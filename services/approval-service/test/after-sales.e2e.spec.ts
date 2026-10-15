import { randomUUID } from 'node:crypto';
import type { AuthUser } from '@san/nest-common';
import {
  ADJUSTMENT_APPROVED,
  DISPUTE_DECIDED,
  WITHDRAWAL_APPROVAL_DECIDED,
  type DisputeOpenedPayload,
  type OrderPlacedPayload,
  type SanEvent,
  type WithdrawalRequestedPayload,
} from '@san/shared';
import { AdjustmentsService } from '../src/disputes/adjustments.service';
import { DisputesService } from '../src/disputes/disputes.service';
import { OrderChecksService } from '../src/order-checks/order-checks.service';
import { WithdrawalApprovalsService } from '../src/withdrawal-approvals/withdrawal-approvals.service';
import type { Prisma } from '../generated/prisma';
import { createTestApp, describeDb, makeUser, resetDb, type TestApp } from './helpers';

const API = '/api/approval/v1';

describeDb('Tranh chấp, duyệt rút tiền, điều chỉnh (P5: DIS-01, DIS-02, FIN-05)', () => {
  let t: TestApp;
  const support = makeUser('Hỗ Trợ', ['SUPPORT']);
  const fin1 = makeUser('Tài Chính 1', ['FINANCE']);
  const fin2 = makeUser('Tài Chính 2', ['FINANCE']);
  const buyer = makeUser('Người Mua');
  const owner = makeUser('Chủ Shop', ['SUPPORT', 'FINANCE']);

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());
  beforeEach(() => resetDb(t.prisma));

  const run = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => t.prisma.$transaction(fn);
  const as = (u: AuthUser) => ({ Authorization: `Bearer ${t.token(u)}` });
  const outbox = async (type: string) =>
    (await t.prisma.outboxEvent.findMany({ where: { type }, orderBy: { createdAt: 'asc' } })).map(
      (e) => (e.payload as unknown as SanEvent).payload as unknown as Record<string, unknown>,
    );

  // ----- tranh chấp trả hàng -----

  describe('tranh chấp trả hàng (DIS-01)', () => {
    function opened(
      stage: DisputeOpenedPayload['stage'] = 'REQUEST_REJECTED',
    ): DisputeOpenedPayload {
      return {
        returnId: randomUUID(),
        returnCode: '261015ABC123-1-TH',
        stage,
        orderId: randomUUID(),
        orderCode: '261015ABC123',
        shopOrderId: randomUUID(),
        shopOrderCode: '261015ABC123-1',
        shop: { shopId: randomUUID(), name: 'Shop A', ownerId: owner.id },
        buyer: { userId: buyer.id, name: buyer.name },
        paymentMethod: 'VNPAY',
        reason: 'DEFECTIVE',
        description: 'Áo rách ở vai',
        images: [`return-images/${buyer.id}/a.png`],
        items: [
          { name: 'Áo thun', variant: 'Đen', price: 200_000, quantity: 1, refundAmount: 180_000 },
        ],
        maxRefundAmount: 180_000,
        buyerStatement: { text: 'Áo rách ngay khi mở hộp', images: [] },
        sellerStatement: { text: 'Ảnh không cho thấy lỗi', images: [] },
        openedAt: new Date().toISOString(),
      };
    }
    const open = async (p = opened()) => {
      await run((tx) => t.app.get(DisputesService).onOpened(p, tx));
      await run((tx) => t.app.get(DisputesService).onOpened(p, tx)); // nhận trùng
      return (await t.prisma.dispute.findFirstOrThrow({ where: { returnId: p.returnId } })).id;
    };
    const decide = (id: string, body: object, u: AuthUser = support) =>
      t.http().post(`${API}/admin/disputes/${id}/decision`).set(as(u)).send(body);

    it('lưu hồ sơ hai bên, hạn nhắc 72 giờ, không tạo trùng', async () => {
      const id = await open();
      expect(await t.prisma.dispute.count()).toBe(1);
      const res = await t.http().get(`${API}/admin/disputes/${id}`).set(as(support)).expect(200);
      expect(res.body).toMatchObject({
        stage: 'REQUEST_REJECTED',
        status: 'PENDING',
        maxRefund: 180_000,
        overdue: false,
        buyerStatement: { text: 'Áo rách ngay khi mở hộp' },
        sellerStatement: { text: 'Ảnh không cho thấy lỗi' },
        returnData: { reason: 'DEFECTIVE', items: [expect.objectContaining({ name: 'Áo thun' })] },
      });
      expect(new Date(res.body.deadline).getTime() - Date.now()).toBeGreaterThan(71 * 3_600_000);
      await t.http().get(`${API}/admin/disputes`).set(as(fin1)).expect(403);
    });

    it('hoàn một phần: kiểm số tiền, phát dispute.decided, ghi nhật ký, không quyết hai lần', async () => {
      const id = await open();
      await decide(id, { decision: 'REFUND', note: 'Lỗi nhỏ, hoàn một phần' }).expect(400);
      await decide(id, {
        decision: 'REFUND',
        refundAmount: 180_001,
        note: 'Lỗi nhỏ, hoàn một phần',
      }).expect(400);
      await decide(id, { decision: 'REFUND', refundAmount: 50_000, note: 'ngắn' }).expect(400);
      const res = await decide(id, {
        decision: 'REFUND',
        refundAmount: 50_000,
        note: 'Lỗi nhỏ, hoàn một phần',
      }).expect(200);
      expect(res.body).toMatchObject({
        status: 'RESOLVED',
        decision: 'REFUND',
        refundAmount: 50_000,
      });
      const [ev] = await outbox(DISPUTE_DECIDED);
      expect(ev).toMatchObject({
        stage: 'REQUEST_REJECTED',
        decision: 'REFUND',
        refundAmount: 50_000,
        decidedBy: { userId: support.id },
      });
      expect(await t.prisma.auditLog.count({ where: { action: 'DECIDE_DISPUTE' } })).toBe(1);
      await decide(id, { decision: 'REJECT', note: 'Đổi ý muốn từ chối' })
        .expect(409)
        .expect((r) => expect(r.body.code).toBe('ALREADY_DECIDED'));
    });

    it('chấp nhận trả hàng chỉ ở giai đoạn shop từ chối; chủ shop/người mua không tự quyết', async () => {
      const stage2 = await open(opened('GOODS_PROBLEM'));
      await decide(stage2, {
        decision: 'ACCEPT_RETURN',
        note: 'Cho người mua gửi lại hàng',
      }).expect(400);
      await decide(stage2, { decision: 'REJECT', note: 'Hàng gửi về không đúng' }, owner)
        .expect(403)
        .expect((r) => expect(r.body.code).toBe('SELF_APPROVAL_FORBIDDEN'));
      const stage1 = await open();
      await decide(stage1, { decision: 'ACCEPT_RETURN', note: 'Ảnh cho thấy áo rách' }).expect(200);
      expect((await outbox(DISPUTE_DECIDED))[0]).toMatchObject({
        decision: 'ACCEPT_RETURN',
        refundAmount: null,
      });
    });
  });

  // ----- duyệt rút tiền -----

  describe('duyệt rút tiền (FIN-05)', () => {
    function requested(): WithdrawalRequestedPayload {
      return {
        withdrawalId: randomUUID(),
        shopId: randomUUID(),
        shopName: 'Shop A',
        owner: { userId: owner.id, name: owner.name },
        amount: 100_000,
        bankAccount: {
          bankName: 'Vietcombank',
          accountNumberMasked: '•••• 6789',
          accountName: 'NGUYEN VAN A',
        },
        wallet: { pending: 0, available: 71_000, locked: 100_000 },
        requestedAt: new Date().toISOString(),
      };
    }
    const svc = () => t.app.get(WithdrawalApprovalsService);
    const decide = (id: string, body: object, u: AuthUser = fin1) =>
      t.http().post(`${API}/admin/withdrawal-approvals/${id}/decision`).set(as(u)).send(body);

    it('duyệt: phát quyết định cho payment-service; chủ shop không tự duyệt', async () => {
      const p = requested();
      await run((tx) => svc().onRequested(p, tx));
      await run((tx) => svc().onRequested(p, tx));
      const list = await t
        .http()
        .get(`${API}/admin/withdrawal-approvals`)
        .set(as(fin1))
        .expect(200);
      expect(list.body).toMatchObject({
        total: 1,
        items: [{ amount: 100_000, status: 'PENDING' }],
      });
      const id = list.body.items[0].id as string;
      await decide(id, { decision: 'APPROVE' }, owner)
        .expect(403)
        .expect((r) => expect(r.body.code).toBe('SELF_APPROVAL_FORBIDDEN'));
      await decide(id, { decision: 'REJECT' }).expect(400);
      await decide(id, { decision: 'APPROVE' }).expect(200);
      expect(await outbox(WITHDRAWAL_APPROVAL_DECIDED)).toEqual([
        expect.objectContaining({
          withdrawalId: p.withdrawalId,
          decision: 'APPROVED',
          reason: null,
        }),
      ]);
      await decide(id, { decision: 'REJECT', reason: 'x' }).expect(409);
      expect(await t.prisma.auditLog.count({ where: { action: 'APPROVE_WITHDRAWAL' } })).toBe(1);
    });

    it('seller hủy trước khi duyệt: hồ sơ thành đã hủy, admin không duyệt được nữa', async () => {
      const p = requested();
      await run((tx) => svc().onRequested(p, tx));
      await run((tx) =>
        svc().onCancelled(
          { withdrawalId: p.withdrawalId, cancelledAt: new Date().toISOString() },
          tx,
        ),
      );
      const a = await t.prisma.withdrawalApproval.findFirstOrThrow();
      expect(a.status).toBe('CANCELLED');
      await decide(a.id, { decision: 'APPROVE' }).expect(409);
      expect(await outbox(WITHDRAWAL_APPROVAL_DECIDED)).toEqual([]);
    });
  });

  // ----- điều chỉnh sau giải ngân -----

  describe('điều chỉnh sau giải ngân (DIS-02)', () => {
    /** Đơn đã nhận qua order.placed (để tra đơn con theo mã) */
    async function placedOrder(): Promise<OrderPlacedPayload> {
      const code = `261015${randomUUID().slice(0, 6).toUpperCase()}`;
      const p: OrderPlacedPayload = {
        orderId: randomUUID(),
        code,
        buyer: { userId: buyer.id, name: buyer.name, email: buyer.email },
        paymentMethod: 'VNPAY',
        total: 230_000,
        payBefore: new Date(Date.now() + 15 * 60_000).toISOString(),
        shippingProvince: 'Hà Nội',
        placedAt: new Date().toISOString(),
        shopOrders: [
          {
            shopOrderId: randomUUID(),
            code: `${code}-1`,
            shopId: randomUUID(),
            shopName: 'Shop A',
            ownerId: owner.id,
            subtotal: 200_000,
            shopDiscount: 0,
            platformDiscount: 0,
            shippingFee: 30_000,
            total: 230_000,
            items: [{ name: 'Áo', variant: '', price: 200_000, quantity: 1 }],
          },
        ],
      };
      await run((tx) => t.app.get(OrderChecksService).onPlaced(p, tx));
      return p;
    }
    const create = (body: object, u: AuthUser = fin1, key: string = randomUUID()) =>
      t.http().post(`${API}/admin/adjustments`).set(as(u)).set('Idempotency-Key', key).send(body);
    const decide = (id: string, body: object, u: AuthUser) =>
      t.http().post(`${API}/admin/adjustments/${id}/decision`).set(as(u)).send(body);
    const bank = { bankName: 'Vietcombank', accountNumber: '0011223344', accountName: 'nguoi mua' };

    it('lập → admin khác duyệt → gửi payment-service → ghi kết quả thực thi', async () => {
      const p = await placedOrder();
      const so = p.shopOrders[0]!;
      const body = {
        shopOrderCode: so.code.toLowerCase(),
        sellerChange: -50_000,
        buyerRefund: 60_000,
        bankAccount: bank,
        reason: 'Người mua khiếu nại hàng giả sau khi hoàn tất',
      };
      const key = randomUUID();
      const res = await create(body, fin1, key).expect(201);
      expect(res.body).toMatchObject({
        shopOrderCode: so.code,
        shop: { id: so.shopId, name: 'Shop A' },
        buyer: { id: buyer.id },
        sellerChange: -50_000,
        buyerRefund: 60_000,
        status: 'PENDING',
        createdByName: 'Tài Chính 1',
        bankAccount: { accountName: 'NGUOI MUA' },
      });
      expect((await create(body, fin1, key).expect(201)).body.id).toBe(res.body.id);
      // Người lập không tự duyệt; chủ shop không duyệt
      await decide(res.body.id, { decision: 'APPROVE' }, fin1)
        .expect(403)
        .expect((r) => expect(r.body.code).toBe('SAME_ADMIN_FORBIDDEN'));
      await decide(res.body.id, { decision: 'APPROVE' }, owner).expect(403);
      await decide(res.body.id, { decision: 'APPROVE' }, fin2).expect(200);
      const [ev] = await outbox(ADJUSTMENT_APPROVED);
      expect(ev).toMatchObject({
        adjustmentId: res.body.id,
        orderId: p.orderId,
        shopOrderId: so.shopOrderId,
        shopId: so.shopId,
        sellerChange: -50_000,
        buyerRefund: 60_000,
        bankAccount: { accountNumber: '0011223344' },
        createdBy: { userId: fin1.id },
        approvedBy: { userId: fin2.id },
      });
      await run((tx) =>
        t.app.get(AdjustmentsService).onExecuted(
          {
            adjustmentId: res.body.id,
            result: 'FAILED',
            message: 'Số dư không đủ',
            executedAt: new Date().toISOString(),
          },
          tx,
        ),
      );
      const after = await t
        .http()
        .get(`${API}/admin/adjustments/${res.body.id}`)
        .set(as(fin1))
        .expect(200);
      expect(after.body).toMatchObject({ status: 'FAILED', executionNote: 'Số dư không đủ' });
      expect(
        await t.prisma.auditLog.count({
          where: { action: { in: ['CREATE_ADJUSTMENT', 'APPROVE_ADJUSTMENT'] } },
        }),
      ).toBe(2);
    });

    it('kiểm dữ liệu: mã đơn lạ, cả hai số bằng 0, thiếu tài khoản, người mua/chủ shop lập', async () => {
      const p = await placedOrder();
      const code = p.shopOrders[0]!.code;
      const reason = 'Điều chỉnh do sai sót đối soát';
      await create({ shopOrderCode: 'KHONGCO-1', sellerChange: 1000, buyerRefund: 0, reason })
        .expect(404)
        .expect((r) => expect(r.body.code).toBe('SHOP_ORDER_NOT_FOUND'));
      await create({ shopOrderCode: code, sellerChange: 0, buyerRefund: 0, reason }).expect(400);
      await create({ shopOrderCode: code, sellerChange: 0, buyerRefund: 10_000, reason }).expect(
        400,
      );
      await create(
        { shopOrderCode: code, sellerChange: 1000, buyerRefund: 0, reason },
        owner,
      ).expect(403);
      await t
        .http()
        .post(`${API}/admin/adjustments`)
        .set(as(fin1))
        .send({ shopOrderCode: code, sellerChange: 1000, buyerRefund: 0, reason })
        .expect(400);
      // Từ chối cần lý do
      const res = await create({
        shopOrderCode: code,
        sellerChange: 1000,
        buyerRefund: 0,
        reason,
      }).expect(201);
      await decide(res.body.id, { decision: 'REJECT' }, fin2).expect(400);
      await decide(res.body.id, { decision: 'REJECT', reason: 'Không đủ căn cứ' }, fin2).expect(
        200,
      );
      expect(await outbox(ADJUSTMENT_APPROVED)).toEqual([]);
    });

    it('chống gửi lặp: cùng mã trả đề nghị cũ (kể cả gửi đồng thời), mã của admin khác bị chặn', async () => {
      const p = await placedOrder();
      const body = {
        shopOrderCode: p.shopOrders[0]!.code,
        sellerChange: 1_000,
        buyerRefund: 0,
        reason: 'Điều chỉnh do sai sót đối soát',
      };
      await create(body, fin1, 'x'.repeat(65)).expect(400);
      const key = randomUUID();
      const [a, b] = await Promise.all([create(body, fin1, key), create(body, fin1, key)]);
      expect([a.status, b.status]).toEqual([201, 201]);
      expect(a.body.id).toBe(b.body.id);
      expect(await t.prisma.dispute.count({ where: { type: 'ADJUSTMENT' } })).toBe(1);
      await create(body, fin2, key)
        .expect(409)
        .expect((r) => expect(r.body.code).toBe('IDEMPOTENCY_KEY_REUSED'));
    });
  });

  it('sai bộ quyền: Hỗ trợ không duyệt rút/điều chỉnh, Tài chính không phân xử tranh chấp', async () => {
    await t.http().get(`${API}/admin/withdrawal-approvals`).set(as(support)).expect(403);
    await t.http().get(`${API}/admin/adjustments`).set(as(support)).expect(403);
    await t.http().get(`${API}/admin/disputes`).set(as(fin1)).expect(403);
    await t.http().get(`${API}/admin/disputes`).set(as(buyer)).expect(403);
  });
});
