import { Injectable } from '@nestjs/common';
import { AppError, SettingsService, skipTake, toPage, type PageQuery } from '@san/nest-common';
import type { Page } from '@san/shared';
import { Prisma, type ShopOrderStatus } from '../../generated/prisma';
import { PrismaService } from '../prisma.service';
import { requireSellerShop } from '../products/seller-shop';
import { resolveRange, type ReportRange } from '../reports/report-range';
import { MarketSetting } from '../settings';
import { AffiliatesService, NO_COMMISSION_STATUSES } from './affiliates.service';
import type { AffiliateProductsQuery, ProductCommissionDto } from './dto/affiliate.dto';

/** Sản phẩm có hoa hồng, CTV chọn để lấy link */
export interface AffiliateProduct {
  id: string;
  name: string;
  image: string | null;
  minPrice: number;
  maxPrice: number;
  soldCount: number;
  ratingCount: number;
  ratingTotal: number;
  /** Phần vạn (500 = 5%) */
  commissionRate: number;
  /** Hoa hồng ước tính khi bán một sản phẩm ở giá thấp nhất (chưa trừ voucher shop) */
  commissionFrom: number;
  shop: { id: string; name: string };
}

/** Một đơn con gắn với CTV, CTV xem (không có thông tin người mua) */
export interface AffiliateOrderRow {
  id: string;
  code: string;
  shopName: string;
  status: ShopOrderStatus;
  createdAt: Date;
  completedAt: Date | null;
  commission: number;
  items: Array<{
    productName: string;
    variantName: string;
    image: string | null;
    quantity: number;
    returnedQuantity: number;
    commissionRate: number;
    commission: number;
  }>;
}

export interface AffiliateStatsDay {
  date: string;
  clicks: number;
  orders: number;
  commission: number;
}

export interface AffiliateStats {
  range: { from: string; to: string; days: number };
  clicks: number;
  orders: number;
  /** Hoa hồng chụp lúc đặt của đơn không bị hủy/giao thất bại (chưa trừ trả hàng) */
  commission: number;
  daily: AffiliateStatsDay[];
  topProducts: Array<{ productId: string; name: string; quantity: number; commission: number }>;
}

/** Đơn qua CTV của một shop, seller xem */
export interface SellerAffiliateOrderRow {
  id: string;
  code: string;
  status: ShopOrderStatus;
  createdAt: Date;
  affiliateName: string;
  subtotal: number;
  shopDiscount: number;
  commission: number;
}

const num = (v: bigint | number | null | undefined) => Number(v ?? 0);

/**
 * Khu Cộng tác viên và phần hoa hồng của seller (P7: AFF-02, AFF-03, AFF-06). Tiền thật của CTV (đang giữ,
 * khả dụng, đã trừ do trả hàng) nằm ở payment-service; ở đây chỉ có số chụp lúc đặt.
 */
