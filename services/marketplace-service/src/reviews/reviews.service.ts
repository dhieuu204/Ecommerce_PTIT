import { Injectable } from '@nestjs/common';
import { AppError, SettingsService, skipTake, toPage, type AuthUser } from '@san/nest-common';
import type { Page } from '@san/shared';
import { AppConfig } from '../config';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma.service';
import { requireSellerShop } from '../products/seller-shop';
import { MarketSetting } from '../settings';
import { StorageService } from '../uploads/storage.service';
import { reviewImagePrefix } from '../uploads/uploads.controller';
import { Prisma, type Review } from '../../generated/prisma';
import type {
  CreateReviewDto,
  MyReviewsQuery,
  PublicReviewsQuery,
  ReviewContentDto,
  SellerReviewsQuery,
} from './dto/reviews.dto';
import { maskName, ratingAvg } from './rating';

type Tx = Prisma.TransactionClient;

const DAY_MS = 86_400_000;
/** Tên file ảnh do POST /uploads/review-image sinh: <uuid>.<đuôi> */
const IMAGE_FILE = /^[A-Za-z0-9-]+\.(jpg|png|webp)$/;

/** Tóm tắt sao: trung bình, tổng số, số đánh giá từng mức sao, số có ảnh */
export interface ReviewSummary {
  ratingAvg: number | null;
  ratingCount: number;
  /** Số đánh giá theo mức sao: { "5": 12, "4": 3, ... } */
  stars: Record<'1' | '2' | '3' | '4' | '5', number>;
  withImages: number;
}

/** Một đánh giá hiện công khai (trang sản phẩm, trang shop) */
export interface PublicReview {
  id: string;
  /** Tên người mua đã che bớt, ví dụ "N***n" */
  buyerName: string;
  rating: number;
  content: string;
  images: string[];
  /** Phân loại đã mua, '' nếu không phân loại */
  variantName: string;
  /** Người mua đã dùng lượt sửa */
  edited: boolean;
  sellerReply: string | null;
  sellerRepliedAt: Date | null;
  createdAt: Date;
  /** Chỉ có ở danh sách đánh giá của shop */
  product?: { id: string; name: string };
}

export interface PublicReviewPage extends Page<PublicReview> {
  summary: ReviewSummary;
}

/** Dòng hàng đang chờ đánh giá (GET /me/reviews?state=PENDING) */
export interface PendingReviewItem {
  orderItemId: string;
  productId: string;
  productName: string;
  variantName: string;
  image: string | null;
  quantity: number;
  orderId: string;
  shopOrderId: string;
  shopOrderCode: string;
  shop: { id: string; name: string };
  completedAt: Date;
  /** Hạn đánh giá */
  reviewBefore: Date;
}

