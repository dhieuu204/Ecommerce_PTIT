import type { PrismaService } from '../prisma.service';

interface SeedCategory {
  name: string;
  slug: string;
  /** Tên icon lucide (bắt buộc với danh mục cấp 1) */
  icon: string;
  children: Array<{ name: string; slug: string }>;
}

/**
 * Bộ danh mục mẫu: sàn chuyên đồ điện tử (chủ đồ án chốt 02/11/2026, bỏ Thời trang, Nhà cửa, Làm đẹp
 * của lựa chọn 10/10). Admin vẫn thêm được danh mục khác trên web.
 */
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
    name: 'Màn hình & PC',
    slug: 'man-hinh-pc',
    icon: 'monitor',
    children: [
      { name: 'Màn hình', slug: 'man-hinh' },
      { name: 'PC', slug: 'pc' },
      { name: 'Chuột & bàn phím', slug: 'chuot-ban-phim' },
    ],
  },
  {
    name: 'Gaming',
    slug: 'gaming',
    icon: 'gamepad-2',
    children: [
      { name: 'Máy chơi game', slug: 'may-choi-game' },
      { name: 'Tay cầm & phụ kiện', slug: 'phu-kien-gaming' },
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
