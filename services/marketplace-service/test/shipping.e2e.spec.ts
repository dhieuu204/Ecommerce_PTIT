import { randomUUID } from 'node:crypto';
import {
  ORDER_PLACED,
  SHOP_ORDER_COMPLETED,
  SHOP_ORDER_DELIVERED,
  SHOP_ORDER_DELIVERY_FAILED,
  SHOP_ORDER_INCIDENT_CONFIRMED,
  type SanEvent,
} from '@san/shared';
import { CarrierRejectedError } from '../src/shipping/carrier';
import { OrderJobs } from '../src/orders/order.jobs';
import { OrderLifecycle } from '../src/orders/order-lifecycle.service';
import { ShipmentsService } from '../src/shipping/shipments.service';
import type { ProductVariant, Shop } from '../generated/prisma';
import { makeProduct, makeShop } from './fixtures-p2';
import { API, createTestApp, describeDb, makeUser, resetDb, type TestApp } from './helpers';

type User = ReturnType<typeof makeUser>;

const WEBHOOK_TOKEN = 'webhook-test';

describeDb('Giao hàng và COD (P4: SHIP-01..04, COD-01)', () => {
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
    process.env.GHN_WEBHOOK_TOKEN = WEBHOOK_TOKEN;
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.app.close();
    delete process.env.GHN_WEBHOOK_TOKEN;
  });
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.carrier.reset();
    buyer = makeUser('Người Mua');
    seller = makeUser('Chủ Shop');
    support = makeUser('Admin Hỗ Trợ', ['SUPPORT']);
    shop = await makeShop(t.prisma, seller.id, { name: 'Shop Giao Hàng' });
    const p = await makeProduct(t.prisma, shop.id, {
      name: 'Áo thun',
      variants: [{ price: 200_000, stock: 5 }],
    });
    shirt = p.variants[0]!;
    hat = (
      await makeProduct(t.prisma, shop.id, { name: 'Mũ', variants: [{ price: 50_000, stock: 4 }] })
    ).variants[0]!;
  });

  const auth = (u: User) => ({ Authorization: `Bearer ${u.token}` });
  const lifecycle = () => t.app.get(OrderLifecycle);
  const shipments = () => t.app.get(ShipmentsService);
  const jobs = () => t.app.get(OrderJobs);

  async function addToCart(variantId: string, quantity: number) {
    const res = await t
      .http()
      .post(`${API}/cart/items`)
      .set(auth(buyer))
      .send({ variantId, quantity });
    expect(res.status).toBe(201);
    return res.body.itemId as string;
  }

  const preview = (body: object) =>
    t.http().post(`${API}/checkout/preview`).set(auth(buyer)).send(body);

  /** Đặt 1 áo + 1 mũ của shop, trả bằng `paymentMethod` */
  async function placeOrder(paymentMethod: 'VNPAY' | 'COD' = 'COD') {
    const items = [await addToCart(shirt.id, 1), await addToCart(hat.id, 1)];
    const p = await preview({ itemIds: items, paymentMethod }).expect(201);
    const res = await t
      .http()
      .post(`${API}/orders`)
      .set(auth(buyer))
      .send({ checkoutId: p.body.checkoutId })
      .expect(201);
    const o = await t.prisma.order.findUniqueOrThrow({
      where: { id: res.body.orderId },
      include: { shopOrders: { include: { items: { orderBy: { id: 'asc' } } } } },
    });
    return { order: o, so: o.shopOrders[0]!, preview: p.body };
  }

  async function pay(orderId: string) {
    const o = await t.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { shopOrders: true },
    });
    await t.prisma.$transaction((tx) =>
      lifecycle().markPaid(tx, {
        orderId,
        paymentId: randomUUID(),
        amount: o.total,
        paidAt: new Date().toISOString(),
        shopOrders: o.shopOrders.map((so) => ({
          shopOrderId: so.id,
          platformFeeRate: 500,
          platformFee: 0,
          sellerAmount: so.subtotal,
        })),
      }),
    );
  }

  async function passCheck(orderId: string) {
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
  }

  /** Đơn tới "Chờ shop xác nhận" */
  async function toConfirm(paymentMethod: 'VNPAY' | 'COD' = 'COD') {
    const placed = await placeOrder(paymentMethod);
    if (paymentMethod === 'VNPAY') await pay(placed.order.id);
    await passCheck(placed.order.id);
    return placed;
  }

  const confirm = (shopOrderId: string) =>
    t.http().post(`${API}/shops/me/orders/${shopOrderId}/confirm`).set(auth(seller));

  /** Đơn đã xác nhận và có vận đơn READY_TO_PICK */
  async function confirmed(paymentMethod: 'VNPAY' | 'COD' = 'COD') {
    const placed = await toConfirm(paymentMethod);
    await confirm(placed.so.id).expect(200);
    return { ...placed, shipment: await shipmentOf(placed.so.id) };
  }

  const shipmentOf = (shopOrderId: string) =>
    t.prisma.shipment.findUniqueOrThrow({
      where: { shopOrderId_type: { shopOrderId, type: 'DELIVERY' } },
    });
  const shopOrder = (id: string) => t.prisma.shopOrder.findUniqueOrThrow({ where: { id } });
  const variant = (id: string) => t.prisma.productVariant.findUniqueOrThrow({ where: { id } });
  const events = async (type: string) =>
    (await t.prisma.outboxEvent.findMany({ where: { type }, orderBy: { createdAt: 'asc' } })).map(
      (e) => (e.payload as unknown as SanEvent).payload as unknown as Record<string, unknown>,
    );

  /** Gửi tin GHN như webhook thật */
  const webhook = (body: object, token = WEBHOOK_TOKEN) =>
    t.http().post(`${API}/webhooks/ghn?token=${token}`).send(body);

  const simulate = (shipmentId: string, event: string, u: User = support) =>
    t
      .http()
      .post(`${API}/admin/carrier-simulator/${shipmentId}/events`)
      .set(auth(u))
      .send({ event });

  // ----- COD lúc đặt hàng -----

  describe('đặt hàng COD (COD-01)', () => {
    it('trừ tồn ngay, không có hạn thanh toán, ghi lịch sử tồn và số đã bán', async () => {
      const { order, so, preview: p } = await placeOrder('COD');
      expect(p.codAvailable).toBe(true);
      expect(p.paymentMethod).toBe('COD');
      expect(order).toMatchObject({
        paymentMethod: 'COD',
        paymentStatus: 'COD',
        payBefore: null,
        holdUntil: null,
      });
      expect(so.codAmount).toBe(so.total);
      expect(await variant(shirt.id)).toMatchObject({ stock: 4, reserved: 0 });
      expect(await variant(hat.id)).toMatchObject({ stock: 3, reserved: 0 });
      expect(
        await t.prisma.stockHistory.count({ where: { orderId: order.id, change: { lt: 0 } } }),
      ).toBe(2);
      const product = await t.prisma.product.findUniqueOrThrow({ where: { id: shirt.productId } });
      expect(product.soldCount).toBe(1);
      const [placed] = await events(ORDER_PLACED);
      expect(placed).toMatchObject({ paymentMethod: 'COD', payBefore: null });

      // Đơn COD không trả trước và không bị job hết hạn thanh toán hủy
      await t
        .http()
        .post(`${API}/orders/${order.id}/pay`)
        .set(auth(buyer))
        .set('Idempotency-Key', randomUUID())
        .expect(409);
      expect(await jobs().expireHolds(new Date(Date.now() + 7 * 86_400_000))).toBe(0);
    });

    it('qua kiểm tra thì sang "Chờ xác nhận" dù chưa trả tiền', async () => {
      const { so } = await toConfirm('COD');
      expect((await shopOrder(so.id)).status).toBe('TO_CONFIRM');
    });

    it('shop tắt COD: không chọn COD được, đặt cũng bị chặn', async () => {
      const res = await t
        .http()
        .patch(`${API}/shops/me`)
        .set(auth(seller))
        .send({ codEnabled: false })
        .expect(200);
      expect(res.body.shop.codEnabled).toBe(false);
      expect(await t.prisma.auditLog.count({ where: { action: 'UPDATE_SHOP' } })).toBe(1);

      const item = await addToCart(shirt.id, 1);
      const vnpay = await preview({ itemIds: [item] }).expect(201);
      expect(vnpay.body).toMatchObject({ codAvailable: false, canPlace: true });
      const cod = await preview({ itemIds: [item], paymentMethod: 'COD' }).expect(201);
      expect(cod.body.canPlace).toBe(false);
      expect(cod.body.problems[0].message).toContain('COD');
      const placed = await t
        .http()
        .post(`${API}/orders`)
        .set(auth(buyer))
        .send({ checkoutId: cod.body.checkoutId });
      expect(placed.status).toBe(409);
      expect(await t.prisma.order.count()).toBe(0);
      expect((await variant(shirt.id)).stock).toBe(5);
    });

    it('cách thanh toán lạ bị từ chối', async () => {
      const item = await addToCart(shirt.id, 1);
      await preview({ itemIds: [item], paymentMethod: 'MOMO' }).expect(400);
    });
  });

  // ----- tạo vận đơn -----

  describe('xác nhận và tạo vận đơn (SHIP-02)', () => {
    it('một kiện một vận đơn, có tiền thu hộ của đơn COD, hạn bàn giao', async () => {
      const { so } = await toConfirm('COD');
      const res = await confirm(so.id).expect(200);
      expect(res.body.status).toBe('CONFIRMED');
      expect(res.body.handoverBefore).toEqual(expect.any(String));
      expect(res.body.shipment).toMatchObject({
        ghnCode: 'SIMTEST1',
        status: 'READY_TO_PICK',
        simulated: true,
        fee: 25_000,
      });
      expect(t.carrier.calls).toHaveLength(1);
      expect(t.carrier.calls[0]).toMatchObject({ clientCode: so.code, codAmount: so.total });

      // Bấm lại: không tạo vận đơn thứ hai
      await confirm(so.id).expect(409);
      expect(await t.prisma.shipment.count()).toBe(1);
      expect(t.carrier.calls).toHaveLength(1);
    });

    it('đơn trả trước: GHN không thu hộ', async () => {
      const { so } = await toConfirm('VNPAY');
      await confirm(so.id).expect(200);
      expect(t.carrier.calls[0]!.codAmount).toBe(0);
    });

    it('GHN từ chối: đơn vẫn xác nhận, seller tạo lại được; tạo lại khi đã có vận đơn thì 409', async () => {
      const { so } = await toConfirm();
      t.carrier.createError = new CarrierRejectedError('Địa chỉ không hỗ trợ');
      const res = await confirm(so.id).expect(200);
      expect(res.body.status).toBe('CONFIRMED');
      expect(res.body.shipment).toMatchObject({
        status: 'CREATE_FAILED',
        ghnCode: null,
        lastError: 'Địa chỉ không hỗ trợ',
      });

      t.carrier.createError = null;
      const retry = await t
        .http()
        .post(`${API}/shops/me/orders/${so.id}/shipment/retry`)
        .set(auth(seller))
        .expect(200);
      expect(retry.body.shipment).toMatchObject({ status: 'READY_TO_PICK', lastError: null });
      await t
        .http()
        .post(`${API}/shops/me/orders/${so.id}/shipment/retry`)
        .set(auth(seller))
        .expect(409)
        .expect((r) => expect(r.body.code).toBe('SHIPMENT_NOT_RETRYABLE'));
      expect(await t.prisma.shipment.count()).toBe(1);
    });

    it('lỗi mạng sau khi GHN đã tạo: ghi "chưa rõ", tra cứu rồi gắn đúng vận đơn cũ, không tạo thêm', async () => {
      const { so } = await toConfirm();
      t.carrier.loseResponse = true;
      const res = await confirm(so.id).expect(200);
      expect(res.body.shipment.status).toBe('UNKNOWN');

      t.carrier.loseResponse = false;
      await shipments().syncUnknown();
      const sh = await shipmentOf(so.id);
      expect(sh).toMatchObject({ status: 'READY_TO_PICK', ghnCode: 'SIMTEST1' });
      expect(t.carrier.orders.size).toBe(1);
      expect(t.carrier.calls).toHaveLength(1);
    });

    it('lỗi mạng mà GHN chưa có vận đơn: job tạo lại bằng cùng mã đơn con', async () => {
      const { so } = await toConfirm();
      t.carrier.createError = new Error('ECONNRESET');
      await confirm(so.id).expect(200);
      expect((await shipmentOf(so.id)).status).toBe('UNKNOWN');

      t.carrier.createError = null;
      await shipments().syncUnknown();
      expect((await shipmentOf(so.id)).status).toBe('READY_TO_PICK');
      expect(t.carrier.calls.map((c) => c.clientCode)).toEqual([so.code, so.code]);
      expect(t.carrier.orders.size).toBe(1);
    });
  });

  // ----- trạng thái vận đơn -----

  describe('nhận trạng thái GHN (SHIP-03)', () => {
    it('sai mã webhook: 401', async () => {
      await webhook({ OrderCode: 'X', Status: 'picked' }, 'sai').expect(401);
    });

    it('lấy hàng → giao thành công; tin trùng và tin cũ tới muộn không làm sai trạng thái', async () => {
      const { so, shipment } = await confirmed('COD');
      const at = (hours: number) => new Date(Date.now() + hours * 3600_000).toISOString();
      const pickedAt = at(3);
      const r1 = await webhook({ OrderCode: shipment.ghnCode, Status: 'picked', Time: pickedAt });
      expect(r1.status).toBe(200);
      expect(r1.body.result).toBe('APPLIED');
      expect((await shopOrder(so.id)).status).toBe('SHIPPING');

      // Tin trùng hệt: bỏ qua
      const dup = await webhook({ OrderCode: shipment.ghnCode, Status: 'picked', Time: pickedAt });
      expect(dup.body.result).toBe('DUPLICATE');

      await webhook({
        OrderCode: shipment.ghnCode,
        Status: 'delivered',
        Time: at(27),
        TotalFee: 27_000,
      }).expect(200);
      const after = await shopOrder(so.id);
      expect(after.status).toBe('DELIVERED');
      expect(after.completeBefore!.getTime() - after.deliveredAt!.getTime()).toBe(7 * 86_400_000);

      // Tin cũ tới muộn (đang lấy hàng, đã lấy hàng lúc khác) và tin "đã giao" gửi lại
      await webhook({ OrderCode: shipment.ghnCode, Status: 'picking', Time: at(1) });
      await webhook({ OrderCode: shipment.ghnCode, Status: 'picked', Time: at(2) });
      await webhook({ OrderCode: shipment.ghnCode, Status: 'delivered', Time: at(28) });
      expect((await shopOrder(so.id)).status).toBe('DELIVERED');
      expect(await shipmentOf(so.id)).toMatchObject({ status: 'DELIVERED', fee: 27_000 });

      const delivered = await events(SHOP_ORDER_DELIVERED);
      expect(delivered).toHaveLength(1);
      expect(delivered[0]).toMatchObject({
        shopOrderId: so.id,
        paymentMethod: 'COD',
        codAmount: so.total,
        carrierFee: 27_000,
        ghnCode: shipment.ghnCode,
      });
      // Lịch sử giữ đủ mọi tin (trừ tin trùng hệt), xếp theo giờ xảy ra
      const detail = await t.http().get(`${API}/orders/${so.orderId}`).set(auth(buyer)).expect(200);
      const tracking = detail.body.shopOrders[0].shipment.tracking;
      expect(tracking.map((x: { ghnStatus: string }) => x.ghnStatus)).toEqual([
        'delivered',
        'delivered',
        'picked',
        'picked',
        'picking',
        'ready_to_pick',
      ]);
    });

    it('mất tin "đã lấy hàng": tin "đã giao" vẫn đưa đơn tới DELIVERED', async () => {
      const { so, shipment } = await confirmed();
      await webhook({ OrderCode: shipment.ghnCode, Status: 'delivered' }).expect(200);
      expect((await shopOrder(so.id)).status).toBe('DELIVERED');
      expect((await shopOrder(so.id)).pickedAt).not.toBeNull();
    });

    it('vận đơn lạ: trả 200 để GHN không gửi lại', async () => {
      const res = await webhook({ OrderCode: 'KHONGCO', Status: 'picked' }).expect(200);
      expect(res.body.result).toBe('UNKNOWN_SHIPMENT');
    });

    it('đang xin hủy mà GHN lấy hàng: yêu cầu hủy hết hiệu lực', async () => {
      const { so, shipment } = await confirmed();
      await t
        .http()
        .post(`${API}/orders/${so.orderId}/shop-orders/${so.id}/cancel`)
        .set(auth(buyer))
        .send({ reason: 'Đổi ý' })
        .expect(200);
      expect((await shopOrder(so.id)).status).toBe('CANCEL_REQUESTED');
      await webhook({ OrderCode: shipment.ghnCode, Status: 'picked' }).expect(200);
      expect((await shopOrder(so.id)).status).toBe('SHIPPING');
      await t
        .http()
        .post(`${API}/shops/me/orders/${so.id}/cancel-request/accept`)
        .set(auth(seller))
        .expect(409);
    });
  });

  // ----- hoàn tất -----

  describe('hoàn tất đơn', () => {
    async function delivered(paymentMethod: 'VNPAY' | 'COD' = 'COD') {
      const c = await confirmed(paymentMethod);
      await simulate(c.shipment.id, 'PICKED').expect(200);
      await simulate(c.shipment.id, 'DELIVERED').expect(200);
      return c;
    }

    it('người mua bấm "Đã nhận hàng": hoàn tất một lần, phát sự kiện một lần', async () => {
      const { so } = await delivered();
      const received = () =>
        t.http().post(`${API}/orders/${so.orderId}/shop-orders/${so.id}/received`).set(auth(buyer));
      const res = await received().expect(200);
      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.shopOrders[0].status).toBe('COMPLETED');
      await received()
        .expect(409)
        .expect((r) => expect(r.body.code).toBe('ORDER_NOT_DELIVERED'));
      const done = await events(SHOP_ORDER_COMPLETED);
      expect(done).toHaveLength(1);
      expect(done[0]).toMatchObject({ shopOrderId: so.id, completedBy: 'BUYER' });
    });

    it('người khác không bấm "Đã nhận" thay được', async () => {
      const { so } = await delivered();
      const other = makeUser('Người Lạ');
      await t
        .http()
        .post(`${API}/orders/${so.orderId}/shop-orders/${so.id}/received`)
        .set(auth(other))
        .expect(404);
    });

    it('chưa giao thì không bấm "Đã nhận" được', async () => {
      const { so } = await confirmed();
      await t
        .http()
        .post(`${API}/orders/${so.orderId}/shop-orders/${so.id}/received`)
        .set(auth(buyer))
        .expect(409);
    });

    it('hết hạn: job tự hoàn tất, chạy lại không phát thêm', async () => {
      const { so } = await delivered();
      const later = new Date(Date.now() + 8 * 86_400_000);
      expect(await jobs().autoComplete(new Date())).toBe(0);
      expect(await jobs().autoComplete(later)).toBe(1);
      expect(await jobs().autoComplete(later)).toBe(0);
      expect((await shopOrder(so.id)).status).toBe('COMPLETED');
      const done = await events(SHOP_ORDER_COMPLETED);
      expect(done).toEqual([expect.objectContaining({ completedBy: 'SYSTEM' })]);
    });
  });

  // ----- giao thất bại, hoàn hàng -----

  describe('giao thất bại và hoàn hàng (SHIP-04)', () => {
    async function failDelivery(paymentMethod: 'VNPAY' | 'COD') {
      const c = await confirmed(paymentMethod);
      await simulate(c.shipment.id, 'PICKED').expect(200);
      for (let i = 0; i < 3; i++) await simulate(c.shipment.id, 'DELIVERY_FAILED').expect(200);
      return c;
    }

    it('trả trước: thất bại đủ 3 lần thì hoàn hàng, hoàn tiền trừ phí ship chiều đi', async () => {
      const { so, shipment } = await failDelivery('VNPAY');
      expect(await shipmentOf(so.id)).toMatchObject({ status: 'RETURNING', failedAttempts: 3 });
      expect(await shopOrder(so.id)).toMatchObject({
        status: 'RETURNING',
        refundStatus: 'PROCESSING',
      });
      const failed = await events(SHOP_ORDER_DELIVERY_FAILED);
      expect(failed).toEqual([
        expect.objectContaining({
          shopOrderId: so.id,
          paymentMethod: 'VNPAY',
          refundAmount: so.total - so.shippingFee,
        }),
      ]);
      // Nút "giao thất bại" không còn bấm được khi đang hoàn
      await simulate(shipment.id, 'DELIVERY_FAILED').expect(409);
    });

    it('COD: không có tiền để hoàn', async () => {
      const { so } = await failDelivery('COD');
      const [failed] = await events(SHOP_ORDER_DELIVERY_FAILED);
      expect(failed).toMatchObject({ shopOrderId: so.id, paymentMethod: 'COD', refundAmount: 0 });
      expect((await shopOrder(so.id)).refundStatus).toBe('NONE');
    });

    it('shop nhận kiện hoàn, chọn dòng nhập lại kho; bấm lại thì 409', async () => {
      const { so, shipment } = await failDelivery('COD');
      await simulate(shipment.id, 'RETURNED').expect(200);
      expect((await shopOrder(so.id)).status).toBe('RETURNED');
      const shirtLine = so.items.find((i) => i.variantId === shirt.id)!;
      const before = await variant(shirt.id);
      const hatBefore = await variant(hat.id);

      const res = await t
        .http()
        .post(`${API}/shops/me/orders/${so.id}/return-received`)
        .set(auth(seller))
        .send({ restockItemIds: [shirtLine.id] })
        .expect(200);
      expect(res.body.status).toBe('FAILED');
      expect((await variant(shirt.id)).stock).toBe(before.stock + 1);
      expect((await variant(hat.id)).stock).toBe(hatBefore.stock);
      const product = await t.prisma.product.findUniqueOrThrow({ where: { id: shirt.productId } });
      expect(product.soldCount).toBe(0);

      await t
        .http()
        .post(`${API}/shops/me/orders/${so.id}/return-received`)
        .set(auth(seller))
        .send({ restockItemIds: [shirtLine.id] })
        .expect(409);
      expect((await variant(shirt.id)).stock).toBe(before.stock + 1);
    });

    it('shop không xác nhận kịp: job tự đóng, không cộng kho', async () => {
      const { so, shipment } = await failDelivery('COD');
      await simulate(shipment.id, 'RETURNED').expect(200);
      const stock = (await variant(shirt.id)).stock;
      expect(await jobs().closeReturns(new Date(Date.now() + 8 * 86_400_000))).toBe(1);
      expect((await shopOrder(so.id)).status).toBe('FAILED');
      expect((await variant(shirt.id)).stock).toBe(stock);
    });

    it('GHN báo hoàn ngay (không qua thất bại): vẫn hoàn tiền một lần', async () => {
      const { so, shipment } = await confirmed('VNPAY');
      await webhook({ OrderCode: shipment.ghnCode, Status: 'picked' });
      await webhook({ OrderCode: shipment.ghnCode, Status: 'return' });
      await webhook({ OrderCode: shipment.ghnCode, Status: 'returned' });
      await webhook({
        OrderCode: shipment.ghnCode,
        Status: 'return',
        Time: '2026-10-20T00:00:00Z',
      });
      expect((await shopOrder(so.id)).status).toBe('RETURNED');
      expect(await events(SHOP_ORDER_DELIVERY_FAILED)).toHaveLength(1);
    });
  });

  // ----- sự cố -----

  describe('sự cố GHN (thất lạc, hư hỏng)', () => {
    it('admin hỗ trợ xác nhận: hoàn đủ cho người mua trả trước, ghi nhật ký; bấm lại thì 409', async () => {
      const { so, shipment } = await confirmed('VNPAY');
      await simulate(shipment.id, 'PICKED').expect(200);
      await simulate(shipment.id, 'LOST').expect(200);
      expect((await shopOrder(so.id)).status).toBe('INCIDENT');
      expect((await shipmentOf(so.id)).status).toBe('LOST');

      const tab = await t
        .http()
        .get(`${API}/admin/orders?tab=INCIDENT`)
        .set(auth(support))
        .expect(200);
      expect(tab.body.total).toBe(1);

      const resolve = () =>
        t
          .http()
          .post(`${API}/admin/orders/${so.orderId}/shop-orders/${so.id}/incident`)
          .set(auth(support))
          .send({ note: 'GHN xác nhận làm mất hàng' });
      const res = await resolve().expect(200);
      expect(res.body.shopOrders[0]).toMatchObject({
        status: 'INCIDENT_RESOLVED',
        incidentNote: 'GHN xác nhận làm mất hàng',
      });
      await resolve()
        .expect(409)
        .expect((r) => expect(r.body.code).toBe('NO_INCIDENT'));
      expect(await events(SHOP_ORDER_INCIDENT_CONFIRMED)).toEqual([
        expect.objectContaining({ shopOrderId: so.id, refundAmount: so.total }),
      ]);
      expect(await t.prisma.auditLog.count({ where: { action: 'CONFIRM_INCIDENT' } })).toBe(1);
    });

    it('thất lạc lúc đang hoàn về: không hoàn tiền lần hai', async () => {
      const { so, shipment } = await confirmed('VNPAY');
      await webhook({ OrderCode: shipment.ghnCode, Status: 'picked' });
      await webhook({ OrderCode: shipment.ghnCode, Status: 'return' });
      await webhook({ OrderCode: shipment.ghnCode, Status: 'lost' });
      expect((await shopOrder(so.id)).status).toBe('INCIDENT');
      await t
        .http()
        .post(`${API}/admin/orders/${so.orderId}/shop-orders/${so.id}/incident`)
        .set(auth(support))
        .send({ note: 'Mất lúc hoàn' })
        .expect(200);
      const [incident] = await events(SHOP_ORDER_INCIDENT_CONFIRMED);
      expect(incident).toMatchObject({ refundAmount: 0 });
    });

    it('cần quyền SUPPORT', async () => {
      const { so } = await confirmed();
      await t
        .http()
        .post(`${API}/admin/orders/${so.orderId}/shop-orders/${so.id}/incident`)
        .set(auth(buyer))
        .send({ note: 'x' })
        .expect(403);
    });
  });

  // ----- hủy đua với GHN -----

  describe('hủy đơn đã có vận đơn', () => {
    it('shop hủy trước khi GHN lấy: hủy vận đơn với GHN, trả lại tồn', async () => {
      const { so, shipment } = await confirmed('COD');
      const stock = (await variant(shirt.id)).stock;
      const res = await t
        .http()
        .post(`${API}/shops/me/orders/${so.id}/cancel`)
        .set(auth(seller))
        .send({ reason: 'Hết hàng' })
        .expect(200);
      expect(res.body.status).toBe('CANCELLED');
      expect(t.carrier.cancelled).toEqual([shipment.ghnCode]);
      expect((await shipmentOf(so.id)).status).toBe('CANCELLED');
      expect((await variant(shirt.id)).stock).toBe(stock + 1);
    });

    it('GHN đã lấy hàng (chưa kịp báo về): không hủy, đơn giữ nguyên', async () => {
      const { so } = await confirmed();
      t.carrier.cancelResult = 'ALREADY_PICKED';
      await t
        .http()
        .post(`${API}/shops/me/orders/${so.id}/cancel`)
        .set(auth(seller))
        .send({ reason: 'Hết hàng' })
        .expect(409)
        .expect((r) => expect(r.body.code).toBe('ALREADY_PICKED_UP'));
      expect((await shopOrder(so.id)).status).toBe('CONFIRMED');
    });

    it('GHN không trả lời khi hủy: 503, đơn giữ nguyên', async () => {
      const { so } = await confirmed();
      t.carrier.cancelError = new Error('timeout');
      await t
        .http()
        .post(`${API}/shops/me/orders/${so.id}/cancel`)
        .set(auth(seller))
        .send({ reason: 'Hết hàng' })
        .expect(503);
      expect((await shopOrder(so.id)).status).toBe('CONFIRMED');
    });

    it('quá hạn bàn giao: job hủy vận đơn và đơn, hoàn tiền; tin "đã lấy hàng" tới sau không mở lại đơn', async () => {
      const { so, shipment } = await confirmed('VNPAY');
      const later = new Date(Date.now() + 49 * 3600_000);
      expect(await jobs().handoverTimeout(new Date())).toBe(0);
      expect(await jobs().handoverTimeout(later)).toBe(1);
      expect(await shopOrder(so.id)).toMatchObject({
        status: 'CANCELLED',
        refundStatus: 'PROCESSING',
      });
      expect((await shipmentOf(so.id)).status).toBe('CANCELLED');

      await webhook({ OrderCode: shipment.ghnCode, Status: 'picked' }).expect(200);
      expect((await shopOrder(so.id)).status).toBe('CANCELLED');
      expect((await shipmentOf(so.id)).lastError).toContain('sau khi đơn bị hủy');
    });

    it('hủy lúc vận đơn còn "chưa rõ": đánh dấu chờ hủy, job tra mã rồi báo hủy với GHN', async () => {
      const { so } = await toConfirm('COD');
      t.carrier.loseResponse = true;
      await confirm(so.id).expect(200);
      t.carrier.loseResponse = false;
      await t
        .http()
        .post(`${API}/shops/me/orders/${so.id}/cancel`)
        .set(auth(seller))
        .send({ reason: 'Hết hàng' })
        .expect(200);
      expect((await shipmentOf(so.id)).status).toBe('CANCELLING');
      await shipments().syncCancelling();
      expect(await shipmentOf(so.id)).toMatchObject({ status: 'CANCELLED', ghnCode: 'SIMTEST1' });
      expect(t.carrier.cancelled).toEqual(['SIMTEST1']);
    });
  });

  // ----- bảng mô phỏng -----

  describe('bảng GHN mô phỏng', () => {
    it('liệt kê vận đơn đang chạy kèm nút bấm được; bước sai thì 409; cần quyền SUPPORT', async () => {
      const { shipment } = await confirmed();
      const list = await t
        .http()
        .get(`${API}/admin/carrier-simulator`)
        .set(auth(support))
        .expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0]).toMatchObject({ ghnCode: shipment.ghnCode, actions: ['PICKED'] });
      await simulate(shipment.id, 'DELIVERY_FAILED')
        .expect(409)
        .expect((r) => expect(r.body.code).toBe('INVALID_CARRIER_EVENT'));
      await simulate(shipment.id, 'PICKED', seller).expect(403);
    });
  });
});