@Injectable()
export class AffiliatePortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly affiliates: AffiliatesService,
  ) {}

  /** Sản phẩm đang bán có bật hoa hồng, bỏ hàng của shop mình */
  async products(userId: string, q: AffiliateProductsQuery): Promise<Page<AffiliateProduct>> {
    await this.affiliates.requireActive(userId);
    const where: Prisma.ProductWhereInput = {
      status: 'ACTIVE',
      commissionRate: { not: null },
      shop: { status: 'ACTIVE', ownerId: { not: userId } },
    };
    if (q.q) where.name = { contains: q.q, mode: 'insensitive' };
    if (q.categoryId) {
      where.OR = [{ categoryId: q.categoryId }, { category: { parentId: q.categoryId } }];
    }
    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      q.sort === 'best_selling'
        ? [{ soldCount: 'desc' }, { id: 'asc' }]
        : q.sort === 'newest'
          ? [{ createdAt: 'desc' }, { id: 'asc' }]
          : [{ commissionRate: 'desc' }, { soldCount: 'desc' }, { id: 'asc' }];
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy,
        ...skipTake(q),
        select: {
          id: true,
          name: true,
          minPrice: true,
          maxPrice: true,
          soldCount: true,
          ratingCount: true,
          ratingTotal: true,
          commissionRate: true,
          shop: { select: { id: true, name: true } },
          images: {
            select: { url: true },
            orderBy: [{ option1Value: { sort: 'asc', nulls: 'first' } }, { sort: 'asc' }],
            take: 1,
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);
    return toPage(
      rows.map((p) => ({
        id: p.id,
        name: p.name,
        image: p.images[0]?.url ?? null,
        minPrice: p.minPrice,
        maxPrice: p.maxPrice,
        soldCount: p.soldCount,
        ratingCount: p.ratingCount,
        ratingTotal: p.ratingTotal,
        commissionRate: p.commissionRate!,
        commissionFrom: Math.floor((p.minPrice * p.commissionRate!) / 10_000),
        shop: { id: p.shop.id, name: p.shop.name ?? '' },
      })),
      total,
      q,
    );
  }

  /** Lượt bấm, số đơn, hoa hồng theo ngày (giờ Việt Nam) */
  async stats(userId: string, q: { from?: string; to?: string }): Promise<AffiliateStats> {
    const a = await this.prisma.affiliate.findUnique({ where: { userId } });
    if (!a || a.status === 'PENDING' || a.status === 'REJECTED') {
      throw new AppError(
        409,
        'AFFILIATE_NOT_ACTIVE',
        'Tài khoản cộng tác viên chưa hoạt động nên chưa dùng được chức năng này.',
      );
    }
    const range = resolveRange(q);
    const day = (col: Prisma.Sql) =>
      Prisma.sql`to_char((${col} AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD')`;
    const excluded = Prisma.join(
      NO_COMMISSION_STATUSES.map((s) => Prisma.sql`${s}::"ShopOrderStatus"`),
    );
    const [clicks, orders, top] = await Promise.all([
      this.prisma.$queryRaw<Array<{ day: string; n: bigint }>>`
        SELECT ${day(Prisma.sql`created_at`)} AS day, count(*) AS n
        FROM affiliate_clicks
        WHERE affiliate_id = ${a.id}::uuid AND created_at >= ${range.start} AND created_at < ${range.end}
        GROUP BY 1`,
      this.prisma.$queryRaw<Array<{ day: string; n: bigint; commission: bigint | null }>>`
        SELECT ${day(Prisma.sql`created_at`)} AS day, count(*) AS n, sum(commission) AS commission
        FROM shop_orders
        WHERE affiliate_id = ${a.id}::uuid AND created_at >= ${range.start} AND created_at < ${range.end}
          AND status NOT IN (${excluded})
        GROUP BY 1`,
      this.prisma.$queryRaw<
        Array<{ product_id: string; name: string; quantity: bigint; commission: bigint }>
      >`
        SELECT oi.product_id, max(oi.product_name) AS name, sum(oi.quantity) AS quantity,
          sum(oi.commission) AS commission
        FROM shop_orders so JOIN order_items oi ON oi.shop_order_id = so.id
        WHERE so.affiliate_id = ${a.id}::uuid AND so.created_at >= ${range.start}
          AND so.created_at < ${range.end} AND so.status NOT IN (${excluded}) AND oi.commission > 0
        GROUP BY oi.product_id
        ORDER BY commission DESC, quantity DESC
        LIMIT 10`,
    ]);
    return buildStats(range, clicks, orders, top);
  }

  /** Đơn con gắn với CTV, mới nhất trước */
  async orders(userId: string, q: PageQuery): Promise<Page<AffiliateOrderRow>> {
    const a = await this.prisma.affiliate.findUnique({ where: { userId }, select: { id: true } });
    if (!a) return toPage([], 0, q);
    const where: Prisma.ShopOrderWhereInput = { affiliateId: a.id };
    const [rows, total] = await Promise.all([
      this.prisma.shopOrder.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...skipTake(q),
        select: {
          id: true,
          code: true,
          shopName: true,
          status: true,
          createdAt: true,
          completedAt: true,
          commission: true,
          items: {
            orderBy: { id: 'asc' },
            select: {
              productName: true,
              variantName: true,
              image: true,
              quantity: true,
              returnedQuantity: true,
              commissionRate: true,
              commission: true,
            },
          },
        },
      }),
      this.prisma.shopOrder.count({ where }),
    ]);
    return toPage(rows, total, q);
  }

  // ===== Seller =====

  /** Bật, đổi hoặc tắt hoa hồng cho nhiều sản phẩm của shop (AFF-02). Chỉ áp cho đơn đặt sau đó */
  async setCommission(userId: string, dto: ProductCommissionDto): Promise<{ updated: number }> {
    const shop = await requireSellerShop(this.prisma, userId);
    if (dto.rate !== null) {
      const s = await this.settings.values([
        MarketSetting.affiliateRateMin,
        MarketSetting.affiliateRateMax,
      ]);
      const min = s[MarketSetting.affiliateRateMin]!;
      const max = s[MarketSetting.affiliateRateMax]!;
      if (dto.rate < min || dto.rate > max) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          `Hoa hồng phải từ ${percent(min)} đến ${percent(max)}.`,
          { min, max },
        );
      }
    }
    const ids = [...new Set(dto.productIds)];
    const owned = await this.prisma.product.count({ where: { id: { in: ids }, shopId: shop.id } });
    if (owned !== ids.length) {
      throw new AppError(404, 'NOT_FOUND', 'Có sản phẩm không thuộc shop của bạn.');
    }
    const { count } = await this.prisma.product.updateMany({
      where: { id: { in: ids }, shopId: shop.id },
      data: { commissionRate: dto.rate },
    });
    return { updated: count };
  }

  /** Khoảng % shop được đặt (để web hiện gợi ý và kiểm trước khi gửi) */
  async rateRange(): Promise<{ min: number; max: number }> {
    const s = await this.settings.values([
      MarketSetting.affiliateRateMin,
      MarketSetting.affiliateRateMax,
    ]);
    return { min: s[MarketSetting.affiliateRateMin]!, max: s[MarketSetting.affiliateRateMax]! };
  }

  /** Đơn qua CTV của shop, mới nhất trước */
  async sellerOrders(userId: string, q: PageQuery): Promise<Page<SellerAffiliateOrderRow>> {
    const shop = await requireSellerShop(this.prisma, userId);
    const where: Prisma.ShopOrderWhereInput = { shopId: shop.id, affiliateId: { not: null } };
    const [rows, total] = await Promise.all([
      this.prisma.shopOrder.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...skipTake(q),
        select: {
          id: true,
          code: true,
          status: true,
          createdAt: true,
          subtotal: true,
          shopDiscount: true,
          commission: true,
          affiliate: { select: { displayName: true } },
        },
      }),
      this.prisma.shopOrder.count({ where }),
    ]);
    return toPage(
      rows.map(({ affiliate, ...r }) => ({ ...r, affiliateName: affiliate?.displayName ?? '' })),
      total,
      q,
    );
  }
}

