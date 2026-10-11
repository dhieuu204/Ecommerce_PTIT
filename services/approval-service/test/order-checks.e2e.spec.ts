import { randomUUID } from 'node:crypto';
import type { AuthUser } from '@san/nest-common';
import type { OrderPlacedPayload, SanEvent } from '@san/shared';
import { OrderChecksService, evaluateRules } from '../src/order-checks/order-checks.service';
import { createTestApp, describeDb, makeUser, resetDb, type TestApp } from './helpers';

const API = '/api/approval/v1';

describe('Luật kiểm tra đơn (RSK-01)', () => {
  const t = { total: 10_000_000, cod: 3_000_000 };
  it('đơn tổng ≥ ngưỡng thì chạm luật (đúng bằng ngưỡng cũng chạm)', () => {
    expect(evaluateRules({ total: 9_999_999, paymentMethod: 'VNPAY' }, t)).toEqual([]);
    expect(evaluateRules({ total: 10_000_000, paymentMethod: 'VNPAY' }, t)).toEqual([
      { rule: 'TOTAL', threshold: 10_000_000 },
    ]);
  });

  it('đơn COD có ngưỡng thấp hơn riêng (P4)', () => {
    expect(evaluateRules({ total: 2_999_999, paymentMethod: 'COD' }, t)).toEqual([]);
    expect(evaluateRules({ total: 3_000_000, paymentMethod: 'COD' }, t)).toEqual([
      { rule: 'COD', threshold: 3_000_000 },
    ]);
    expect(evaluateRules({ total: 3_000_000, paymentMethod: 'VNPAY' }, t)).toEqual([]);
    expect(evaluateRules({ total: 10_000_000, paymentMethod: 'COD' }, t)).toEqual([
      { rule: 'TOTAL', threshold: 10_000_000 },
      { rule: 'COD', threshold: 3_000_000 },
    ]);
  });
});

