import { Injectable } from '@nestjs/common';
import { AppError, skipTake, toPage, type AuthUser } from '@san/nest-common';
import type { Page } from '@san/shared';
import { toPrefixQuery } from '../catalog/search';
import { AppConfig } from '../config';
import { PrismaService } from '../prisma.service';
import { StorageService } from '../uploads/storage.service';
import { productImagePrefix } from '../uploads/uploads.controller';
import { Prisma, type Product, type ProductVariant } from '../../generated/prisma';
import type {
  ProductInputDto,
  ProductStatusDto,
  SellerProductQuery,
  StockAdjustDto,
  StockHistoryQuery,
} from './dto/product.dto';
import { requireSellerShop } from './seller-shop';

/** Một dòng ở trang "Sản phẩm của tôi" */
export interface SellerProductRow {
  id: string;
  name: string;
  status: Product['status'];
  /** Ảnh chung đầu tiên */
  image: string | null;
  minPrice: number;
  maxPrice: number;
  /** Tổng tồn của các biến thể đang bán */
  totalStock: number;
  /** Tổng còn bán được (tồn - đang giữ) của các biến thể đang bán */
  totalAvailable: number;
  variantCount: number;
  soldCount: number;
  categoryName: string;
  updatedAt: Date;
}

export interface CategoryRef {
  id: string;
  name: string;
  slug: string;
}

export interface ProductImageView {
  url: string;
  /** null = ảnh chung */
  option1Value: string | null;
}

/** Biến thể ở Kênh người bán: có cả tồn và lượng đang giữ */
export interface SellerVariant {
  id: string;
  option1Value: string | null;
  option2Value: string | null;
  price: number;
  originalPrice: number | null;
  stock: number;
  /** Đang giữ cho đơn chưa thanh toán (từ P3) */
  reserved: number;
  /** stock - reserved */
  available: number;
}

/** Chi tiết sản phẩm ở Kênh người bán (chỉ biến thể đang bán) */
export interface SellerProduct {
  id: string;
  name: string;
  description: string;
  status: Product['status'];
  categoryId: string;
  category: CategoryRef & { parent: CategoryRef | null };
  weight: number;
  option1Name: string | null;
  option2Name: string | null;
  minPrice: number;
  maxPrice: number;
  soldCount: number;
  /** Ảnh chung trước (theo thứ tự), rồi ảnh theo lựa chọn nhóm 1 */
  images: ProductImageView[];
  variants: SellerVariant[];
  createdAt: Date;
  updatedAt: Date;
}

/** Kết quả điều chỉnh tồn */
export interface StockAdjustResult {
  variantId: string;
  stock: number;
  reserved: number;
  available: number;
}

/** Một dòng lịch sử tồn kho */
export interface StockHistoryRow {
  id: string;
  variantId: string;
  option1Value: string | null;
  option2Value: string | null;
  change: number;
  stockAfter: number;
  reason: string;
  /** userId người đổi */
  createdBy: string;
  createdAt: Date;
}

/** Biến thể đã chuẩn hóa ('' = không có lựa chọn ở nhóm đó) */
interface VariantInput {
  index: number;
  id?: string;
  o1: string;
  o2: string;
  price: number;
  originalPrice: number | null;
  stock?: number;
}

interface ProductInput {
  name: string;
  description: string;
  categoryId: string;
  weight: number;
  option1Name: string | null;
  option2Name: string | null;
  variants: VariantInput[];
  images: Array<{ url: string; option1Value: string | null }>;
}

const INITIAL_STOCK_REASON = 'Nhập ban đầu';
const IMAGE_FILE = /^[A-Za-z0-9-]+\.(jpg|png|webp)$/;

const comboKey = (o1: string, o2: string) => `${o1}\u0000${o2}`;
const comboLabel = (o1: string, o2: string) => [o1, o2].filter(Boolean).join(' / ');
const vnd = (n: number) => `${n.toLocaleString('vi-VN')}đ`;
const notFound = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy sản phẩm.');

