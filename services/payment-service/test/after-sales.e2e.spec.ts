import { randomUUID } from 'node:crypto';
import {
  ADJUSTMENT_EXECUTED,
  REFUND_UPDATED,
  WITHDRAWAL_CANCELLED,
  WITHDRAWAL_REQUESTED,
  type AdjustmentApprovedPayload,
  type OrderPlacedPayload,
  type ReturnResolvedPayload,
} from '@san/shared';
import { AdjustmentsService } from '../src/adjustments/adjustments.service';
import { PaymentOrderEvents } from '../src/payments/order.events';
import { RefundsService } from '../src/refunds/refunds.service';
import { WithdrawalsService } from '../src/withdrawals/withdrawals.service';
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
type Tx = Parameters<Parameters<TestApp['prisma']['$transaction']>[0]>[0];

/** Shop A: tiền hàng 200.000 - voucher shop 20.000 = 180.000; phí 5% = 9.000; seller nhận 171.000 */
const SELLER_A = 171_000;
/** Người mua đã trả cho món của shop A (tiền hàng sau voucher shop và phần voucher sàn), chưa kể ship */
const PAID_ITEMS_A = 200_000 - 20_000 - 32_143;
const BANK = { bankName: 'Vietcombank', accountNumber: '0123456789', accountName: 'NGUYEN VAN A' };

