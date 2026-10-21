import { randomUUID } from 'node:crypto';
import type { NotificationCreatedPayload } from '@san/shared';
import { NotificationMailEvents } from '../src/notification-mail/notification-mail.events';
import { createTestApp, describeDb, resetDb, type TestApp } from './helpers';

describeDb('Email cho thông báo quan trọng (P6, MSG-02: nhận notification.created)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.mail.sent = [];
    t.mail.fail = false;
  });

  const user = (status: 'ACTIVE' | 'LOCKED' | 'UNVERIFIED' = 'ACTIVE') =>
    t.prisma.user.create({
      data: {
        email: `nguoi${Math.floor(Math.random() * 1e6)}@gmail.com`,
        fullName: 'Người Mua',
        status,
      },
    });
  const payload = (userId: string, over: Partial<NotificationCreatedPayload> = {}) => ({
    notificationId: randomUUID(),
    userId,
    type: 'ORDER_DELIVERED',
    title: 'Giao hàng thành công',
    content: 'Đơn 261021ABC123-1 của Shop A đã được giao tới bạn.',
    link: '/tai-khoan/don-mua/abc',
    email: true,
    createdAt: new Date().toISOString(),
    ...over,
  });
  const handle = (p: NotificationCreatedPayload) =>
    t.prisma.$transaction((tx) => t.app.get(NotificationMailEvents).handle(p, tx));

  it('email = true, tài khoản hoạt động: gửi mail có tiêu đề, nội dung, nút mở trang trên web', async () => {
    const u = await user();
    expect(await handle(payload(u.id))).toBe(true);
    expect(t.mail.sent).toHaveLength(1);
    const mail = t.mail.sent[0]!;
    expect(mail).toMatchObject({ to: u.email, subject: 'Giao hàng thành công' });
    expect(mail.text).toContain('Đơn 261021ABC123-1 của Shop A đã được giao tới bạn.');
    expect(mail.text).toContain('http://localhost:5173/tai-khoan/don-mua/abc');
    expect(mail.html).toContain('href="http://localhost:5173/tai-khoan/don-mua/abc"');
    expect(mail.html).toContain('Xem chi tiết');
  });

  it('email = false thì không gửi', async () => {
    const u = await user();
    expect(await handle(payload(u.id, { email: false, type: 'ORDER_CONFIRMED' }))).toBe(false);
    expect(t.mail.sent).toHaveLength(0);
  });

  it('tài khoản bị khóa, chưa xác minh hoặc không có thì không gửi', async () => {
    const locked = await user('LOCKED');
    const unverified = await user('UNVERIFIED');
    expect(await handle(payload(locked.id))).toBe(false);
    expect(await handle(payload(unverified.id))).toBe(false);
    expect(await handle(payload(randomUUID()))).toBe(false);
    expect(t.mail.sent).toHaveLength(0);
  });

  it('nội dung có ký tự HTML được thoát; không có đường dẫn thì không có nút', async () => {
    const u = await user();
    await handle(payload(u.id, { content: 'Lý do: <b>sai</b> & "khác"', link: null }));
    const mail = t.mail.sent[0]!;
    expect(mail.html).toContain('&#60;b&#62;sai&#60;/b&#62; &#38; &#34;khác&#34;');
    expect(mail.html).not.toContain('Xem chi tiết');
    expect(mail.text).not.toContain('Xem chi tiết');
  });

  it('gửi lỗi thì ném lỗi để sự kiện được thử lại', async () => {
    const u = await user();
    t.mail.fail = true;
    await expect(handle(payload(u.id))).rejects.toThrow('SMTP lỗi');
  });
});
