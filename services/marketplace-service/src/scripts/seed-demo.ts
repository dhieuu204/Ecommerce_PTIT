/**
 * Nạp dữ liệu DEMO cho marketplace: bộ danh mục, 2 shop đã duyệt (Táo Xanh Mobile, Galaxy Hub),
 * 23 sản phẩm có biến thể và ảnh, vài voucher shop và 1 voucher sàn.
 * Ảnh sản phẩm là ảnh minh hoạ tự vẽ (services/marketplace-service/seed/images), không phải ảnh thật.
 * Chạy cùng các phần khác bằng `pnpm seed:demo` ở thư mục gốc (cần infra đang chạy và database đã migrate).
 * Chạy lại không tạo trùng: shop đã có thì bỏ qua cả shop đó.
 */
import '../env';
import { DEMO_SHOPS, type ShopApplicationData } from '@san/shared';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { seedCategories } from '../categories/seed-categories';
import { AppConfig } from '../config';
import { PrismaService } from '../prisma.service';
import { StorageService } from '../uploads/storage.service';
import { productImagePrefix, shopLogoPrefix } from '../uploads/uploads.controller';

interface DemoProduct {
  key: string;
  shop: 'A' | 'B';
  category: string;
  name: string;
  description: string;
  weight: number;
  soldCount: number;
  option1Name: string | null;
  option2Name: string | null;
  variants: Array<{
    option1Value: string;
    option2Value: string;
    price: number;
    originalPrice: number | null;
    stock: number;
  }>;
  images: Array<{ file: string; option1Value: string | null }>;
}

const SEED_DIR = join(__dirname, '..', '..', 'seed');
const DAY = 24 * 60 * 60 * 1000;
/** Người tạo voucher sàn demo: lệnh trên máy chủ, không phải một admin cụ thể */
const SYSTEM_ID = '00000000-0000-0000-0000-000000000000';