describeDb('Kiểm tra đơn (RSK-01)', () => {
  let t: TestApp;
  const fin = makeUser('Tài Chính', ['FINANCE']);
  const buyer = makeUser('Người Mua');
  const owner = makeUser('Chủ Shop');

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());
  beforeEach(() => resetDb(t.prisma));

  const svc = () => t.app.get(OrderChecksService);
  const order = (total: number, by: AuthUser = buyer): OrderPlacedPayload => ({
    orderId: randomUUID(),
    code: `261011${randomUUID().slice(0, 6).toUpperCase()}`,
    buyer: { userId: by.id, name: by.name, email: by.email },
    paymentMethod: 'VNPAY',
    total,
    payBefore: new Date(Date.now() + 15 * 60_000).toISOString(),
    shippingProvince: 'Hà Nội',
    placedAt: new Date().toISOString(),
    shopOrders: [
      {
        shopOrderId: randomUUID(),
        code: 'X-1',
        shopId: randomUUID(),
        shopName: 'Shop A',
        ownerId: owner.id,
        subtotal: total,
        shopDiscount: 0,
        platformDiscount: 0,
        shippingFee: 0,
        total,
        items: [{ name: 'Laptop', variant: '', price: total, quantity: 1 }],
      },
    ],
  });
  const placed = (p: OrderPlacedPayload) => t.prisma.$transaction((tx) => svc().onPlaced(p, tx));
  const decided = async () =>
    (await t.prisma.outboxEvent.findMany({ where: { type: 'order_check.decided' } })).map(
      (e) => (e.payload as unknown as SanEvent).payload as unknown as Record<string, unknown>,
    );
  const decide = (id: string, body: object, user: AuthUser = fin) =>
    t
      .http()
      .post(`${API}/admin/order-checks/${id}/decision`)
      .set('Authorization', `Bearer ${t.token(user)}`)
      .send(body);
  const pendingId = async () => (await t.prisma.orderCheck.findFirstOrThrow()).id;

  it('đơn nhỏ: qua ngay, phát PASSED; nhận trùng sự kiện không tạo thêm', async () => {
    const p = order(2_000_000);
    await placed(p);
    await placed(p);
    expect(await t.prisma.orderCheck.count()).toBe(1);
    expect((await t.prisma.orderCheck.findFirstOrThrow()).status).toBe('PASSED');
    expect(await decided()).toEqual([
      expect.objectContaining({ orderId: p.orderId, result: 'PASSED', decidedBy: null }),
    ]);
  });

  it('đơn từ 10 triệu: chờ duyệt, có hạn 24 giờ, chưa phát gì', async () => {
    await placed(order(10_000_000));
    const c = await t.prisma.orderCheck.findFirstOrThrow();
    expect(c.status).toBe('PENDING');
    expect(c.rulesHit).toEqual([{ rule: 'TOTAL', threshold: 10_000_000 }]);
    const hours = (c.deadline!.getTime() - c.createdAt.getTime()) / 3600_000;
    expect(Math.round(hours)).toBe(24);
    expect(await decided()).toEqual([]);
  });

  it('chỉ FINANCE; admin là người mua/chủ shop không tự duyệt; từ chối bắt buộc lý do; quyết rồi → 409', async () => {
    await placed(order(15_000_000));
    const id = await pendingId();
    await t
      .http()
      .get(`${API}/admin/order-checks`)
      .set('Authorization', `Bearer ${t.token(makeUser('Hỗ Trợ', ['SUPPORT']))}`)
      .expect(403);
    const list = await t
      .http()
      .get(`${API}/admin/order-checks`)
      .set('Authorization', `Bearer ${t.token(fin)}`)
      .expect(200);
    expect(list.body.items[0]).toMatchObject({ id, amount: 15_000_000, status: 'PENDING' });

    const selfOwner = { ...owner, permissions: ['FINANCE' as const] };
    expect((await decide(id, { decision: 'APPROVE' }, selfOwner).expect(403)).body.code).toBe(
      'SELF_APPROVAL_FORBIDDEN',
    );
    await decide(id, { decision: 'REJECT' }).expect(400);
    const res = await decide(id, {
      decision: 'REJECT',
      reason: 'Thông tin người nhận bất thường',
    }).expect(200);
    expect(res.body).toMatchObject({ status: 'REJECTED', decidedByName: 'Tài Chính' });
    expect((await decide(id, { decision: 'APPROVE' }).expect(409)).body.code).toBe(
      'ALREADY_DECIDED',
    );
    expect(await decided()).toEqual([
      expect.objectContaining({ result: 'REJECTED', reason: 'Thông tin người nhận bất thường' }),
    ]);
    expect(await t.prisma.auditLog.count({ where: { action: 'REJECT_ORDER' } })).toBe(1);
  });

  it('chi tiết có lịch sử mua của buyer; duyệt → PASSED', async () => {
    await placed(order(1_000_000));
    await placed(order(12_000_000));
    const id = (await t.prisma.orderCheck.findFirstOrThrow({ where: { status: 'PENDING' } })).id;
    const detail = await t
      .http()
      .get(`${API}/admin/order-checks/${id}`)
      .set('Authorization', `Bearer ${t.token(fin)}`)
      .expect(200);
    expect(detail.body.buyerStats).toEqual({ orders: 1, total: 1_000_000, rejected: 0 });
    expect(detail.body.order.shopOrders[0].shopName).toBe('Shop A');
    await decide(id, { decision: 'APPROVE' }).expect(200);
    expect((await decided()).at(-1)).toMatchObject({
      result: 'PASSED',
      decidedBy: { userId: fin.id },
    });
  });

  it('quá hạn chưa duyệt → TIMEOUT (không tự duyệt); chạy lại không phát thêm', async () => {
    await placed(order(20_000_000));
    const later = new Date(Date.now() + 25 * 3600_000);
    expect(await svc().timeout(later)).toBe(1);
    expect(await svc().timeout(later)).toBe(0);
    expect((await t.prisma.orderCheck.findFirstOrThrow()).status).toBe('TIMEOUT');
    expect(await decided()).toEqual([expect.objectContaining({ result: 'TIMEOUT' })]);
  });

  it('đơn bị hủy hết trong lúc chờ → CANCELLED, admin không duyệt được nữa', async () => {
    const p = order(20_000_000);
    await placed(p);
    await t.prisma.$transaction((tx) =>
      svc().onCancelled(
        {
          orderId: p.orderId,
          shopOrderId: p.shopOrders[0]!.shopOrderId,
          code: 'X-1',
          shopId: p.shopOrders[0]!.shopId,
          cancelledBy: 'BUYER',
          reason: 'Đổi ý',
          orderCancelled: true,
          cancelledAt: new Date().toISOString(),
        },
        tx,
      ),
    );
    expect((await t.prisma.orderCheck.findFirstOrThrow()).status).toBe('CANCELLED');
    await decide(await pendingId(), { decision: 'APPROVE' }).expect(409);
  });

  it('ngưỡng đổi trong cấu hình chỉ áp cho đơn mới', async () => {
    const sys = makeUser('Quản Trị', ['SYSTEM']);
    await t
      .http()
      .put(`${API}/admin/settings/review_total_threshold`)
      .set('Authorization', `Bearer ${t.token(sys)}`)
      .send({ value: 5_000_000, reason: 'Siết kiểm tra mùa sale' })
      .expect(200);
    await placed(order(6_000_000));
    expect((await t.prisma.orderCheck.findFirstOrThrow()).rulesHit).toEqual([
      { rule: 'TOTAL', threshold: 5_000_000 },
    ]);
  });
});
