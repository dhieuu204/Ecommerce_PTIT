import { randomUUID } from 'node:crypto';
import type { OrderPlacedPayload } from '@san/shared';
import { PaymentOrderEvents } from '../src/payments/order.events';
import { PaymentJobs } from '../src/payments/payment.jobs';
import { buildCodFile, readCodFile } from '../src/reconciliation/cod-file';
import { VnpayReconciliationService } from '../src/reconciliation/vnpay-reconciliation.service';
import { WalletService } from '../src/wallet/wallet.service';
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

/** Shop A: tiền hàng 200.000 - voucher shop 20.000 - phí sàn 9.000 = 171.000; shop B: 100.000 - 5.000 = 95.000 */
const SELLER_A = 171_000;
const SELLER_B = 95_000;

describeDb('Ví seller và đối soát (P4: FIN-01/02, COD-02, PAY-05)', () => {
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
    buyer = makeUser('Người Mua');
    sellerA = makeUser('Chủ Shop A');
    finance = makeUser('Kế Toán', ['FINANCE']);
  });

  const auth = (u: User) => ({ Authorization: `Bearer ${u.token}` });
  const ev = () => t.app.get(PaymentOrderEvents);
  const run = <T>(
    fn: (tx: Parameters<Parameters<TestApp['prisma']['$transaction']>[0]>[0]) => Promise<T>,
  ) => t.prisma.$transaction(fn);

  /** Đơn 2 shop; chủ shop A là `sellerA` */
  function order(method: 'VNPAY' | 'COD' = 'VNPAY'): OrderPlacedPayload {
    const p = placedOrder(buyer, {
      paymentMethod: method,
      payBefore: method === 'COD' ? null : new Date(Date.now() + 15 * 60_000).toISOString(),
    });
    p.shopOrders[0]!.ownerId = sellerA.id;
    return p;
  }
  const so = (p: OrderPlacedPayload, i = 0) => p.shopOrders[i]!;

  const placed = (p: OrderPlacedPayload) => run((tx) => ev().placed(p, tx));
  async function pay(p: OrderPlacedPayload) {
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
    return link.paymentId as string;
  }
  const delivered = (p: OrderPlacedPayload, i = 0, ghnCode = `SIM${i}${p.code}`) =>
    run((tx) =>
      ev().delivered(
        {
          orderId: p.orderId,
          shopOrderId: so(p, i).shopOrderId,
          paymentMethod: p.paymentMethod,
          ghnCode,
          codAmount: p.paymentMethod === 'COD' ? so(p, i).total : 0,
          carrierFee: 25_000,
          deliveredAt: new Date().toISOString(),
        },
        tx,
      ),
    );
  const completed = (p: OrderPlacedPayload, i = 0) =>
    run((tx) =>
      ev().completed(
        {
          orderId: p.orderId,
          shopOrderId: so(p, i).shopOrderId,
          completedBy: 'BUYER',
          completedAt: new Date().toISOString(),
        },
        tx,
      ),
    );
  const failed = (p: OrderPlacedPayload, i = 0) =>
    run((tx) =>
      ev().deliveryFailed(
        {
          orderId: p.orderId,
          shopOrderId: so(p, i).shopOrderId,
          paymentMethod: p.paymentMethod,
          refundAmount: p.paymentMethod === 'VNPAY' ? so(p, i).total - so(p, i).shippingFee : 0,
          failedAt: new Date().toISOString(),
        },
        tx,
      ),
    );
  const incident = (p: OrderPlacedPayload, refundAmount: number, i = 0) =>
    run((tx) =>
      ev().incident(
        {
          orderId: p.orderId,
          shopOrderId: so(p, i).shopOrderId,
          paymentMethod: p.paymentMethod,
          refundAmount,
          note: 'GHN làm mất hàng',
          confirmedAt: new Date().toISOString(),
        },
        tx,
      ),
    );

  const wallet = (shopId: string) => t.prisma.sellerWallet.findUniqueOrThrow({ where: { shopId } });
  const earning = (p: OrderPlacedPayload, i = 0) =>
    t.prisma.sellerEarning.findUniqueOrThrow({ where: { shopOrderId: so(p, i).shopOrderId } });

  /** Số dư mỗi ngăn phải bằng tổng các dòng lịch sử vào trừ ra */
  async function expectLedgerMatches(shopId: string) {
    const w = await wallet(shopId);
    const txs = await t.prisma.walletTransaction.findMany({ where: { shopId } });
    const sum = (bucket: string) =>
      txs.reduce(
        (a, x) =>
          a + (x.toBucket === bucket ? x.amount : 0) - (x.fromBucket === bucket ? x.amount : 0),
        0,
      );
    expect({ pending: w.pending, available: w.available, locked: w.locked }).toEqual({
      pending: sum('PENDING'),
      available: sum('AVAILABLE'),
      locked: sum('LOCKED'),
    });
    expect(w.pending).toBeGreaterThanOrEqual(0);
    expect(w.available).toBeGreaterThanOrEqual(0);
  }

  // ----- nhận đơn -----

  it('order.placed tạo ví cho shop và báo lại phí sàn một lần (cả đơn COD)', async () => {
    const p = order('COD');
    await placed(p);
    await placed(p);
    expect(await t.prisma.sellerWallet.count()).toBe(2);
    expect((await wallet(so(p).shopId)).ownerId).toBe(sellerA.id);
    const e = await earning(p);
    expect(e).toMatchObject({
      paymentMethod: 'COD',
      codAmount: so(p).total,
      payBefore: null,
      status: 'UNPAID',
      sellerAmount: SELLER_A,
    });
    const recorded = await outbox(t.prisma, 'seller_earnings.recorded');
    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.shopOrders).toEqual(
      expect.arrayContaining([
        {
          shopOrderId: so(p).shopOrderId,
          platformFeeRate: 500,
          platformFee: 9_000,
          sellerAmount: SELLER_A,
        },
      ]),
    );
  });

  // ----- trả trước -----

  describe('đơn trả trước', () => {
    it('đã thu → đang giữ; hoàn tất → khả dụng; sự kiện lặp không cộng hai lần', async () => {
      const p = order();
      await placed(p);
      await pay(p);
      expect(await wallet(so(p).shopId)).toMatchObject({ pending: SELLER_A, available: 0 });
      expect(await wallet(so(p, 1).shopId)).toMatchObject({ pending: SELLER_B, available: 0 });

      await delivered(p);
      await delivered(p);
      expect((await wallet(so(p).shopId)).pending).toBe(SELLER_A);
      await completed(p);
      await completed(p);
      expect(await wallet(so(p).shopId)).toMatchObject({ pending: 0, available: SELLER_A });
      expect(await earning(p)).toMatchObject({ status: 'AVAILABLE', ghnCode: `SIM0${p.code}` });
      expect(await t.prisma.walletTransaction.count({ where: { shopId: so(p).shopId } })).toBe(2);
      await expectLedgerMatches(so(p).shopId);
    });

    it('"hoàn tất" tới trước "đã giao" (sai thứ tự) vẫn ra đúng số', async () => {
      const p = order();
      await placed(p);
      await pay(p);
      await completed(p);
      await delivered(p);
      expect(await wallet(so(p).shopId)).toMatchObject({ pending: 0, available: SELLER_A });
      await expectLedgerMatches(so(p).shopId);
    });

    it('sự kiện tới trước order.placed: báo lỗi để xử lý lại sau, không ghi gì', async () => {
      const p = order();
      await expect(completed(p)).rejects.toThrow(/Chưa có đơn con/);
      expect(await t.prisma.walletTransaction.count()).toBe(0);
    });

    it('hủy sau khi đã thu: trừ lại ngăn đang giữ và tạo khoản hoàn', async () => {
      const p = order();
      await placed(p);
      await pay(p);
      await run((tx) =>
        ev().cancelled(
          {
            orderId: p.orderId,
            shopOrderId: so(p).shopOrderId,
            code: so(p).code,
            shopId: so(p).shopId,
            cancelledBy: 'SELLER',
            reason: 'Hết hàng',
            orderCancelled: false,
            cancelledAt: new Date().toISOString(),
          },
          tx,
        ),
      );
      expect(await wallet(so(p).shopId)).toMatchObject({ pending: 0, available: 0 });
      expect(await t.prisma.refund.findMany()).toEqual([
        expect.objectContaining({ amount: so(p).total, reason: 'CANCELLED' }),
      ]);
      await expectLedgerMatches(so(p).shopId);
    });

    it('giao thất bại: trừ lại ngăn đang giữ, hoàn tiền hàng sau voucher; nhận lặp không hoàn hai lần', async () => {
      const p = order();
      await placed(p);
      await pay(p);
      await failed(p);
      await failed(p);
      expect(await wallet(so(p).shopId)).toMatchObject({ pending: 0, available: 0 });
      expect(await earning(p)).toMatchObject({ status: 'FAILED' });
      expect(await t.prisma.refund.findMany()).toEqual([
        expect.objectContaining({
          amount: so(p).total - so(p).shippingFee,
          reason: 'DELIVERY_FAILED',
        }),
      ]);
      await expectLedgerMatches(so(p).shopId);
    });

    it('sự cố: đền seller vào khả dụng, hoàn đủ người mua', async () => {
      const p = order();
      await placed(p);
      await pay(p);
      await incident(p, so(p).total);
      await incident(p, so(p).total);
      expect(await wallet(so(p).shopId)).toMatchObject({ pending: 0, available: SELLER_A });
      expect(await earning(p)).toMatchObject({ status: 'COMPENSATED' });
      expect(await t.prisma.refund.findMany()).toEqual([
        expect.objectContaining({ amount: so(p).total, reason: 'INCIDENT' }),
      ]);
      const types = (await t.prisma.walletTransaction.findMany({ where: { shopId: so(p).shopId } }))
        .map((x) => x.type)
        .sort();
      expect(types).toEqual(['COMPENSATION', 'HELD', 'REVERSED']);
      await expectLedgerMatches(so(p).shopId);
    });

    it('thất lạc lúc đang hoàn, tin "sự cố" tới trước "giao thất bại": hoàn đúng một khoản, đền một lần', async () => {
      const p = order();
      await placed(p);
      await pay(p);
      await incident(p, 0);
      await failed(p);
      expect(await wallet(so(p).shopId)).toMatchObject({ pending: 0, available: SELLER_A });
      expect(await earning(p)).toMatchObject({ status: 'COMPENSATED' });
      expect(await t.prisma.refund.findMany()).toEqual([
        expect.objectContaining({ amount: so(p).total - so(p).shippingFee }),
      ]);
      await expectLedgerMatches(so(p).shopId);
    });
  });

  // ----- COD -----

  describe('đơn COD', () => {
    it('không trả trước được, không bị hết hạn thanh toán', async () => {
      const p = order('COD');
      await placed(p);
      const res = await t
        .http()
        .post(`${API}/payments`)
        .set(auth(buyer))
        .set('Idempotency-Key', randomUUID())
        .send({ orderId: p.orderId })
        .expect(409);
      expect(res.body.code).toBe('ORDER_NOT_PAYABLE');
      expect(await t.app.get(PaymentJobs).watch(new Date(Date.now() + 30 * 86_400_000))).toBe(0);
      expect((await earning(p)).status).toBe('UNPAID');
    });

    it('đã giao → đang giữ; hoàn tất mà chưa đối soát thì vẫn giữ; giao thất bại trước khi giao thì không đụng ví', async () => {
      const p = order('COD');
      await placed(p);
      await delivered(p);
      await delivered(p);
      await completed(p);
      expect(await wallet(so(p).shopId)).toMatchObject({ pending: SELLER_A, available: 0 });
      const w = await t.http().get(`${API}/shops/me/wallet`).set(auth(sellerA)).expect(200);
      expect(w.body).toMatchObject({
        pending: SELLER_A,
        available: 0,
        pendingWaitingCod: SELLER_A,
        pendingWaitingCompletion: 0,
      });

      await failed(p, 1);
      expect(await wallet(so(p, 1).shopId)).toMatchObject({ pending: 0, available: 0 });
      expect(await earning(p, 1)).toMatchObject({ status: 'FAILED' });
      expect(await t.prisma.refund.count()).toBe(0);
    });
  });

  // ----- đối soát COD -----

  describe('đối soát COD', () => {
    const upload = (buf: Buffer, name = 'doi-soat.xlsx', u: User = finance) =>
      t.http().post(`${API}/admin/cod-reconciliations`).set(auth(u)).attach('file', buf, name);

    async function codDelivered() {
      const p = order('COD');
      await placed(p);
      await delivered(p, 0, 'GHNA1');
      await completed(p);
      return p;
    }
    const file = (rows: Array<[string, number]>) =>
      buildCodFile(
        rows.map(([ghnCode, codAmount]) => ({
          ghnCode,
          clientCode: '',
          codAmount,
          shipFee: 22_000,
          returnFee: 0,
          deliveredAt: null,
        })),
        'GHN',
      );

    it('khớp → tiền khả dụng; nhập lại cùng file → 409; file khác có vận đơn đã đối soát → "trùng", không cộng lần nữa', async () => {
      const p = await codDelivered();
      const buf = await file([
        ['GHNA1', so(p).total],
        ['KHONGCO', 50_000],
      ]);
      const res = await upload(buf).expect(201);
      expect(res.body).toMatchObject({
        totalRows: 2,
        matched: 1,
        notFound: 1,
        totalCod: so(p).total + 50_000,
      });
      expect(res.body.items[0]).toMatchObject({
        ghnCode: 'GHNA1',
        result: 'MATCHED',
        shopOrderCode: so(p).code,
        codDifference: 0,
        shippingDifference: so(p).shippingFee - 22_000,
      });
      expect(await wallet(so(p).shopId)).toMatchObject({ pending: 0, available: SELLER_A });

      const again = await upload(buf);
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('FILE_ALREADY_IMPORTED');

      const other = await upload(
        await file([
          ['GHNA1', so(p).total],
          ['GHNA1', so(p).total],
        ]),
        'lan-2.xlsx',
      ).expect(201);
      expect(other.body).toMatchObject({ duplicated: 2, matched: 0 });
      expect(await wallet(so(p).shopId)).toMatchObject({ pending: 0, available: SELLER_A });
      expect(await t.prisma.walletTransaction.count({ where: { type: 'RELEASED' } })).toBe(1);
      expect(
        await t.prisma.auditLog.count({ where: { action: 'IMPORT_COD_RECONCILIATION' } }),
      ).toBe(2);
      await expectLedgerMatches(so(p).shopId);
    });

    it('chưa hoàn tất mà đã đối soát: chờ hoàn tất mới khả dụng', async () => {
      const p = order('COD');
      await placed(p);
      await delivered(p, 0, 'GHNA1');
      await upload(await file([['GHNA1', so(p).total]])).expect(201);
      expect(await wallet(so(p).shopId)).toMatchObject({ pending: SELLER_A, available: 0 });
      await completed(p);
      expect(await wallet(so(p).shopId)).toMatchObject({ pending: 0, available: SELLER_A });
    });

    it('lệch tiền → chờ xử lý; chấp nhận thì khả dụng (ghi nhật ký); xử lý lại → 409', async () => {
      const p = await codDelivered();
      const res = await upload(await file([['GHNA1', so(p).total - 1_000]])).expect(201);
      const item = res.body.items[0];
      expect(item).toMatchObject({ result: 'MISMATCHED', codDifference: -1_000 });
      expect((await wallet(so(p).shopId)).available).toBe(0);

      const resolve = (accept: boolean) =>
        t
          .http()
          .post(`${API}/admin/cod-reconciliations/items/${item.id}/resolve`)
          .set(auth(finance))
          .send({ accept, note: 'GHN trừ nhầm, đã liên hệ' });
      expect((await resolve(false).expect(200)).body.resolution).toBe('NOTED');
      expect((await wallet(so(p).shopId)).available).toBe(0);
      expect((await resolve(true).expect(200)).body.resolution).toBe('ACCEPTED');
      expect(await wallet(so(p).shopId)).toMatchObject({ pending: 0, available: SELLER_A });
      await resolve(true)
        .expect(409)
        .expect((r) => expect(r.body.code).toBe('ITEM_NOT_MISMATCHED'));
      expect(await t.prisma.auditLog.count({ where: { action: 'RESOLVE_COD_ITEM' } })).toBe(2);
    });

    it('vận đơn chưa giao → "chưa giao"; CSV đọc được; thiếu cột → 400; không phải FINANCE → 403', async () => {
      const p = order('COD');
      await placed(p);
      await run((tx) =>
        tx.sellerEarning.update({
          where: { shopOrderId: so(p).shopOrderId },
          data: { ghnCode: 'GHNCHUAGIAO' },
        }),
      );
      const csv = Buffer.from(
        `Mã vận đơn;Tiền thu hộ;Phí giao hàng\nGHNCHUAGIAO;${so(p).total};22.000\n`,
      );
      const res = await upload(csv, 'ghn.csv').expect(201);
      expect(res.body).toMatchObject({ notDelivered: 1 });

      const bad = await upload(Buffer.from('a,b\n1,2\n'), 'x.csv').expect(400);
      expect(bad.body.code).toBe('INVALID_RECONCILIATION_FILE');
      await upload(Buffer.from('x'), 'x.pdf').expect(400);
      await upload(csv, 'ghn.csv', sellerA).expect(403);
    });

    it('file mẫu và file MÔ PHỎNG tải được, file MÔ PHỎNG nhập vào thì khớp hết', async () => {
      const p = await codDelivered();
      const tpl = await t
        .http()
        .get(`${API}/admin/cod-reconciliations/template`)
        .set(auth(finance))
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect((await readCodFile(tpl.body as Buffer))[0]!.ghnCode).toBe('GHNVIDU01');

      const sim = await t
        .http()
        .get(`${API}/admin/cod-reconciliations/simulated-file`)
        .set(auth(finance))
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      const rows = await readCodFile(sim.body as Buffer);
      expect(rows.map((r) => r.ghnCode)).toEqual(['GHNA1']);
      const res = await upload(sim.body as Buffer, 'mo-phong.xlsx').expect(201);
      expect(res.body.matched).toBe(1);
      expect((await wallet(so(p).shopId)).available).toBe(SELLER_A);
      const list = await t
        .http()
        .get(`${API}/admin/cod-reconciliations`)
        .set(auth(finance))
        .expect(200);
      expect(list.body.total).toBe(1);
    });
  });

  // ----- số dư không âm -----

  describe('số dư không bao giờ âm', () => {
    it('trừ quá số đang giữ: báo lỗi, không ghi dòng lịch sử nào', async () => {
      const p = order();
      await placed(p);
      const e = await earning(p);
      await expect(
        run((tx) => t.app.get(WalletService).reverse(tx, { ...e, status: 'HELD' }, 'thử')),
      ).rejects.toThrow(/không đủ/);
      expect(await t.prisma.walletTransaction.count()).toBe(0);
      expect(await wallet(so(p).shopId)).toMatchObject({ pending: 0 });
    });

    it('database chặn số dư âm và dòng tiền không dương', async () => {
      const p = order();
      await placed(p);
      await expect(
        t.prisma.sellerWallet.update({ where: { shopId: so(p).shopId }, data: { available: -1 } }),
      ).rejects.toThrow();
      await expect(
        t.prisma.walletTransaction.create({
          data: { shopId: so(p).shopId, type: 'HELD', amount: 0, toBucket: 'PENDING' },
        }),
      ).rejects.toThrow();
    });
  });

  // ----- API của seller -----

  describe('API ví của seller', () => {
    it('chỉ thấy ví của shop mình; lịch sử và tiền từng đơn có lý do chưa khả dụng', async () => {
      const p = order();
      await placed(p);
      await pay(p);
      await delivered(p);

      const w = await t.http().get(`${API}/shops/me/wallet`).set(auth(sellerA)).expect(200);
      expect(w.body).toMatchObject({
        shopId: so(p).shopId,
        pending: SELLER_A,
        pendingWaitingCompletion: SELLER_A,
      });
      const txs = await t
        .http()
        .get(`${API}/shops/me/wallet/transactions`)
        .set(auth(sellerA))
        .expect(200);
      expect(txs.body.items).toEqual([
        expect.objectContaining({
          type: 'HELD',
          amount: SELLER_A,
          toBucket: 'PENDING',
          shopOrderCode: so(p).code,
        }),
      ]);
      const earnings = await t
        .http()
        .get(`${API}/shops/me/earnings?status=HELD`)
        .set(auth(sellerA))
        .expect(200);
      expect(earnings.body.items).toEqual([
        expect.objectContaining({
          shopOrderCode: so(p).code,
          sellerAmount: SELLER_A,
          platformFee: 9_000,
          waitingFor: 'Chờ đơn hoàn tất',
        }),
      ]);

      const stranger = makeUser('Người Lạ');
      const empty = await t.http().get(`${API}/shops/me/wallet`).set(auth(stranger)).expect(200);
      expect(empty.body).toMatchObject({ shopId: null, pending: 0, available: 0 });
      expect(
        (await t.http().get(`${API}/shops/me/earnings`).set(auth(stranger)).expect(200)).body.total,
      ).toBe(0);
    });
  });

  // ----- đối soát VNPay -----

  describe('đối soát VNPay', () => {
    it('khớp thì không hiện; lệch thì hiện, ghi chú xong thì đánh dấu đã xử lý (ghi nhật ký)', async () => {
      const p1 = order();
      await placed(p1);
      const ok = await pay(p1);
      const p2 = order();
      p2.shopOrders[0]!.ownerId = randomUUID();
      await placed(p2);
      const bad = await pay(p2);
      // Giả "VNPay tra cứu lại báo thất bại" cho giao dịch thứ hai
      await t.prisma.payment.update({
        where: { id: bad },
        data: { gatewayResponse: { mockBank: 'FAILED' } },
      });

      const run1 = await t
        .http()
        .post(`${API}/admin/vnpay-reconciliation/run`)
        .set(auth(finance))
        .expect(200);
      expect(run1.body).toMatchObject({ checked: 2, mismatched: 1 });
      expect(run1.body.lastRunAt).toEqual(expect.any(String));
      expect(run1.body.payments).toEqual([
        expect.objectContaining({ paymentId: bad, kind: 'MISMATCH', orderCode: p2.code }),
      ]);
      expect(
        (await t.prisma.payment.findUniqueOrThrow({ where: { id: ok } })).reconcileStatus,
      ).toBe('MATCHED');

      const note = (id: string) =>
        t
          .http()
          .post(`${API}/admin/vnpay-reconciliation/payments/${id}/note`)
          .set(auth(finance))
          .send({ note: 'Đã đối chiếu sao kê, VNPay xác nhận có tiền' });
      expect((await note(bad).expect(200)).body).toMatchObject({ reconcileStatus: 'RESOLVED' });
      await note(ok)
        .expect(409)
        .expect((r) => expect(r.body.code).toBe('NOT_RECONCILE_EXCEPTION'));
      const view = await t
        .http()
        .get(`${API}/admin/vnpay-reconciliation`)
        .set(auth(finance))
        .expect(200);
      expect(view.body.payments).toEqual([]);
      expect(view.body.resolved).toEqual([expect.objectContaining({ paymentId: bad })]);
      expect(await t.prisma.auditLog.count({ where: { action: 'RESOLVE_VNPAY_RECONCILE' } })).toBe(
        1,
      );

      // Chạy lại không đè khoản đã xử lý
      await t.app.get(VnpayReconciliationService).run();
      expect(
        (await t.prisma.payment.findUniqueOrThrow({ where: { id: bad } })).reconcileStatus,
      ).toBe('RESOLVED');
      await t.http().get(`${API}/admin/vnpay-reconciliation`).set(auth(sellerA)).expect(403);
    });
  });
});
