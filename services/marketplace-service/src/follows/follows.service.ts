import { Injectable } from '@nestjs/common';
import { AppError, PageQuery, skipTake, toPage, type AuthUser } from '@san/nest-common';
import type { Page } from '@san/shared';
import { PRODUCT_CARD_INCLUDE, toProductCard, type ProductCard } from '../catalog/catalog.service';
import { PrismaService } from '../prisma.service';
import { ratingAvg } from '../reviews/rating';

/** Kết quả theo dõi / bỏ theo dõi shop */
export interface FollowState {
  following: boolean;
  followerCount: number;
}

/** Kết quả thả tim / bỏ tim */
export interface LikeState {
  liked: boolean;
  likeCount: number;
}

/** Một shop trong "Shop đang theo dõi" */
export interface FollowedShop {
  id: string;
  name: string;
  logoUrl: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  /** Số sản phẩm đang bán (0 khi shop bị đình chỉ) */
  productCount: number;
  suspended: boolean;
  followedAt: Date;
}

/** Một sản phẩm trong "Sản phẩm yêu thích": thẻ như GET /products, kèm còn bán hay không */
export interface LikedProduct extends ProductCard {
  /** false: sản phẩm đã ẩn, bị gỡ hoặc shop không hoạt động (không còn bán) */
  available: boolean;
  likedAt: Date;
}

const notFound = (what: string) => new AppError(404, 'NOT_FOUND', `Không tìm thấy ${what}.`);

/**
 * Theo dõi shop và thả tim sản phẩm (ENG-03). Mỗi cặp (người, shop) / (người, sản phẩm) là khóa chính nên
 * làm lại không tạo dòng trùng; số người theo dõi và số tim đếm từ bảng khi đọc.
 */
@Injectable()
export class FollowsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Theo dõi shop đã được duyệt (đang hoạt động hoặc bị đình chỉ). Shop của mình → 409 OWN_SHOP */
  async follow(user: AuthUser, shopId: string): Promise<FollowState> {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop || (shop.status !== 'ACTIVE' && shop.status !== 'SUSPENDED')) {
      throw notFound('shop');
    }
    if (shop.ownerId === user.id) {
      throw new AppError(409, 'OWN_SHOP', 'Bạn không theo dõi được shop của chính mình.');
    }
    await this.prisma.shopFollow.createMany({
      data: [{ userId: user.id, shopId }],
      skipDuplicates: true,
    });
    return this.followState(user.id, shopId);
  }

  /** Bỏ theo dõi: chưa theo dõi cũng không lỗi */
  async unfollow(user: AuthUser, shopId: string): Promise<FollowState> {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId }, select: { id: true } });
    if (!shop) throw notFound('shop');
    await this.prisma.shopFollow.deleteMany({ where: { userId: user.id, shopId } });
    return this.followState(user.id, shopId);
  }

  async followedShops(user: AuthUser, q: PageQuery): Promise<Page<FollowedShop>> {
    const where = { userId: user.id };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.shopFollow.findMany({
        where,
        include: { shop: true },
        orderBy: [{ createdAt: 'desc' }, { shopId: 'asc' }],
        ...skipTake(q),
      }),
      this.prisma.shopFollow.count({ where }),
    ]);
    const activeIds = rows.filter((r) => r.shop.status === 'ACTIVE').map((r) => r.shopId);
    const counts = activeIds.length
      ? await this.prisma.product.groupBy({
          by: ['shopId'],
          where: { shopId: { in: activeIds }, status: 'ACTIVE' },
          _count: { _all: true },
        })
      : [];
    const countBy = new Map(counts.map((c) => [c.shopId, c._count._all]));
    return toPage(
      rows.map((r): FollowedShop => ({
        id: r.shop.id,
        name: r.shop.name ?? '',
        logoUrl: r.shop.logoUrl,
        ratingAvg: ratingAvg(r.shop.ratingTotal, r.shop.ratingCount),
        ratingCount: r.shop.ratingCount,
        productCount: countBy.get(r.shopId) ?? 0,
        suspended: r.shop.status !== 'ACTIVE',
        followedAt: r.createdAt,
      })),
      total,
      q,
    );
  }

  /** Thả tim hàng đang bán (sản phẩm ACTIVE của shop ACTIVE), không thì 404 */
  async like(user: AuthUser, productId: string): Promise<LikeState> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, status: 'ACTIVE', shop: { status: 'ACTIVE' } },
      select: { id: true },
    });
    if (!product) throw notFound('sản phẩm');
    await this.prisma.productLike.createMany({
      data: [{ userId: user.id, productId }],
      skipDuplicates: true,
    });
    return this.likeState(user.id, productId);
  }

  /** Bỏ tim: luôn được (kể cả sản phẩm không còn bán), chưa thả tim cũng không lỗi */
  async unlike(user: AuthUser, productId: string): Promise<LikeState> {
    await this.prisma.productLike.deleteMany({ where: { userId: user.id, productId } });
    return this.likeState(user.id, productId);
  }

  async likedProducts(user: AuthUser, q: PageQuery): Promise<Page<LikedProduct>> {
    const where = { userId: user.id };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.productLike.findMany({
        where,
        include: { product: { include: { ...PRODUCT_CARD_INCLUDE, shop: true } } },
        orderBy: [{ createdAt: 'desc' }, { productId: 'asc' }],
        ...skipTake(q),
      }),
      this.prisma.productLike.count({ where }),
    ]);
    return toPage(
      rows.map((r): LikedProduct => ({
        ...toProductCard(r.product),
        available: r.product.status === 'ACTIVE' && r.product.shop.status === 'ACTIVE',
        likedAt: r.createdAt,
      })),
      total,
      q,
    );
  }

  private async followState(userId: string, shopId: string): Promise<FollowState> {
    const [followerCount, mine] = await Promise.all([
      this.prisma.shopFollow.count({ where: { shopId } }),
      this.prisma.shopFollow.count({ where: { shopId, userId } }),
    ]);
    return { following: mine > 0, followerCount };
  }

  private async likeState(userId: string, productId: string): Promise<LikeState> {
    const [likeCount, mine] = await Promise.all([
      this.prisma.productLike.count({ where: { productId } }),
      this.prisma.productLike.count({ where: { productId, userId } }),
    ]);
    return { liked: mine > 0, likeCount };
  }
}