describeDb('Hậu mãi và rút tiền (P5: REF-02, FIN-02..06, DIS-02)', () => {
  let t: TestApp;
  let buyer: User;
  let sellerA: User;
  let finance: User;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.marketplace.myShop.mockReset();
    buyer = makeUser('Người Mua');
    sellerA = makeUser('Chủ Shop A');
    finance = makeUser('Kế Toán', ['FINANCE']);
  });

  const auth = (u: User) => ({ Authorization: `Bearer ${u.token}` });
  const ev = () => t.app.get(PaymentOrderEvents);
  const run = <T>(fn: (tx: Tx) => Promise<T>) => t.prisma.$transaction(fn);
  const earning = (p: OrderPlacedPayload) =>
    t.prisma.sellerEarning.findUniqueOrThrow({
      where: { shopOrderId: p.shopOrders[0]!.shopOrderId },
    });
  const walletA = (p: OrderPlacedPayload) =>
    t.prisma.sellerWallet.findUniqueOrThrow({ where: { shopId: p.shopOrders[0]!.shopId } });

  /** Đơn 2 shop, chủ shop A là `sellerA`; trả trước thì đã thanh toán */
  async function order(method: 'VNPAY' | 'COD' = 'VNPAY'): Promise<OrderPlacedPayload> {
    const p = placedOrder(buyer, {
      paymentMethod: method,
      payBefore: method === 'COD' ? null : new Date(Date.now() + 15 * 60_000).toISOString(),
    });
    p.shopOrders[0]!.ownerId = sellerA.id;
    await run((tx) => ev().placed(p, tx));
    if (method === 'VNPAY') {
      const link = (
        await t
          .http()
          .post(`${API}/payments`)
          .set(auth(buyer))
          .set('Idempotency-Key', randomUUID())
          .send({ orderId: p.orderId })
          .expect(201)
      ).body;
      const ref = (await t.prisma.payment.findUniqueOrThrow({ where: { id: link.paymentId } })).ref;
      await t
        .http()
        .post(`${API}/mock-gateway/payments/${ref}`)
        .send({ result: 'SUCCESS' })
        .expect(200);
    }
    return p;
  }

  const delivered = (p: OrderPlacedPayload) =>
    run((tx) =>
      ev().delivered(
        {
          orderId: p.orderId,
          shopOrderId: p.shopOrders[0]!.shopOrderId,
          paymentMethod: p.paymentMethod,
          ghnCode: `SIM${p.code}`,
          codAmount: p.paymentMethod === 'COD' ? p.shopOrders[0]!.total : 0,
          carrierFee: 25_000,
          deliveredAt: new Date().toISOString(),
        },
        tx,
      ),
    );
  const completed = (p: OrderPlacedPayload, returnId: string | null = null) =>
    run((tx) =>
      ev().completed(
        {
          orderId: p.orderId,
          shopOrderId: p.shopOrders[0]!.shopOrderId,
          completedBy: 'SYSTEM',
          returnId,
          completedAt: new Date().toISOString(),
        },
        tx,
      ),
    );
  const requested = (p: OrderPlacedPayload, returnId: string) =>
    run((tx) =>
      ev().returnRequested(
        {
          returnId,
          code: `${p.shopOrders[0]!.code}-TH`,
          orderId: p.orderId,
          shopOrderId: p.shopOrders[0]!.shopOrderId,
          refundAmount: PAID_ITEMS_A,
          requestedAt: new Date().toISOString(),
        },
        tx,
      ),
    );
  const resolved = (
    p: OrderPlacedPayload,
    returnId: string,
    over: Partial<ReturnResolvedPayload> = {},
  ) =>
    run((tx) =>
      ev().returnResolved(
        {
          returnId,
          code: `${p.shopOrders[0]!.code}-TH`,
          orderId: p.orderId,
          shopOrderId: p.shopOrders[0]!.shopOrderId,
          outcome: 'REFUND',
          refundAmount: PAID_ITEMS_A,
          maxRefundAmount: PAID_ITEMS_A,
          sellerBase: 180_000,
          platformCovers: false,
          bankAccount: null,
          resolvedAt: new Date().toISOString(),
          ...over,
        },
        tx,
      ),
    );

  /** Tổng các dòng lịch sử ví theo ngăn phải khớp số dư */
  async function expectLedgerMatches(shopId: string) {
    const w = await t.prisma.sellerWallet.findUniqueOrThrow({ where: { shopId } });
    const rows = await t.prisma.walletTransaction.findMany({ where: { shopId } });
    const bucket = (b: 'PENDING' | 'AVAILABLE' | 'LOCKED') =>
      rows.reduce(
        (a, r) => a + (r.toBucket === b ? r.amount : 0) - (r.fromBucket === b ? r.amount : 0),
        0,
      );
    expect({
      pending: bucket('PENDING'),
      available: bucket('AVAILABLE'),
      locked: bucket('LOCKED'),
    }).toEqual({
      pending: w.pending,
      available: w.available,
      locked: w.locked,
    });
  }

  // ----- trả hàng -----

  describe('trả hàng: giữ tiền, hoàn tiền, trừ tiền seller (REF-02, FIN-02, FIN-03)', () => {
    it('có yêu cầu đang mở thì đơn hoàn tất cũng không chuyển khả dụng', async () => {
      const p = await order();
      const retId = randomUUID();
      await requested(p, retId);
      await delivered(p);
      await completed(p, retId);
      expect(await earning(p)).toMatchObject({ status: 'HELD', returnState: 'OPEN' });
      expect(await walletA(p)).toMatchObject({ pending: SELLER_A, available: 0 });
      const w = await t.http().get(`${API}/shops/me/wallet`).set(auth(sellerA)).expect(200);
      expect(w.body).toMatchObject({ pendingWaitingReturn: SELLER_A, pendingWaitingCompletion: 0 });
      const list = await t.http().get(`${API}/shops/me/earnings`).set(auth(sellerA)).expect(200);
      expect(list.body.items[0].waitingFor).toBe('Chờ xử lý yêu cầu trả hàng');
    });

    it('hoàn toàn bộ: hoàn qua cổng đúng số đã trả, seller bị trừ hết, sàn không thu phí', async () => {
      const p = await order();
      const retId = randomUUID();
      await requested(p, retId);
      await delivered(p);
      await resolved(p, retId);
      await completed(p, retId);
      expect(await earning(p)).toMatchObject({
        status: 'REFUNDED',
        returnState: 'RESOLVED',
        returnRefund: PAID_ITEMS_A,
        returnDeduction: SELLER_A,
        returnFeeReversed: 9_000,
      });
      expect(await walletA(p)).toMatchObject({ pending: 0, available: 0 });
      const refund = await t.prisma.refund.findUniqueOrThrow({ where: { returnId: retId } });
      expect(refund).toMatchObject({
        amount: PAID_ITEMS_A,
        reason: 'RETURN',
        method: 'GATEWAY',
        status: 'PENDING',
      });
      // Nhận lại kết quả: không hoàn, không trừ lần nữa
      await resolved(p, retId);
      expect(await t.prisma.refund.count({ where: { returnId: retId } })).toBe(1);
      // Job gửi lệnh hoàn (một phần giao dịch), cổng mô phỏng báo thành công → báo marketplace kèm mã yêu cầu
      await t.app.get(RefundsService).processDue();
      const updates = await outbox(t.prisma, REFUND_UPDATED);
      expect(updates).toEqual([
        expect.objectContaining({ returnId: retId, amount: PAID_ITEMS_A, status: 'SUCCEEDED' }),
      ]);
      await expectLedgerMatches(p.shopOrders[0]!.shopId);
    });

    it('admin hoàn một phần: trừ seller theo tỉ lệ, phí tính lại, phần còn lại chuyển khả dụng', async () => {
      const p = await order();
      const retId = randomUUID();
      await requested(p, retId);
      await delivered(p);
      await resolved(p, retId, { refundAmount: 50_000 });
      // Bớt ⌊180.000 × 50.000 / 147.857⌋ = 60.869 → còn 119.131, phí 5.956, seller nhận 113.175
      expect(await earning(p)).toMatchObject({
        status: 'HELD',
        returnDeduction: 57_825,
        returnFeeReversed: 3_044,
      });
      await completed(p, retId);
      expect(await walletA(p)).toMatchObject({ pending: 0, available: 113_175 });
      await expectLedgerMatches(p.shopOrders[0]!.shopId);
    });

    it('sự kiện tới sai thứ tự: hoàn tất trước, kết quả sau; kết quả trước, yêu cầu sau', async () => {
      const p = await order();
      const retId = randomUUID();
      await delivered(p);
      // Hoàn tất (mang mã yêu cầu) tới trước mọi tin trả hàng: chờ, không chuyển theo số cũ
      await completed(p, retId);
      expect(await walletA(p)).toMatchObject({ pending: SELLER_A, available: 0 });
      await resolved(p, retId, { refundAmount: 50_000 });
      await requested(p, retId); // tới muộn nhất: bỏ qua
      expect(await earning(p)).toMatchObject({ status: 'AVAILABLE', returnState: 'RESOLVED' });
      expect(await walletA(p)).toMatchObject({ pending: 0, available: 113_175 });
    });

    it('đóng không hoàn (hoặc người mua hủy): bỏ giữ tiền, chuyển đủ tiền', async () => {
      const p = await order();
      const retId = randomUUID();
      await requested(p, retId);
      await delivered(p);
      await completed(p, retId);
      await resolved(p, retId, { outcome: 'NO_REFUND', refundAmount: 0 });
      expect(await walletA(p)).toMatchObject({ pending: 0, available: SELLER_A });
      expect(await t.prisma.refund.count()).toBe(0);
    });

    it('sàn chịu (kiện trả thất lạc): người mua được hoàn, seller không bị trừ', async () => {
      const p = await order();
      const retId = randomUUID();
      await requested(p, retId);
      await delivered(p);
      await resolved(p, retId, { platformCovers: true });
      await completed(p, retId);
      expect(await earning(p)).toMatchObject({ returnRefund: PAID_ITEMS_A, returnDeduction: 0 });
      expect(await walletA(p)).toMatchObject({ available: SELLER_A });
    });

    it('đơn COD: hoàn bằng chuyển khoản tay, chờ admin tài chính ngay', async () => {
      const p = await order('COD');
      const retId = randomUUID();
      await requested(p, retId);
      await delivered(p);
      await resolved(p, retId, { bankAccount: BANK });
      const refund = await t.prisma.refund.findUniqueOrThrow({ where: { returnId: retId } });
      expect(refund).toMatchObject({
        method: 'BANK_TRANSFER',
        status: 'NEEDS_MANUAL',
        paymentId: null,
        bankAccountNumber: BANK.accountNumber,
      });
      expect(await outbox(t.prisma, REFUND_UPDATED)).toEqual([
        expect.objectContaining({ returnId: retId, status: 'NEEDS_MANUAL' }),
      ]);
      // Không bao giờ gửi qua cổng
      await t.app.get(RefundsService).processDue();
      expect((await t.prisma.refund.findUniqueOrThrow({ where: { id: refund.id } })).status).toBe(
        'NEEDS_MANUAL',
      );
      const list = await t
        .http()
        .get(`${API}/admin/refunds?status=NEEDS_MANUAL`)
        .set(auth(finance))
        .expect(200);
      expect(list.body.items[0]).toMatchObject({
        reason: 'RETURN',
        method: 'BANK_TRANSFER',
        returnId: retId,
        paymentRef: null,
        bankAccount: BANK,
      });
      expect(await walletA(p)).toMatchObject({ pending: 0 });
    });

    it('không hoàn quá số người mua đã trả cho đơn con', async () => {
      const p = await order();
      const retId = randomUUID();
      await requested(p, retId);
      await delivered(p);
      await resolved(p, retId, { refundAmount: 999_999, maxRefundAmount: 999_999 });
      const refund = await t.prisma.refund.findUniqueOrThrow({ where: { returnId: retId } });
      expect(refund.amount).toBe(p.shopOrders[0]!.total);
    });
  });

  // ----- rút tiền -----

  describe('rút tiền và chi trả (FIN-04..06)', () => {
    /** Shop A có 171.000đ khả dụng; marketplace trả hồ sơ shop đang hoạt động */
    async function available(): Promise<OrderPlacedPayload> {
      const p = await order();
      await delivered(p);
      await completed(p);
      expect(await walletA(p)).toMatchObject({ available: SELLER_A });
      t.marketplace.myShop.mockResolvedValue({
        status: 'ACTIVE',
        shop: { id: p.shopOrders[0]!.shopId, name: 'Shop A', bankAccount: BANK },
      });
      return p;
    }

    const withdraw = (amount: number, key: string = randomUUID(), u = sellerA) =>
      t
        .http()
        .post(`${API}/shops/me/withdrawals`)
        .set(auth(u))
        .set('Idempotency-Key', key)
        .send({ amount });
    const decide = (withdrawalId: string, decision: 'APPROVED' | 'REJECTED') =>
      run((tx) =>
        t.app.get(WithdrawalsService).applyDecision(
          {
            withdrawalId,
            approvalId: randomUUID(),
            decision,
            reason: decision === 'REJECTED' ? 'Cần kiểm tra thêm' : null,
            decidedBy: { userId: finance.id, name: finance.name },
            decidedAt: new Date().toISOString(),
          },
          tx,
        ),
      );
    const receipt = async (u: User = finance) =>
      (
        await t
          .http()
          .post(`${API}/admin/uploads/payout-receipt`)
          .set(auth(u))
          .attach('file', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]), 'bien-lai.jpg')
          .expect(201)
      ).body.key as string;

    it('gửi yêu cầu: khóa tiền, lấy tài khoản từ hồ sơ shop, báo approval-service (chỉ 4 số cuối)', async () => {
      const p = await available();
      await withdraw(10_000).expect(400);
      await withdraw(100_000, 'x'.repeat(65)).expect(400);
      const key = randomUUID();
      const res = await withdraw(100_000, key).expect(201);
      expect(res.body).toMatchObject({
        status: 'PENDING',
        amount: 100_000,
        canCancel: true,
        bankAccount: { bankName: 'Vietcombank', accountNumber: '•••• 6789' },
      });
      expect(t.marketplace.myShop).toHaveBeenCalledWith(`Bearer ${sellerA.token}`);
      expect(await walletA(p)).toMatchObject({ available: SELLER_A - 100_000, locked: 100_000 });
      const [ev2] = await outbox(t.prisma, WITHDRAWAL_REQUESTED);
      expect(ev2).toMatchObject({
        withdrawalId: res.body.id,
        owner: { userId: sellerA.id },
        amount: 100_000,
        bankAccount: { accountNumberMasked: '•••• 6789' },
        wallet: { available: SELLER_A - 100_000, locked: 100_000 },
      });
      // Gửi lại cùng mã: trả yêu cầu cũ; mã khác khi đang có yêu cầu: chặn
      expect((await withdraw(100_000, key).expect(201)).body.id).toBe(res.body.id);
      await withdraw(50_000)
        .expect(409)
        .expect((r) => expect(r.body.code).toBe('WITHDRAWAL_IN_PROGRESS'));
      const wallet = await t.http().get(`${API}/shops/me/wallet`).set(auth(sellerA)).expect(200);
      expect(wallet.body).toMatchObject({
        withdrawMin: 50_000,
        openWithdrawal: { id: res.body.id, status: 'PENDING' },
      });
      await expectLedgerMatches(p.shopOrders[0]!.shopId);
    });

    it('vượt số khả dụng bị chặn; hai yêu cầu cùng lúc chỉ một được khóa tiền', async () => {
      const p = await available();
      await withdraw(SELLER_A + 1)
        .expect(409)
        .expect((r) =>
          expect(r.body).toMatchObject({
            code: 'INSUFFICIENT_BALANCE',
            details: { available: SELLER_A },
          }),
        );
      const [a, b] = await Promise.all([withdraw(100_000), withdraw(100_000)]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      expect(await walletA(p)).toMatchObject({ available: SELLER_A - 100_000, locked: 100_000 });
      expect(await t.prisma.withdrawal.count()).toBe(1);
      await expectLedgerMatches(p.shopOrders[0]!.shopId);
    });

    it('shop không hoạt động hoặc chưa có tài khoản thì không rút được', async () => {
      const p = await available();
      t.marketplace.myShop.mockResolvedValue({
        status: 'SUSPENDED',
        shop: { id: p.shopOrders[0]!.shopId, name: 'Shop A', bankAccount: BANK },
      });
      await withdraw(100_000)
        .expect(409)
        .expect((r) => expect(r.body.code).toBe('SHOP_NOT_ACTIVE'));
      expect(await walletA(p)).toMatchObject({ available: SELLER_A, locked: 0 });
    });

    it('seller hủy khi chưa duyệt: mở khóa đúng một lần; quyết định tới sau thì bỏ qua', async () => {
      const p = await available();
      const { body } = await withdraw(100_000).expect(201);
      await t
        .http()
        .post(`${API}/shops/me/withdrawals/${body.id}/cancel`)
        .set(auth(sellerA))
        .expect(200);
      await t
        .http()
        .post(`${API}/shops/me/withdrawals/${body.id}/cancel`)
        .set(auth(sellerA))
        .expect(409)
        .expect((r) => expect(r.body.code).toBe('WITHDRAWAL_NOT_CANCELLABLE'));
      await decide(body.id, 'APPROVED');
      expect(await t.prisma.withdrawal.findUniqueOrThrow({ where: { id: body.id } })).toMatchObject(
        {
          status: 'CANCELLED',
        },
      );
      expect(await walletA(p)).toMatchObject({ available: SELLER_A, locked: 0 });
      expect(await outbox(t.prisma, WITHDRAWAL_CANCELLED)).toHaveLength(1);
      // Người khác không hủy được yêu cầu của shop mình
      await t
        .http()
        .post(`${API}/shops/me/withdrawals/${body.id}/cancel`)
        .set(auth(makeUser('Người Lạ')))
        .expect(404);
    });

    it('bị từ chối: mở khóa đúng một lần dù quyết định tới hai lần', async () => {
      const p = await available();
      const { body } = await withdraw(100_000).expect(201);
      await decide(body.id, 'REJECTED');
      await decide(body.id, 'REJECTED');
      expect(await walletA(p)).toMatchObject({ available: SELLER_A, locked: 0 });
      const list = await t.http().get(`${API}/shops/me/withdrawals`).set(auth(sellerA)).expect(200);
      expect(list.body.items[0]).toMatchObject({ status: 'REJECTED', reason: 'Cần kiểm tra thêm' });
      await expectLedgerMatches(p.shopOrders[0]!.shopId);
    });

    it('đã duyệt → admin chuyển khoản, nhập mã + biên lai → đã chi; chủ shop không tự chi', async () => {
      const p = await available();
      const { body } = await withdraw(100_000).expect(201);
      const paid = (u: User, receiptKey: string) =>
        t
          .http()
          .post(`${API}/admin/withdrawals/${body.id}/paid`)
          .set(auth(u))
          .send({ transferCode: 'FT2610150001', receiptKey });
      await paid(finance, await receipt())
        .expect(409)
        .expect((r) => expect(r.body.code).toBe('WITHDRAWAL_NOT_APPROVED'));
      await decide(body.id, 'APPROVED');
      const detail = await t
        .http()
        .get(`${API}/admin/withdrawals/${body.id}`)
        .set(auth(finance))
        .expect(200);
      expect(detail.body).toMatchObject({
        status: 'APPROVED',
        bankAccount: { accountNumber: '0123456789' },
        wallet: { locked: 100_000 },
      });
      expect(detail.body.wallet.recentTransactions[0]).toMatchObject({
        type: 'LOCKED',
        amount: 100_000,
      });
      await paid(finance, 'payout-receipts/khac/anh.jpg').expect(400);
      // Đúng thư mục nhưng chưa tải file lên: không được ghi "đã chi"
      await paid(finance, `payout-receipts/${finance.id}/chua-tai.jpg`).expect(400);
      const res = await paid(finance, await receipt()).expect(200);
      expect(res.body).toMatchObject({
        status: 'PAID',
        transferCode: 'FT2610150001',
        hasReceipt: true,
        paidByName: 'Kế Toán',
      });
      expect(await walletA(p)).toMatchObject({ available: SELLER_A - 100_000, locked: 0 });
      expect(await t.prisma.auditLog.count({ where: { action: 'PAY_WITHDRAWAL' } })).toBe(1);
      await paid(finance, await receipt()).expect(409);
      const all = await t
        .http()
        .get(`${API}/admin/withdrawals?status=PAID`)
        .set(auth(finance))
        .expect(200);
      expect(all.body).toMatchObject({ total: 1, totalAmount: 100_000 });
      await expectLedgerMatches(p.shopOrders[0]!.shopId);
    });

    it('chủ shop là admin tài chính: không tự chi, không tự ghi chuyển lỗi', async () => {
      await available();
      const { body } = await withdraw(100_000).expect(201);
      await decide(body.id, 'APPROVED');
      // Vé admin mang đúng id của chủ shop
      const owner = makeUser('Chủ Shop A', ['FINANCE']);
      await t.prisma.withdrawal.update({ where: { id: body.id }, data: { ownerId: owner.id } });
      await t
        .http()
        .post(`${API}/admin/withdrawals/${body.id}/failed`)
        .set(auth(owner))
        .send({ reason: 'Ngân hàng trả lại' })
        .expect(403)
        .expect((r) => expect(r.body.code).toBe('SELF_PAYOUT_FORBIDDEN'));
    });

    it('chuyển khoản lỗi: mở khóa, seller gửi yêu cầu mới được', async () => {
      const p = await available();
      const { body } = await withdraw(100_000).expect(201);
      await decide(body.id, 'APPROVED');
      await t
        .http()
        .post(`${API}/admin/withdrawals/${body.id}/failed`)
        .set(auth(finance))
        .send({ reason: 'Ngân hàng trả lại vì sai tên' })
        .expect(200);
      expect(await walletA(p)).toMatchObject({ available: SELLER_A, locked: 0 });
      await withdraw(SELLER_A).expect(201);
      await expectLedgerMatches(p.shopOrders[0]!.shopId);
    });

    it('chỉ admin tài chính dùng API chi trả', async () => {
      await t.http().get(`${API}/admin/withdrawals`).set(auth(sellerA)).expect(403);
      await t
        .http()
        .get(`${API}/admin/shops/${randomUUID()}/wallet`)
        .set(auth(finance))
        .expect(404);
    });
  });

  // ----- điều chỉnh sau giải ngân -----

  describe('điều chỉnh sau giải ngân (DIS-02)', () => {
    async function done(): Promise<OrderPlacedPayload> {
      const p = await order();
      await delivered(p);
      await completed(p);
      return p;
    }
    const approve = (p: OrderPlacedPayload, over: Partial<AdjustmentApprovedPayload> = {}) => {
      const payload: AdjustmentApprovedPayload = {
        adjustmentId: randomUUID(),
        orderId: p.orderId,
        shopOrderId: p.shopOrders[0]!.shopOrderId,
        shopOrderCode: p.shopOrders[0]!.code,
        shopId: p.shopOrders[0]!.shopId,
        sellerChange: 0,
        buyerRefund: 0,
        bankAccount: null,
        reason: 'Người mua khiếu nại sau khi hoàn tất',
        createdBy: { userId: randomUUID(), name: 'Kế Toán 1' },
        approvedBy: { userId: finance.id, name: finance.name },
        approvedAt: new Date().toISOString(),
        ...over,
      };
      return run((tx) => t.app.get(AdjustmentsService).execute(payload, tx)).then(() => payload);
    };

    it('trừ ví seller và hoàn thêm cho người mua (chuyển khoản tay), báo lại approval-service', async () => {
      const p = await done();
      const a = await approve(p, { sellerChange: -50_000, buyerRefund: 60_000, bankAccount: BANK });
      expect(await walletA(p)).toMatchObject({ available: SELLER_A - 50_000 });
      expect(
        await t.prisma.refund.findUniqueOrThrow({ where: { adjustmentId: a.adjustmentId } }),
      ).toMatchObject({
        amount: 60_000,
        reason: 'ADJUSTMENT',
        method: 'BANK_TRANSFER',
        status: 'NEEDS_MANUAL',
      });
      expect(await outbox(t.prisma, ADJUSTMENT_EXECUTED)).toEqual([
        expect.objectContaining({ adjustmentId: a.adjustmentId, result: 'APPLIED', message: null }),
      ]);
      // Nhận trùng: không thực thi lần nữa
      await run((tx) => t.app.get(AdjustmentsService).execute(a, tx));
      expect(await walletA(p)).toMatchObject({ available: SELLER_A - 50_000 });
      await expectLedgerMatches(p.shopOrders[0]!.shopId);
    });

    it('cộng ví seller', async () => {
      const p = await done();
      await approve(p, { sellerChange: 20_000 });
      expect(await walletA(p)).toMatchObject({ available: SELLER_A + 20_000 });
    });

    it('tất cả hoặc không: không đủ số dư, hoàn vượt số đã trả, sai shop đều không thực thi', async () => {
      const p = await done();
      await approve(p, { sellerChange: -(SELLER_A + 1), buyerRefund: 10_000, bankAccount: BANK });
      await approve(p, { buyerRefund: p.shopOrders[0]!.total + 1, bankAccount: BANK });
      await approve(p, { sellerChange: 1_000, shopId: randomUUID() });
      const results = await outbox(t.prisma, ADJUSTMENT_EXECUTED);
      expect(results.map((r) => r.result)).toEqual(['FAILED', 'FAILED', 'FAILED']);
      expect(results[0]!.message).toContain('không đủ');
      expect(await walletA(p)).toMatchObject({ available: SELLER_A });
      expect(await t.prisma.refund.count({ where: { reason: 'ADJUSTMENT' } })).toBe(0);
    });
  });
});
