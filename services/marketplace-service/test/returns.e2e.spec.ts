import { randomUUID } from 'node:crypto';
import {
  DISPUTE_OPENED,
  RETURN_REQUESTED,
  RETURN_RESOLVED,
  SHOP_ORDER_COMPLETED,
  type DisputeDecidedPayload,
  type SanEvent,
} from '@san/shared';
import { OrderJobs } from '../src/orders/order.jobs';
import { CarrierRejectedError } from '../src/shipping/carrier';
import { OrderLifecycle } from '../src/orders/order-lifecycle.service';
import { ReturnJobs } from '../src/returns/return.jobs';
import { ReturnLifecycle } from '../src/returns/return-lifecycle.service';
import { ShipmentsService } from '../src/shipping/shipments.service';
import type { ProductVariant, Shop } from '../generated/prisma';
import { makeProduct, makeShop } from './fixtures-p2';
import { API, createTestApp, describeDb, makeUser, resetDb, type TestApp } from './helpers';

type User = ReturnType<typeof makeUser>;

/** Ảnh PNG giả: chỉ cần đúng 8 byte đầu để được nhận là ảnh */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const BANK = { bankName: 'Vietcombank', accountNumber: '0011223344', accountName: 'nguoi mua' };
const DESCRIPTION = 'Áo bị rách đường may ở vai, không mặc được';