async function main() {
  const prisma = new PrismaService();
  const storage = new StorageService(new AppConfig());
  const upload = (key: string, file: string) =>
    storage.putPublic(key, readFileSync(join(SEED_DIR, 'images', file)), 'image/webp');

  try {
    const created = await seedCategories(prisma);
    console.log(`Danh mục: thêm ${created} mục mới.`);

    const categories = new Map(
      (await prisma.category.findMany({ where: { parentId: { not: null } } })).map((c) => [
        c.name,
        c.id,
      ]),
    );
    const { products } = JSON.parse(readFileSync(join(SEED_DIR, 'demo-products.json'), 'utf8')) as {
      products: DemoProduct[];
    };

    for (const [code, shop] of Object.entries(DEMO_SHOPS) as Array<
      [keyof typeof DEMO_SHOPS, (typeof DEMO_SHOPS)[keyof typeof DEMO_SHOPS]]
    >) {
      if (await prisma.shop.findUnique({ where: { id: shop.id } })) {
        console.log(`Đã có shop ${shop.name}, bỏ qua.`);
        continue;
      }
      // Địa chỉ lấy hàng: tỉnh theo tên (dữ liệu mẫu hoặc GHN thật), huyện/xã đầu tiên
      const province = await prisma.province.findFirst({
        where: { name: { contains: shop.city } },
        include: {
          districts: { take: 1, orderBy: { id: 'asc' }, include: { wards: { take: 1 } } },
        },
      });
      const district = province?.districts[0];
      const ward = district?.wards[0];
      if (!province || !district || !ward) {
        throw new Error(
          'Chưa có danh sách tỉnh/huyện/xã. Chạy marketplace-service một lần (pnpm dev) để nạp, rồi chạy lại.',
        );
      }
      const logoUrl = await upload(
        `${shopLogoPrefix(shop.owner.id)}demo-logo.webp`,
        `shop-${code.toLowerCase()}-logo.webp`,
      );
      const pickupAddress = `${shop.street}, ${ward.name}, ${district.name}, ${province.name}`;
      const data: ShopApplicationData = {
        name: shop.name,
        description: shop.description,
        logoUrl,
        phone: shop.owner.phone,
        pickupAddress: {
          provinceId: province.id,
          districtId: district.id,
          wardCode: ward.code,
          provinceName: province.name,
          districtName: district.name,
          wardName: ward.name,
          street: shop.street,
        },
        bankAccount: { ...shop.bankAccount },
      };
      const joined = new Date(Date.now() - 120 * DAY);
      await prisma.shop.create({
        data: {
          id: shop.id,
          ownerId: shop.owner.id,
          status: 'ACTIVE',
          name: shop.name,
          description: shop.description,
          logoUrl,
          phone: shop.owner.phone,
          pickupProvinceId: province.id,
          pickupDistrictId: district.id,
          pickupWardCode: ward.code,
          pickupStreet: shop.street,
          pickupAddress,
          bankName: shop.bankAccount.bankName,
          bankAccountNumber: shop.bankAccount.accountNumber,
          bankAccountName: shop.bankAccount.accountName,
          createdAt: joined,
          applications: {
            create: {
              version: 1,
              type: 'REGISTER',
              status: 'APPROVED',
              data: data as object,
              requestKey: `demo-${shop.id}`,
              createdAt: joined,
              decidedAt: joined,
            },
          },
        },
      });

      const mine = products.filter((p) => p.shop === code);
      for (const [index, p] of mine.entries()) {
        const categoryId = categories.get(p.category);
        if (!categoryId) throw new Error(`Không thấy danh mục "${p.category}"`);
        const images: Array<{ url: string; sort: number; option1Value: string | null }> = [];
        for (const [sort, img] of p.images.entries()) {
          const url = await upload(
            `${productImagePrefix(shop.owner.id)}demo-${img.file}`,
            img.file,
          );
          images.push({ url, sort, option1Value: img.option1Value });
        }
        const prices = p.variants.map((v) => v.price);
        // Sản phẩm đăng rải rác trong 60 ngày qua để "Mới nhất" có thứ tự rõ
        const createdAt = new Date(Date.now() - (index * 3 + (code === 'B' ? 1 : 0)) * DAY);
        await prisma.$transaction(async (tx) => {
          const product = await tx.product.create({
            data: {
              shopId: shop.id,
              categoryId,
              name: p.name,
              description: p.description,
              weight: p.weight,
              option1Name: p.option1Name,
              option2Name: p.option2Name,
              minPrice: Math.min(...prices),
              maxPrice: Math.max(...prices),
              soldCount: p.soldCount,
              createdAt,
              images: { create: images },
            },
          });
          for (const [sort, v] of p.variants.entries()) {
            const variant = await tx.productVariant.create({
              data: { productId: product.id, sort, ...v },
            });
            if (v.stock > 0) {
              await tx.stockHistory.create({
                data: {
                  variantId: variant.id,
                  change: v.stock,
                  stockAfter: v.stock,
                  reason: 'Nhập ban đầu (dữ liệu demo)',
                  createdBy: shop.owner.id,
                  createdAt,
                },
              });
            }
          }
        });
      }
      console.log(`Đã tạo shop ${shop.name} với ${mine.length} sản phẩm.`);
    }

    // Voucher: 2 voucher shop + 1 voucher sàn, chạy 30 ngày (P2 chỉ hiện, áp vào đơn ở P3)
    const start = new Date();
    const end = new Date(start.getTime() + 30 * DAY);
    const vouchers = [
      {
        shopId: DEMO_SHOPS.A.id,
        code: 'TAOXANH500',
        name: 'Giảm 500.000đ đơn từ 15 triệu',
        discountType: 'AMOUNT' as const,
        value: 500_000,
        maxDiscount: null,
        minOrder: 15_000_000,
        createdBy: DEMO_SHOPS.A.owner.id,
      },
      {
        shopId: DEMO_SHOPS.B.id,
        code: 'GALAXY10',
        name: 'Giảm 10% tối đa 300.000đ',
        discountType: 'PERCENT' as const,
        value: 10,
        maxDiscount: 300_000,
        minOrder: 1_000_000,
        createdBy: DEMO_SHOPS.B.owner.id,
      },
      {
        shopId: null,
        code: 'SAN50K',
        name: 'Voucher sàn giảm 50.000đ',
        discountType: 'AMOUNT' as const,
        value: 50_000,
        maxDiscount: null,
        minOrder: 300_000,
        createdBy: SYSTEM_ID,
      },
    ];
    for (const v of vouchers) {
      if (await prisma.voucher.findUnique({ where: { code: v.code } })) continue;
      await prisma.voucher.create({
        data: { ...v, startAt: start, endAt: end, quantity: 200, perUserLimit: 1 },
      });
      console.log(`Đã tạo voucher ${v.code}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
