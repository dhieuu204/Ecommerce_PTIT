import { execSync } from 'node:child_process';

/**
 * Chạy một lần trước mọi test: dùng database riêng cho test (tên database + "_test", ví dụ payment_db_test)
 * để test được xóa dữ liệu thoải mái, không đụng dữ liệu đang dev. Prisma tự tạo database và chạy migration.
 * Không kết nối được PostgreSQL: test cần database được bỏ qua (trên CI thì báo lỗi).
 */
export default function globalSetup(): void {
  try {
    process.loadEnvFile('.env');
  } catch {
    // không có .env (ví dụ trên CI): dùng giá trị mặc định
  }
  const url = new URL(
    process.env.DATABASE_URL ??
      'postgresql://payment_svc:payment_svc@localhost:5432/payment_db?schema=public',
  );
  if (!url.pathname.endsWith('_test')) url.pathname += '_test';
  process.env.DATABASE_URL = url.toString();
  // Test không gửi sự kiện thật lên RabbitMQ (sự kiện nằm lại trong bảng outbox để kiểm).
  // Đặt rỗng chứ không xóa, vì Prisma tự đọc .env và sẽ điền lại biến đã xóa.
  process.env.RABBITMQ_URL = '';

  try {
    execSync('prisma migrate deploy', { stdio: 'pipe', env: process.env });
    process.env.TEST_DB = '1';
  } catch (e) {
    const output = String((e as { stderr?: Buffer }).stderr ?? e);
    if (process.env.CI) throw new Error(`Không chuẩn bị được database test:\n${output}`);
    console.warn(
      `\n[payment-service] Bỏ qua test cần database: chưa bật PostgreSQL (pnpm infra:up).\n${output.split('\n')[0]}\n`,
    );
  }
}