/** Đánh giá của tôi (GET /me/reviews?state=DONE, POST, PUT) */
export interface MyReview {
  id: string;
  orderItemId: string;
  productId: string;
  productName: string;
  variantName: string;
  image: string | null;
  orderId: string;
  shopOrderCode: string;
  shop: { id: string; name: string };
  /** Tên đầy đủ (chỉ chính người mua thấy) */
  buyerName: string;
  rating: number;
  content: string;
  images: string[];
  edited: boolean;
  /** Còn sửa được không (chưa dùng lượt sửa và còn hạn) */
  canEdit: boolean;
  /** Hạn sửa (cũng là hạn đánh giá) */
  editBefore: Date;
  sellerReply: string | null;
  sellerRepliedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Đánh giá trong Kênh người bán */
export interface SellerReview extends PublicReview {
  product: { id: string; name: string; image: string | null };
  shopOrderId: string;
  shopOrderCode: string;
}

export interface SellerReviewPage extends Page<SellerReview> {
  summary: ReviewSummary & { unreplied: number };
}

const notFound = (what = 'đánh giá') => new AppError(404, 'NOT_FOUND', `Không tìm thấy ${what}.`);

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/** Dòng hàng kèm đơn con, đơn tổng, đánh giá: đủ để biết có được đánh giá không */
const ITEM_INCLUDE = {
  shopOrder: {
    select: {
      id: true,
      code: true,
      status: true,
      completedAt: true,
      shopId: true,
      shopName: true,
      orderId: true,
      order: { select: { buyerId: true, buyerName: true } },
      shop: { select: { ownerId: true, name: true } },
    },
  },
  review: { select: { id: true } },
} satisfies Prisma.OrderItemInclude;

const MY_REVIEW_INCLUDE = {
  orderItem: {
    select: {
      productName: true,
      image: true,
      shopOrder: {
        select: { code: true, orderId: true, completedAt: true, shopId: true, shopName: true },
      },
    },
  },
} satisfies Prisma.ReviewInclude;
type MyReviewRow = Prisma.ReviewGetPayload<{ include: typeof MY_REVIEW_INCLUDE }>;

/**
 * Đánh giá sản phẩm (ENG-01) và shop trả lời (ENG-02). Sao của sản phẩm và shop lưu bằng hai số nguyên
 * (`rating_count`, `rating_total`), cộng/trừ bằng câu lệnh tăng/giảm trong cùng giao dịch với đánh giá.
 * Sao shop = trung bình sao mọi sản phẩm của shop (quyết định P6 số 1).
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
    private readonly config: AppConfig,
  ) {}

  // ----- Người mua -----

  async mine(user: AuthUser, q: MyReviewsQuery): Promise<Page<PendingReviewItem> | Page<MyReview>> {
    const days = await this.reviewDays();
    if ((q.state ?? 'PENDING') === 'PENDING') return this.pending(user, q, days);
    const where = { buyerId: user.id };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        include: MY_REVIEW_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.review.count({ where }),
    ]);
    const now = Date.now();
    return toPage(
      rows.map((r) => this.myView(r, days, now)),
      total,
      q,
    );
  }

  /** Dòng hàng còn đánh giá được: đơn con hoàn tất trong hạn, còn món chưa trả, chưa có đánh giá */
  private async pending(
    user: AuthUser,
    q: MyReviewsQuery,
    days: number,
  ): Promise<Page<PendingReviewItem>> {
    const since = new Date(Date.now() - days * DAY_MS);
    const { skip, take } = skipTake(q);
    // So sánh hai cột (quantity > returned_quantity) nên viết SQL; chỉ lấy mã rồi nạp chi tiết bằng Prisma
    const where = Prisma.sql`
      o.buyer_id = ${user.id}::uuid AND so.status = 'COMPLETED' AND so.completed_at >= ${since}
      AND oi.quantity > oi.returned_quantity
      AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.order_item_id = oi.id)`;
    const from = Prisma.sql`order_items oi JOIN shop_orders so ON so.id = oi.shop_order_id
      JOIN orders o ON o.id = so.order_id`;
    const [countRows, idRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ total: bigint }>>`
        SELECT count(*) AS total FROM ${from} WHERE ${where}`,
      this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT oi.id FROM ${from} WHERE ${where}
        ORDER BY so.completed_at DESC, so.id, oi.id LIMIT ${take} OFFSET ${skip}`,
    ]);
    const ids = idRows.map((r) => r.id);
    const items = await this.prisma.orderItem.findMany({
      where: { id: { in: ids } },
      include: {
        shopOrder: {
          select: {
            id: true,
            code: true,
            orderId: true,
            shopId: true,
            shopName: true,
            completedAt: true,
          },
        },
      },
    });
    const byId = new Map(items.map((i) => [i.id, i]));
    return toPage(
      ids.map((id): PendingReviewItem => {
        const it = byId.get(id)!;
        const completedAt = it.shopOrder.completedAt!;
        return {
          orderItemId: it.id,
          productId: it.productId,
          productName: it.productName,
          variantName: it.variantName,
          image: it.image,
          quantity: it.quantity - it.returnedQuantity,
          orderId: it.shopOrder.orderId,
          shopOrderId: it.shopOrder.id,
          shopOrderCode: it.shopOrder.code,
          shop: { id: it.shopOrder.shopId, name: it.shopOrder.shopName },
          completedAt,
          reviewBefore: new Date(completedAt.getTime() + days * DAY_MS),
        };
      }),
      Number(countRows[0]?.total ?? 0),
      q,
    );
  }

  /**
   * Viết đánh giá cho một dòng hàng. Dòng hàng của người khác → 404; đơn chưa hoàn tất hoặc đã trả hết →
   * REVIEW_NOT_ALLOWED; quá hạn → REVIEW_WINDOW_CLOSED; đã đánh giá → ALREADY_REVIEWED.
   */
  async create(user: AuthUser, dto: CreateReviewDto): Promise<MyReview> {
    const item = await this.prisma.orderItem.findUnique({
      where: { id: dto.orderItemId },
      include: ITEM_INCLUDE,
    });
    if (!item || item.shopOrder.order.buyerId !== user.id) throw notFound('dòng hàng');
    if (item.review) throw alreadyReviewed();
    const so = item.shopOrder;
    if (so.status !== 'COMPLETED' || !so.completedAt || item.quantity <= item.returnedQuantity) {
      throw new AppError(
        409,
        'REVIEW_NOT_ALLOWED',
        'Chỉ đánh giá được món đã nhận của đơn đã hoàn tất.',
      );
    }
    const days = await this.reviewDays();
    if (Date.now() > so.completedAt.getTime() + days * DAY_MS) throw windowClosed(days);
    const content = this.content(user, dto);

    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const review = await tx.review.create({
          data: {
            orderItemId: item.id,
            shopOrderId: so.id,
            productId: item.productId,
            shopId: so.shopId,
            buyerId: user.id,
            buyerName: (user.name || so.order.buyerName).slice(0, 100),
            variantName: item.variantName,
            ...content,
          },
        });
        await addRating(tx, item.productId, so.shopId, 1, content.rating);
        await this.notifications.notify(tx, {
          userId: so.shop.ownerId,
          type: 'SHOP_REVIEW_NEW',
          title: `Đánh giá mới ${content.rating} sao`,
          content: `${maskName(review.buyerName)} đánh giá ${content.rating} sao cho "${item.productName}" (đơn ${so.code}).`,
          link: '/kenh-nguoi-ban/danh-gia',
        });
        return review.id;
      });
    } catch (e) {
      // Hai lần gửi cùng lúc: dòng hàng đã có đánh giá (khóa không trùng order_item_id)
      if (isUniqueViolation(e)) throw alreadyReviewed();
      throw e;
    }
    return this.myOne(user.id, id, days);
  }

  /** Sửa đánh giá (một lần, trong hạn). Sao của sản phẩm và shop đổi theo chênh lệch. */
  async update(user: AuthUser, reviewId: string, dto: ReviewContentDto): Promise<MyReview> {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, buyerId: user.id },
      include: MY_REVIEW_INCLUDE,
    });
    if (!review) throw notFound();
    if (review.edited) throw editUsed();
    const days = await this.reviewDays();
    const completedAt = review.orderItem.shopOrder.completedAt;
    if (!completedAt || Date.now() > completedAt.getTime() + days * DAY_MS) {
      throw windowClosed(days);
    }
    const content = this.content(user, dto);
    await this.prisma.$transaction(async (tx) => {
      // Điều kiện edited = false: hai lần sửa cùng lúc thì chỉ một lần được
      const { count } = await tx.review.updateMany({
        where: { id: review.id, edited: false },
        data: { ...content, edited: true },
      });
      if (count === 0) throw editUsed();
      const delta = content.rating - review.rating;
      if (delta !== 0) await addRating(tx, review.productId, review.shopId, 0, delta);
    });
    return this.myOne(user.id, review.id, days);
  }

  // ----- Công khai -----

  /** Đánh giá của một sản phẩm đang bán (sản phẩm ẩn, bị gỡ hoặc shop không hoạt động → 404) */
  async forProduct(productId: string, q: PublicReviewsQuery): Promise<PublicReviewPage> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, status: 'ACTIVE', shop: { status: 'ACTIVE' } },
      select: { ratingCount: true, ratingTotal: true },
    });
    if (!product) throw notFound('sản phẩm');
    const base: Prisma.ReviewWhereInput = { productId };
    const [page, summary] = await Promise.all([
      this.publicPage(base, q, false),
      this.summary(base, product),
    ]);
    return { ...page, summary };
  }

  /** Đánh giá mọi sản phẩm của shop (shop đã được duyệt: đang hoạt động hoặc bị đình chỉ) */
  async forShop(shopId: string, q: PublicReviewsQuery): Promise<PublicReviewPage> {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { status: true, ratingCount: true, ratingTotal: true },
    });
    if (!shop || (shop.status !== 'ACTIVE' && shop.status !== 'SUSPENDED')) throw notFound('shop');
    const base: Prisma.ReviewWhereInput = { shopId };
    const [page, summary] = await Promise.all([
      this.publicPage(base, q, true),
      this.summary(base, shop),
    ]);
    return { ...page, summary };
  }

  private async publicPage(
    base: Prisma.ReviewWhereInput,
    q: PublicReviewsQuery,
    withProduct: boolean,
  ): Promise<Page<PublicReview>> {
    const where: Prisma.ReviewWhereInput = {
      ...base,
      ...(q.rating ? { rating: q.rating } : {}),
      ...(q.withImages === true ? { images: { isEmpty: false } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        include: { product: { select: { id: true, name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.review.count({ where }),
    ]);
    return toPage(
      rows.map((r) => ({
        ...publicView(r),
        ...(withProduct ? { product: { id: r.product.id, name: r.product.name } } : {}),
      })),
      total,
      q,
    );
  }

  // ----- Seller -----

  async forSeller(user: AuthUser, q: SellerReviewsQuery): Promise<SellerReviewPage> {
    const shop = await requireSellerShop(this.prisma, user.id);
    const base: Prisma.ReviewWhereInput = { shopId: shop.id };
    const where: Prisma.ReviewWhereInput = {
      ...base,
      ...(q.rating ? { rating: q.rating } : {}),
      ...(q.replied === true ? { sellerReply: { not: null } } : {}),
      ...(q.replied === false ? { sellerReply: null } : {}),
    };
    const [rows, total, unreplied] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        include: SELLER_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.review.count({ where }),
      this.prisma.review.count({ where: { ...base, sellerReply: null } }),
    ]);
    const summary = await this.summary(base, shop);
    return { ...toPage(rows.map(sellerView), total, q), summary: { ...summary, unreplied } };
  }

  /** Shop trả lời đánh giá (lần đầu) hoặc sửa câu trả lời của mình. Đánh giá của shop khác → 404 */
  async reply(user: AuthUser, reviewId: string, content: string): Promise<SellerReview> {
    const shop = await requireSellerShop(this.prisma, user.id);
    const { count } = await this.prisma.review.updateMany({
      where: { id: reviewId, shopId: shop.id },
      data: { sellerReply: content, sellerRepliedAt: new Date() },
    });
    if (count === 0) throw notFound();
    const row = await this.prisma.review.findUniqueOrThrow({
      where: { id: reviewId },
      include: SELLER_INCLUDE,
    });
    return sellerView(row);
  }

  // ----- Phụ -----

  private reviewDays(): Promise<number> {
    return this.settings.get(MarketSetting.reviewDays);
  }

  /** Sao, nội dung, ảnh đã kiểm: ảnh phải tải lên từ tài khoản của chính người viết, không quá số cho phép */
  private content(user: AuthUser, dto: ReviewContentDto) {
    const images = [...new Set(dto.images ?? [])];
    const max = this.config.reviewMaxImages;
    if (images.length > max) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu chưa hợp lệ.', {
        fields: { images: `Tối đa ${max} ảnh.` },
      });
    }
    const prefix = this.storage.publicUrl(reviewImagePrefix(user.id));
    images.forEach((url, index) => {
      if (!url.startsWith(prefix) || !IMAGE_FILE.test(url.slice(prefix.length))) {
        throw new AppError(
          400,
          'INVALID_IMAGE_URL',
          'Ảnh đánh giá phải được tải lên từ tài khoản của bạn.',
          { index },
        );
      }
    });
    return { rating: dto.rating, content: dto.content ?? '', images };
  }

  private async summary(
    base: Prisma.ReviewWhereInput,
    counters: { ratingCount: number; ratingTotal: number },
  ): Promise<ReviewSummary> {
    const [groups, withImages] = await Promise.all([
      this.prisma.review.groupBy({ by: ['rating'], where: base, _count: { _all: true } }),
      this.prisma.review.count({ where: { ...base, images: { isEmpty: false } } }),
    ]);
    const stars = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    for (const g of groups) stars[String(g.rating) as keyof typeof stars] = g._count._all;
    return {
      ratingAvg: ratingAvg(counters.ratingTotal, counters.ratingCount),
      ratingCount: counters.ratingCount,
      stars,
      withImages,
    };
  }

  private async myOne(userId: string, id: string, days: number): Promise<MyReview> {
    const row = await this.prisma.review.findFirstOrThrow({
      where: { id, buyerId: userId },
      include: MY_REVIEW_INCLUDE,
    });
    return this.myView(row, days, Date.now());
  }

  private myView(r: MyReviewRow, days: number, now: number): MyReview {
    const so = r.orderItem.shopOrder;
    const editBefore = new Date((so.completedAt ?? r.createdAt).getTime() + days * DAY_MS);
    return {
      id: r.id,
      orderItemId: r.orderItemId,
      productId: r.productId,
      productName: r.orderItem.productName,
      variantName: r.variantName,
      image: r.orderItem.image,
      orderId: so.orderId,
      shopOrderCode: so.code,
      shop: { id: so.shopId, name: so.shopName },
      buyerName: r.buyerName,
      rating: r.rating,
      content: r.content,
      images: r.images,
      edited: r.edited,
      canEdit: !r.edited && now <= editBefore.getTime(),
      editBefore,
      sellerReply: r.sellerReply,
      sellerRepliedAt: r.sellerRepliedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}

const SELLER_INCLUDE = {
  product: { select: { id: true, name: true } },
  orderItem: { select: { image: true, shopOrder: { select: { code: true } } } },
} satisfies Prisma.ReviewInclude;

function publicView(r: Review): PublicReview {
  return {
    id: r.id,
    buyerName: maskName(r.buyerName),
    rating: r.rating,
    content: r.content,
    images: r.images,
    variantName: r.variantName,
    edited: r.edited,
    sellerReply: r.sellerReply,
    sellerRepliedAt: r.sellerRepliedAt,
    createdAt: r.createdAt,
  };
}

function sellerView(r: Prisma.ReviewGetPayload<{ include: typeof SELLER_INCLUDE }>): SellerReview {
  return {
    ...publicView(r),
    product: { id: r.product.id, name: r.product.name, image: r.orderItem.image },
    shopOrderId: r.shopOrderId,
    shopOrderCode: r.orderItem.shopOrder.code,
  };
}

/**
 * Cộng số đánh giá và tổng số sao vào sản phẩm và shop bằng câu lệnh tăng/giảm (không đọc rồi ghi), trong
 * giao dịch của đánh giá. Không đụng cột updated_at để sản phẩm không nhảy lên đầu danh sách của seller.
 */
async function addRating(
  tx: Tx,
  productId: string,
  shopId: string,
  countDelta: number,
  totalDelta: number,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE products SET rating_count = rating_count + ${countDelta}::int,
      rating_total = rating_total + ${totalDelta}::int
    WHERE id = ${productId}::uuid`;
  await tx.$executeRaw`
    UPDATE shops SET rating_count = rating_count + ${countDelta}::int,
      rating_total = rating_total + ${totalDelta}::int
    WHERE id = ${shopId}::uuid`;
}

function alreadyReviewed(): AppError {
  return new AppError(409, 'ALREADY_REVIEWED', 'Bạn đã đánh giá sản phẩm này rồi.');
}

function editUsed(): AppError {
  return new AppError(409, 'REVIEW_EDIT_USED', 'Mỗi đánh giá chỉ sửa được một lần.');
}

function windowClosed(days: number): AppError {
  return new AppError(
    409,
    'REVIEW_WINDOW_CLOSED',
    `Đã quá ${days} ngày kể từ khi đơn hoàn tất nên không đánh giá hoặc sửa được nữa.`,
  );
}