function invalid(fields: Record<string, string>): AppError {
  return new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu chưa hợp lệ.', { fields });
}

/**
 * Sản phẩm của seller (CAT-02, CAT-03) và tồn kho (INV-01). Đăng là bán ngay. Tồn chỉ đổi qua API
 * điều chỉnh tồn (mỗi lần một dòng stock_history), trừ tồn ban đầu của biến thể mới.
 */
@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly storage: StorageService,
  ) {}

  async list(user: AuthUser, q: SellerProductQuery): Promise<Page<SellerProductRow>> {
    const shop = await requireSellerShop(this.prisma, user.id);
    const conditions: Prisma.Sql[] = [Prisma.sql`p.shop_id = ${shop.id}::uuid`];
    if (q.status) conditions.push(Prisma.sql`p.status = ${q.status}::"ProductStatus"`);
    if (q.categoryId) {
      conditions.push(
        Prisma.sql`p.category_id IN (SELECT id FROM categories WHERE id = ${q.categoryId}::uuid OR parent_id = ${q.categoryId}::uuid)`,
      );
    }
    const tsq = toPrefixQuery(q.q);
    if (tsq) conditions.push(Prisma.sql`p.search_vector @@ to_tsquery('simple', ${tsq})`);
    const where = Prisma.join(conditions, ' AND ');

    const { skip, take } = skipTake(q);
    const [countRows, idRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ total: bigint }>>`
        SELECT count(*) AS total FROM products p WHERE ${where}`,
      this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT p.id FROM products p WHERE ${where}
        ORDER BY p.updated_at DESC, p.id LIMIT ${take} OFFSET ${skip}`,
    ]);
    const ids = idRows.map((r) => r.id);
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: {
        variants: { where: { active: true } },
        images: { where: { option1Value: null }, orderBy: { sort: 'asc' }, take: 1 },
        category: { select: { name: true } },
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const items = ids.map((id) => {
      const p = byId.get(id)!;
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        image: p.images[0]?.url ?? null,
        minPrice: p.minPrice,
        maxPrice: p.maxPrice,
        totalStock: p.variants.reduce((s, v) => s + v.stock, 0),
        totalAvailable: p.variants.reduce((s, v) => s + Math.max(0, v.stock - v.reserved), 0),
        variantCount: p.variants.length,
        soldCount: p.soldCount,
        categoryName: p.category.name,
        updatedAt: p.updatedAt,
      };
    });
    return toPage(items, Number(countRows[0]?.total ?? 0), q);
  }

  async get(user: AuthUser, productId: string): Promise<SellerProduct> {
    const shop = await requireSellerShop(this.prisma, user.id);
    return this.detail(shop.id, productId);
  }

  /** Tạo sản phẩm: ACTIVE ngay, biến thể kèm tồn ban đầu (ghi lịch sử "Nhập ban đầu") */
  async create(user: AuthUser, dto: ProductInputDto): Promise<SellerProduct> {
    const shop = await requireSellerShop(this.prisma, user.id);
    const input = this.normalize(user.id, dto, false);
    const missingStock: Record<string, string> = {};
    for (const v of input.variants) {
      if (v.stock === undefined)
        missingStock[`variants.${v.index}.stock`] = 'Vui lòng nhập tồn kho.';
    }
    if (Object.keys(missingStock).length) throw invalid(missingStock);

    const productId = await this.prisma.$transaction(async (tx) => {
      await this.checkCategory(tx, input.categoryId, null);
      const prices = input.variants.map((v) => v.price);
      const product = await tx.product.create({
        data: {
          shopId: shop.id,
          categoryId: input.categoryId,
          name: input.name,
          description: input.description,
          weight: input.weight,
          option1Name: input.option1Name,
          option2Name: input.option2Name,
          minPrice: Math.min(...prices),
          maxPrice: Math.max(...prices),
          variants: {
            create: input.variants.map((v) => ({
              option1Value: v.o1,
              option2Value: v.o2,
              price: v.price,
              originalPrice: v.originalPrice,
              stock: v.stock!,
              sort: v.index,
            })),
          },
          images: { create: input.images.map((img, i) => ({ ...img, sort: i })) },
        },
        include: { variants: true },
      });
      await this.logInitialStock(tx, product.variants, user.id);
      return product.id;
    });
    return this.detail(shop.id, productId);
  }

  /**
   * Sửa toàn bộ sản phẩm. Biến thể cũ nhận ra bằng `id` (tồn giữ nguyên); biến thể không gửi lại
   * thì tắt (active = false), trừ khi đang có lượng giữ cho đơn; thêm lại đúng tổ hợp đã tắt thì
   * bật lại dòng cũ (giữ tồn cũ). Ảnh thay cả bộ.
   */
  async update(user: AuthUser, productId: string, dto: ProductInputDto): Promise<SellerProduct> {
    const shop = await requireSellerShop(this.prisma, user.id);
    const input = this.normalize(user.id, dto, true);

    await this.prisma.$transaction(async (tx) => {
      // Khóa sản phẩm và các biến thể: hai lần sửa cùng lúc chạy lần lượt
      const product = await this.lockOwnProduct(tx, shop.id, productId);
      await this.checkCategory(tx, input.categoryId, product.categoryId);
      await tx.$queryRaw`SELECT id FROM product_variants WHERE product_id = ${productId}::uuid FOR UPDATE`;
      const existing = await tx.productVariant.findMany({ where: { productId } });
      const byId = new Map(existing.map((v) => [v.id, v]));
      const byCombo = new Map(existing.map((v) => [comboKey(v.option1Value, v.option2Value), v]));

      // 1. Biến thể gửi kèm id phải thuộc sản phẩm này
      const claimed = new Map<string, VariantInput>();
      const unknown: Record<string, string> = {};
      for (const v of input.variants) {
        if (!v.id) continue;
        if (byId.has(v.id)) claimed.set(v.id, v);
        else unknown[`variants.${v.index}.id`] = 'Biến thể không thuộc sản phẩm này.';
      }
      if (Object.keys(unknown).length) throw invalid(unknown);

      // 2. Biến thể không có id: trùng tổ hợp với dòng cũ chưa ai nhận thì dùng lại dòng đó
      const creates: VariantInput[] = [];
      for (const v of input.variants) {
        if (v.id) continue;
        const row = byCombo.get(comboKey(v.o1, v.o2));
        if (row && !claimed.has(row.id)) claimed.set(row.id, v);
        else creates.push(v);
      }

      // 3. Đổi tên lựa chọn của biến thể cũ thành đúng tổ hợp của một dòng đã bỏ → trùng
      const unclaimed = existing.filter((r) => !claimed.has(r.id));
      const unclaimedCombos = new Set(
        unclaimed.map((r) => comboKey(r.option1Value, r.option2Value)),
      );
      for (const [rowId, v] of claimed) {
        const row = byId.get(rowId)!;
        const target = comboKey(v.o1, v.o2);
        if (
          target !== comboKey(row.option1Value, row.option2Value) &&
          unclaimedCombos.has(target)
        ) {
          throw new AppError(
            409,
            'DUPLICATE_VARIANT',
            `Tổ hợp "${comboLabel(v.o1, v.o2)}" trùng với một biến thể khác của sản phẩm.`,
            { index: v.index },
          );
        }
      }

      // 4. Biến thể bị bỏ: đang giữ hàng cho đơn thì không bỏ được
      const removed = unclaimed.filter((r) => r.active);
      const reserved = removed.find((r) => r.reserved > 0);
      if (reserved) {
        throw new AppError(
          409,
          'VARIANT_RESERVED',
          `Biến thể "${comboLabel(reserved.option1Value, reserved.option2Value)}" đang được giữ cho đơn chưa thanh toán nên chưa bỏ được.`,
          { variantId: reserved.id },
        );
      }
      if (removed.length) {
        await tx.productVariant.updateMany({
          where: { id: { in: removed.map((r) => r.id) } },
          data: { active: false },
        });
      }

      // 5. Cập nhật biến thể cũ. Đổi tên lựa chọn làm 2 bước (qua tên tạm) để hai biến thể đổi
      //    tên cho nhau không vướng ràng buộc không trùng tổ hợp
      const renamed = [...claimed].filter(([rowId, v]) => {
        const row = byId.get(rowId)!;
        return comboKey(row.option1Value, row.option2Value) !== comboKey(v.o1, v.o2);
      });
      for (const [i, [rowId]] of renamed.entries()) {
        await tx.productVariant.update({
          where: { id: rowId },
          data: { option1Value: `\u0001${i}`, option2Value: '' },
        });
      }
      for (const [rowId, v] of claimed) {
        await tx.productVariant.update({
          where: { id: rowId },
          data: {
            option1Value: v.o1,
            option2Value: v.o2,
            price: v.price,
            originalPrice: v.originalPrice,
            sort: v.index,
            active: true,
          },
        });
      }

      // 6. Biến thể mới: tồn ban đầu bắt buộc
      const missingStock: Record<string, string> = {};
      for (const v of creates) {
        if (v.stock === undefined)
          missingStock[`variants.${v.index}.stock`] = 'Vui lòng nhập tồn kho.';
      }
      if (Object.keys(missingStock).length) throw invalid(missingStock);
      const created: ProductVariant[] = [];
      for (const v of creates) {
        created.push(
          await tx.productVariant.create({
            data: {
              productId,
              option1Value: v.o1,
              option2Value: v.o2,
              price: v.price,
              originalPrice: v.originalPrice,
              stock: v.stock!,
              sort: v.index,
            },
          }),
        );
      }
      await this.logInitialStock(tx, created, user.id);

      // 7. Ảnh thay cả bộ, rồi thông tin chung và khoảng giá
      await tx.productImage.deleteMany({ where: { productId } });
      await tx.productImage.createMany({
        data: input.images.map((img, i) => ({ ...img, productId, sort: i })),
      });
      const prices = input.variants.map((v) => v.price);
      await tx.product.update({
        where: { id: productId },
        data: {
          name: input.name,
          description: input.description,
          categoryId: input.categoryId,
          weight: input.weight,
          option1Name: input.option1Name,
          option2Name: input.option2Name,
          minPrice: Math.min(...prices),
          maxPrice: Math.max(...prices),
        },
      });
    });
    return this.detail(shop.id, productId);
  }

  /** ACTIVE ↔ HIDDEN. Ẩn không xóa gì */
  async setStatus(
    user: AuthUser,
    productId: string,
    dto: ProductStatusDto,
  ): Promise<SellerProduct> {
    const shop = await requireSellerShop(this.prisma, user.id);
    const { count } = await this.prisma.product.updateMany({
      where: { id: productId, shopId: shop.id },
      data: { status: dto.status },
    });
    if (count === 0) throw notFound();
    return this.detail(shop.id, productId);
  }

  /**
   * Điều chỉnh tồn một biến thể bằng một câu UPDATE có điều kiện: hai người sửa cùng lúc thì câu
   * sau chạy trên số tồn mới nhất (PostgreSQL khóa dòng), nên không làm tồn xuống dưới lượng đang giữ.
   */
  async adjustStock(
    user: AuthUser,
    productId: string,
    variantId: string,
    dto: StockAdjustDto,
  ): Promise<StockAdjustResult> {
    const shop = await requireSellerShop(this.prisma, user.id);
    const max = this.config.stockMax;
    const tooLarge = () =>
      new AppError(
        400,
        'STOCK_TOO_LARGE',
        `Tồn kho mỗi biến thể tối đa ${max.toLocaleString('vi-VN')}.`,
      );
    const belowReserved = (stock: number, reserved: number) =>
      new AppError(
        409,
        'STOCK_BELOW_RESERVED',
        reserved > 0
          ? `Tồn sau điều chỉnh không được nhỏ hơn số đang giữ cho đơn chưa thanh toán (${reserved}).`
          : 'Tồn sau điều chỉnh không được âm.',
        { stock, reserved },
      );

    return this.prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findFirst({
        where: { id: variantId, productId, active: true, product: { shopId: shop.id } },
      });
      if (!variant) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy biến thể.');
      if (dto.change > max) throw tooLarge();
      if (dto.change < -max) throw belowReserved(variant.stock, variant.reserved);

      const rows = await tx.$queryRaw<Array<{ stock: number; reserved: number }>>`
        UPDATE product_variants SET stock = stock + ${dto.change}::int
        WHERE id = ${variantId}::uuid
          AND stock + ${dto.change}::int >= reserved
          AND stock + ${dto.change}::int <= ${max}::int
        RETURNING stock, reserved`;
      const row = rows[0];
      if (!row) {
        const now = await tx.productVariant.findUniqueOrThrow({ where: { id: variantId } });
        if (now.stock + dto.change > max) throw tooLarge();
        throw belowReserved(now.stock, now.reserved);
      }
      const { stock, reserved } = row;
      await tx.stockHistory.create({
        data: {
          variantId,
          change: dto.change,
          stockAfter: stock,
          reason: dto.reason,
          createdBy: user.id,
        },
      });
      return { variantId, stock, reserved, available: stock - reserved };
    });
  }

  /** Lịch sử tồn của một sản phẩm, mới nhất lên đầu */
  async stockHistory(
    user: AuthUser,
    productId: string,
    q: StockHistoryQuery,
  ): Promise<Page<StockHistoryRow>> {
    const shop = await requireSellerShop(this.prisma, user.id);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, shopId: shop.id },
    });
    if (!product) throw notFound();
    const where: Prisma.StockHistoryWhereInput = {
      variant: { productId },
      ...(q.variantId ? { variantId: q.variantId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.stockHistory.findMany({
        where,
        include: { variant: { select: { option1Value: true, option2Value: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.stockHistory.count({ where }),
    ]);
    const items = rows.map((r) => ({
      id: r.id,
      variantId: r.variantId,
      option1Value: r.variant.option1Value || null,
      option2Value: r.variant.option2Value || null,
      change: r.change,
      stockAfter: r.stockAfter,
      reason: r.reason,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
    }));
    return toPage(items, total, q);
  }

  // ----- phần dùng chung -----

  /** Chi tiết sản phẩm của shop (biến thể đang bán), không thuộc shop → 404 */
  private async detail(shopId: string, productId: string): Promise<SellerProduct> {
    const p = await this.prisma.product.findFirst({
      where: { id: productId, shopId },
      include: {
        category: { include: { parent: true } },
        variants: { where: { active: true }, orderBy: { sort: 'asc' } },
        images: { orderBy: { sort: 'asc' } },
      },
    });
    if (!p) throw notFound();
    const ref = (c: { id: string; name: string; slug: string }): CategoryRef => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
    });
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      categoryId: p.categoryId,
      category: { ...ref(p.category), parent: p.category.parent && ref(p.category.parent) },
      weight: p.weight,
      option1Name: p.option1Name,
      option2Name: p.option2Name,
      minPrice: p.minPrice,
      maxPrice: p.maxPrice,
      soldCount: p.soldCount,
      images: sortImages(p.images),
      variants: p.variants.map((v) => ({
        id: v.id,
        option1Value: v.option1Value || null,
        option2Value: v.option2Value || null,
        price: v.price,
        originalPrice: v.originalPrice,
        stock: v.stock,
        reserved: v.reserved,
        available: v.stock - v.reserved,
      })),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  private async lockOwnProduct(
    tx: Prisma.TransactionClient,
    shopId: string,
    productId: string,
  ): Promise<Product> {
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId}::uuid FOR UPDATE`;
    const product = await tx.product.findFirst({ where: { id: productId, shopId } });
    if (!product) throw notFound();
    return product;
  }

  /**
   * Danh mục phải là cấp 2 và chưa ẩn (kể cả danh mục cha). Khi sửa mà giữ nguyên danh mục cũ thì
   * vẫn được dù danh mục đó đã bị ẩn (sản phẩm đã gắn vẫn bán bình thường).
   */
  private async checkCategory(
    tx: Prisma.TransactionClient,
    categoryId: string,
    currentCategoryId: string | null,
  ): Promise<void> {
    if (categoryId === currentCategoryId) return;
    const c = await tx.category.findUnique({
      where: { id: categoryId },
      include: { parent: true },
    });
    if (!c || !c.parent || c.hidden || c.parent.hidden) {
      throw new AppError(400, 'INVALID_CATEGORY', 'Vui lòng chọn một danh mục con đang hiển thị.');
    }
  }

  private async logInitialStock(
    tx: Prisma.TransactionClient,
    variants: ProductVariant[],
    userId: string,
  ): Promise<void> {
    const logs = variants
      .filter((v) => v.stock > 0)
      .map((v) => ({
        variantId: v.id,
        change: v.stock,
        stockAfter: v.stock,
        reason: INITIAL_STOCK_REASON,
        createdBy: userId,
      }));
    if (logs.length) await tx.stockHistory.createMany({ data: logs });
  }

  /**
   * Kiểm các quy tắc cần con số cấu hình hoặc nhìn cả sản phẩm (DTO đã kiểm kiểu và độ dài).
   * Sai thì 400 VALIDATION_ERROR (details.fields), trùng tổ hợp 409 DUPLICATE_VARIANT, ảnh không
   * nằm trong thư mục của người gọi 400 INVALID_IMAGE_URL.
   */
  private normalize(userId: string, dto: ProductInputDto, isUpdate: boolean): ProductInput {
    const c = this.config;
    const fields: Record<string, string> = {};
    const option1Name = dto.option1Name ?? null;
    const option2Name = dto.option2Name ?? null;

    if (dto.weight > c.weightMaxGrams) {
      fields.weight = `Khối lượng tối đa ${c.weightMaxGrams.toLocaleString('vi-VN')} g.`;
    }
    if (option2Name && !option1Name) {
      fields.option2Name = 'Hãy đặt tên nhóm phân loại 1 trước.';
    } else if (option2Name && option1Name!.toLowerCase() === option2Name.toLowerCase()) {
      fields.option2Name = 'Hai nhóm phân loại phải khác tên.';
    }

    const seenIds = new Set<string>();
    const variants: VariantInput[] = dto.variants.map((v, index) => {
      const f = `variants.${index}`;
      const o1 = v.option1Value ?? '';
      const o2 = v.option2Value ?? '';
      if (option1Name && !o1) fields[`${f}.option1Value`] = `Vui lòng nhập ${option1Name}.`;
      if (!option1Name && o1) fields[`${f}.option1Value`] = 'Sản phẩm chưa có nhóm phân loại 1.';
      if (option2Name && !o2) fields[`${f}.option2Value`] = `Vui lòng nhập ${option2Name}.`;
      if (!option2Name && o2) fields[`${f}.option2Value`] = 'Sản phẩm chưa có nhóm phân loại 2.';
      if (v.price < c.priceMin || v.price > c.priceMax) {
        fields[`${f}.price`] = `Giá từ ${vnd(c.priceMin)} đến ${vnd(c.priceMax)}.`;
      }
      const originalPrice = v.originalPrice ?? null;
      if (originalPrice !== null && originalPrice <= v.price) {
        fields[`${f}.originalPrice`] = 'Giá gốc phải lớn hơn giá bán.';
      } else if (originalPrice !== null && originalPrice > c.priceMax) {
        fields[`${f}.originalPrice`] = `Giá gốc tối đa ${vnd(c.priceMax)}.`;
      }
      if (v.stock !== undefined && v.stock > c.stockMax) {
        fields[`${f}.stock`] = `Tồn kho tối đa ${c.stockMax.toLocaleString('vi-VN')}.`;
      }
      const id = isUpdate ? v.id?.toLowerCase() : undefined;
      if (id && seenIds.has(id)) fields[`${f}.id`] = 'Biến thể bị gửi trùng.';
      if (id) seenIds.add(id);
      return { index, id, o1, o2, price: v.price, originalPrice, stock: v.stock };
    });

    if (!option1Name && variants.length !== 1) {
      fields.variants = 'Sản phẩm không phân loại có đúng 1 biến thể.';
    }
    const values1 = new Set(variants.map((v) => v.o1).filter(Boolean));
    const values2 = new Set(variants.map((v) => v.o2).filter(Boolean));
    if (values1.size > c.variantMaxOptions || values2.size > c.variantMaxOptions) {
      fields.variants = `Mỗi nhóm phân loại tối đa ${c.variantMaxOptions} lựa chọn.`;
    }

    const images = dto.images.map((img) => ({
      url: img.url,
      option1Value: img.option1Value ?? null,
    }));
    const general = images.filter((img) => img.option1Value === null).length;
    if (general < 1 || general > c.productMaxImages) {
      fields.images = `Cần từ 1 đến ${c.productMaxImages} ảnh chung.`;
    }
    const withImage = new Set<string>();
    images.forEach((img, i) => {
      if (img.option1Value === null) return;
      if (!values1.has(img.option1Value)) {
        fields[`images.${i}.option1Value`] =
          `Lựa chọn "${img.option1Value}" không có trong các biến thể.`;
      } else if (withImage.has(img.option1Value)) {
        fields[`images.${i}.option1Value`] = 'Mỗi lựa chọn chỉ có 1 ảnh riêng.';
      }
      withImage.add(img.option1Value);
    });
    if (Object.keys(fields).length) throw invalid(fields);

    // Không trùng tổ hợp (không phân biệt hoa thường)
    const combos = new Set<string>();
    for (const v of variants) {
      const key = comboKey(v.o1.toLowerCase(), v.o2.toLowerCase());
      if (combos.has(key)) {
        throw new AppError(
          409,
          'DUPLICATE_VARIANT',
          `Tổ hợp "${comboLabel(v.o1, v.o2)}" bị trùng.`,
          { index: v.index },
        );
      }
      combos.add(key);
    }

    // Ảnh phải nằm trong thư mục ảnh sản phẩm của chính người gọi
    const prefix = this.storage.publicUrl(productImagePrefix(userId));
    images.forEach((img, index) => {
      if (!img.url.startsWith(prefix) || !IMAGE_FILE.test(img.url.slice(prefix.length))) {
        throw new AppError(
          400,
          'INVALID_IMAGE_URL',
          'Ảnh sản phẩm phải được tải lên từ tài khoản của bạn.',
          { index },
        );
      }
    });

    return {
      name: dto.name,
      description: dto.description,
      categoryId: dto.categoryId,
      weight: dto.weight,
      option1Name,
      option2Name,
      variants,
      images,
    };
  }
}

/** Ảnh chung trước (theo thứ tự), rồi ảnh theo lựa chọn nhóm 1 */
export function sortImages(
  images: Array<{ url: string; option1Value: string | null; sort: number }>,
): ProductImageView[] {
  return [...images]
    .sort(
      (a, b) =>
        Number(a.option1Value !== null) - Number(b.option1Value !== null) || a.sort - b.sort,
    )
    .map((img) => ({ url: img.url, option1Value: img.option1Value }));
}
