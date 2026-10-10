import { Injectable } from '@nestjs/common';
import { AppError, skipTake, toPage } from '@san/nest-common';
import type { Page } from '@san/shared';
import { PrismaService } from '../prisma.service';
import { sortImages, type CategoryRef, type ProductImageView } from '../products/products.service';
import { Prisma, type Shop } from '../../generated/prisma';
import type { ProductSearchQuery } from './dto/catalog.dto';
import { toPrefixQuery } from './search';

/** Thẻ sản phẩm ở trang chủ, danh mục, kết quả tìm, trang shop */
export interface ProductCard {
  id: string;
  name: string;
  /** Ảnh chung đầu tiên */
  image: string | null;
  minPrice: number;
  maxPrice: number;
  /** Giá gốc của biến thể rẻ nhất (để hiện nhãn -%), null nếu không giảm */
  originalPrice: number | null;
  option1Name: string | null;
  /** Các lựa chọn nhóm 1 đang bán, theo thứ tự (ô chọn phiên bản trên thẻ) */
  option1Values: string[];
  soldCount: number;
  /** Còn biến thể nào bán được không */
  inStock: boolean;
  shop: { id: string; name: string };
  createdAt: Date;
}

/** Biến thể ở trang sản phẩm: chỉ số còn bán được, không lộ tồn và lượng đang giữ */
export interface PublicVariant {
  id: string;
  option1Value: string | null;
  option2Value: string | null;
  price: number;
  originalPrice: number | null;
  /** Số còn bán được (tồn - đang giữ) */
  available: number;
}

/** Trang sản phẩm (CAT-04) */
export interface ProductDetail {
  id: string;
  name: string;
  description: string;
  status: 'ACTIVE';
  weight: number;
  soldCount: number;
  minPrice: number;
  maxPrice: number;
  option1Name: string | null;
  option2Name: string | null;
  category: CategoryRef & { parent: CategoryRef | null };
  images: ProductImageView[];
  variants: PublicVariant[];
  shop: { id: string; name: string; logoUrl: string | null; productCount: number; joinedAt: Date };
}

/** Trang shop (CAT-04) */
export interface PublicShop {
  id: string;
  name: string;
  logoUrl: string | null;
  description: string | null;
  /** Tỉnh/thành lấy hàng */
  provinceName: string | null;
  /** Số sản phẩm đang bán (0 khi shop bị đình chỉ) */
  productCount: number;
  /** Ngày được duyệt mở shop */
  joinedAt: Date;
  status: 'ACTIVE' | 'SUSPENDED';
  /** true: hiện "Shop đang tạm ngừng bán" */
  suspended: boolean;
}

const notFound = (what = 'sản phẩm') => new AppError(404, 'NOT_FOUND', `Không tìm thấy ${what}.`);

