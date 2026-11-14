import { randomUUID } from 'node:crypto';
import {
  WITHDRAWAL_REQUESTED,
  WITHDRAWAL_UPDATED,
  type OrderPlacedPayload,
  type ReturnResolvedPayload,
} from '@san/shared';
import { PaymentOrderEvents } from '../src/payments/order.events';
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

/**
 * Shop A: tiền hàng 200.000 − voucher shop 20.000 = 180.000; phí sàn 5% = 9.000; hoa hồng CTV 10% = 18.000
 * → seller nhận 153.000
 */
const COMMISSION = 18_000;
const SELLER_A = 153_000;
const PAID_ITEMS_A = 200_000 - 20_000 - 32_143;
const BANK = { bankName: 'Techcombank', accountNumber: '1903456789', accountName: 'TRAN THI BINH' };

describeDb('Tiền cộng tác viên (P7: AFF-04, AFF-05)', () => {
  let t: TestApp;
  let buyer: User;
  let sellerA: User;
  let ctv: User;
  let finance: User;
  let affiliateId: string;
  /** Shop A cố định: một chủ shop chỉ có một ví shop */
  let shopA: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.marketplace.myShop.mockReset();
    t.marketplace.myAffiliate.mockReset();
    buyer = makeUser('Người Mua');
    sellerA = makeUser('Chủ Shop A');
    ctv = makeUser('Trần Thị Bình');
    finance = makeUser('Kế Toán', ['FINANCE']);
    affiliateId = randomUUID();
    shopA = randomUUID();
  });

  const auth = (u: User) => ({ Authorization: `Bearer ${u.token}` });
  const ev = () => t.app.get(PaymentOrderEvents);
  const run = <T>(fn: (tx: Tx) => Promise<T>) => t.prisma.$transaction(fn);
  const shopOrder = (p: OrderPlacedPayload) => p.shopOrders[0]!;
  const earning = (p: OrderPlacedPayload) =>
    t.prisma.sellerEarning.findUniqueOrThrow({ where: { shopOrderId: shopOrder(p).shopOrderId } });
  const shopWallet = (p: OrderPlacedPayload) =>
    t.prisma.wallet.findUniqueOrThrow({ where: { shopId: shopOrder(p).shopId } });
  const ctvWallet = () => t.prisma.wallet.findUniqueOrThrow({ where: { affiliateId } });

  /** Đơn 2 shop; đơn con shop A qua CTV (hoa hồng 18.000đ); trả trước thì đã thanh toán */
  async function order(method: 'VNPAY' | 'COD' = 'VNPAY'): Promise<OrderPlacedPayload> {
    const p = placedOrder(buyer, {
      paymentMethod: method,
      payBefore: method === 'COD' ? null : new Date(Date.now() + 15 * 60_000).toISOString(),
    });
    p.shopOrders[0]!.ownerId = sellerA.id;
    p.shopOrders[0]!.shopId = shopA;
    p.shopOrders[0]!.affiliate = {
      affiliateId,
      userId: ctv.id,
      name: 'Review Công Nghệ',
      commission: COMMISSION,
    };
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
          shopOrderId: shopOrder(p).shopOrderId,
          paymentMethod: p.paymentMethod,
          ghnCode: `SIM${p.code}`,
          codAmount: p.paymentMethod === 'COD' ? shopOrder(p).total : 0,
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
          shopOrderId: shopOrder(p).shopOrderId,
          completedBy: 'SYSTEM',
          returnId,
          completedAt: new Date().toISOString(),
        },
        tx,
      ),
    );
  const resolved = (
    p: OrderPlacedPayload,
    returnId: string,
    over: Partial<ReturnResolvedPayload>,
  ) =>
    run((tx) =>
      ev().returnResolved(
        {
          returnId,
          code: `${shopOrder(p).code}-TH`,
          orderId: p.orderId,
          shopOrderId: shopOrder(p).shopOrderId,
          outcome: 'REFUND',
          refundAmount: PAID_ITEMS_A,
          maxRefundAmount: PAID_ITEMS_A,
          sellerBase: 180_000,
          commissionBase: COMMISSION,
          platformCovers: false,
          bankAccount: null,
          resolvedAt: new Date().toISOString(),
          ...over,
        },
        tx,
      ),
    );

  /** Số dư mỗi ngăn bằng tổng các dòng lịch sử vào trừ ra */
  async function expectLedgerMatches(walletId: string) {
    const w = await t.prisma.wallet.findUniqueOrThrow({ where: { id: walletId } });
    const rows = await t.prisma.walletTransaction.findMany({ where: { walletId } });
    const sum = (b: string) =>
      rows.reduce(
        (a, r) => a + (r.toBucket === b ? r.amount : 0) - (r.fromBucket === b ? r.amount : 0),
        0,
      );
    expect({ pending: w.pending, available: w.available, locked: w.locked }).toEqual({
      pending: sum('PENDING'),
      available: sum('AVAILABLE'),
      locked: sum('LOCKED'),
    });
  }

  it('nhận đơn: seller nhận đã trừ hoa hồng, phí sàn vẫn tính trên tiền hàng sau voucher shop, tạo ví CTV', async () => {
    const p = await order('COD');
    expect(await earning(p)).toMatchObject({
      platformFee: 9_000,
      commission: COMMISSION,
      sellerAmount: SELLER_A,
      affiliateId,
      affiliateUserId: ctv.id,
    });
    expect(await ctvWallet()).toMatchObject({
      ownerType: 'AFFILIATE',
      ownerId: ctv.id,
      pending: 0,
    });
    // Đơn con shop B không có CTV
    const b = await t.prisma.sellerEarning.findUniqueOrThrow({
      where: { shopOrderId: p.shopOrders[1]!.shopOrderId },
    });
    expect(b).toMatchObject({ commission: 0, affiliateId: null });
  });

  it('đã thu → hoa hồng vào đang giữ; hoàn tất → khả dụng cùng lúc với tiền seller; sự kiện lặp không cộng hai lần', async () => {
    const p = await order();
    expect(await ctvWallet()).toMatchObject({ pending: COMMISSION, available: 0 });
    expect(await shopWallet(p)).toMatchObject({ pending: SELLER_A });
    await delivered(p);
    await completed(p);
    await completed(p);
    expect(await ctvWallet()).toMatchObject({ pending: 0, available: COMMISSION });
    expect(await shopWallet(p)).toMatchObject({ pending: 0, available: SELLER_A });
    await expectLedgerMatches((await ctvWallet()).id);
  });

  it('đơn COD: hoa hồng chỉ khả dụng khi tiền COD đã đối soát', async () => {
    const p = await order('COD');
    await delivered(p);
    await completed(p);
    expect(await ctvWallet()).toMatchObject({ pending: COMMISSION, available: 0 });
  });

  it('hủy sau khi đã thu: CTV mất hoa hồng', async () => {
    const p = await order();
    await run((tx) =>
      ev().cancelled(
        {
          orderId: p.orderId,
          shopOrderId: shopOrder(p).shopOrderId,
          code: shopOrder(p).code,
          shopId: shopOrder(p).shopId,
          cancelledBy: 'SELLER',
          reason: 'Hết hàng',
          orderCancelled: false,
          cancelledAt: new Date().toISOString(),
        },
        tx,
      ),
    );
    expect(await ctvWallet()).toMatchObject({ pending: 0, available: 0 });
    await expectLedgerMatches((await ctvWallet()).id);
  });

  it('trả hàng hoàn toàn bộ: CTV bị trừ hết hoa hồng, seller không còn tiền', async () => {
    const p = await order();
    await delivered(p);
    const returnId = randomUUID();
    await completed(p, returnId);
    await resolved(p, returnId, {});
    expect(await earning(p)).toMatchObject({
      status: 'REFUNDED',
      returnDeduction: SELLER_A,
      returnCommissionReversed: COMMISSION,
    });
    expect(await ctvWallet()).toMatchObject({ pending: 0, available: 0 });
    expect(await shopWallet(p)).toMatchObject({ pending: 0, available: 0 });
  });

  it('admin hoàn một phần: hoa hồng trừ cùng tỉ lệ, phần còn lại chuyển khả dụng', async () => {
    const p = await order();
    await delivered(p);
    const returnId = randomUUID();
    await completed(p, returnId);
    // Hoàn một nửa số tối đa → bớt 90.000 tiền hàng, hoa hồng bớt 9.000
    const half = Math.floor(PAID_ITEMS_A / 2);
    await resolved(p, returnId, { refundAmount: half });
    const e = await earning(p);
    const reduction = Math.floor((COMMISSION * half) / PAID_ITEMS_A);
    expect(e.returnCommissionReversed).toBe(reduction);
    // Seller: tiền hàng còn 180.000 − bớt, phí tính lại, trừ hoa hồng còn lại
    const base = 180_000 - Math.floor((180_000 * half) / PAID_ITEMS_A);
    const seller = base - Math.floor((base * 500) / 10_000) - (COMMISSION - reduction);
    expect(e.sellerAmount - e.returnDeduction).toBe(seller);
    expect(await ctvWallet()).toMatchObject({ pending: 0, available: COMMISSION - reduction });
    expect(await shopWallet(p)).toMatchObject({ pending: 0, available: seller });
    await expectLedgerMatches((await ctvWallet()).id);
  });

  it('sàn chịu (kiện trả thất lạc): CTV giữ hoa hồng', async () => {
    const p = await order();
    await delivered(p);
    const returnId = randomUUID();
    await completed(p, returnId);
    await resolved(p, returnId, { platformCovers: true });
    expect(await ctvWallet()).toMatchObject({ available: COMMISSION });
  });

  it('sự cố GHN: CTV không có hoa hồng, seller được đền cả phần hoa hồng', async () => {
    const p = await order();
    await run((tx) =>
      ev().incident(
        {
          orderId: p.orderId,
          shopOrderId: shopOrder(p).shopOrderId,
          paymentMethod: p.paymentMethod,
          refundAmount: shopOrder(p).total,
          note: 'GHN làm mất hàng',
          confirmedAt: new Date().toISOString(),
        },
        tx,
      ),
    );
    expect(await ctvWallet()).toMatchObject({ pending: 0, available: 0 });
    expect(await shopWallet(p)).toMatchObject({ available: SELLER_A + COMMISSION });
  });

  describe('API ví và rút tiền của CTV (AFF-05)', () => {
    async function available() {
      const p = await order();
      await delivered(p);
      await completed(p);
      // Hoa hồng 18.000 dưới mức rút tối thiểu 50.000: thêm 2 đơn nữa
      for (let i = 0; i < 2; i++) {
        const q = await order();
        await delivered(q);
        await completed(q);
      }
      t.marketplace.myAffiliate.mockResolvedValue({
        status: 'ACTIVE',
        affiliate: { id: affiliateId, displayName: 'Review Công Nghệ', bankAccount: BANK },
      });
      return p;
    }
    const withdraw = (amount: number, u: User = ctv) =>
      t
        .http()
        .post(`${API}/affiliates/me/withdrawals`)
        .set(auth(u))
        .set('Idempotency-Key', randomUUID())
        .send({ amount });

    it('ví và hoa hồng: chỉ thấy của mình, không lẫn với ví shop', async () => {
      await available();
      const w = await t.http().get(`${API}/affiliates/me/wallet`).set(auth(ctv)).expect(200);
      expect(w.body).toMatchObject({ affiliateId, shopId: null, available: 3 * COMMISSION });
      const list = await t
        .http()
        .get(`${API}/affiliates/me/commissions`)
        .set(auth(ctv))
        .expect(200);
      expect(list.body.total).toBe(3);
      expect(list.body.items[0]).toMatchObject({ commission: COMMISSION, receives: COMMISSION });
      expect(JSON.stringify(list.body)).not.toContain(buyer.id);
      // Chủ shop xem ví CTV: chưa có ví CTV → số 0; ví shop vẫn đúng
      const other = await t
        .http()
        .get(`${API}/affiliates/me/wallet`)
        .set(auth(sellerA))
        .expect(200);
      expect(other.body).toMatchObject({ walletId: null, available: 0 });
      const shop = await t.http().get(`${API}/shops/me/wallet`).set(auth(sellerA)).expect(200);
      expect(shop.body.available).toBe(3 * SELLER_A);
    });

    it('rút tiền: khóa tiền, tài khoản từ hồ sơ CTV, sự kiện v2 có chủ ví AFFILIATE; admin lọc theo loại ví', async () => {
      await available();
      const res = await withdraw(50_000).expect(201);
      expect(res.body).toMatchObject({
        ownerType: 'AFFILIATE',
        displayName: 'Review Công Nghệ',
        bankAccount: { accountNumber: '•••• 6789' },
      });
      expect(t.marketplace.myAffiliate).toHaveBeenCalledWith(`Bearer ${ctv.token}`);
      expect(t.marketplace.myShop).not.toHaveBeenCalled();
      expect(await ctvWallet()).toMatchObject({
        available: 3 * COMMISSION - 50_000,
        locked: 50_000,
      });
      const [requested] = await outbox(t.prisma, WITHDRAWAL_REQUESTED);
      expect(requested).toMatchObject({
        owner: { type: 'AFFILIATE', shopId: null, affiliateId, userId: ctv.id },
        balances: { locked: 50_000 },
      });
      const row = await t.prisma.outboxEvent.findFirstOrThrow({
        where: { type: WITHDRAWAL_REQUESTED },
      });
      expect((row.payload as { version: number }).version).toBe(2);

      await run((tx) =>
        t.app.get(WithdrawalsService).applyDecision(
          {
            withdrawalId: res.body.id,
            approvalId: randomUUID(),
            decision: 'APPROVED',
            reason: null,
            decidedBy: { userId: finance.id, name: finance.name },
            decidedAt: new Date().toISOString(),
          },
          tx,
        ),
      );
      const [updated] = await outbox(t.prisma, WITHDRAWAL_UPDATED);
      expect(updated).toMatchObject({
        status: 'APPROVED',
        owner: { type: 'AFFILIATE', userId: ctv.id },
      });
      const admin = await t
        .http()
        .get(`${API}/admin/withdrawals?ownerType=AFFILIATE`)
        .set(auth(finance))
        .expect(200);
      expect(admin.body.items).toHaveLength(1);
      const shopOnly = await t
        .http()
        .get(`${API}/admin/withdrawals?ownerType=SHOP`)
        .set(auth(finance))
        .expect(200);
      expect(shopOnly.body.items).toHaveLength(0);
    });

    it('CTV bị khóa thì không rút được', async () => {
      await available();
      t.marketplace.myAffiliate.mockResolvedValue({
        status: 'SUSPENDED',
        affiliate: { id: affiliateId, displayName: 'Review Công Nghệ', bankAccount: BANK },
      });
      const res = await withdraw(50_000).expect(409);
      expect(res.body.code).toBe('AFFILIATE_NOT_ACTIVE');
      expect(await ctvWallet()).toMatchObject({ locked: 0 });
    });
  });
});
