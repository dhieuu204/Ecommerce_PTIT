/**
 * Cấp bộ quyền SYSTEM cho admin đầu tiên (ACC-05). Không có màn hình tạo admin.
 * Cách dùng: đăng ký tài khoản bình thường trên web, rồi chạy
 *   pnpm --filter @san/user-service create-admin email@cua-ban.com
 * Sau đó admin này cấp quyền cho người khác ở trang Admin › Người dùng và quyền.
 */
import '../env';
import { writeAudit } from '@san/nest-common';
import { PrismaService } from '../prisma.service';

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Thiếu email. Ví dụ: pnpm --filter @san/user-service create-admin an@gmail.com');
    process.exit(1);
  }
  const prisma = new PrismaService();
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.error(`Chưa có tài khoản ${email}. Hãy đăng ký trên web trước.`);
      process.exit(1);
    }
    if (user.permissions.includes('SYSTEM')) {
      console.log(`${email} đã có bộ quyền SYSTEM.`);
      return;
    }
    const permissions = [...user.permissions, 'SYSTEM' as const];
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { permissions, status: user.status === 'LOCKED' ? 'LOCKED' : 'ACTIVE' },
      });
      await writeAudit(tx, {
        actor: { id: user.id, name: 'Lệnh create-admin trên máy chủ' },
        action: 'SET_PERMISSIONS',
        targetType: 'USER',
        targetId: user.id,
        reason: 'Tạo admin đầu tiên bằng lệnh create-admin',
        before: { permissions: user.permissions },
        after: { permissions },
      });
    });
    console.log(`Đã cấp bộ quyền SYSTEM cho ${email}. Đăng nhập lại để vé mang quyền mới.`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
