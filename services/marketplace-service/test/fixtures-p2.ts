import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/prisma.service';
import type { Product, ProductVariant, Shop } from '../generated/prisma';

/**
 * Dữ liệu mẫu P2 ghi thẳng vào database (không qua API sản phẩm), để test giỏ hàng, voucher,
 * admin shop không phụ thuộc phần sản phẩm.
 */

let seq = 0;
const next = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Shop đã được duyệt (mặc định ACTIVE), kèm hồ sơ mở shop đã duyệt */
export async function makeShop(
  prisma: PrismaService,
  ownerId: string,
  overrides: Partial<Shop> = {},
): Promise<Shop> {
  const name = overrides.name ?? `Shop ${next()}`;
  const shop = await prisma.shop.create({
    data: {
      ownerId,
      status: 'ACTIVE',
      name,
      description: 'Shop bán đồ công nghệ',
      logoUrl: `http://localhost:9000/san-public/shop-logos/${ownerId}/logo.png`,
      phone: '0912345678',
      pickupProvinceId: 90001,
      pickupDistrictId: 90101,
      pickupWardCode: '9010101',
      pickupStreet: '12 Kim Mã',
      pickupAddress: '12 Kim Mã, Phường Điện Biên, Quận Ba Đình, Hà Nội',
      bankName: 'Vietcombank',
      bankAccountNumber: '0123456789',
      bankAccountName: 'NGUYEN VAN AN',
      ...overrides,
    },
  });
  if (shop.status === 'ACTIVE' || shop.status === 'SUSPENDED') {
    await prisma.shopApplication.create({
      data: {
        shopId: shop.id,
        version: 1,
        type: 'REGISTER',
        status: 'APPROVED',
        data: { name },
        requestKey: randomUUID(),
        decidedAt: new Date('2026-10-01T03:00:00Z'),
      },
    });
  }
  return shop;
}

export interface VariantInput {
  option1Value?: string;
  option2Value?: string;
  price?: number;
  originalPrice?: number | null;
  stock?: number;
  reserved?: number;
  active?: boolean;
}

export interface ProductInput {
  name?: string;
  status?: Product['status'];
  option1Name?: string | null;
  option2Name?: string | null;
  variants?: VariantInput[];
  /** Ảnh: option1Value trống = ảnh chung */
  images?: Array<{ url: string; option1Value?: string | null; sort?: number }>;
}

/** Sản phẩm (kèm danh mục 2 cấp mới) và các biến thể */
export async function makeProduct(
  prisma: PrismaService,
  shopId: string,
  input: ProductInput = {},
): Promise<{ product: Product; variants: ProductVariant[] }> {
  const key = next();
  const parent = await prisma.category.create({
    data: { name: 'Điện thoại', slug: `dien-thoai-${key}` },
  });
  const category = await prisma.category.create({
    data: { name: 'Điện thoại di động', slug: `di-dong-${key}`, parentId: parent.id },
  });
  const variants = input.variants ?? [{}];
  const prices = variants.map((v) => v.price ?? 100_000);
  const product = await prisma.product.create({
    data: {
      shopId,
      categoryId: category.id,
      name: input.name ?? `Điện thoại ${key}`,
      description: 'Mô tả sản phẩm đủ dài để hợp lệ.',
      status: input.status ?? 'ACTIVE',
      option1Name: input.option1Name ?? null,
      option2Name: input.option2Name ?? null,
      weight: 500,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
    },
  });
  const created: ProductVariant[] = [];
  for (const [i, v] of variants.entries()) {
    created.push(
      await prisma.productVariant.create({
        data: {
          productId: product.id,
          option1Value: v.option1Value ?? '',
          option2Value: v.option2Value ?? '',
          price: v.price ?? 100_000,
          originalPrice: v.originalPrice ?? null,
          stock: v.stock ?? 10,
          reserved: v.reserved ?? 0,
          active: v.active ?? true,
          sort: i,
        },
      }),
    );
  }
  for (const [i, img] of (input.images ?? []).entries()) {
    await prisma.productImage.create({
      data: {
        productId: product.id,
        url: img.url,
        option1Value: img.option1Value ?? null,
        sort: img.sort ?? i,
      },
    });
  }
  return { product, variants: created };
}
