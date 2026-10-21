import { randomUUID } from 'node:crypto';
import type { Prisma } from '../generated/prisma';
import { API, createTestApp, describeDb, makeUser, resetDb, type TestApp } from './helpers';

type User = ReturnType<typeof makeUser>;

describeDb('Báo cáo tài chính (P6: RPT-02)', () => {
  let t: TestApp;
  let sellerA: User;
  let sellerB: User;
  let finance: User;
  const shopA = randomUUID();
  const shopB = randomUUID();
  let seq = 0;

  const auth = (u: User) => ({ Authorization: `Bearer ${u.token}` });
  const at = (iso: string) => new Date(iso);

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    seq = 0;
    sellerA = makeUser('Chủ Shop A');
    sellerB = makeUser('Chủ Shop B');
    finance = makeUser('Kế Toán', ['FINANCE']);
  });

  /** Tiền một đơn con (mỗi đơn tổng một đơn con) */
  async function earn(
    shopId: string,
    data: Partial<Prisma.SellerEarningUncheckedCreateInput> & { buyerPaid: number },
  ) {
    const code = `2610${String(++seq).padStart(2, '0')}AAAA`;
    const e = await t.prisma.sellerEarning.create({
      data: {
        orderId: randomUUID(),
        orderCode: code,
        shopOrderId: randomUUID(),
        shopOrderCode: `${code}-1`,
        shopId,
        buyerId: randomUUID(),
        subtotal: data.buyerPaid,
        shopDiscount: 0,
        platformDiscount: 0,
        shippingFee: 0,
        platformFeeRate: 500,
        platformFee: 0,
        sellerAmount: 0,
        ...data,
      },
    });
    return e;
  }

  async function payment(amount: number, status: 'SUCCEEDED' | 'FAILED', paidAt: string | null) {
    const ref = `REF${++seq}${randomUUID().slice(0, 8)}`;
    await t.prisma.payment.create({
      data: {
        orderId: randomUUID(),
        attempt: 1,
        ref,
        requestKey: randomUUID(),
        gateway: 'MOCK',
        amount,
        payUrl: 'http://localhost/mo-phong',
        status,
        applied: status === 'SUCCEEDED',
        paidAt: paidAt ? at(paidAt) : null,
        clientIp: '127.0.0.1',
      },
    });
  }

  async function refund(
    amount: number,
    status: 'SUCCEEDED' | 'MANUAL_DONE' | 'PENDING',
    completedAt: string | null,
    shopOrderId: string | null,
    reason: 'CANCELLED' | 'RETURN' | 'LATE_PAYMENT' = 'CANCELLED',
  ) {
    await t.prisma.refund.create({
      data: {
        orderId: randomUUID(),
        shopOrderId,
        amount,
        reason,
        // Chuyển khoản (không cần gắn lần thanh toán): báo cáo không phân biệt cách hoàn
        method: 'BANK_TRANSFER',
        bankName: 'Vietcombank',
        bankAccountNumber: '0011223344',
        bankAccountName: 'NGUOI MUA',
        returnId: reason === 'RETURN' ? randomUUID() : null,
        status,
        completedAt: completedAt ? at(completedAt) : null,
      },
    });
  }

  async function withdrawal(
    shopId: string,
    ownerId: string,
    amount: number,
    status: 'PAID' | 'APPROVED',
    paidAt: string | null,
  ) {
    await t.prisma.withdrawal.create({
      data: {
        shopId,
        ownerId,
        ownerName: 'Chủ shop',
        shopName: 'Shop',
        amount,
        status,
        bankName: 'Vietcombank',
        bankAccountNumber: '0123456789',
        bankAccountName: 'NGUYEN VAN AN',
        requestKey: randomUUID(),
        paidAt: paidAt ? at(paidAt) : null,
      },
    });
  }

  async function walletTx(
    shopId: string,
    type: 'RELEASED' | 'COMPENSATION' | 'HELD',
    amount: number,
    createdAt: string,
  ) {
    await t.prisma.walletTransaction.create({
      data: {
        shopId,
        type,
        amount,
        fromBucket: type === 'RELEASED' ? 'PENDING' : null,
        toBucket: type === 'HELD' ? 'PENDING' : 'AVAILABLE',
        shopOrderId: randomUUID(),
        createdAt: at(createdAt),
      },
    });
  }

  /**
   * Dữ liệu mẫu, khoảng 01–02/10/2026 giờ Việt Nam (= 30/09 17:00 UTC tới 02/10 17:00 UTC).
   * Shop A: 3 đơn ghi nhận (1 bị hủy sau khi trả), 1 đơn ngoài khoảng, 1 đơn hết hạn, 1 đơn COD chưa giao.
   * Shop B: 1 đơn ghi nhận.
   */
  async function seed() {
    await t.prisma.sellerWallet.create({
      data: {
        shopId: shopA,
        ownerId: sellerA.id,
        pending: 100_000,
        available: 50_000,
        locked: 20_000,
      },
    });
    await t.prisma.sellerWallet.create({
      data: { shopId: shopB, ownerId: sellerB.id, available: 30_000 },
    });
    // 00:00 ngày 01/10: trả trước đã thu
    const a1 = await earn(shopA, {
      paymentMethod: 'VNPAY',
      status: 'HELD',
      paidAt: at('2026-09-30T17:00:00Z'),
      moneyReceivedAt: at('2026-09-30T17:00:00Z'),
      buyerPaid: 200_000,
      platformDiscount: 10_000,
      platformFee: 10_000,
      sellerAmount: 170_000,
    });
    // 23:59:59 ngày 30/09: ngoài khoảng
    await earn(shopA, {
      paymentMethod: 'VNPAY',
      status: 'AVAILABLE',
      paidAt: at('2026-09-30T16:59:59Z'),
      buyerPaid: 999_000,
      platformFee: 49_950,
      sellerAmount: 949_050,
    });
    // 23:59 ngày 01/10: COD đã giao (ghi nhận lúc giao), trả hàng một phần đã đảo phí sàn 5.000, trừ seller 95.000;
    // tiền COD đối soát khớp ngày 02/10
    const a3 = await earn(shopA, {
      paymentMethod: 'COD',
      status: 'AVAILABLE',
      deliveredAt: at('2026-10-01T16:59:00Z'),
      moneyReceivedAt: at('2026-10-02T03:00:00Z'),
      codAmount: 300_000,
      buyerPaid: 300_000,
      platformFee: 15_000,
      sellerAmount: 285_000,
      returnFeeReversed: 5_000,
      returnDeduction: 95_000,
    });
    // 00:00 ngày 02/10: trả trước rồi bị hủy → chỉ tính giá trị đơn (có khoản hoàn riêng)
    const a4 = await earn(shopA, {
      paymentMethod: 'VNPAY',
      status: 'CANCELLED',
      paidAt: at('2026-10-01T17:00:00Z'),
      buyerPaid: 100_000,
      platformDiscount: 5_000,
      platformFee: 5_000,
      sellerAmount: 95_000,
    });
    // Hết hạn thanh toán, COD chưa giao: chưa có tiền, không ghi nhận
    await earn(shopA, { paymentMethod: 'VNPAY', status: 'EXPIRED', buyerPaid: 400_000 });
    await earn(shopA, { paymentMethod: 'COD', status: 'UNPAID', buyerPaid: 400_000 });
    // Shop B 02/10
    const b1 = await earn(shopB, {
      paymentMethod: 'VNPAY',
      status: 'HELD',
      paidAt: at('2026-10-02T05:00:00Z'),
      buyerPaid: 500_000,
      platformDiscount: 20_000,
      platformFee: 25_000,
      sellerAmount: 475_000,
    });

    // Thanh toán VNPay
    await payment(200_000, 'SUCCEEDED', '2026-09-30T17:00:00Z');
    await payment(100_000, 'SUCCEEDED', '2026-10-01T17:00:00Z');
    await payment(500_000, 'SUCCEEDED', '2026-10-02T05:00:00Z');
    await payment(77_000, 'FAILED', null);
    await payment(999_000, 'SUCCEEDED', '2026-09-30T16:00:00Z');

    // Khoản hoàn
    await refund(100_000, 'SUCCEEDED', '2026-10-01T18:00:00Z', a4.shopOrderId);
    await refund(100_000, 'MANUAL_DONE', '2026-10-01T10:00:00Z', a3.shopOrderId, 'RETURN');
    await refund(50_000, 'PENDING', null, a1.shopOrderId);
    await refund(70_000, 'SUCCEEDED', '2026-10-01T09:00:00Z', null, 'LATE_PAYMENT');
    await refund(10_000, 'SUCCEEDED', '2026-10-02T17:00:00Z', b1.shopOrderId);

    // Ví shop A
    await walletTx(shopA, 'RELEASED', 50_000, '2026-10-02T04:00:00Z');
    await walletTx(shopA, 'COMPENSATION', 20_000, '2026-10-01T05:00:00Z');
    await walletTx(shopA, 'HELD', 170_000, '2026-10-01T05:00:00Z');
    await walletTx(shopA, 'RELEASED', 999, '2026-09-30T10:00:00Z');

    // Rút tiền
    await withdrawal(shopA, sellerA.id, 40_000, 'PAID', '2026-10-02T09:00:00Z');
    await withdrawal(shopA, sellerA.id, 15_000, 'PAID', '2026-10-02T17:30:00Z');
    await withdrawal(shopA, sellerA.id, 20_000, 'APPROVED', null);
    await withdrawal(shopB, sellerB.id, 60_000, 'PAID', '2026-10-01T02:00:00Z');
  }

  const RANGE = { from: '2026-10-01', to: '2026-10-02' };

  it('seller: giá trị đơn, khoản hoàn, phí sàn sau đảo trả hàng, tiền nhận, khả dụng, đã rút, số dư', async () => {
    await seed();
    const r = (
      await t
        .http()
        .get(`${API}/shops/me/reports/finance`)
        .query(RANGE)
        .set(auth(sellerA))
        .expect(200)
    ).body;
    expect(r.range).toEqual({ from: '2026-10-01', to: '2026-10-02', days: 2 });
    expect(r.hasWallet).toBe(true);
    expect(r.summary).toEqual({
      orderCount: 3,
      orderValue: 600_000,
      refunded: 200_000,
      // 10.000 + (15.000 − 5.000); đơn bị hủy không tính
      platformFee: 20_000,
      // 170.000 + (285.000 − 95.000)
      sellerReceives: 360_000,
      released: 70_000,
      withdrawn: 40_000,
    });
    expect(r.balance).toEqual({
      pending: 100_000,
      available: 50_000,
      locked: 20_000,
      total: 170_000,
    });
    expect(r.daily).toEqual([
      { date: '2026-10-01', sellerReceives: 360_000, refunded: 100_000 },
      { date: '2026-10-02', sellerReceives: 0, refunded: 100_000 },
    ]);
  });

  it('seller chỉ thấy shop mình; chưa có ví → mọi số bằng 0', async () => {
    await seed();
    const b = (
      await t
        .http()
        .get(`${API}/shops/me/reports/finance`)
        .query(RANGE)
        .set(auth(sellerB))
        .expect(200)
    ).body;
    expect(b.summary).toEqual({
      orderCount: 1,
      orderValue: 500_000,
      refunded: 0,
      platformFee: 25_000,
      sellerReceives: 475_000,
      released: 0,
      withdrawn: 60_000,
    });
    expect(b.balance.total).toBe(30_000);

    const nobody = makeUser('Chưa Có Shop');
    const z = (
      await t
        .http()
        .get(`${API}/shops/me/reports/finance`)
        .query(RANGE)
        .set(auth(nobody))
        .expect(200)
    ).body;
    expect(z.hasWallet).toBe(false);
    expect(Object.values(z.summary).every((v) => v === 0)).toBe(true);
    expect(z.balance).toEqual({ pending: 0, available: 0, locked: 0, total: 0 });
    expect(z.daily).toEqual([
      { date: '2026-10-01', sellerReceives: 0, refunded: 0 },
      { date: '2026-10-02', sellerReceives: 0, refunded: 0 },
    ]);
  });

  it('admin: thực thu VNPay + COD đối soát, hoàn, trợ giá voucher sàn, phí sàn, phải trả, đã chi', async () => {
    await seed();
    const r = (
      await t.http().get(`${API}/admin/reports/finance`).query(RANGE).set(auth(finance)).expect(200)
    ).body;
    expect(r.summary).toEqual({
      orderCount: 4,
      orderValue: 1_100_000,
      collected: 1_100_000,
      collectedVnpay: 800_000,
      collectedCod: 300_000,
      refunded: 270_000,
      platformSubsidy: 30_000,
      platformFee: 45_000,
      payableToSellers: 200_000,
      paidToSellers: 100_000,
    });
    expect(r.payable).toEqual({
      pending: 100_000,
      available: 80_000,
      locked: 20_000,
      total: 200_000,
    });
    expect(r.daily).toEqual([
      { date: '2026-10-01', collected: 200_000, refunded: 170_000, platformFee: 20_000 },
      { date: '2026-10-02', collected: 900_000, refunded: 100_000, platformFee: 25_000 },
    ]);
  });

  it('mặc định 30 ngày; khoảng ngày sai → 400 INVALID_RANGE', async () => {
    const r = (await t.http().get(`${API}/admin/reports/finance`).set(auth(finance)).expect(200))
      .body;
    expect(r.range.days).toBe(30);
    expect(r.daily).toHaveLength(30);
    const bad = await t
      .http()
      .get(`${API}/shops/me/reports/finance`)
      .query({ from: '2026-10-02', to: '2026-10-01' })
      .set(auth(sellerA))
      .expect(400);
    expect(bad.body.code).toBe('INVALID_RANGE');
    const long = await t
      .http()
      .get(`${API}/admin/reports/finance`)
      .query({ from: '2025-01-01', to: '2026-01-02' })
      .set(auth(finance))
      .expect(400);
    expect(long.body.code).toBe('INVALID_RANGE');
    await t
      .http()
      .get(`${API}/admin/reports/finance`)
      .query({ to: '2026-13-01' })
      .set(auth(finance))
      .expect(400);
  });

  it('quyền: admin không có bộ Tài chính → 403; chưa đăng nhập → 401', async () => {
    for (const perms of [[], ['SYSTEM'], ['MODERATION'], ['SUPPORT']] as const) {
      const u = makeUser('Admin Khác', [...perms]);
      const res = await t.http().get(`${API}/admin/reports/finance`).set(auth(u)).expect(403);
      expect(res.body.code).toBe('FORBIDDEN');
    }
    await t.http().get(`${API}/admin/reports/finance`).expect(401);
    await t.http().get(`${API}/shops/me/reports/finance`).expect(401);
  });
});
