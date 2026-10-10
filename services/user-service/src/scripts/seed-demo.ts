/**
 * Nạp tài khoản DEMO: 2 seller (Táo Xanh Mobile, Galaxy Hub), 1 buyer và 1 admin đủ 4 bộ quyền, đã xác minh email,
 * mật khẩu chung `demo12345`. Chạy cùng các phần khác bằng `pnpm seed:demo` ở thư mục gốc.
 * Chạy lại không tạo trùng. Chỉ dùng khi chạy thử, không chạy trên môi trường thật.
 */
import '../env';
import { DEMO_PASSWORD, DEMO_USERS } from '@san/shared';
import { hashPassword } from '../common/password';
import { PrismaService } from '../prisma.service';

async function main() {
  const prisma = new PrismaService();
  try {
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    for (const u of Object.values(DEMO_USERS)) {
      const byEmail = await prisma.user.findUnique({ where: { email: u.email } });
      if (byEmail && byEmail.id !== u.id) {
        throw new Error(`Email ${u.email} đã thuộc tài khoản khác, không nạp được dữ liệu demo.`);
      }
      if (byEmail) {
        console.log(`Đã có ${u.email}, bỏ qua.`);
        continue;
      }
      await prisma.user.create({
        data: {
          id: u.id,
          email: u.email,
          fullName: u.fullName,
          phone: u.phone,
          passwordHash,
          status: 'ACTIVE',
          permissions:
            u.id === DEMO_USERS.admin.id ? ['MODERATION', 'SUPPORT', 'FINANCE', 'SYSTEM'] : [],
        },
      });
      console.log(`Đã tạo ${u.email}`);
    }
    console.log(`Tài khoản demo dùng mật khẩu: ${DEMO_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
