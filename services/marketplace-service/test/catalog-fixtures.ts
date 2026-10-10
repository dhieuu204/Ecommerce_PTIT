import { seedCategories } from '../src/categories/seed-categories';
import type { ShopStatus } from '../generated/prisma';
import { API, makeUser, PICKUP, type TestApp } from './helpers';

export type TestUser = ReturnType<typeof makeUser>;

/** Tạo thẳng shop trong database (không đi qua hồ sơ và sự kiện duyệt) */
export async function createShop(
  t: TestApp,
  owner: TestUser,
  status: ShopStatus = 'ACTIVE',
  name = `Shop ${owner.name} ${Math.floor(Math.random() * 1e6)}`,
) {
  return t.prisma.shop.create({
    data: {
      ownerId: owner.id,
      status,
      name,
      description: 'Shop bán đồ công nghệ chính hãng',
      logoUrl: `http://localhost:9000/san-public/shop-logos/${owner.id}/logo.png`,
      phone: '0912345678',
      pickupProvinceId: PICKUP.provinceId,
      pickupDistrictId: PICKUP.districtId,
      pickupWardCode: PICKUP.wardCode,
      pickupStreet: PICKUP.street,
      pickupAddress: `${PICKUP.street}, Phường Điện Biên, Quận Ba Đình, Hà Nội`,
      bankName: 'Vietcombank',
      bankAccountNumber: '0123456789',
      bankAccountName: 'NGUYEN VAN AN',
    },
  });
}

/** Nạp bộ danh mục mẫu, trả hàm lấy mã danh mục theo slug */
export async function loadCategories(t: TestApp) {
  await seedCategories(t.prisma);
  const all = await t.prisma.category.findMany();
  const bySlug = new Map(all.map((c) => [c.slug, c.id]));
  return (slug: string) => {
    const id = bySlug.get(slug);
    if (!id) throw new Error(`Không có danh mục ${slug}`);
    return id;
  };
}

/** Đường dẫn ảnh sản phẩm hợp lệ của một người */
export const img = (userId: string, name = 'a1') =>
  `http://localhost:9000/san-public/product-images/${userId}/${name}.png`;

/** Sản phẩm 2 nhóm (Màu × Dung lượng): Đen/128GB, Đen/256GB, Trắng/128GB */
export function phoneBody(userId: string, categoryId: string, overrides: object = {}) {
  return {
    name: 'Điện thoại iPhone 16 Pro',
    description: 'Hàng chính hãng VN/A, nguyên seal, bảo hành 12 tháng.',
    categoryId,
    weight: 400,
    option1Name: 'Màu sắc',
    option2Name: 'Dung lượng',
    variants: [
      {
        option1Value: 'Đen',
        option2Value: '128GB',
        price: 25000000,
        originalPrice: 28000000,
        stock: 10,
      },
      { option1Value: 'Đen', option2Value: '256GB', price: 28000000, stock: 5 },
      { option1Value: 'Trắng', option2Value: '128GB', price: 25500000, stock: 0 },
    ],
    images: [
      { url: img(userId, 'cover') },
      { url: img(userId, 'side') },
      { url: img(userId, 'black'), option1Value: 'Đen' },
    ],
    ...overrides,
  };
}

/** Sản phẩm không phân loại: đúng 1 biến thể */
export function simpleBody(userId: string, categoryId: string, overrides: object = {}) {
  return {
    name: 'Ốp lưng silicon trong suốt',
    description: 'Ốp lưng silicon dẻo, chống sốc 4 góc, không ố vàng.',
    categoryId,
    weight: 50,
    variants: [{ price: 99000, stock: 100 }],
    images: [{ url: img(userId, 'case') }],
    ...overrides,
  };
}

/** Tạo sản phẩm qua API, trả body */
export async function createProduct(t: TestApp, user: TestUser, body: object) {
  const res = await t
    .http()
    .post(`${API}/shops/me/products`)
    .set('Authorization', `Bearer ${user.token}`)
    .send(body);
  if (res.status !== 201)
    throw new Error(`Tạo sản phẩm lỗi ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body as {
    id: string;
    variants: Array<{
      id: string;
      option1Value: string | null;
      option2Value: string | null;
      stock: number;
    }>;
  };
}
