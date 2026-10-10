/**
 * Nạp bộ danh mục mẫu (CAT-01): công nghệ + thời trang, nhà cửa, làm đẹp.
 * Cách dùng (cần database đã chạy migration):
 *   pnpm --filter @san/marketplace-service seed:categories
 * Chạy lại không tạo trùng: danh mục đã có (theo slug) được giữ nguyên.
 */
import '../env';
import { seedCategories } from '../categories/seed-categories';
import { PrismaService } from '../prisma.service';

async function main() {
  const prisma = new PrismaService();
  try {
    const created = await seedCategories(prisma);
    const total = await prisma.category.count();
    console.log(`Đã thêm ${created} danh mục mới. Hiện có ${total} danh mục.`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
