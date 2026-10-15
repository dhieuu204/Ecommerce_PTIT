import { randomUUID } from 'node:crypto';
import type { OrderPlacedPayload } from '@san/shared';
import { AppConfig } from '../src/config';
import { VnpayGateway } from '../src/gateway/vnpay.gateway';
import { signedQuery } from '../src/gateway/vnpay-sign';
import { PaymentOrderEvents } from '../src/payments/order.events';
import { PaymentJobs } from '../src/payments/payment.jobs';
import { RefundsService } from '../src/refunds/refunds.service';
import {
  API,
  createTestApp,
  describeDb,
  makeUser,
  outbox,
  placedOrder,
  resetDb,
  type TestApp,
} from './helpers';

type User = ReturnType<typeof makeUser>;

describeDb('Thanh toán và hoàn tiền (PAY-01..04, REF-01) — cổng MÔ PHỎNG', () => {
  let t: TestApp;
  let buyer: User;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    buyer = makeUser('Người Mua');
    (t.app.get(AppConfig) as { mockRefundResult: string }).mockRefundResult = 'SUCCEEDED';
  });

  const auth = (u: User) => ({ Authorization: `Bearer ${u.token}` });
  const events = () => t.app.get(PaymentOrderEvents);
  const placed = async (p: OrderPlacedPayload) =>
    t.prisma.$transaction((tx) => events().placed(p, tx));
  const cancelled = async (p: OrderPlacedPayload, i: number, orderCancelled = false) =>
    t.prisma.$transaction((tx) =>
      events().cancelled(
        {
          orderId: p.orderId,
          shopOrderId: p.shopOrders[i]!.shopOrderId,
          code: p.shopOrders[i]!.code,
          shopId: p.shopOrders[i]!.shopId,
          cancelledBy: 'BUYER',
          reason: 'Đổi ý',
          orderCancelled,
          cancelledAt: new Date().toISOString(),
        },
        tx,
      ),
    );
  const create = (orderId: string, key: string = randomUUID(), u: User = buyer) =>
    t.http().post(`${API}/payments`).set(auth(u)).set('Idempotency-Key', key).send({ orderId });
  const mock = (ref: string, result: string) =>
    t.http().post(`${API}/mock-gateway/payments/${ref}`).send({ result });
  const status = async (orderId: string) =>
    (await t.http().get(`${API}/orders/${orderId}/payment`).set(auth(buyer)).expect(200)).body;
  const earnings = (orderId: string) =>
    t.prisma.sellerEarning.findMany({ where: { orderId }, orderBy: { shopOrderCode: 'asc' } });

  async function paidOrder() {
    const p = placedOrder(buyer);
    await placed(p);
    const link = (await create(p.orderId).expect(201)).body;
    const ref = (await t.prisma.payment.findUniqueOrThrow({ where: { id: link.paymentId } })).ref;
    await mock(ref, 'SUCCESS').expect(200);
    return p;
  }

  it('order.placed: mỗi đơn con một dòng, chụp phí sàn 5% làm tròn xuống; nhận trùng không nhân đôi', async () => {
    const p = placedOrder(buyer, {});
    p.shopOrders[1]!.subtotal = 99_999;
    p.shopOrders[1]!.total = 112_142;
    await placed(p);
    await placed(p);
    const rows = await earnings(p.orderId);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      buyerPaid: 177_857,
      platformFeeRate: 500,
      platformFee: 9_000,
      sellerAmount: 171_000,
      status: 'UNPAID',
    });
    // 99.999 × 5% = 4.999,95 → 4.999đ
    expect(rows[1]).toMatchObject({ platformFee: 4_999, sellerAmount: 95_000 });
  });

  it('tạo lần thanh toán: chưa nhận đơn → 409; đơn người khác → 404; cùng key / còn lần chờ → trả lại lần cũ', async () => {
    const p = placedOrder(buyer);
    expect((await create(p.orderId).expect(409)).body.code).toBe('ORDER_NOT_READY');
    await placed(p);
    await create(p.orderId, randomUUID(), makeUser('Người Lạ')).expect(404);
    expect(
      (
        await t
          .http()
          .post(`${API}/payments`)
          .set(auth(buyer))
          .send({ orderId: p.orderId })
          .expect(400)
      ).body.code,
    ).toBe('IDEMPOTENCY_KEY_REQUIRED');

    const key = randomUUID();
    const first = (await create(p.orderId, key).expect(201)).body;
    expect(first).toMatchObject({ attempt: 1, maxAttempts: 3, gateway: 'MOCK' });
    expect(first.payUrl).toMatch(/\/thanh-toan\/mo-phong\?ref=/);
    expect((await create(p.orderId, key).expect(201)).body.paymentId).toBe(first.paymentId);
    // Bấm lại với key mới trong lúc lần 1 còn chờ: mở lại đúng link cũ, không tính thêm lần
    expect((await create(p.orderId).expect(201)).body.paymentId).toBe(first.paymentId);
    const pay = await t.prisma.payment.findUniqueOrThrow({ where: { id: first.paymentId } });
    expect(pay).toMatchObject({ amount: 290_000, ref: `${p.code}T1`, status: 'PENDING' });
    expect(await t.prisma.payment.count()).toBe(1);
  });

  it('trả thành công: giữ tiền từng đơn con, phát payment.succeeded kèm phí sàn; không trả lại được', async () => {
    const p = await paidOrder();
    expect((await earnings(p.orderId)).every((r) => r.status === 'HELD' && r.paidAt)).toBe(true);
    const [ev] = await outbox(t.prisma, 'payment.succeeded');
    expect(ev).toMatchObject({
      orderId: p.orderId,
      amount: 290_000,
      shopOrders: expect.arrayContaining([
        {
          shopOrderId: p.shopOrders[0]!.shopOrderId,
          platformFeeRate: 500,
          platformFee: 9_000,
          sellerAmount: 171_000,
        },
      ]),
    });
    expect((await status(p.orderId)).status).toBe('PAID');
    expect((await create(p.orderId).expect(409)).body.code).toBe('ORDER_NOT_PAYABLE');
    // Trang mô phỏng bấm lại → 409, không ghi lại
    const ref = `${p.code}T1`;
    await mock(ref, 'SUCCESS').expect(409);
    expect(await outbox(t.prisma, 'payment.succeeded')).toHaveLength(1);
  });

  it('thất bại 3 lần → hết hạn (ATTEMPTS_EXHAUSTED); lần thứ 4 không tạo được', async () => {
    const p = placedOrder(buyer);
    await placed(p);
    for (let i = 1; i <= 3; i++) {
      const link = (await create(p.orderId).expect(201)).body;
      expect(link.attempt).toBe(i);
      await mock(`${p.code}T${i}`, 'FAILED').expect(200);
    }
    const [ev] = await outbox(t.prisma, 'payment.expired');
    expect(ev).toMatchObject({ orderId: p.orderId, reason: 'ATTEMPTS_EXHAUSTED' });
    expect((await earnings(p.orderId)).every((r) => r.status === 'EXPIRED')).toBe(true);
    expect((await create(p.orderId).expect(409)).body.code).toBe('ORDER_NOT_PAYABLE');
    expect((await status(p.orderId)).status).toBe('EXPIRED');
  });

  it('lần trước "không rõ" → không tạo lần mới (PAYMENT_UNKNOWN)', async () => {
    const p = placedOrder(buyer);
    await placed(p);
    const link = (await create(p.orderId).expect(201)).body;
    await t.prisma.payment.update({ where: { id: link.paymentId }, data: { status: 'UNKNOWN' } });
    expect((await create(p.orderId).expect(409)).body.code).toBe('PAYMENT_UNKNOWN');
  });

  it('trả tiền nhưng mất tin báo: buyer quay về → tra cứu thấy đã trả → ghi đã trả', async () => {
    const p = placedOrder(buyer);
    await placed(p);
    await create(p.orderId).expect(201);
    const ref = `${p.code}T1`;
    const r = await mock(ref, 'PAID_NO_NOTICE').expect(200);
    expect(r.body.returnUrl).toBe(`/thanh-toan/ket-qua?vnp_TxnRef=${ref}`);
    expect((await status(p.orderId)).status).toBe('UNPAID');
    const back = await t
      .http()
      .post(`${API}/payments/return`)
      .set(auth(buyer))
      .send({ params: { vnp_TxnRef: ref } })
      .expect(200);
    expect(back.body.status).toBe('PAID');
    // Người khác gửi mã giao dịch của mình → 404
    await t
      .http()
      .post(`${API}/payments/return`)
      .set(auth(makeUser('Người Lạ')))
      .send({ params: { vnp_TxnRef: ref } })
      .expect(404);
  });

  it('job: đơn quá hạn mà lần thanh toán không có tiền → hết hạn (TIMEOUT); chạy lại không phát thêm', async () => {
    const p = placedOrder(buyer, { payBefore: new Date(Date.now() + 60_000).toISOString() });
    await placed(p);
    await create(p.orderId).expect(201);
    const jobs = t.app.get(PaymentJobs);
    const later = new Date(Date.now() + 120_000);
    expect(await jobs.watch(later)).toBe(1);
    expect(await jobs.watch(later)).toBe(0);
    expect(await outbox(t.prisma, 'payment.expired')).toEqual([
      expect.objectContaining({ orderId: p.orderId, reason: 'TIMEOUT' }),
    ]);
    expect((await t.prisma.payment.findFirstOrThrow()).status).toBe('FAILED');
  });

  it('job: quá hạn nhưng tra cứu thấy đã trả → ghi đã trả, không cho hết hạn', async () => {
    const p = placedOrder(buyer, { payBefore: new Date(Date.now() + 60_000).toISOString() });
    await placed(p);
    await create(p.orderId).expect(201);
    await mock(`${p.code}T1`, 'PAID_NO_NOTICE').expect(200);
    expect(await t.app.get(PaymentJobs).watch(new Date(Date.now() + 120_000))).toBe(0);
    expect((await earnings(p.orderId)).every((r) => r.status === 'HELD')).toBe(true);
    expect(await outbox(t.prisma, 'payment.expired')).toHaveLength(0);
  });

  it('tiền về sau khi đơn đã hủy → giữ tiền và tự tạo khoản hoàn (LATE_PAYMENT)', async () => {
    const p = placedOrder(buyer);
    await placed(p);
    await create(p.orderId).expect(201);
    await cancelled(p, 0, false);
    await cancelled(p, 1, true);
    await mock(`${p.code}T1`, 'SUCCESS').expect(200);
    const pay = await t.prisma.payment.findFirstOrThrow();
    expect(pay).toMatchObject({ status: 'SUCCEEDED', applied: false });
    const refund = await t.prisma.refund.findFirstOrThrow();
    expect(refund).toMatchObject({ reason: 'LATE_PAYMENT', amount: 290_000, shopOrderId: null });
    expect(await outbox(t.prisma, 'payment.succeeded')).toHaveLength(0);
  });

  it('hủy đơn con đã trả → khoản hoàn đúng số buyer trả cho đơn con đó; job gửi lệnh, báo đã hoàn', async () => {
    const p = await paidOrder();
    await cancelled(p, 1);
    await cancelled(p, 1); // tin trùng
    const refunds = await t.prisma.refund.findMany();
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({
      shopOrderId: p.shopOrders[1]!.shopOrderId,
      amount: 112_143,
      status: 'PENDING',
      reason: 'CANCELLED',
    });
    const rows = await earnings(p.orderId);
    expect(rows.map((r) => r.status)).toEqual(['HELD', 'CANCELLED']);

    await t.app.get(RefundsService).processDue();
    expect((await t.prisma.refund.findFirstOrThrow()).status).toBe('SUCCEEDED');
    expect(await outbox(t.prisma, 'refund.updated')).toEqual([
      expect.objectContaining({ shopOrderId: p.shopOrders[1]!.shopOrderId, status: 'SUCCEEDED' }),
    ]);
  });

  it('hoàn lỗi: thử lại theo lịch đủ 3 lần rồi chờ hoàn tay; admin FINANCE hoàn tay có biên lai', async () => {
    (t.app.get(AppConfig) as { mockRefundResult: string }).mockRefundResult = 'FAILED';
    const p = await paidOrder();
    await cancelled(p, 0);
    const svc = t.app.get(RefundsService);
    const far = (h: number) => new Date(Date.now() + h * 3600_000);
    await svc.processDue();
    expect((await t.prisma.refund.findFirstOrThrow()).status).toBe('FAILED');
    await svc.processDue(); // chưa tới giờ thử lại
    expect((await t.prisma.refund.findFirstOrThrow()).tries).toBe(1);
    await svc.processDue(far(1));
    await svc.processDue(far(2));
    const r = await t.prisma.refund.findFirstOrThrow();
    expect(r).toMatchObject({ status: 'NEEDS_MANUAL', tries: 3 });
    expect((await outbox(t.prisma, 'refund.updated'))[0]).toMatchObject({ status: 'NEEDS_MANUAL' });

    const fin = makeUser('Tài Chính', ['FINANCE']);
    await t
      .http()
      .get(`${API}/admin/refunds`)
      .set(auth(makeUser('Hỗ Trợ', ['SUPPORT'])))
      .expect(403);
    const list = await t
      .http()
      .get(`${API}/admin/refunds?status=NEEDS_MANUAL`)
      .set(auth(fin))
      .expect(200);
    expect(list.body.items[0]).toMatchObject({ id: r.id, orderCode: p.code, amount: 177_857 });

    // Biên lai phải do chính admin này tải lên
    await t
      .http()
      .post(`${API}/admin/refunds/${r.id}/manual`)
      .set(auth(fin))
      .send({ transferCode: 'FT2610110001', receiptKey: 'refund-receipts/khac/x.png' })
      .expect(400);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const up = await t
      .http()
      .post(`${API}/admin/uploads/refund-receipt`)
      .set(auth(fin))
      .attach('file', png, 'bien-lai.png')
      .expect(201);
    expect(up.body.key).toMatch(new RegExp(`^refund-receipts/${fin.id}/.+\\.png$`));
    const done = await t
      .http()
      .post(`${API}/admin/refunds/${r.id}/manual`)
      .set(auth(fin))
      .send({
        transferCode: 'FT2610110001',
        receiptKey: up.body.key,
        note: 'Chuyển vào Vietcombank',
      })
      .expect(200);
    expect(done.body).toMatchObject({
      status: 'MANUAL_DONE',
      transferCode: 'FT2610110001',
      hasReceipt: true,
    });
    expect(await t.prisma.auditLog.count({ where: { action: 'MANUAL_REFUND' } })).toBe(1);
    await t
      .http()
      .post(`${API}/admin/refunds/${r.id}/manual`)
      .set(auth(fin))
      .send({ transferCode: 'FT2', receiptKey: up.body.key })
      .expect(409);
    expect((await outbox(t.prisma, 'refund.updated')).at(-1)).toMatchObject({
      status: 'MANUAL_DONE',
    });
  });

  it('lệnh hoàn chưa rõ kết quả → tra cứu chứ không gửi lại', async () => {
    (t.app.get(AppConfig) as { mockRefundResult: string }).mockRefundResult = 'UNKNOWN';
    const p = await paidOrder();
    await cancelled(p, 0);
    const svc = t.app.get(RefundsService);
    await svc.processDue();
    expect((await t.prisma.refund.findFirstOrThrow()).status).toBe('UNKNOWN');
    // Lần sau: tra cứu (cổng mô phỏng báo chưa nhận lệnh) → tính là lỗi, chờ lịch thử lại
    await svc.processDue();
    const r = await t.prisma.refund.findFirstOrThrow();
    expect(r).toMatchObject({ status: 'FAILED', tries: 1 });
  });

  it('tra cứu báo "đã có hoàn" mà cùng giao dịch đã có khoản hoàn khác: không ghi đã hoàn, chuyển hoàn tay', async () => {
    const config = t.app.get(AppConfig) as { mockRefundResult: string };
    config.mockRefundResult = 'UNKNOWN';
    const p = await paidOrder();
    await cancelled(p, 0);
    const svc = t.app.get(RefundsService);
    await svc.processDue();
    const r = await t.prisma.refund.findFirstOrThrow();
    expect(r.status).toBe('UNKNOWN');
    // Khoản hoàn khác của cùng giao dịch đã thành công (ví dụ trả hàng của shop kia)
    await t.prisma.refund.create({
      data: {
        paymentId: r.paymentId,
        orderId: r.orderId,
        amount: 1_000,
        reason: 'RETURN',
        status: 'SUCCEEDED',
        completedAt: new Date(),
      },
    });
    config.mockRefundResult = 'SUCCEEDED'; // tra cứu chỉ biết "giao dịch đã có hoàn"
    await svc.processDue();
    expect(await t.prisma.refund.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({
      status: 'NEEDS_MANUAL',
    });
  });

  it('đơn đã hủy khi chưa trả, buyer vẫn trả nhưng mất tin báo → job tra cứu sau hạn, tự tạo khoản hoàn', async () => {
    const p = placedOrder(buyer, { payBefore: new Date(Date.now() + 60_000).toISOString() });
    await placed(p);
    await create(p.orderId).expect(201);
    await cancelled(p, 0, false);
    await cancelled(p, 1, true);
    await mock(`${p.code}T1`, 'PAID_NO_NOTICE').expect(200);
    const jobs = t.app.get(PaymentJobs);
    await jobs.watch(); // link chưa hết hạn: chưa tra cứu
    expect((await t.prisma.payment.findFirstOrThrow()).status).toBe('PENDING');
    await jobs.watch(new Date(Date.now() + 120_000));
    expect(await t.prisma.payment.findFirstOrThrow()).toMatchObject({
      status: 'SUCCEEDED',
      applied: false,
    });
    expect(await t.prisma.refund.findFirstOrThrow()).toMatchObject({
      reason: 'LATE_PAYMENT',
      amount: 290_000,
    });
  });

  it('admin xem thanh toán của đơn (SUPPORT/FINANCE); phí sàn đổi chỉ áp cho đơn mới', async () => {
    const p = await paidOrder();
    const sup = makeUser('Hỗ Trợ', ['SUPPORT']);
    const res = await t
      .http()
      .get(`${API}/admin/orders/${p.orderId}/payments`)
      .set(auth(sup))
      .expect(200);
    expect(res.body.payments[0]).not.toHaveProperty('gatewayResponse');
    expect(res.body.earnings).toHaveLength(2);
    await t.http().get(`${API}/admin/orders/${p.orderId}/payments`).set(auth(buyer)).expect(403);

    const sys = makeUser('Quản Trị', ['SYSTEM']);
    await t
      .http()
      .put(`${API}/admin/settings/platform_fee_percent_x100`)
      .set(auth(sys))
      .send({ value: 300, reason: 'Khuyến mãi phí sàn tháng 10' })
      .expect(200);
    const next = placedOrder(buyer);
    await placed(next);
    expect((await earnings(next.orderId))[0]).toMatchObject({
      platformFeeRate: 300,
      platformFee: 5_400,
    });
    expect((await earnings(p.orderId))[0]!.platformFeeRate).toBe(500);
  });
});

