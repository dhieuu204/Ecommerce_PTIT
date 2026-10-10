import type { PrismaService } from '../prisma.service';

interface SeedCategory {
  name: string;
  slug: string;
  /** Tên icon lucide (bắt buộc với danh mục cấp 1) */
  icon: string;
  children: Array<{ name: string; slug: string }>;
}

/** Bộ danh mục mẫu: công nghệ trước, thêm vài ngành khác (lựa chọn của chủ đồ án 10/10) */
export const SEED_CATEGORIES: SeedCategory[] = [
  {
    name: 'Điện thoại',
    slug: 'dien-thoai',
    icon: 'smartphone',
    children: [
      { name: 'iPhone', slug: 'iphone' },
      { name: 'Samsung', slug: 'samsung' },
      { name: 'Xiaomi', slug: 'xiaomi' },
      { name: 'OPPO', slug: 'oppo' },
    ],
  },
  {
    name: 'Máy tính bảng',
    slug: 'may-tinh-bang',
    icon: 'tablet',
    children: [
      { name: 'iPad', slug: 'ipad' },
      { name: 'Máy tính bảng Android', slug: 'may-tinh-bang-android' },
    ],
  },
  {
    name: 'Laptop',
    slug: 'laptop',
    icon: 'laptop',
    children: [
      { name: 'MacBook', slug: 'macbook' },
      { name: 'Laptop Windows', slug: 'laptop-windows' },
    ],
  },
  {
    name: 'Đồng hồ thông minh',
    slug: 'dong-ho-thong-minh',
    icon: 'watch',
    children: [
      { name: 'Apple Watch', slug: 'apple-watch' },
      { name: 'Đồng hồ Android', slug: 'dong-ho-android' },
    ],
  },
  {
    name: 'Âm thanh',
    slug: 'am-thanh',
    icon: 'headphones',
    children: [
      { name: 'Tai nghe', slug: 'tai-nghe' },
      { name: 'Loa', slug: 'loa' },
    ],
  },
  {
    name: 'Phụ kiện',
    slug: 'phu-kien',
    icon: 'cable',
    children: [
      { name: 'Sạc và cáp', slug: 'sac-va-cap' },
      { name: 'Ốp lưng', slug: 'op-lung' },
      { name: 'Sạc dự phòng', slug: 'sac-du-phong' },
    ],
  },
  {
    name: 'Thời trang',
    slug: 'thoi-trang',
    icon: 'shirt',
    children: [
      { name: 'Thời trang nam', slug: 'thoi-trang-nam' },
      { name: 'Thời trang nữ', slug: 'thoi-trang-nu' },
      { name: 'Giày dép', slug: 'giay-dep' },
      { name: 'Túi xách', slug: 'tui-xach' },
    ],
  },
  {
    name: 'Nhà cửa',
    slug: 'nha-cua',
    icon: 'house',
    children: [
      { name: 'Đồ dùng nhà bếp', slug: 'do-dung-nha-bep' },
      { name: 'Trang trí', slug: 'trang-tri' },
      { name: 'Đồ gia dụng', slug: 'do-gia-dung' },
    ],
  },
  {
    name: 'Làm đẹp',
    slug: 'lam-dep',
    icon: 'sparkles',
    children: [
      { name: 'Chăm sóc da', slug: 'cham-soc-da' },
      { name: 'Trang điểm', slug: 'trang-diem' },
      { name: 'Nước hoa', slug: 'nuoc-hoa' },
    ],
  },
];

/**
 * Nạp bộ danh mục mẫu. Chạy lại nhiều lần không sao: danh mục đã có (theo slug) được giữ nguyên,
 * kể cả phần admin đã sửa; chỉ thêm danh mục còn thiếu. Trả số danh mục mới thêm.
 */
export async function seedCategories(prisma: PrismaService): Promise<number> {
  let created = 0;
  const upsert = async (data: {
    name: string;
    slug: string;
    icon: string | null;
    sort: number;
    parentId: string | null;
  }) => {
    const existing = await prisma.category.findUnique({ where: { slug: data.slug } });
    if (existing) return existing;
    created++;
    return prisma.category.upsert({ where: { slug: data.slug }, update: {}, create: data });
  };
  for (const [i, root] of SEED_CATEGORIES.entries()) {
    const parent = await upsert({
      name: root.name,
      slug: root.slug,
      icon: root.icon,
      sort: (i + 1) * 10,
      parentId: null,
    });
    for (const [j, child] of root.children.entries()) {
      await upsert({ ...child, icon: null, sort: (j + 1) * 10, parentId: parent.id });
    }
  }
  return created;
}
