import { randomUUID } from 'node:crypto';
import type { SanEvent } from '@san/shared';
import { OrderJobs } from '../src/orders/order.jobs';
import { OrderLifecycle } from '../src/orders/order-lifecycle.service';
import { ShopSuspensionEvents } from '../src/shop-admin/shop-suspension.events';
import type { ProductVariant, Shop } from '../generated/prisma';
import { makeProduct, makeShop } from './fixtures-p2';
import { API, createTestApp, describeDb, makeUser, resetDb, type TestApp } from './helpers';

type User = ReturnType<typeof makeUser>;

describeDb('Đặt hàng và đơn (P3: ORD-01..05, INV-02, VCH-02/03)', () => {
  let t: TestApp;
  let buyer: User;
  let sellerA: User;
  let sellerB: User;
  let shopA: Shop;
  let shopB: Shop;
  /** Áo của shop A: 200.000đ, tồn 5 */
  let shirt: ProductVariant;
  /** Tai nghe của shop B: 100.000đ, tồn 3 */
  let earbuds: ProductVariant;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.payments.createPayment.mockReset();
    buyer = makeUser('Người Mua');
    sellerA = makeUser('Chủ Shop A');
    sellerB = makeUser('Chủ Shop B');
    shopA = await makeShop(t.prisma, sellerA.id, { name: 'Shop A' });
    shopB = await makeShop(t.prisma, sellerB.id, { name: 'Shop B' });
    shirt = (
      await makeProduct(t.prisma, shopA.id, {
        name: 'Áo thun',
        variants: [{ price: 200_000, stock: 5 }],
      })
    ).variants[0]!;
    earbuds = (
      await makeProduct(t.prisma, shopB.id, {
        name: 'Tai nghe',
        variants: [{ price: 100_000, stock: 3 }],
      })
    ).variants[0]!;
  });

  const auth = (u: User) => ({ Authorization: `Bearer ${u.token}` });
  const lifecycle = () => t.app.get(OrderLifecycle);

  async function addToCart(variantId: string, quantity: number, u: User = buyer) {
    const res = await t.http().post(`${API}/cart/items`).set(auth(u)).send({ variantId, quantity });
    expect(res.status).toBe(201);
    return res.body.itemId as string;
  }

  async function voucher(
    shopId: string | null,
    data: Partial<{
      code: string;
      discountType: 'AMOUNT' | 'PERCENT';
      value: number;
      maxDiscount: number | null;
      minOrder: number;
      quantity: number;
      perUserLimit: number;
      startAt: Date;
      endAt: Date;
    }> = {},
  ) {
    return t.prisma.voucher.create({
      data: {
        shopId,
        code: data.code ?? `V${Math.floor(Math.random() * 1e8)}`,
        name: 'Voucher thử',
        discountType: data.discountType ?? 'AMOUNT',
        value: data.value ?? 20_000,
        maxDiscount: data.maxDiscount ?? null,
        minOrder: data.minOrder ?? 0,
        quantity: data.quantity ?? 10,
        perUserLimit: data.perUserLimit ?? 1,
        startAt: data.startAt ?? new Date(Date.now() - 3600_000),
        endAt: data.endAt ?? new Date(Date.now() + 86_400_000),
        createdBy: randomUUID(),
      },
    });
  }

  const preview = (body: object, u: User = buyer) =>
    t.http().post(`${API}/checkout/preview`).set(auth(u)).send(body);
  const place = (checkoutId: string, u: User = buyer) =>
    t.http().post(`${API}/orders`).set(auth(u)).send({ checkoutId });

  /** Giỏ có 1 áo (shop A) + 1 tai nghe (shop B) → xem trước → đặt hàng */
  async function placeTwoShops(body: object = {}) {
    const a = await addToCart(shirt.id, 1);
    const b = await addToCart(earbuds.id, 1);
    const p = await preview({ itemIds: [a, b], ...body }).expect(201);
    const res = await place(p.body.checkoutId).expect(201);
    return { orderId: res.body.orderId as string, preview: p.body, placed: res.body };
  }

  const order = (orderId: string) =>
    t.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { shopOrders: { orderBy: { code: 'asc' } } },
    });
  const variant = (id: string) => t.prisma.productVariant.findUniqueOrThrow({ where: { id } });
  const events = async (type: string) =>
    (await t.prisma.outboxEvent.findMany({ where: { type }, orderBy: { createdAt: 'asc' } })).map(
      (e) => (e.payload as unknown as SanEvent).payload as unknown as Record<string, unknown>,
    );

  async function pay(orderId: string) {
    const o = await order(orderId);
    await t.prisma.$transaction((tx) =>
      lifecycle().markPaid(tx, {
        orderId,
        paymentId: randomUUID(),
        amount: o.total,
        paidAt: new Date().toISOString(),
        shopOrders: o.shopOrders.map((so) => ({
          shopOrderId: so.id,
          platformFeeRate: 500,
          platformFee: Math.floor(((so.subtotal - so.shopDiscount) * 500) / 10_000),
          sellerAmount:
            so.subtotal -
            so.shopDiscount -
            Math.floor(((so.subtotal - so.shopDiscount) * 500) / 10_000),
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

  // ----- xem trước -----

  describe('xem trước (POST /checkout/preview)', () => {
    it('tách tiền theo shop, phí ship cố định, tự chọn voucher giảm nhiều nhất', async () => {
      await voucher(shopA.id, { code: 'SHOPA20', value: 20_000 });
      await voucher(shopA.id, { code: 'SHOPA10', value: 10_000 });
      await voucher(null, { code: 'SAN50', value: 50_000 });
      const a = await addToCart(shirt.id, 1);
      const b = await addToCart(earbuds.id, 1);
      const res = await preview({ itemIds: [a, b] }).expect(201);
      const body = res.body;
      expect(body.checkoutId).toEqual(expect.any(String));
      expect(body.canPlace).toBe(true);
      expect(body.address.fullAddress).toBe(
        '1 Điện Biên Phủ, Phường Điện Biên, Quận Ba Đình, Hà Nội',
      );
      const [sa, sb] = [
        body.shops.find((s: { shop: { id: string } }) => s.shop.id === shopA.id),
        body.shops.find((s: { shop: { id: string } }) => s.shop.id === shopB.id),
      ];
      expect(sa).toMatchObject({
        subtotal: 200_000,
        shopVoucher: { code: 'SHOPA20', discount: 20_000 },
        shopDiscount: 20_000,
        shippingFee: 30_000,
        shippingFeeSource: 'FIXED',
      });
      expect(sa.vouchers.map((v: { code: string }) => v.code).sort()).toEqual([
        'SHOPA10',
        'SHOPA20',
      ]);
      // Voucher sàn 50.000đ chia theo 180.000 : 100.000 → 32.142 + 17.857, dư 1đ vào đơn lớn
      expect(body.platformVoucher).toMatchObject({ code: 'SAN50', discount: 50_000 });
      expect(sa.platformDiscount + sb.platformDiscount).toBe(50_000);
      expect(sa.platformDiscount).toBe(32_143);
      expect(sb.platformDiscount).toBe(17_857);
      expect(sa.total).toBe(200_000 - 20_000 - 32_143 + 30_000);
      expect(body.total).toBe(300_000 - 20_000 - 50_000 + 60_000);
      expect(await t.prisma.checkout.count()).toBe(1);
    });

    it('voucher chưa đủ điều kiện: không áp, báo lý do; code null = không dùng', async () => {
      await voucher(shopA.id, { code: 'SHOPA500K', minOrder: 500_000 });
      const a = await addToCart(shirt.id, 1);
      const res = await preview({
        itemIds: [a],
        shopVouchers: [{ shopId: shopA.id, code: 'SHOPA500K' }],
        platformVoucherCode: 'KHONGCO',
      }).expect(201);
      expect(res.body.shops[0].shopVoucher).toBeNull();
      expect(res.body.shops[0].vouchers[0]).toMatchObject({
        eligible: false,
        reason: 'Mua thêm 300.000đ để dùng mã này.',
      });
      expect(res.body.voucherErrors).toEqual([
        { shopId: shopA.id, code: 'SHOPA500K', message: 'Mua thêm 300.000đ để dùng mã này.' },
        { shopId: null, code: 'KHONGCO', message: 'Mã voucher không tồn tại.' },
      ]);
      expect(res.body.canPlace).toBe(true);
    });

    it('dòng vượt tồn → problems, không đặt được; chưa có địa chỉ → 409 ADDRESS_REQUIRED', async () => {
      const a = await addToCart(earbuds.id, 3);
      await t.prisma.productVariant.update({ where: { id: earbuds.id }, data: { stock: 2 } });
      const res = await preview({ itemIds: [a] }).expect(201);
      expect(res.body.canPlace).toBe(false);
      expect(res.body.problems).toEqual([
        { cartItemId: a, message: '"Tai nghe" chỉ còn 2 sản phẩm.' },
      ]);

      t.users.addresses.mockResolvedValueOnce([]);
      expect((await preview({ itemIds: [a] }).expect(409)).body.code).toBe('ADDRESS_REQUIRED');
      await preview({ itemIds: [randomUUID()] }).expect(400);
    });
  });

  // ----- đặt hàng -----

  describe('đặt hàng (POST /orders)', () => {
    it('tạo đơn tổng + 2 đơn con, giữ tồn, giữ lượt voucher, xóa khỏi giỏ, phát order.placed', async () => {
      const va = await voucher(shopA.id, { code: 'SHOPA20', value: 20_000 });
      const vp = await voucher(null, { code: 'SAN50', value: 50_000 });
      const { orderId, placed } = await placeTwoShops();
      expect(placed).toMatchObject({ orderId, code: expect.stringMatching(/^\d{6}[A-Z0-9]{6}$/) });

      const o = await order(orderId);
      expect(o.shopOrders.map((s) => s.code)).toEqual([`${o.code}-1`, `${o.code}-2`]);
      expect(o.shopOrders.every((s) => s.status === 'PENDING')).toBe(true);
      expect(o).toMatchObject({ paymentStatus: 'UNPAID', checkStatus: 'PENDING', total: 290_000 });
      expect(o.shopOrders.reduce((a, s) => a + s.total, 0)).toBe(o.total);
      expect((await variant(shirt.id)).reserved).toBe(1);
      expect((await variant(earbuds.id)).reserved).toBe(1);
      expect((await t.prisma.voucher.findUniqueOrThrow({ where: { id: va.id } })).usedCount).toBe(
        1,
      );
      expect((await t.prisma.voucher.findUniqueOrThrow({ where: { id: vp.id } })).usedCount).toBe(
        1,
      );
      expect(await t.prisma.voucherUsage.count({ where: { orderId } })).toBe(2);
      expect(await t.prisma.cartItem.count({ where: { userId: buyer.id } })).toBe(0);
      // Giảm giá chia về dòng hàng = voucher shop + phần voucher sàn
      const items = await t.prisma.orderItem.findMany({ where: { shopOrder: { orderId } } });
      expect(items.reduce((a, i) => a + i.discount, 0)).toBe(70_000);

      const [ev] = await events('order.placed');
      expect(ev).toMatchObject({
        orderId,
        total: 290_000,
        buyer: { userId: buyer.id },
        shopOrders: expect.arrayContaining([
          expect.objectContaining({ shopId: shopA.id, ownerId: sellerA.id, shopDiscount: 20_000 }),
        ]),
      });
    });

    it('gửi lại cùng mã phiên → 200 trả đúng đơn cũ, không tạo thêm', async () => {
      const a = await addToCart(shirt.id, 1);
      const p = await preview({ itemIds: [a] }).expect(201);
      const [r1, r2] = await Promise.all([place(p.body.checkoutId), place(p.body.checkoutId)]);
      expect([r1.status, r2.status].sort()).toEqual([200, 201]);
      expect(r1.body.orderId).toBe(r2.body.orderId);
      expect(await t.prisma.order.count()).toBe(1);
      expect((await variant(shirt.id)).reserved).toBe(1);
      // Phiên của người khác → 404
      await place(p.body.checkoutId, makeUser('Người Lạ')).expect(404);
    });

    it('giá đổi sau khi xem → 409 CHECKOUT_CHANGED, không tạo đơn, không giữ tồn', async () => {
      const a = await addToCart(shirt.id, 1);
      const b = await addToCart(earbuds.id, 1);
      const p = await preview({ itemIds: [a, b] }).expect(201);
      await t.prisma.productVariant.update({ where: { id: earbuds.id }, data: { price: 120_000 } });
      const res = await place(p.body.checkoutId).expect(409);
      expect(res.body.code).toBe('CHECKOUT_CHANGED');
      expect(res.body.details.problems).toEqual(['Giá "Tai nghe" đổi từ 100.000đ thành 120.000đ.']);
      expect(await t.prisma.order.count()).toBe(0);
      expect((await variant(shirt.id)).reserved).toBe(0);
    });

    it('hai người tranh SKU cuối: chỉ một người đặt được, không bán vượt tồn', async () => {
      await t.prisma.productVariant.update({ where: { id: earbuds.id }, data: { stock: 1 } });
      const other = makeUser('Người Mua Hai');
      const a = await addToCart(earbuds.id, 1, buyer);
      const b = await addToCart(earbuds.id, 1, other);
      const pa = await preview({ itemIds: [a] }, buyer).expect(201);
      const pb = await preview({ itemIds: [b] }, other).expect(201);
      const results = await Promise.all([
        place(pa.body.checkoutId, buyer),
        place(pb.body.checkoutId, other),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(results.find((r) => r.status === 409)!.body.code).toBe('CHECKOUT_CHANGED');
      const v = await variant(earbuds.id);
      expect(v.reserved).toBe(1);
      expect(await t.prisma.order.count()).toBe(1);
    });

    it('voucher hết lượt giữa lúc xem và lúc đặt → 409, lượt không bị vượt', async () => {
      const v = await voucher(null, { code: 'SAN1', value: 10_000, quantity: 1 });
      const other = makeUser('Người Mua Hai');
      const a = await addToCart(shirt.id, 1, buyer);
      const b = await addToCart(shirt.id, 1, other);
      const pa = await preview({ itemIds: [a] }, buyer).expect(201);
      const pb = await preview({ itemIds: [b] }, other).expect(201);
      expect(pa.body.platformVoucher.code).toBe('SAN1');
      expect(pb.body.platformVoucher.code).toBe('SAN1');
      await place(pa.body.checkoutId, buyer).expect(201);
      const res = await place(pb.body.checkoutId, other).expect(409);
      expect(res.body.code).toBe('CHECKOUT_CHANGED');
      expect((await t.prisma.voucher.findUniqueOrThrow({ where: { id: v.id } })).usedCount).toBe(1);
    });
  });

  // ----- thanh toán, kiểm tra đơn -----

  describe('tiền về và kiểm tra đơn', () => {
    it('đã trả + qua kiểm tra → Chờ xác nhận; chốt tồn, ghi lịch sử tồn, tăng đã bán; tin trùng không làm lại', async () => {
      const { orderId } = await placeTwoShops();
      await pay(orderId);
      let o = await order(orderId);
      expect(o.paymentStatus).toBe('PAID');
      expect(o.shopOrders.every((s) => s.status === 'PENDING')).toBe(true); // còn chờ kiểm tra
      expect(o.shopOrders[0]!.platformFeeRate).toBe(500);
      const v = await variant(shirt.id);
      expect([v.stock, v.reserved]).toEqual([4, 0]);
      expect(await t.prisma.stockHistory.count({ where: { orderId } })).toBe(2);

      await passCheck(orderId);
      o = await order(orderId);
      expect(o.shopOrders.every((s) => s.status === 'TO_CONFIRM' && s.confirmBefore)).toBe(true);

      await pay(orderId); // tin trùng
      expect((await variant(shirt.id)).stock).toBe(4);
      expect(await t.prisma.stockHistory.count({ where: { orderId } })).toBe(2);
      const product = await t.prisma.product.findUniqueOrThrow({ where: { id: shirt.productId } });
      expect(product.soldCount).toBe(1);
    });

    it('kiểm tra qua trước rồi tiền về sau cũng sang Chờ xác nhận', async () => {
      const { orderId } = await placeTwoShops();
      await passCheck(orderId);
      expect((await order(orderId)).shopOrders.every((s) => s.status === 'PENDING')).toBe(true);
      await pay(orderId);
      expect((await order(orderId)).shopOrders.every((s) => s.status === 'TO_CONFIRM')).toBe(true);
    });

    it('admin từ chối đơn đã trả → hủy mọi đơn con, cộng lại tồn, chờ hoàn tiền', async () => {
      const { orderId } = await placeTwoShops();
      await pay(orderId);
      await t.prisma.$transaction((tx) =>
        lifecycle().applyCheck(tx, {
          orderId,
          checkId: randomUUID(),
          result: 'REJECTED',
          reason: 'Nghi gian lận',
          decidedBy: { userId: randomUUID(), name: 'Tài Chính' },
          decidedAt: new Date().toISOString(),
        }),
      );
      const o = await order(orderId);
      expect(o.checkStatus).toBe('REJECTED');
      expect(o.shopOrders.every((s) => s.status === 'CANCELLED')).toBe(true);
      expect(o.shopOrders.every((s) => s.refundStatus === 'PROCESSING')).toBe(true);
      expect(o.shopOrders[0]!.cancelReason).toBe('Đơn không được duyệt: Nghi gian lận');
      expect((await variant(shirt.id)).stock).toBe(5);
      const cancelled = await events('shop_order.cancelled');
      expect(cancelled).toHaveLength(2);
      expect(cancelled.every((e) => e.orderCancelled === true)).toBe(true);
    });

    it('tiền về sau khi đơn đã hủy (hết giữ tồn) → bỏ qua, không chốt tồn', async () => {
      const { orderId } = await placeTwoShops();
      await t.prisma.order.update({
        where: { id: orderId },
        data: { holdUntil: new Date(Date.now() - 1000) },
      });
      expect(await t.app.get(OrderJobs).expireHolds()).toBe(2);
      await pay(orderId);
      const o = await order(orderId);
      expect(o.paymentStatus).toBe('UNPAID');
      expect((await variant(shirt.id)).stock).toBe(5);
    });

    it('refund.updated: lưu trạng thái hoàn, bỏ tin cũ tới sau', async () => {
      const { orderId } = await placeTwoShops();
      await pay(orderId);
      const so = (await order(orderId)).shopOrders[0]!;
      await t
        .http()
        .post(`${API}/orders/${orderId}/shop-orders/${so.id}/cancel`)
        .set(auth(buyer))
        .send({ reason: 'Đổi ý' })
        .expect(200);
      const apply = (status: 'SUCCEEDED' | 'PROCESSING', at: number) =>
        t.prisma.$transaction((tx) =>
          lifecycle().applyRefund(tx, {
            refundId: randomUUID(),
            orderId,
            shopOrderId: so.id,
            amount: so.total,
            status,
            updatedAt: new Date(Date.now() + at).toISOString(),
          }),
        );
      await apply('SUCCEEDED', 10_000);
      await apply('PROCESSING', 5_000);
      expect((await order(orderId)).shopOrders[0]!.refundStatus).toBe('SUCCEEDED');
    });
  });

  // ----- hủy -----

  describe('hủy (ORD-05, VCH-03)', () => {
    it('chưa trả: buyer hủy cả đơn tổng → nhả giữ tồn, trả lượt mọi voucher', async () => {
      const va = await voucher(shopA.id, { code: 'SHOPA20' });
      const vp = await voucher(null, { code: 'SAN50', value: 50_000 });
      const { orderId } = await placeTwoShops();
      const so = (await order(orderId)).shopOrders[0]!;
      // Chưa trả thì không hủy riêng đơn con
      const r = await t
        .http()
        .post(`${API}/orders/${orderId}/shop-orders/${so.id}/cancel`)
        .set(auth(buyer))
        .send({ reason: 'Đổi ý' })
        .expect(409);
      expect(r.body.code).toBe('ORDER_NOT_PAID');

      const res = await t
        .http()
        .post(`${API}/orders/${orderId}/cancel`)
        .set(auth(buyer))
        .send({ reason: 'Đổi ý' })
        .expect(200);
      expect(res.body.status).toBe('CANCELLED');
      expect(res.body.canPay).toBe(false);
      expect((await variant(shirt.id)).reserved).toBe(0);
      expect((await variant(shirt.id)).stock).toBe(5);
      for (const id of [va.id, vp.id]) {
        expect((await t.prisma.voucher.findUniqueOrThrow({ where: { id } })).usedCount).toBe(0);
      }
      expect(await t.prisma.voucherUsage.count({ where: { returnedAt: null } })).toBe(0);
      // Hủy lại → 409
      await t
        .http()
        .post(`${API}/orders/${orderId}/cancel`)
        .set(auth(buyer))
        .send({ reason: 'Đổi ý' })
        .expect(409);
    });

    it('đã trả: hủy đơn con shop B không ảnh hưởng shop A; trả voucher shop B, giữ voucher sàn', async () => {
      const vb = await voucher(shopB.id, { code: 'SHOPB10', value: 10_000 });
      const vp = await voucher(null, { code: 'SAN50', value: 50_000 });
      const { orderId } = await placeTwoShops();
      await pay(orderId);
      await passCheck(orderId);
      const all = (await order(orderId)).shopOrders;
      const soA = all.find((s) => s.shopId === shopA.id);
      const soB = all.find((s) => s.shopId === shopB.id);

      const res = await t
        .http()
        .post(`${API}/orders/${orderId}/shop-orders/${soB!.id}/cancel`)
        .set(auth(buyer))
        .send({ reason: 'Không cần nữa' })
        .expect(200);
      const byId = (id: string) =>
        res.body.shopOrders.find((s: { id: string }) => s.id === id) as Record<string, unknown>;
      expect(byId(soB!.id)).toMatchObject({ status: 'CANCELLED', refundStatus: 'PROCESSING' });
      expect(byId(soA!.id)).toMatchObject({ status: 'TO_CONFIRM', cancelAction: 'NOW' });
      expect(res.body.status).toBe('PROCESSING');

      const v = await variant(earbuds.id);
      expect([v.stock, v.reserved]).toEqual([3, 0]);
      expect((await t.prisma.voucher.findUniqueOrThrow({ where: { id: vb.id } })).usedCount).toBe(
        0,
      );
      expect((await t.prisma.voucher.findUniqueOrThrow({ where: { id: vp.id } })).usedCount).toBe(
        1,
      );
      const [ev] = await events('shop_order.cancelled');
      expect(ev).toMatchObject({
        shopOrderId: soB!.id,
        cancelledBy: 'BUYER',
        orderCancelled: false,
      });
      const history = await t.prisma.stockHistory.findFirst({
        where: { variantId: earbuds.id, change: 1 },
      });
      expect(history?.reason).toBe(`Hủy đơn ${soB!.code}`);
    });

    it('voucher đã hết hạn thì không trả lượt khi hủy', async () => {
      const vp = await voucher(null, { code: 'SAN10', value: 10_000 });
      const { orderId } = await placeTwoShops();
      await t.prisma.voucher.update({
        where: { id: vp.id },
        data: { endAt: new Date(Date.now() - 1) },
      });
      await t
        .http()
        .post(`${API}/orders/${orderId}/cancel`)
        .set(auth(buyer))
        .send({ reason: 'Đổi ý' })
        .expect(200);
      expect((await t.prisma.voucher.findUniqueOrThrow({ where: { id: vp.id } })).usedCount).toBe(
        1,
      );
    });

    it('đơn của người khác → 404', async () => {
      const { orderId } = await placeTwoShops();
      const stranger = makeUser('Người Lạ');
      await t.http().get(`${API}/orders/${orderId}`).set(auth(stranger)).expect(404);
      await t
        .http()
        .post(`${API}/orders/${orderId}/cancel`)
        .set(auth(stranger))
        .send({ reason: 'Phá' })
        .expect(404);
    });
  });

  // ----- seller -----

  describe('Kênh người bán (ORD-03)', () => {
    async function paidOrder() {
      const r = await placeTwoShops();
      await pay(r.orderId);
      await passCheck(r.orderId);
      const o = await order(r.orderId);
      return { orderId: r.orderId, soA: o.shopOrders.find((s) => s.shopId === shopA.id)! };
    }
    const seller = (path: string, u: User = sellerA) =>
      t.http().post(`${API}/shops/me/orders/${path}`).set(auth(u));

    it('xác nhận; shop khác không thấy (404); xác nhận lại → 409', async () => {
      const { soA } = await paidOrder();
      const list = await t.http().get(`${API}/shops/me/orders`).set(auth(sellerA)).expect(200);
      expect(list.body.total).toBe(1);
      expect(list.body.counts.TO_CONFIRM).toBe(1);
      expect(list.body.items[0]).toMatchObject({
        id: soA.id,
        sellerAmount: 190_000,
        platformFee: 10_000,
      });

      await t.http().get(`${API}/shops/me/orders/${soA.id}`).set(auth(sellerB)).expect(404);
      await seller(`${soA.id}/confirm`, sellerB).expect(404);
      const res = await seller(`${soA.id}/confirm`).expect(200);
      expect(res.body.status).toBe('CONFIRMED');
      expect((await seller(`${soA.id}/confirm`).expect(409)).body.code).toBe(
        'ORDER_NOT_CONFIRMABLE',
      );
    });

    it('yêu cầu hủy: buyer xin → shop từ chối → buyer không xin lại được; shop hủy có lý do', async () => {
      const { orderId, soA } = await paidOrder();
      await seller(`${soA.id}/confirm`).expect(200);
      const ask = () =>
        t
          .http()
          .post(`${API}/orders/${orderId}/shop-orders/${soA.id}/cancel`)
          .set(auth(buyer))
          .send({ reason: 'Đặt nhầm màu' });
      const r1 = await ask().expect(200);
      expect(r1.body.shopOrders.find((s: { id: string }) => s.id === soA.id).status).toBe(
        'CANCEL_REQUESTED',
      );
      await seller(`${soA.id}/cancel-request/decline`).send({ reason: 'Đã đóng gói' }).expect(200);
      expect((await ask().expect(409)).body.code).toBe('CANCEL_REQUEST_USED');
      await seller(`${soA.id}/cancel-request/accept`).expect(409);

      const res = await seller(`${soA.id}/cancel`)
        .send({ reason: 'Hết hàng trong kho' })
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'CANCELLED',
        cancelledBy: 'SELLER',
        refundStatus: 'PROCESSING',
      });
      expect(res.body.history.map((h: { toStatus: string }) => h.toStatus)).toEqual([
        'PENDING',
        'TO_CONFIRM',
        'CONFIRMED',
        'CANCEL_REQUESTED',
        'CONFIRMED',
        'CANCELLED',
      ]);
    });

    it('shop đồng ý yêu cầu hủy → hủy, hoàn tiền', async () => {
      const { orderId, soA } = await paidOrder();
      await seller(`${soA.id}/confirm`).expect(200);
      await t
        .http()
        .post(`${API}/orders/${orderId}/shop-orders/${soA.id}/cancel`)
        .set(auth(buyer))
        .send({ reason: 'Đặt nhầm' })
        .expect(200);
      const res = await seller(`${soA.id}/cancel-request/accept`).expect(200);
      expect(res.body).toMatchObject({
        status: 'CANCELLED',
        cancelReason: 'Buyer xin hủy: Đặt nhầm',
      });
    });

    it('quá hạn xác nhận → job hủy, hoàn tiền; chạy lại không hủy thêm', async () => {
      const { soA } = await paidOrder();
      await t.prisma.shopOrder.update({
        where: { id: soA.id },
        data: { confirmBefore: new Date(Date.now() - 1000) },
      });
      const jobs = t.app.get(OrderJobs);
      expect(await jobs.confirmTimeout()).toBe(1);
      expect(await jobs.confirmTimeout()).toBe(0);
      const so = await t.prisma.shopOrder.findUniqueOrThrow({ where: { id: soA.id } });
      expect(so).toMatchObject({ status: 'CANCELLED', cancelledBy: 'SYSTEM' });
    });

    it('shop bị đình chỉ → hủy đơn chưa bàn giao của shop; đơn chưa trả thì hủy cả đơn', async () => {
      const paid = await paidOrder();
      // Đơn thứ hai chưa trả
      const a = await addToCart(shirt.id, 1);
      const p = await preview({ itemIds: [a] }).expect(201);
      const unpaid = (await place(p.body.checkoutId).expect(201)).body.orderId as string;

      await t.prisma.$transaction((tx) =>
        t.app.get(ShopSuspensionEvents).apply(
          {
            shopId: shopA.id,
            action: 'SUSPEND',
            reason: 'Bán hàng giả',
            decidedBy: { userId: randomUUID(), name: 'Kiểm Duyệt' },
            decidedAt: new Date().toISOString(),
          },
          tx,
        ),
      );
      const o1 = await order(paid.orderId);
      expect(o1.shopOrders.find((s) => s.shopId === shopA.id)!.status).toBe('CANCELLED');
      expect(o1.shopOrders.find((s) => s.shopId === shopB.id)!.status).toBe('TO_CONFIRM');
      const o2 = await order(unpaid);
      expect(o2.shopOrders.every((s) => s.status === 'CANCELLED')).toBe(true);
      expect((await variant(shirt.id)).reserved).toBe(0);
    });
  });

  // ----- hết hạn, thanh toán -----

  describe('hết hạn và thanh toán', () => {
    it('job hết giữ tồn chỉ hủy đơn chưa trả quá hạn; chạy lại không hủy thêm', async () => {
      const first = await placeTwoShops();
      await pay(first.orderId);
      await t.prisma.order.update({
        where: { id: first.orderId },
        data: { holdUntil: new Date(Date.now() - 1000) },
      });
      const a = await addToCart(shirt.id, 1);
      const p = await preview({ itemIds: [a] }).expect(201);
      const second = (await place(p.body.checkoutId).expect(201)).body.orderId as string;
      await t.prisma.order.update({
        where: { id: second },
        data: { holdUntil: new Date(Date.now() - 1000) },
      });

      const jobs = t.app.get(OrderJobs);
      expect(await jobs.expireHolds()).toBe(1);
      expect(await jobs.expireHolds()).toBe(0);
      expect((await order(first.orderId)).shopOrders.every((s) => s.status === 'PENDING')).toBe(
        true,
      );
      const o2 = await order(second);
      expect(o2.shopOrders[0]).toMatchObject({
        status: 'CANCELLED',
        cancelReason: 'Hết hạn thanh toán.',
      });
    });

    it('POST /orders/{id}/pay: thiếu Idempotency-Key → 400; gọi payment-service; đơn đã hủy → 409', async () => {
      const { orderId } = await placeTwoShops();
      const url = `${API}/orders/${orderId}/pay`;
      expect((await t.http().post(url).set(auth(buyer)).expect(400)).body.code).toBe(
        'IDEMPOTENCY_KEY_REQUIRED',
      );
      t.payments.createPayment.mockResolvedValueOnce({
        paymentId: randomUUID(),
        attempt: 1,
        maxAttempts: 3,
        payUrl: 'http://localhost:5173/thanh-toan/mo-phong?ref=X',
        gateway: 'MOCK',
      });
      const res = await t
        .http()
        .post(url)
        .set(auth(buyer))
        .set('Idempotency-Key', randomUUID())
        .expect(200);
      expect(res.body).toMatchObject({
        attempt: 1,
        gateway: 'MOCK',
        payBefore: expect.any(String),
      });
      expect(t.payments.createPayment).toHaveBeenCalledWith(
        `Bearer ${buyer.token}`,
        expect.any(String),
        expect.objectContaining({ orderId }),
      );

      await t
        .http()
        .post(`${API}/orders/${orderId}/cancel`)
        .set(auth(buyer))
        .send({ reason: 'Đổi ý' });
      const r = await t
        .http()
        .post(url)
        .set(auth(buyer))
        .set('Idempotency-Key', randomUUID())
        .expect(409);
      expect(r.body.code).toBe('ORDER_NOT_PAYABLE');
    });

    it('danh sách đơn của tôi theo tab', async () => {
      const first = await placeTwoShops();
      const list = async (tab: string) =>
        (await t.http().get(`${API}/orders?tab=${tab}`).set(auth(buyer)).expect(200)).body.total;
      expect(await list('UNPAID')).toBe(1);
      await pay(first.orderId);
      await passCheck(first.orderId);
      expect(await list('UNPAID')).toBe(0);
      expect(await list('PROCESSING')).toBe(1);
      expect(await list('ALL')).toBe(1);
      expect(await list('CANCELLED')).toBe(0);
    });
  });

  // ----- admin -----

  describe('admin (SUPPORT)', () => {
    it('cần bộ quyền SUPPORT; hủy đơn đã trả có lý do và ghi nhật ký', async () => {
      const { orderId } = await placeTwoShops();
      await pay(orderId);
      const so = (await order(orderId)).shopOrders[0]!;
      await t
        .http()
        .get(`${API}/admin/orders`)
        .set(auth(makeUser('Tài Chính', ['FINANCE'])))
        .expect(403);
      const admin = makeUser('Hỗ Trợ', ['SUPPORT']);
      const found = await t
        .http()
        .get(`${API}/admin/orders?q=${so.code}`)
        .set(auth(admin))
        .expect(200);
      expect(found.body.items[0]).toMatchObject({ id: orderId, buyer: { id: buyer.id } });
      const res = await t
        .http()
        .post(`${API}/admin/orders/${orderId}/shop-orders/${so.id}/cancel`)
        .set(auth(admin))
        .send({ reason: 'Buyer gọi tổng đài nhờ hủy' })
        .expect(200);
      expect(res.body.shopOrders.find((s: { id: string }) => s.id === so.id)).toMatchObject({
        status: 'CANCELLED',
        cancelledBy: 'ADMIN',
      });
      const log = await t.prisma.auditLog.findFirst({ where: { action: 'CANCEL_ORDER' } });
      expect(log).toMatchObject({ actorId: admin.id, targetId: so.id });
    });
  });

  // ----- cấu hình -----

  describe('cấu hình chính sách (ADM-01)', () => {
    it('FINANCE xem, SYSTEM sửa tạo phiên bản mới, ghi nhật ký; đơn mới dùng giá trị mới', async () => {
      const fin = makeUser('Tài Chính', ['FINANCE']);
      const sys = makeUser('Quản Trị', ['SYSTEM']);
      const list = await t.http().get(`${API}/admin/settings`).set(auth(fin)).expect(200);
      expect(list.body.find((s: { key: string }) => s.key === 'payment_minutes')).toMatchObject({
        value: 15,
        version: 0,
      });
      await t
        .http()
        .put(`${API}/admin/settings/payment_minutes`)
        .set(auth(fin))
        .send({ value: 5, reason: 'Demo hết hạn' })
        .expect(403);
      // Hạn thanh toán không được dài hơn giữ tồn (20 phút)
      await t
        .http()
        .put(`${API}/admin/settings/payment_minutes`)
        .set(auth(sys))
        .send({ value: 30, reason: 'Thử dài hơn' })
        .expect(400);
      const res = await t
        .http()
        .put(`${API}/admin/settings/payment_minutes`)
        .set(auth(sys))
        .send({ value: 2, reason: 'Demo hết hạn nhanh' })
        .expect(200);
      expect(res.body).toMatchObject({ value: 2, version: 1, createdByName: 'Quản Trị' });
      const hist = await t
        .http()
        .get(`${API}/admin/settings/payment_minutes/history`)
        .set(auth(sys));
      expect(hist.body.map((h: { version: number }) => h.version)).toEqual([1, 0]);
      expect(await t.prisma.auditLog.count({ where: { action: 'UPDATE_SETTING' } })).toBe(1);

      const { orderId } = await placeTwoShops();
      const o = await order(orderId);
      const minutes = (o.payBefore!.getTime() - o.createdAt.getTime()) / 60_000;
      expect(Math.round(minutes)).toBe(2);
    });
  });
});