describeDb('IPN VNPay (PAY-02, PAY-03)', () => {
  let t: TestApp;
  const secret = 'BI_MAT_TEST';
  const buyer = makeUser('Người Mua');

  beforeAll(async () => {
    const config = Object.assign(new AppConfig(), {
      vnpayTmnCode: 'TESTTMN1',
      vnpayHashSecret: secret,
    });
    t = await createTestApp(new VnpayGateway(config));
  });
  afterAll(() => t.app.close());
  beforeEach(() => resetDb(t.prisma));

  async function pendingPayment() {
    const p = placedOrder(buyer);
    await t.prisma.$transaction((tx) => t.app.get(PaymentOrderEvents).placed(p, tx));
    const res = await t
      .http()
      .post(`${API}/payments`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ orderId: p.orderId })
      .expect(201);
    return { p, link: res.body as { payUrl: string; gateway: string } };
  }

  const ipn = (params: Record<string, string>, key = secret) =>
    t
      .http()
      .get(`${API}/webhooks/vnpay/ipn?${signedQuery(params, key)}`)
      .expect(200);

  it('link VNPay có chữ ký, số tiền × 100, hạn = hạn thanh toán', async () => {
    const { p, link } = await pendingPayment();
    expect(link.gateway).toBe('VNPAY');
    const url = new URL(link.payUrl);
    expect(url.origin + url.pathname).toBe('https://sandbox.vnpayment.vn/paymentv2/vpcpay.html');
    expect(url.searchParams.get('vnp_Amount')).toBe('29000000');
    expect(url.searchParams.get('vnp_TxnRef')).toBe(`${p.code}T1`);
    expect(url.searchParams.get('vnp_SecureHash')).toMatch(/^[0-9a-f]{128}$/);
  });

  it('sai chữ ký → 97; không có giao dịch → 01; sai số tiền → 04; đúng → 00 và ghi đã trả; gửi lại → 02', async () => {
    const { p } = await pendingPayment();
    const ok = {
      vnp_TmnCode: 'TESTTMN1',
      vnp_TxnRef: `${p.code}T1`,
      vnp_Amount: '29000000',
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
      vnp_TransactionNo: '14567890',
      vnp_BankCode: 'NCB',
      vnp_PayDate: '20261011101500',
    };
    expect((await ipn(ok, 'KHOA_GIA')).body).toEqual({
      RspCode: '97',
      Message: 'Invalid signature',
    });
    expect((await ipn({ ...ok, vnp_TxnRef: 'KHONGCO' })).body.RspCode).toBe('01');
    expect((await ipn({ ...ok, vnp_Amount: '100' })).body.RspCode).toBe('04');
    expect((await ipn(ok)).body).toEqual({ RspCode: '00', Message: 'Confirm Success' });
    const pay = await t.prisma.payment.findFirstOrThrow();
    expect(pay).toMatchObject({ status: 'SUCCEEDED', applied: true, transactionNo: '14567890' });
    expect((await ipn(ok)).body.RspCode).toBe('02');
    expect(await outbox(t.prisma, 'payment.succeeded')).toHaveLength(1);
  });

  it('IPN báo thất bại → lần đó thất bại, buyer được thử lần mới', async () => {
    const { p } = await pendingPayment();
    const res = await ipn({
      vnp_TxnRef: `${p.code}T1`,
      vnp_Amount: '29000000',
      vnp_ResponseCode: '24',
      vnp_TransactionStatus: '02',
    });
    expect(res.body.RspCode).toBe('00');
    expect((await t.prisma.payment.findFirstOrThrow()).status).toBe('FAILED');
  });

  it('buyer quay về với chữ ký sai → 400 INVALID_SIGNATURE', async () => {
    const { p } = await pendingPayment();
    const res = await t
      .http()
      .post(`${API}/payments/return`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({
        params: { vnp_TxnRef: `${p.code}T1`, vnp_ResponseCode: '00', vnp_SecureHash: 'abc' },
      })
      .expect(400);
    expect(res.body.code).toBe('INVALID_SIGNATURE');
  });
});