/**
 * Xem hàng công khai (CAT-04, SRC-01). Chỉ "hàng đang bán" = sản phẩm ACTIVE của shop ACTIVE;
 * chỉ trả số còn bán được, không trả tồn và lượng đang giữ.
 */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /** Tìm bằng SQL (full-text bỏ dấu, lọc, sắp xếp) lấy mã + tổng, rồi nạp chi tiết bằng Prisma */
  async search(q: ProductSearchQuery): Promise<Page<ProductCard>> {
    const conditions: Prisma.Sql[] = [Prisma.sql`p.status = 'ACTIVE' AND s.status = 'ACTIVE'`];
    const tsq = toPrefixQuery(q.q);
    if (tsq) conditions.push(Prisma.sql`p.search_vector @@ to_tsquery('simple', ${tsq})`);
    if (q.categoryId) {
      conditions.push(
        Prisma.sql`p.category_id IN (SELECT id FROM categories WHERE id = ${q.categoryId}::uuid OR parent_id = ${q.categoryId}::uuid)`,
      );
    }
    if (q.minPrice !== undefined) conditions.push(Prisma.sql`p.min_price >= ${q.minPrice}::int`);
    if (q.maxPrice !== undefined) conditions.push(Prisma.sql`p.min_price <= ${q.maxPrice}::int`);
    if (q.shopId) conditions.push(Prisma.sql`p.shop_id = ${q.shopId}::uuid`);
    const where = Prisma.join(conditions, ' AND ');

    let sort = q.sort ?? (tsq ? 'relevance' : 'newest');
    if (sort === 'relevance' && !tsq) sort = 'newest';
    const orderBy = {
      relevance: Prisma.sql`ts_rank(p.search_vector, to_tsquery('simple', ${tsq})) DESC,`,
      newest: Prisma.empty,
      price_asc: Prisma.sql`p.min_price ASC,`,
      price_desc: Prisma.sql`p.min_price DESC,`,
      best_selling: Prisma.sql`p.sold_count DESC,`,
    }[sort];

    const { skip, take } = skipTake(q);
    const [countRows, idRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ total: bigint }>>`
        SELECT count(*) AS total FROM products p JOIN shops s ON s.id = p.shop_id WHERE ${where}`,
      this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT p.id FROM products p JOIN shops s ON s.id = p.shop_id WHERE ${where}
        ORDER BY ${orderBy} p.created_at DESC, p.id LIMIT ${take} OFFSET ${skip}`,
    ]);
    const ids = idRows.map((r) => r.id);
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: {
        variants: { where: { active: true }, orderBy: { sort: 'asc' } },
        images: { where: { option1Value: null }, orderBy: { sort: 'asc' }, take: 1 },
        shop: { select: { id: true, name: true } },
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const items = ids.map((id): ProductCard => {
      const p = byId.get(id)!;
      // Biến thể rẻ nhất (bằng giá thì lấy biến thể đứng trước)
      const cheapest = p.variants.reduce<(typeof p.variants)[number] | undefined>(
        (best, v) => (!best || v.price < best.price ? v : best),
        undefined,
      );
      return {
        id: p.id,
        name: p.name,
        image: p.images[0]?.url ?? null,
        minPrice: p.minPrice,
        maxPrice: p.maxPrice,
        originalPrice: cheapest?.originalPrice ?? null,
        option1Name: p.option1Name,
        option1Values: [...new Set(p.variants.map((v) => v.option1Value).filter(Boolean))],
        soldCount: p.soldCount,
        inStock: p.variants.some((v) => v.stock - v.reserved > 0),
        shop: { id: p.shop.id, name: p.shop.name ?? '' },
        createdAt: p.createdAt,
      };
    });
    return toPage(items, Number(countRows[0]?.total ?? 0), q);
  }

  /** Chi tiết hàng đang bán; sản phẩm ẩn hoặc shop không hoạt động → 404 */
  async product(productId: string): Promise<ProductDetail> {
    const p = await this.prisma.product.findFirst({
      where: { id: productId, status: 'ACTIVE', shop: { status: 'ACTIVE' } },
      include: {
        category: { include: { parent: true } },
        variants: { where: { active: true }, orderBy: { sort: 'asc' } },
        images: { orderBy: { sort: 'asc' } },
        shop: true,
      },
    });
    if (!p) throw notFound();
    const [productCount, joinedAt] = await Promise.all([
      this.sellableCount(p.shop),
      this.joinedAt(p.shop),
    ]);
    const ref = (c: { id: string; name: string; slug: string }): CategoryRef => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
    });
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      status: 'ACTIVE',
      weight: p.weight,
      soldCount: p.soldCount,
      minPrice: p.minPrice,
      maxPrice: p.maxPrice,
      option1Name: p.option1Name,
      option2Name: p.option2Name,
      category: { ...ref(p.category), parent: p.category.parent && ref(p.category.parent) },
      images: sortImages(p.images),
      variants: p.variants.map((v) => ({
        id: v.id,
        option1Value: v.option1Value || null,
        option2Value: v.option2Value || null,
        price: v.price,
        originalPrice: v.originalPrice,
        available: Math.max(0, v.stock - v.reserved),
      })),
      shop: {
        id: p.shop.id,
        name: p.shop.name ?? '',
        logoUrl: p.shop.logoUrl,
        productCount,
        joinedAt,
      },
    };
  }

  /** Trang shop: shop đang hoạt động hoặc bị đình chỉ; shop chưa được duyệt → 404 */
  async shop(shopId: string): Promise<PublicShop> {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop || (shop.status !== 'ACTIVE' && shop.status !== 'SUSPENDED')) {
      throw notFound('shop');
    }
    const [province, productCount, joinedAt] = await Promise.all([
      shop.pickupProvinceId
        ? this.prisma.province.findUnique({ where: { id: shop.pickupProvinceId } })
        : null,
      this.sellableCount(shop),
      this.joinedAt(shop),
    ]);
    return {
      id: shop.id,
      name: shop.name ?? '',
      logoUrl: shop.logoUrl,
      description: shop.description,
      provinceName: province?.name ?? null,
      productCount,
      joinedAt,
      status: shop.status,
      suspended: shop.status === 'SUSPENDED',
    };
  }

  /** Số sản phẩm đang bán của shop (shop không hoạt động thì 0) */
  private async sellableCount(shop: Shop): Promise<number> {
    if (shop.status !== 'ACTIVE') return 0;
    return this.prisma.product.count({ where: { shopId: shop.id, status: 'ACTIVE' } });
  }

  /** Ngày tham gia = lúc hồ sơ mở shop được duyệt (không có thì ngày tạo shop) */
  private async joinedAt(shop: Shop): Promise<Date> {
    const approved = await this.prisma.shopApplication.findFirst({
      where: { shopId: shop.id, type: 'REGISTER', status: 'APPROVED' },
      orderBy: { version: 'asc' },
      select: { decidedAt: true },
    });
    return approved?.decidedAt ?? shop.createdAt;
  }
}