/** Ghép số liệu theo ngày; ngày không có số liệu trả 0 */
export function buildStats(
  range: ReportRange,
  clicks: Array<{ day: string; n: bigint | number }>,
  orders: Array<{ day: string; n: bigint | number; commission: bigint | number | null }>,
  top: Array<{
    product_id: string;
    name: string;
    quantity: bigint | number;
    commission: bigint | number;
  }>,
): AffiliateStats {
  const c = new Map(clicks.map((r) => [r.day, num(r.n)]));
  const o = new Map(orders.map((r) => [r.day, r]));
  const daily = range.dates.map((date) => ({
    date,
    clicks: c.get(date) ?? 0,
    orders: num(o.get(date)?.n),
    commission: num(o.get(date)?.commission),
  }));
  return {
    range: { from: range.from, to: range.to, days: range.days },
    clicks: daily.reduce((s, d) => s + d.clicks, 0),
    orders: daily.reduce((s, d) => s + d.orders, 0),
    commission: daily.reduce((s, d) => s + d.commission, 0),
    daily,
    topProducts: top.map((t) => ({
      productId: t.product_id,
      name: t.name,
      quantity: num(t.quantity),
      commission: num(t.commission),
    })),
  };
}

/** 150 → "1,5%" */
function percent(rate: number): string {
  return `${(rate / 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`;
}