describeDb('Trả hàng (P5: RET-01..04, DIS-01)', () => {
  let t: TestApp;
  let buyer: User;
  let seller: User;
  let support: User;
  let shop: Shop;
  /** Áo của shop: 200.000đ, tồn 5 */
  let shirt: ProductVariant;
  /** Mũ của shop: 50.000đ, tồn 4 */
  let hat: ProductVariant;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.carrier.reset();
    t.storage.privateFiles.clear();
    buyer = makeUser('Người Mua');
    seller = makeUser('Chủ Shop');
    support = makeUser('Admin Hỗ Trợ', ['SUPPORT']);
    shop = await makeShop(t.prisma, seller.id, { name: 'Shop Trả Hàng' });
    shirt = (
      await makeProduct(t.prisma, shop.id, {
        name: 'Áo thun',
        variants: [{ price: 200_000, stock: 5 }],
      })
    ).variants[0]!;
    hat = (
      await makeProduct(t.prisma, shop.id, { name: 'Mũ', variants: [{ price: 50_000, stock: 4 }] })
    ).variants[0]!;
  });

  const auth = (u: User) => ({ Authorization: `Bearer ${u.token}` });
  const lifecycle = () => t.app.get(OrderLifecycle);
  const returns = () => t.app.get(ReturnLifecycle);
  const returnJobs = () => t.app.get(ReturnJobs);
  const shipments = () => t.app.get(ShipmentsService);
  const events = async (type: string) =>
    (await t.prisma.outboxEvent.findMany({ where: { type }, orderBy: { createdAt: 'asc' } })).map(
      (e) => (e.payload as unknown as SanEvent).payload as unknown as Record<string, unknown>,
    );
  const shopOrder = (id: string) => t.prisma.shopOrder.findUniqueOrThrow({ where: { id } });
  const returnRow = (id: string) => t.prisma.returnRequest.findUniqueOrThrow({ where: { id } });
  const variant = (id: string) => t.prisma.productVariant.findUniqueOrThrow({ where: { id } });
  const returnShipment = (shopOrderId: string) =>
    t.prisma.shipment.findUnique({
      where: { shopOrderId_type: { shopOrderId, type: 'RETURN' } },
    });

  async function addToCart(variantId: string, quantity: number) {
    const res = await t
      .http()
      .post(`${API}/cart/items`)
      .set(auth(buyer))
      .send({ variantId, quantity });
    expect(res.status).toBe(201);
    return res.body.itemId as string;
  }

  /** Voucher shop giảm 45.000đ, đang chạy */
  async function shopVoucher() {
    await t.prisma.voucher.create({
      data: {
        shopId: shop.id,
        code: 'GIAM45K',
        name: 'Giảm 45K',
        discountType: 'AMOUNT',
        value: 45_000,
        minOrder: 0,
        startAt: new Date(Date.now() - 86_400_000),
        endAt: new Date(Date.now() + 30 * 86_400_000),
        quantity: 10,
        perUserLimit: 1,
        createdBy: seller.id,
      },
    });
  }

  /**
   * Đơn 2 áo + 1 mũ của shop đã giao (trả trước VNPay mặc định). `voucher`: áp voucher shop GIAM45K.
   * Trả đơn con (kèm dòng hàng) ở trạng thái "Đã giao".
   */
  async function delivered(paymentMethod: 'VNPAY' | 'COD' = 'VNPAY', voucher = false) {
    if (voucher) await shopVoucher();
    const items = [await addToCart(shirt.id, 2), await addToCart(hat.id, 1)];
    const p = await t
      .http()
      .post(`${API}/checkout/preview`)
      .set(auth(buyer))
      .send({
        itemIds: items,
        paymentMethod,
        ...(voucher ? { shopVouchers: [{ shopId: shop.id, code: 'GIAM45K' }] } : {}),
      })
      .expect(201);
    const placed = await t
      .http()
      .post(`${API}/orders`)
      .set(auth(buyer))
      .send({ checkoutId: p.body.checkoutId })
      .expect(201);
    const orderId = placed.body.orderId as string;
    const order = await t.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { shopOrders: true },
    });
    if (paymentMethod === 'VNPAY') {
      await t.prisma.$transaction((tx) =>
        lifecycle().markPaid(tx, {
          orderId,
          paymentId: randomUUID(),
          amount: order.total,
          paidAt: new Date().toISOString(),
          shopOrders: order.shopOrders.map((so) => ({
            shopOrderId: so.id,
            platformFeeRate: 500,
            platformFee: 0,
            sellerAmount: so.subtotal,
          })),
        }),
      );
    }
    await t.prisma.$transaction((tx) =>
      lifecycle().applyCheck(tx, {
        orderId,
        checkId: randomUUID(),
        result: 'PASSED',
        reason: null,
        decidedBy: null,
        decidedAt: new Date().toISOString(),
      }),
    );
    const soId = order.shopOrders[0]!.id;
    await t.http().post(`${API}/shops/me/orders/${soId}/confirm`).set(auth(seller)).expect(200);
    const sh = await t.prisma.shipment.findUniqueOrThrow({
      where: { shopOrderId_type: { shopOrderId: soId, type: 'DELIVERY' } },
    });
    await simulate(sh.id, 'PICKED').expect(200);
    await simulate(sh.id, 'DELIVERED').expect(200);
    const so = await t.prisma.shopOrder.findUniqueOrThrow({
      where: { id: soId },
      include: { items: { orderBy: { price: 'desc' } } },
    });
    expect(so.status).toBe('DELIVERED');
    return { orderId, so, shirtItem: so.items[0]!, hatItem: so.items[1]! };
  }

  const simulate = (shipmentId: string, event: string) =>
    t
      .http()
      .post(`${API}/admin/carrier-simulator/${shipmentId}/events`)
      .set(auth(support))
      .send({ event });

  async function upload(u: User = buyer): Promise<string> {
    const res = await t
      .http()
      .post(`${API}/uploads/return-image`)
      .set(auth(u))
      .attach('file', PNG, 'anh.png')
      .expect(201);
    return res.body.key as string;
  }

  /** Ảnh bằng chứng đã có sẵn trong kho riêng tư (khỏi gọi API tải ảnh mỗi lần) */
  function img(u: User = buyer): string {
    const key = `return-images/${u.id}/${randomUUID()}.png`;
    t.storage.privateFiles.set(key, PNG);
    return key;
  }

  /** Gửi yêu cầu trả hàng; mặc định trả 1 áo, lý do hàng lỗi */
  function request(
    d: Awaited<ReturnType<typeof delivered>>,
    body: Record<string, unknown> = {},
    key = randomUUID(),
  ) {
    return t
      .http()
      .post(`${API}/orders/${d.orderId}/shop-orders/${d.so.id}/returns`)
      .set(auth(buyer))
      .set('Idempotency-Key', key)
      .send({
        items: [{ orderItemId: d.shirtItem.id, quantity: 1 }],
        reason: 'DEFECTIVE',
        description: DESCRIPTION,
        images: [img()],
        ...body,
      });
  }

  async function requested(paymentMethod: 'VNPAY' | 'COD' = 'VNPAY', body = {}) {
    const d = await delivered(paymentMethod);
    const res = await request(d, body).expect(201);
    return { ...d, ret: res.body as { id: string; code: string; refundAmount: number } };
  }

  const sellerPost = (path: string, body: object = {}) =>
    t.http().post(`${API}/shops/me/returns/${path}`).set(auth(seller)).send(body);

  /** Đã chấp nhận, GHN lấy hàng trả và giao về tới shop */
  async function received(paymentMethod: 'VNPAY' | 'COD' = 'VNPAY') {
    const r = await requested(paymentMethod);
    await sellerPost(`${r.ret.id}/accept`, { refundWithoutReturn: false }).expect(200);
    const sh = (await returnShipment(r.so.id))!;
    await simulate(sh.id, 'PICKED').expect(200);
    await simulate(sh.id, 'DELIVERED').expect(200);
    expect((await returnRow(r.ret.id)).status).toBe('RECEIVED');
    return r;
  }

  const decide = (p: Omit<DisputeDecidedPayload, 'disputeId' | 'decidedBy' | 'decidedAt'>) =>
    t.prisma.$transaction((tx) =>
      returns().applyDisputeDecision(tx, {
        disputeId: randomUUID(),
        decidedBy: { userId: support.id, name: support.name },
        decidedAt: new Date().toISOString(),
        ...p,
      }),
    );

  // ----- gửi yêu cầu -----

  describe('gửi yêu cầu (RET-01)', () => {
    it('tính tiền hoàn từng món, giữ đơn ở "Đã giao", báo payment-service giữ tiền', async () => {
      const d = await delivered('VNPAY', true);
      const res = await request(d).expect(201);
      // Đơn 450.000đ, voucher shop 45.000 chia: áo 40.000, mũ 5.000; trả 1/2 áo → giảm 20.000
      expect(res.body).toMatchObject({
        code: `${d.so.code}-TH`,
        status: 'REQUESTED',
        reason: 'DEFECTIVE',
        refundAmount: 180_000,
        decidedRefund: null,
        paymentMethod: 'VNPAY',
        bankAccount: null,
        actions: { canCancel: true, canDispute: false },
      });
      expect(res.body.items).toEqual([
        expect.objectContaining({
          orderItemId: d.shirtItem.id,
          quantity: 1,
          refundAmount: 180_000,
        }),
      ]);
      expect(new Date(res.body.deadline).getTime() - Date.now()).toBeGreaterThan(47 * 3_600_000);
      const row = await returnRow(res.body.id);
      expect(row.sellerBase).toBe(180_000);

      const [ev] = await events(RETURN_REQUESTED);
      expect(ev).toMatchObject({
        returnId: res.body.id,
        shopOrderId: d.so.id,
        refundAmount: 180_000,
      });

      // Đang có yêu cầu: không bấm "Đã nhận" được, không tự hoàn tất
      const order = await t.http().get(`${API}/orders/${d.orderId}`).set(auth(buyer)).expect(200);
      expect(order.body.shopOrders[0]).toMatchObject({
        canConfirmReceived: false,
        canRequestReturn: false,
        returnRequest: { id: res.body.id, status: 'REQUESTED', refundAmount: 180_000 },
      });
      await t
        .http()
        .post(`${API}/orders/${d.orderId}/shop-orders/${d.so.id}/received`)
        .set(auth(buyer))
        .expect(409)
        .expect((r) => expect(r.body.code).toBe('RETURN_IN_PROGRESS'));
      await t.prisma.shopOrder.update({
        where: { id: d.so.id },
        data: { completeBefore: new Date(Date.now() - 1000) },
      });
      expect(await t.app.get(OrderJobs).autoComplete()).toBe(0);
      expect((await shopOrder(d.so.id)).status).toBe('DELIVERED');
    });

    it('gửi lại cùng mã chống gửi lặp trả yêu cầu cũ; mỗi đơn con chỉ một yêu cầu', async () => {
      const d = await delivered();
      const key = randomUUID();
      const first = await request(d, {}, key).expect(201);
      const again = await request(d, {}, key).expect(201);
      expect(again.body.id).toBe(first.body.id);
      await request(d)
        .expect(409)
        .expect((r) => expect(r.body.code).toBe('RETURN_EXISTS'));
      expect(await t.prisma.returnRequest.count()).toBe(1);
      expect(await events(RETURN_REQUESTED)).toHaveLength(1);
    });

    it('kiểm dữ liệu: số lượng, ảnh, hạn, trạng thái đơn, chủ đơn', async () => {
      const d = await delivered();
      await request(d, { items: [{ orderItemId: d.shirtItem.id, quantity: 3 }] }).expect(400);
      await request(d, { items: [{ orderItemId: randomUUID(), quantity: 1 }] }).expect(400);
      await request(d, { images: [] }).expect(400);
      await request(d, { reason: 'CHANGED_MIND' }).expect(400);
      await request(d, { description: 'ngắn quá' }).expect(400);
      // Ảnh của người khác
      const other = makeUser('Người Lạ');
      await request(d, { images: [img(other)] })
        .expect(400)
        .expect((r) => expect(r.body.code).toBe('INVALID_IMAGE_KEY'));
      // Người khác gửi cho đơn của mình
      await t
        .http()
        .post(`${API}/orders/${d.orderId}/shop-orders/${d.so.id}/returns`)
        .set(auth(other))
        .set('Idempotency-Key', randomUUID())
        .send({
          items: [{ orderItemId: d.shirtItem.id, quantity: 1 }],
          reason: 'DEFECTIVE',
          description: DESCRIPTION,
          images: [img(other)],
        })
        .expect(404);
      // Thiếu mã chống gửi lặp
      await t
        .http()
        .post(`${API}/orders/${d.orderId}/shop-orders/${d.so.id}/returns`)
        .set(auth(buyer))
        .send({})
        .expect(400);
      // Hết hạn
      await t.prisma.shopOrder.update({
        where: { id: d.so.id },
        data: { completeBefore: new Date(Date.now() - 1000) },
      });
      await request(d)
        .expect(409)
        .expect((r) => expect(r.body.code).toBe('RETURN_WINDOW_CLOSED'));
      expect(await t.prisma.returnRequest.count()).toBe(0);
    });

    it('đơn COD bắt buộc tài khoản nhận tiền hoàn; shop chỉ thấy 4 số cuối', async () => {
      const d = await delivered('COD');
      await request(d).expect(400);
      const res = await request(d, { bankAccount: BANK }).expect(201);
      expect(res.body.bankAccount).toEqual({
        bankName: 'Vietcombank',
        accountNumber: '0011223344',
        accountName: 'NGUOI MUA',
      });
      const seen = await t
        .http()
        .get(`${API}/shops/me/returns/${res.body.id}`)
        .set(auth(seller))
        .expect(200);
      expect(seen.body.bankAccount.accountNumber).toBe('•••• 3344');
      expect(seen.body.buyer).toEqual({ id: buyer.id, name: 'Người Mua' });
    });

    it('người mua hủy khi shop chưa trả lời: đơn hoàn tất, payment-service bỏ giữ tiền', async () => {
      const r = await requested();
      const res = await t
        .http()
        .post(`${API}/returns/${r.ret.id}/cancel`)
        .set(auth(buyer))
        .expect(200);
      expect(res.body.status).toBe('CANCELLED');
      expect((await shopOrder(r.so.id)).status).toBe('COMPLETED');
      const [resolved] = await events(RETURN_RESOLVED);
      expect(resolved).toMatchObject({ outcome: 'NO_REFUND', refundAmount: 0 });
      const [done] = await events(SHOP_ORDER_COMPLETED);
      expect(done).toMatchObject({ shopOrderId: r.so.id, returnId: r.ret.id });
      await t.http().post(`${API}/returns/${r.ret.id}/cancel`).set(auth(buyer)).expect(409);
    });
  });

  // ----- shop trả lời, gửi hàng về, kiểm hàng -----

  describe('shop trả lời và hàng trả về (RET-02, RET-03, RET-04)', () => {
    it('chấp nhận → GHN lấy hàng ở nhà người mua, giao về shop → kiểm đúng → hoàn tiền, nhập kho', async () => {
      const r = await requested();
      const accepted = await sellerPost(`${r.ret.id}/accept`, {
        refundWithoutReturn: false,
      }).expect(200);
      expect(accepted.body).toMatchObject({
        status: 'SHIPPING_BACK',
        shipment: { status: 'READY_TO_PICK', simulated: true },
      });
      // Vận đơn trả: mã gửi GHN là mã yêu cầu, lấy ở người mua, giao về shop, không thu hộ
      const call = t.carrier.calls.find((c) => c.clientCode === r.ret.code)!;
      expect(call).toMatchObject({ codAmount: 0, to: { name: 'Shop Trả Hàng' } });
      expect(call.from.name).toBe('Người Mua');
      expect(call.items).toEqual([expect.objectContaining({ quantity: 1 })]);

      const sh = (await returnShipment(r.so.id))!;
      await simulate(sh.id, 'PICKED').expect(200);
      expect((await returnRow(r.ret.id)).deadline).toBeNull();
      // GHN đã lấy hàng: người mua không hủy được nữa
      await t
        .http()
        .post(`${API}/returns/${r.ret.id}/cancel`)
        .set(auth(buyer))
        .expect(409)
        .expect((res) => expect(res.body.code).toBe('ALREADY_PICKED_UP'));
      await simulate(sh.id, 'DELIVERED').expect(200);
      expect((await returnRow(r.ret.id)).status).toBe('RECEIVED');

      const stockBefore = (await variant(shirt.id)).stock;
      const sold = (await t.prisma.product.findUniqueOrThrow({ where: { id: shirt.productId } }))
        .soldCount;
      const res = await sellerPost(`${r.ret.id}/inspect`, {
        result: 'OK',
        restockItemIds: [r.shirtItem.id],
      }).expect(200);
      expect(res.body).toMatchObject({
        status: 'REFUNDING',
        decidedRefund: r.ret.refundAmount,
        refundStatus: 'PROCESSING',
        items: [expect.objectContaining({ restocked: true })],
      });
      expect((await variant(shirt.id)).stock).toBe(stockBefore + 1);
      expect(
        await t.prisma.stockHistory.count({ where: { reason: `Nhận hàng trả ${r.ret.code}` } }),
      ).toBe(1);
      expect(
        (await t.prisma.orderItem.findUniqueOrThrow({ where: { id: r.shirtItem.id } }))
          .returnedQuantity,
      ).toBe(1);
      expect(
        (await t.prisma.product.findUniqueOrThrow({ where: { id: shirt.productId } })).soldCount,
      ).toBe(sold - 1);
      expect((await shopOrder(r.so.id)).status).toBe('COMPLETED');
      const [resolved] = await events(RETURN_RESOLVED);
      expect(resolved).toMatchObject({
        returnId: r.ret.id,
        outcome: 'REFUND',
        refundAmount: 200_000,
        maxRefundAmount: 200_000,
        sellerBase: 200_000,
        platformCovers: false,
        bankAccount: null,
      });
      expect(await events(SHOP_ORDER_COMPLETED)).toEqual([
        expect.objectContaining({ returnId: r.ret.id, completedBy: 'SYSTEM' }),
      ]);

      // payment-service báo đã hoàn → "Đã hoàn tiền"; tin cũ tới sau không làm lùi
      const at = new Date();
      const refundUpdated = (status: 'PROCESSING' | 'SUCCEEDED', when: Date) =>
        t.prisma.$transaction((tx) =>
          lifecycle().applyRefund(tx, {
            refundId: randomUUID(),
            orderId: r.orderId,
            shopOrderId: r.so.id,
            returnId: r.ret.id,
            amount: 200_000,
            status,
            updatedAt: when.toISOString(),
          }),
        );
      await refundUpdated('SUCCEEDED', at);
      await refundUpdated('PROCESSING', new Date(at.getTime() - 5000));
      const done = await returnRow(r.ret.id);
      expect(done).toMatchObject({ status: 'REFUNDED', refundStatus: 'SUCCEEDED' });
      // Khoản hoàn trả hàng không đổi trạng thái hoàn của đơn con (dành cho hủy/giao thất bại)
      expect((await shopOrder(r.so.id)).refundStatus).toBe('NONE');
    });

    it('chấp nhận "hoàn tiền không cần gửi trả": hoàn ngay, không có vận đơn trả', async () => {
      const r = await requested();
      const res = await sellerPost(`${r.ret.id}/accept`, { refundWithoutReturn: true }).expect(200);
      expect(res.body).toMatchObject({ status: 'REFUNDING', refundWithoutReturn: true });
      expect(await returnShipment(r.so.id)).toBeNull();
      expect((await shopOrder(r.so.id)).status).toBe('COMPLETED');
      await sellerPost(`${r.ret.id}/reject`, { reason: 'Không còn chờ trả lời nữa' })
        .expect(409)
        .expect((x) => expect(x.body.code).toBe('RETURN_NOT_PENDING'));
    });

    it('kiểm hàng không đúng: bắt buộc lời và ảnh, thành tranh chấp giai đoạn 2', async () => {
      const r = await received();
      await sellerPost(`${r.ret.id}/inspect`, { result: 'PROBLEM', restockItemIds: [] }).expect(
        400,
      );
      const photo = img(seller);
      const res = await sellerPost(`${r.ret.id}/inspect`, {
        result: 'PROBLEM',
        restockItemIds: [],
        note: 'Áo gửi về không phải áo shop đã bán',
        images: [photo],
      }).expect(200);
      expect(res.body).toMatchObject({
        status: 'DISPUTED',
        disputeStage: 'GOODS_PROBLEM',
        sellerNote: 'Áo gửi về không phải áo shop đã bán',
      });
      const [opened] = await events(DISPUTE_OPENED);
      expect(opened).toMatchObject({
        returnId: r.ret.id,
        stage: 'GOODS_PROBLEM',
        shop: { shopId: shop.id, ownerId: seller.id },
        buyer: { userId: buyer.id },
        maxRefundAmount: 200_000,
        buyerStatement: { text: DESCRIPTION },
        sellerStatement: { text: 'Áo gửi về không phải áo shop đã bán', images: [photo] },
      });
      expect((await shopOrder(r.so.id)).status).toBe('DELIVERED');

      // Admin quyết hoàn một phần: món không tính là đã trả
      await decide({
        returnId: r.ret.id,
        stage: 'GOODS_PROBLEM',
        decision: 'REFUND',
        refundAmount: 50_000,
        note: 'Áo có lỗi nhỏ',
      });
      const done = await returnRow(r.ret.id);
      expect(done).toMatchObject({ status: 'REFUNDING', decidedRefund: 50_000 });
      expect(
        (await t.prisma.orderItem.findUniqueOrThrow({ where: { id: r.shirtItem.id } }))
          .returnedQuantity,
      ).toBe(0);
      const [resolved] = await events(RETURN_RESOLVED);
      expect(resolved).toMatchObject({ refundAmount: 50_000, maxRefundAmount: 200_000 });
      expect((await shopOrder(r.so.id)).status).toBe('COMPLETED');
    });
  });

  // ----- từ chối và khiếu nại -----

  describe('từ chối và khiếu nại (DIS-01)', () => {
    async function rejected() {
      const r = await requested();
      const res = await sellerPost(`${r.ret.id}/reject`, {
        reason: 'Ảnh không cho thấy lỗi của áo',
      }).expect(200);
      expect(res.body.status).toBe('REJECTED');
      return r;
    }

    const disputeBody = { statement: 'Áo rách ngay khi mở hộp, tôi có video mở hộp' };

    it('người mua khiếu nại trong hạn → tranh chấp giai đoạn 1 kèm lời hai bên', async () => {
      const r = await rejected();
      const res = await t
        .http()
        .post(`${API}/returns/${r.ret.id}/dispute`)
        .set(auth(buyer))
        .send(disputeBody)
        .expect(200);
      expect(res.body).toMatchObject({ status: 'DISPUTED', disputeStage: 'REQUEST_REJECTED' });
      const [opened] = await events(DISPUTE_OPENED);
      expect(opened).toMatchObject({
        stage: 'REQUEST_REJECTED',
        buyerStatement: { text: disputeBody.statement },
        sellerStatement: { text: 'Ảnh không cho thấy lỗi của áo' },
        items: [expect.objectContaining({ name: 'Áo thun', quantity: 1, refundAmount: 200_000 })],
      });
    });

    it('admin chấp nhận trả hàng → tạo vận đơn trả (job gọi GHN), shop kiểm như thường', async () => {
      const r = await rejected();
      await t.http().post(`${API}/returns/${r.ret.id}/dispute`).set(auth(buyer)).send(disputeBody);
      // Quyết định cho sai giai đoạn: bỏ qua
      expect(
        await decide({
          returnId: r.ret.id,
          stage: 'GOODS_PROBLEM',
          decision: 'REJECT',
          refundAmount: null,
          note: 'x',
        }),
      ).toBe('IGNORED');
      expect(
        await decide({
          returnId: r.ret.id,
          stage: 'REQUEST_REJECTED',
          decision: 'ACCEPT_RETURN',
          refundAmount: null,
          note: 'Ảnh cho thấy áo rách',
        }),
      ).toBe('SHIPPING');
      expect((await returnRow(r.ret.id)).status).toBe('SHIPPING_BACK');
      expect((await returnShipment(r.so.id))!.status).toBe('CREATING');
      await shipments().syncCreating(new Date(Date.now() + 2 * 60_000));
      expect((await returnShipment(r.so.id))!.status).toBe('READY_TO_PICK');
      // Tin trùng: không làm gì thêm
      expect(
        await decide({
          returnId: r.ret.id,
          stage: 'REQUEST_REJECTED',
          decision: 'ACCEPT_RETURN',
          refundAmount: null,
          note: 'lặp',
        }),
      ).toBe('IGNORED');
    });

    it('admin hoàn toàn bộ không cần gửi trả, hoặc không hoàn', async () => {
      const a = await rejected();
      await t.http().post(`${API}/returns/${a.ret.id}/dispute`).set(auth(buyer)).send(disputeBody);
      await decide({
        returnId: a.ret.id,
        stage: 'REQUEST_REJECTED',
        decision: 'REFUND',
        refundAmount: 200_000,
        note: 'Lỗi rõ',
      });
      expect(await returnRow(a.ret.id)).toMatchObject({
        status: 'REFUNDING',
        decidedRefund: 200_000,
        refundWithoutReturn: true,
      });
      expect(await returnShipment(a.so.id)).toBeNull();

      await resetDb(t.prisma);
      shop = await makeShop(t.prisma, seller.id, { name: 'Shop Trả Hàng' });
      shirt = (
        await makeProduct(t.prisma, shop.id, {
          name: 'Áo thun',
          variants: [{ price: 200_000, stock: 5 }],
        })
      ).variants[0]!;
      hat = (
        await makeProduct(t.prisma, shop.id, {
          name: 'Mũ',
          variants: [{ price: 50_000, stock: 4 }],
        })
      ).variants[0]!;
      const b = await rejected();
      await t.http().post(`${API}/returns/${b.ret.id}/dispute`).set(auth(buyer)).send(disputeBody);
      await decide({
        returnId: b.ret.id,
        stage: 'REQUEST_REJECTED',
        decision: 'REJECT',
        refundAmount: null,
        note: 'Không đủ bằng chứng',
      });
      expect((await returnRow(b.ret.id)).status).toBe('CLOSED');
      expect((await shopOrder(b.so.id)).status).toBe('COMPLETED');
      const [resolved] = await events(RETURN_RESOLVED);
      expect(resolved).toMatchObject({ outcome: 'NO_REFUND' });
    });

    it('quá hạn khiếu nại: không khiếu nại được, job đóng yêu cầu', async () => {
      const r = await rejected();
      await t.prisma.returnRequest.update({
        where: { id: r.ret.id },
        data: { deadline: new Date(Date.now() - 1000) },
      });
      await t
        .http()
        .post(`${API}/returns/${r.ret.id}/dispute`)
        .set(auth(buyer))
        .send(disputeBody)
        .expect(409)
        .expect((res) => expect(res.body.code).toBe('RETURN_NOT_DISPUTABLE'));
      expect(await returnJobs().disputeTimeout()).toBe(1);
      expect(await returnJobs().disputeTimeout()).toBe(0);
      expect((await returnRow(r.ret.id)).status).toBe('CLOSED');
      expect((await shopOrder(r.so.id)).status).toBe('COMPLETED');
    });
  });

  // ----- hạn -----

  describe('các hạn (job mỗi phút)', () => {
    const later = (hours: number) => new Date(Date.now() + hours * 3_600_000);

    it('shop quá hạn trả lời: tự chấp nhận, tạo vận đơn trả; thiếu hàng thì hoàn ngay', async () => {
      const r = await requested();
      expect(await returnJobs().responseTimeout(later(47))).toBe(0);
      expect(await returnJobs().responseTimeout(later(49))).toBe(1);
      expect(await returnRow(r.ret.id)).toMatchObject({ status: 'SHIPPING_BACK' });
      expect((await returnShipment(r.so.id))!.status).toBe('READY_TO_PICK');

      await resetDb(t.prisma);
      shop = await makeShop(t.prisma, seller.id, { name: 'Shop Trả Hàng' });
      shirt = (
        await makeProduct(t.prisma, shop.id, {
          name: 'Áo thun',
          variants: [{ price: 200_000, stock: 5 }],
        })
      ).variants[0]!;
      hat = (
        await makeProduct(t.prisma, shop.id, {
          name: 'Mũ',
          variants: [{ price: 50_000, stock: 4 }],
        })
      ).variants[0]!;
      const m = await requested('VNPAY', { reason: 'MISSING' });
      expect(await returnJobs().responseTimeout(later(49))).toBe(1);
      expect(await returnRow(m.ret.id)).toMatchObject({
        status: 'REFUNDING',
        refundWithoutReturn: true,
      });
    });

    it('quá hạn kiểm hàng: tự hoàn tiền, không nhập kho', async () => {
      const r = await received();
      const stock = (await variant(shirt.id)).stock;
      expect(await returnJobs().inspectTimeout(later(49))).toBe(1);
      expect(await returnRow(r.ret.id)).toMatchObject({ status: 'REFUNDING' });
      expect((await variant(shirt.id)).stock).toBe(stock);
    });

    it('quá hạn giao hàng trả mà GHN chưa lấy: hủy vận đơn trả và hủy yêu cầu', async () => {
      const r = await requested();
      await sellerPost(`${r.ret.id}/accept`, { refundWithoutReturn: false }).expect(200);
      const sh = (await returnShipment(r.so.id))!;
      expect(await returnJobs().shipTimeout(later(24))).toBe(0);
      expect(await returnJobs().shipTimeout(later(73))).toBe(1);
      expect((await returnRow(r.ret.id)).status).toBe('CANCELLED');
      expect((await returnShipment(r.so.id))!.status).toBe('CANCELLED');
      expect(t.carrier.cancelled).toContain(sh.ghnCode);
      expect((await shopOrder(r.so.id)).status).toBe('COMPLETED');
    });

    it('người mua hủy khi GHN đang tạo vận đơn trả: vận đơn tạo xong sau đó vẫn bị báo hủy', async () => {
      const r = await requested();
      let release!: () => void;
      t.carrier.gate = new Promise((res) => (release = res));
      // Shop chấp nhận: lệnh tạo vận đơn trả treo ở GHN
      const accepting = sellerPost(`${r.ret.id}/accept`, { refundWithoutReturn: false }).then(
        (x) => x,
      );
      while (!t.carrier.calls.some((c) => c.clientCode === r.ret.code)) {
        await new Promise((res) => setTimeout(res, 10));
      }
      expect((await returnShipment(r.so.id))!.status).toBe('CREATING');
      const cancelled = await t
        .http()
        .post(`${API}/returns/${r.ret.id}/cancel`)
        .set(auth(buyer))
        .expect(200);
      expect(cancelled.body.status).toBe('CANCELLED');
      expect((await returnShipment(r.so.id))!.status).toBe('CANCELLING');
      release();
      await accepting;
      // GHN trả lời muộn: giữ mã để báo hủy, không chuyển sang "chờ lấy hàng"
      const sh = (await returnShipment(r.so.id))!;
      expect(sh.status).toBe('CANCELLING');
      expect(sh.ghnCode).toBeTruthy();
      await shipments().syncCancelling();
      expect((await returnShipment(r.so.id))!.status).toBe('CANCELLED');
      expect(t.carrier.cancelled).toContain(sh.ghnCode);
      expect((await returnRow(r.ret.id)).status).toBe('CANCELLED');
    });

    it('quá hạn giao hàng trả: câu truy vấn đến hạn bỏ qua yêu cầu có vận đơn lỗi', async () => {
      const failed = await requested();
      t.carrier.createError = new CarrierRejectedError('Địa chỉ không phục vụ');
      await sellerPost(`${failed.ret.id}/accept`, { refundWithoutReturn: false }).expect(200);
      t.carrier.createError = null;
      // Đã quá hạn nhưng vận đơn chưa tạo được: không phải lỗi người mua, không hủy
      await t.prisma.returnRequest.update({
        where: { id: failed.ret.id },
        data: { deadline: new Date(Date.now() - 3_600_000) },
      });
      expect(await returnJobs().shipTimeout(later(73))).toBe(0);
      expect((await returnRow(failed.ret.id)).status).toBe('SHIPPING_BACK');
    });

    it('vận đơn trả lỗi quá hạn mà người mua không tạo lại: admin hỗ trợ hủy yêu cầu hoặc hoàn tiền', async () => {
      const failedReturn = async () => {
        const r = await requested();
        t.carrier.createError = new CarrierRejectedError('Địa chỉ không phục vụ');
        await sellerPost(`${r.ret.id}/accept`, { refundWithoutReturn: false }).expect(200);
        t.carrier.createError = null;
        return r;
      };
      const resolve = (id: string, body: object, u: User = support) =>
        t.http().post(`${API}/admin/returns/${id}/failed-shipment`).set(auth(u)).send(body);
      const overdue = (id: string) =>
        t.prisma.returnRequest.update({
          where: { id },
          data: { deadline: new Date(Date.now() - 60_000) },
        });

      const a = await failedReturn();
      // Chưa quá hạn: chưa cho admin xử lý (người mua còn tạo lại được)
      const before = await t
        .http()
        .get(`${API}/admin/returns/${a.ret.id}`)
        .set(auth(support))
        .expect(200);
      expect(before.body.actions.canResolveFailedShipment).toBe(false);
      await resolve(a.ret.id, { result: 'CANCEL', note: 'Đã gọi người mua' })
        .expect(409)
        .expect((r) => expect(r.body.code).toBe('RETURN_SHIPMENT_NOT_STUCK'));
      await overdue(a.ret.id);
      const after = await t
        .http()
        .get(`${API}/admin/returns/${a.ret.id}`)
        .set(auth(support))
        .expect(200);
      expect(after.body.actions.canResolveFailedShipment).toBe(true);
      await resolve(a.ret.id, { result: 'CANCEL', note: 'Đã gọi' }, seller).expect(403);
      await resolve(a.ret.id, { result: 'KHAC', note: 'Đã gọi người mua' }).expect(400);
      const cancelled = await resolve(a.ret.id, {
        result: 'CANCEL',
        note: 'Người mua không trả lời điện thoại',
      }).expect(200);
      expect(cancelled.body.status).toBe('CANCELLED');
      expect((await shopOrder(a.so.id)).status).toBe('COMPLETED');
      expect((await returnShipment(a.so.id))!.status).toBe('CANCELLED');
      await resolve(a.ret.id, { result: 'REFUND', note: 'Bấm lại lần nữa' }).expect(409);

      const b = await failedReturn();
      await overdue(b.ret.id);
      const refunded = await resolve(b.ret.id, {
        result: 'REFUND',
        note: 'Hàng rẻ, GHN không phục vụ địa chỉ người mua',
      }).expect(200);
      expect(refunded.body).toMatchObject({ status: 'REFUNDING', refundWithoutReturn: true });
      expect((await returnShipment(b.so.id))!.status).toBe('CANCELLED');
      const resolved = (await events(RETURN_RESOLVED)).find((e) => e.returnId === b.ret.id);
      expect(resolved).toMatchObject({ outcome: 'REFUND', platformCovers: false });
      expect(
        await t.prisma.auditLog.count({ where: { action: 'RESOLVE_RETURN_SHIPMENT_FAILED' } }),
      ).toBe(2);
    });

    it('vận đơn trả chưa tạo được (GHN từ chối) thì không hủy yêu cầu; người mua tạo lại', async () => {
      const r = await requested();
      t.carrier.createError = new CarrierRejectedError('Địa chỉ không phục vụ');
      const res = await sellerPost(`${r.ret.id}/accept`, { refundWithoutReturn: false }).expect(
        200,
      );
      expect(res.body.shipment.status).toBe('CREATE_FAILED');
      expect(await returnJobs().shipTimeout(later(73))).toBe(0);
      t.carrier.createError = null;
      const retried = await t
        .http()
        .post(`${API}/returns/${r.ret.id}/shipment/retry`)
        .set(auth(buyer))
        .expect(200);
      expect(retried.body.shipment.status).toBe('READY_TO_PICK');
      expect(new Date(retried.body.deadline).getTime()).toBeGreaterThan(
        Date.now() + 70 * 3_600_000,
      );
    });
  });

  // ----- thất lạc kiện trả, quyền, ảnh -----

  it('kiện trả bị GHN làm thất lạc: admin xác nhận → hoàn đủ, sàn chịu (không trừ seller)', async () => {
    const r = await requested();
    await sellerPost(`${r.ret.id}/accept`, { refundWithoutReturn: false }).expect(200);
    const sh = (await returnShipment(r.so.id))!;
    const lost = () =>
      t
        .http()
        .post(`${API}/admin/returns/${r.ret.id}/lost`)
        .set(auth(support))
        .send({ note: 'GHN xác nhận thất lạc' });
    await lost()
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('RETURN_SHIPMENT_NOT_LOST'));
    await simulate(sh.id, 'PICKED').expect(200);
    await simulate(sh.id, 'LOST').expect(200);
    const seen = await t
      .http()
      .get(`${API}/admin/returns/${r.ret.id}`)
      .set(auth(support))
      .expect(200);
    expect(seen.body.actions.canConfirmLost).toBe(true);
    const res = await lost().expect(200);
    expect(res.body).toMatchObject({ status: 'REFUNDING', platformCovers: true });
    const [resolved] = await events(RETURN_RESOLVED);
    expect(resolved).toMatchObject({ refundAmount: 200_000, platformCovers: true });
    expect(await t.prisma.auditLog.count({ where: { action: 'CONFIRM_RETURN_LOST' } })).toBe(1);
  });

  it('quyền: shop khác, người khác, admin thiếu quyền đều bị chặn', async () => {
    const r = await requested();
    const otherSeller = makeUser('Shop Khác');
    await makeShop(t.prisma, otherSeller.id, { name: 'Shop Khác' });
    await t.http().get(`${API}/shops/me/returns/${r.ret.id}`).set(auth(otherSeller)).expect(404);
    await t
      .http()
      .post(`${API}/shops/me/returns/${r.ret.id}/accept`)
      .set(auth(otherSeller))
      .send({ refundWithoutReturn: true })
      .expect(404);
    await t.http().get(`${API}/returns/${r.ret.id}`).set(auth(otherSeller)).expect(404);
    await t.http().get(`${API}/admin/returns`).set(auth(buyer)).expect(403);
    const list = await t.http().get(`${API}/shops/me/returns`).set(auth(seller)).expect(200);
    expect(list.body).toMatchObject({ total: 1, counts: { REQUESTED: 1 } });
    const mine = await t.http().get(`${API}/returns`).set(auth(buyer)).expect(200);
    expect(mine.body.items).toHaveLength(1);
  });

  it('ảnh bằng chứng: người tải, chủ shop của yêu cầu, admin hỗ trợ xem được; người khác thì không', async () => {
    const d = await delivered();
    const key = await upload();
    await request(d, { images: [key] }).expect(201);
    const path = `${API}/${key}`;
    expect(key).toMatch(new RegExp(`^return-images/${buyer.id}/`));
    expect(t.storage.privateFiles.has(key)).toBe(true);
    await t.http().get(path).set(auth(buyer)).expect(200);
    await t.http().get(path).set(auth(seller)).expect(200);
    await t.http().get(path).set(auth(support)).expect(200);
    await t
      .http()
      .get(path)
      .set(auth(makeUser('Người Lạ')))
      .expect(404);
    await t
      .http()
      .get(`${API}/return-images/${buyer.id}/..%2F..%2Fx.png`)
      .set(auth(buyer))
      .expect(404);
  });
});
