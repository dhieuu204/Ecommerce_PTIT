import { randomUUID } from 'node:crypto';
import { NOTIFICATION_CREATED, type SanEvent } from '@san/shared';
import { Notifier } from '../src/notifications/notifier.service';
import { OrderLifecycle } from '../src/orders/order-lifecycle.service';
import { ReturnJobs } from '../src/returns/return.jobs';
import { ShopSuspensionEvents } from '../src/shop-admin/shop-suspension.events';
import { ShopsService } from '../src/shops/shops.service';
import type { ProductVariant, Shop } from '../generated/prisma';
import { makeProduct, makeShop } from './fixtures-p2';
import { API, createTestApp, describeDb, makeUser, resetDb, type TestApp } from './helpers';
import { resetRealtime } from './rt-fixtures';

type User = ReturnType<typeof makeUser>;

describeDb('Thông báo theo từng việc nghiệp vụ (P6: MSG-02)', () => {
  let t: TestApp;
  let buyer: User;
  let seller: User;
  let support: User;
  let shop: Shop;
  /** Áo 200.000đ */
  let shirt: ProductVariant;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    await resetRealtime(t.prisma);
    t.carrier.reset();
    buyer = makeUser('Người Mua');
    seller = makeUser('Chủ Shop');
    support = makeUser('Admin Hỗ Trợ', ['SUPPORT']);
    shop = await makeShop(t.prisma, seller.id, { name: 'Shop Áo Đẹp' });
    shirt = (
      await makeProduct(t.prisma, shop.id, {
        name: 'Áo thun',
        variants: [{ price: 200_000, stock: 10 }],
      })
    ).variants[0]!;
  });

  const auth = (u: User) => ({ Authorization: `Bearer ${u.token}` });
  const lifecycle = () => t.app.get(OrderLifecycle);
  const notes = (userId: string) =>
    t.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  const types = async (userId: string) => (await notes(userId)).map((n) => n.type);
  const created = async () =>
    (
      await t.prisma.outboxEvent.findMany({
        where: { type: NOTIFICATION_CREATED },
        orderBy: { createdAt: 'asc' },
      })
    ).map((e) => (e.payload as unknown as SanEvent<typeof NOTIFICATION_CREATED>).payload);
  const simulate = (shipmentId: string, event: string) =>
    t
      .http()
      .post(`${API}/admin/carrier-simulator/${shipmentId}/events`)
      .set(auth(support))
      .send({ event });

  /** Đặt 1 áo (trả trước), đã thanh toán hoặc chưa; `check` = qua kiểm tra → chờ shop xác nhận */
  async function placed(opts: { paid?: boolean; check?: boolean } = {}) {
    const { paid = true, check = true } = opts;
    const item = await t
      .http()
      .post(`${API}/cart/items`)
      .set(auth(buyer))
      .send({ variantId: shirt.id, quantity: 1 })
      .expect(201);
    const p = await t
      .http()
      .post(`${API}/checkout/preview`)
      .set(auth(buyer))
      .send({ itemIds: [item.body.itemId] })
      .expect(201);
    const res = await t
      .http()
      .post(`${API}/orders`)
      .set(auth(buyer))
      .send({ checkoutId: p.body.checkoutId })
      .expect(201);
    const orderId = res.body.orderId as string;
    const order = await t.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { shopOrders: true },
    });
    if (paid) {
      await t.prisma.$transaction((tx) =>
        lifecycle().markPaid(tx, {
          orderId,
          paymentId: randomUUID(),
          amount: order.total,
          paidAt: new Date().toISOString(),
          shopOrders: order.shopOrders.map((so) => ({
            shopOrderId: so.id,
            platformFeeRate: 500,
            platformFee: 10_000,
            sellerAmount: so.subtotal - 10_000,
          })),
        }),
      );
    }
    if (check) {
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
    const so = order.shopOrders[0]!;
    return { orderId, so };
  }

  async function delivered() {
    const d = await placed();
    await t.http().post(`${API}/shops/me/orders/${d.so.id}/confirm`).set(auth(seller)).expect(200);
    const sh = await t.prisma.shipment.findUniqueOrThrow({
      where: { shopOrderId_type: { shopOrderId: d.so.id, type: 'DELIVERY' } },
    });
    await simulate(sh.id, 'PICKED').expect(200);
    await simulate(sh.id, 'DELIVERED').expect(200);
    return d;
  }

  // ----- đơn con -----

  it('vòng đời đơn: shop có đơn mới; người mua nhận xác nhận, đang giao, đã giao (email), hoàn tất', async () => {
    const { orderId, so } = await placed();
    const shopNotes = await notes(seller.id);
    expect(shopNotes).toHaveLength(1);
    expect(shopNotes[0]).toMatchObject({
      type: 'SHOP_ORDER_NEW',
      title: 'Có đơn hàng mới',
      link: `/kenh-nguoi-ban/don-hang/${so.id}`,
    });
    expect(shopNotes[0]!.content).toContain(`Đơn ${so.code} (200.000đ tiền hàng)`);
    expect(await notes(buyer.id)).toHaveLength(0);

    await t.http().post(`${API}/shops/me/orders/${so.id}/confirm`).set(auth(seller)).expect(200);
    const sh = await t.prisma.shipment.findUniqueOrThrow({
      where: { shopOrderId_type: { shopOrderId: so.id, type: 'DELIVERY' } },
    });
    await simulate(sh.id, 'PICKED').expect(200);
    await simulate(sh.id, 'DELIVERED').expect(200);
    await t
      .http()
      .post(`${API}/orders/${orderId}/shop-orders/${so.id}/received`)
      .set(auth(buyer))
      .expect(200);

    const mine = await notes(buyer.id);
    expect(mine.map((n) => n.type)).toEqual([
      'ORDER_CONFIRMED',
      'ORDER_SHIPPING',
      'ORDER_DELIVERED',
      'ORDER_COMPLETED',
    ]);
    expect(mine.every((n) => n.link === `/tai-khoan/don-mua/${orderId}`)).toBe(true);
    expect(mine[0]!.content).toBe(
      `Shop Áo Đẹp đã xác nhận đơn ${so.code} và đang chuẩn bị hàng để giao cho GHN.`,
    );
    expect(mine[3]!.content).toContain('Hãy đánh giá sản phẩm');
    // Chỉ "đã giao" là loại có email
    const delivered = (await created()).find((e) => e.type === 'ORDER_DELIVERED')!;
    expect(delivered).toMatchObject({ userId: buyer.id, email: true });
    expect((await created()).find((e) => e.type === 'ORDER_CONFIRMED')!.email).toBe(false);
  });

  it('đơn chưa thanh toán/chưa qua kiểm tra: shop chưa được báo', async () => {
    await placed({ paid: false, check: false });
    expect(await notes(seller.id)).toHaveLength(0);
  });

  it('shop hủy: người mua nhận ORDER_CANCELLED (email, kèm số tiền hoàn), shop không tự báo mình', async () => {
    const { so } = await placed();
    await t
      .http()
      .post(`${API}/shops/me/orders/${so.id}/cancel`)
      .set(auth(seller))
      .send({ reason: 'Hết hàng trong kho.' })
      .expect(200);
    const [n] = await notes(buyer.id);
    expect(n).toMatchObject({ type: 'ORDER_CANCELLED', title: 'Đơn hàng đã bị hủy' });
    expect(n!.content).toBe(
      `Đơn ${so.code} của Shop Áo Đẹp đã bị hủy bởi shop. Lý do: Hết hàng trong kho. Sàn sẽ hoàn ${so.total.toLocaleString('vi-VN')}đ cho bạn.`,
    );
    expect(await types(seller.id)).toEqual(['SHOP_ORDER_NEW']);
    expect((await created()).find((e) => e.type === 'ORDER_CANCELLED')!.email).toBe(true);
  });

  it('người mua tự hủy: không báo người mua; shop nhận SHOP_ORDER_CANCELLED', async () => {
    const { orderId, so } = await placed();
    await t
      .http()
      .post(`${API}/orders/${orderId}/shop-orders/${so.id}/cancel`)
      .set(auth(buyer))
      .send({ reason: 'Đổi ý không mua nữa' })
      .expect(200);
    expect(await notes(buyer.id)).toHaveLength(0);
    const shopNotes = await notes(seller.id);
    expect(shopNotes.map((n) => n.type)).toEqual(['SHOP_ORDER_NEW', 'SHOP_ORDER_CANCELLED']);
    expect(shopNotes[1]!.content).toBe(
      `Đơn ${so.code} đã bị hủy bởi người mua. Lý do: Đổi ý không mua nữa.`,
    );
  });

  it('xin hủy đơn đã xác nhận → shop được báo; shop từ chối → người mua được báo', async () => {
    const { orderId, so } = await placed();
    await t.http().post(`${API}/shops/me/orders/${so.id}/confirm`).set(auth(seller)).expect(200);
    await t
      .http()
      .post(`${API}/orders/${orderId}/shop-orders/${so.id}/cancel`)
      .set(auth(buyer))
      .send({ reason: 'Đặt nhầm màu' })
      .expect(200);
    expect(await types(seller.id)).toEqual(['SHOP_ORDER_NEW', 'SHOP_ORDER_CANCEL_REQUESTED']);
    await t
      .http()
      .post(`${API}/shops/me/orders/${so.id}/cancel-request/decline`)
      .set(auth(seller))
      .send({ reason: 'Hàng đã đóng gói' })
      .expect(200);
    const last = (await notes(buyer.id)).at(-1)!;
    expect(last).toMatchObject({ type: 'ORDER_CONFIRMED', title: 'Shop từ chối yêu cầu hủy đơn' });
    expect(last.content).toContain('Hàng đã đóng gói');
  });

  it('hệ thống hủy đơn (không qua kiểm tra): báo người mua; shop chưa thấy đơn thì không báo shop', async () => {
    const { orderId } = await placed({ check: false });
    await t.prisma.$transaction((tx) =>
      lifecycle().applyCheck(tx, {
        orderId,
        checkId: randomUUID(),
        result: 'REJECTED',
        reason: 'Nghi gian lận',
        decidedBy: null,
        decidedAt: new Date().toISOString(),
      }),
    );
    expect(await types(buyer.id)).toEqual(['ORDER_CANCELLED']);
    expect((await notes(buyer.id))[0]!.content).toContain('Nghi gian lận');
    expect(await notes(seller.id)).toHaveLength(0);
  });

  // ----- hoàn tiền -----

  it('hoàn tiền xong (qua cổng hoặc hoàn tay): REFUND_DONE đúng một lần', async () => {
    const { orderId, so } = await placed();
    await t
      .http()
      .post(`${API}/shops/me/orders/${so.id}/cancel`)
      .set(auth(seller))
      .send({ reason: 'Hết hàng trong kho.' })
      .expect(200);
    const refund = (status: 'PROCESSING' | 'NEEDS_MANUAL' | 'SUCCEEDED' | 'MANUAL_DONE', at = 0) =>
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
    await refund('NEEDS_MANUAL', 1000);
    expect(await types(buyer.id)).toEqual(['ORDER_CANCELLED']);
    await refund('MANUAL_DONE', 2000);
    await refund('MANUAL_DONE', 3000);
    // Tin cũ tới sau: không áp, không báo
    await refund('SUCCEEDED', -60_000);
    const done = (await notes(buyer.id)).filter((n) => n.type === 'REFUND_DONE');
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({
      title: 'Hoàn tiền thành công',
      link: `/tai-khoan/don-mua/${orderId}`,
    });
    expect(done[0]!.content).toBe(
      `Sàn đã chuyển khoản hoàn ${so.total.toLocaleString('vi-VN')}đ cho đơn ${so.code}.`,
    );
  });

  // ----- trả hàng -----

  it('trả hàng: shop có yêu cầu mới; từ chối → người mua; phân xử → shop + người mua; hoàn xong', async () => {
    const { orderId, so } = await delivered();
    const items = await t.prisma.orderItem.findMany({ where: { shopOrderId: so.id } });
    const key = `return-images/${buyer.id}/${randomUUID()}.png`;
    t.storage.privateFiles.set(key, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const ret = await t
      .http()
      .post(`${API}/orders/${orderId}/shop-orders/${so.id}/returns`)
      .set(auth(buyer))
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [{ orderItemId: items[0]!.id, quantity: 1 }],
        reason: 'DEFECTIVE',
        description: 'Áo bị rách đường may ở vai, không mặc được',
        images: [key],
      })
      .expect(201);
    const returnId = ret.body.id as string;
    const shopNew = (await notes(seller.id)).find((n) => n.type === 'SHOP_RETURN_REQUESTED')!;
    expect(shopNew.link).toBe(`/kenh-nguoi-ban/tra-hang/${returnId}`);
    expect(shopNew.content).toContain(ret.body.code);

    await t
      .http()
      .post(`${API}/shops/me/returns/${returnId}/reject`)
      .set(auth(seller))
      .send({ reason: 'Áo còn nguyên tem, không lỗi gì' })
      .expect(200);
    const rejected = (await notes(buyer.id)).at(-1)!;
    expect(rejected).toMatchObject({
      type: 'RETURN_REJECTED',
      link: `/tai-khoan/tra-hang/${returnId}`,
    });
    expect(rejected.content).toContain('Áo còn nguyên tem, không lỗi gì');

    await t
      .http()
      .post(`${API}/returns/${returnId}/dispute`)
      .set(auth(buyer))
      .send({ statement: 'Áo rách thật, tôi có ảnh chụp lúc mở hộp ra.' })
      .expect(200);
    await t.prisma.$transaction((tx) =>
      t.app.get(ReturnJobs).onDisputeDecided(tx, {
        disputeId: randomUUID(),
        returnId,
        stage: 'REQUEST_REJECTED',
        decision: 'REFUND',
        refundAmount: 100_000,
        note: 'Ảnh cho thấy áo rách.',
        decidedBy: { userId: support.id, name: support.name },
        decidedAt: new Date().toISOString(),
      }),
    );
    const result = (await notes(seller.id)).find((n) => n.type === 'SHOP_RETURN_RESULT')!;
    expect(result.content).toContain('hoàn 100.000đ cho người mua');
    const buyerTypes = await types(buyer.id);
    expect(buyerTypes).toContain('RETURN_REFUNDING');
    // Đơn hoàn tất do yêu cầu trả hàng có kết quả: không gửi thêm "hãy đánh giá"
    expect(buyerTypes).not.toContain('ORDER_COMPLETED');

    await t.prisma.$transaction((tx) =>
      lifecycle().applyRefund(tx, {
        refundId: randomUUID(),
        orderId,
        shopOrderId: so.id,
        returnId,
        amount: 100_000,
        status: 'SUCCEEDED',
        updatedAt: new Date(Date.now() + 1000).toISOString(),
      }),
    );
    const refunded = (await notes(buyer.id)).at(-1)!;
    expect(refunded).toMatchObject({
      type: 'REFUND_DONE',
      link: `/tai-khoan/tra-hang/${returnId}`,
    });
    expect(refunded.content).toContain('100.000đ');
  });

  // ----- shop, rút tiền -----

  it('duyệt shop / từ chối: báo chủ shop (có email), đúng đường dẫn', async () => {
    const owner = makeUser('Chủ Shop Mới');
    const pending = await t.prisma.shop.create({
      data: { ownerId: owner.id, status: 'PENDING', name: 'Shop Mới' },
    });
    await t.prisma.shopApplication.create({
      data: {
        shopId: pending.id,
        version: 1,
        type: 'REGISTER',
        status: 'PENDING',
        data: { name: 'Shop Mới' },
        requestKey: randomUUID(),
      },
    });
    const decide = (version: number, decision: 'APPROVED' | 'REJECTED', reason: string | null) =>
      t.prisma.$transaction((tx) =>
        t.app.get(ShopsService).applyDecision(
          {
            shopId: pending.id,
            version,
            type: 'REGISTER',
            decision,
            reason,
            decidedBy: { userId: support.id, name: 'Admin' },
            decidedAt: new Date().toISOString(),
          },
          tx,
        ),
      );
    await decide(1, 'REJECTED', 'Logo không rõ.');
    await decide(1, 'REJECTED', 'Logo không rõ.'); // tin trùng: bỏ qua, không báo lại
    let mine = await notes(owner.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      type: 'SHOP_REJECTED',
      title: 'Hồ sơ mở shop chưa được duyệt',
      link: '/tai-khoan/shop',
    });
    expect(mine[0]!.content).toContain('Logo không rõ');

    await t.prisma.shopApplication.create({
      data: {
        shopId: pending.id,
        version: 2,
        type: 'REGISTER',
        status: 'PENDING',
        data: { name: 'Shop Mới' },
        requestKey: randomUUID(),
      },
    });
    await decide(2, 'APPROVED', null);
    mine = await notes(owner.id);
    expect(mine[1]).toMatchObject({
      type: 'SHOP_APPROVED',
      title: 'Shop đã được duyệt',
      link: '/kenh-nguoi-ban',
    });
    const ev = (await created()).filter((e) => e.userId === owner.id);
    expect(ev.map((e) => e.email)).toEqual([true, true]);
  });

  it('đình chỉ shop: báo chủ shop; đơn đang mở bị hủy thì báo cả người mua và shop', async () => {
    const { so } = await placed();
    await t.prisma.$transaction((tx) =>
      t.app.get(ShopSuspensionEvents).apply(
        {
          shopId: shop.id,
          action: 'SUSPEND',
          reason: 'Bán hàng giả',
          decidedBy: { userId: support.id, name: 'Admin' },
          decidedAt: new Date().toISOString(),
        },
        tx,
      ),
    );
    expect(await types(seller.id)).toEqual([
      'SHOP_ORDER_NEW',
      'SHOP_ORDER_CANCELLED',
      'SHOP_SUSPENDED',
    ]);
    const suspended = (await notes(seller.id)).at(-1)!;
    expect(suspended.content).toContain('Bán hàng giả');
    expect(suspended.link).toBe('/kenh-nguoi-ban/ho-so-shop');
    const [cancelled] = await notes(buyer.id);
    expect(cancelled).toMatchObject({ type: 'ORDER_CANCELLED' });
    expect(cancelled!.content).toContain(`Đơn ${so.code}`);
    expect(cancelled!.content).toContain('Shop tạm ngừng bán');

    await t.prisma.$transaction((tx) =>
      t.app.get(ShopSuspensionEvents).apply(
        {
          shopId: shop.id,
          action: 'RESTORE',
          reason: 'Đã xác minh nguồn hàng',
          decidedBy: { userId: support.id, name: 'Admin' },
          decidedAt: new Date(Date.now() + 1000).toISOString(),
        },
        tx,
      ),
    );
    expect((await types(seller.id)).at(-1)).toBe('SHOP_RESTORED');
  });

  it('withdrawal.updated: báo chủ shop đúng loại, số tiền định dạng, có email khi quan trọng', async () => {
    const notifier = t.app.get(Notifier);
    for (const [status, reason] of [
      ['APPROVED', null],
      ['PAID', null],
      ['REJECTED', 'Thiếu chứng từ'],
      ['FAILED', 'Sai số tài khoản'],
    ] as const) {
      await t.prisma.$transaction((tx) =>
        notifier.withdrawal(tx, {
          withdrawalId: randomUUID(),
          shopId: shop.id,
          ownerId: seller.id,
          amount: 1_250_000,
          status,
          reason,
          updatedAt: new Date().toISOString(),
        }),
      );
    }
    const mine = await notes(seller.id);
    expect(mine.map((n) => n.type)).toEqual([
      'WITHDRAWAL_APPROVED',
      'WITHDRAWAL_PAID',
      'WITHDRAWAL_REJECTED',
      'WITHDRAWAL_FAILED',
    ]);
    expect(mine.every((n) => n.link === '/kenh-nguoi-ban/tai-chinh')).toBe(true);
    expect(mine[1]!.content).toBe(
      'Sàn đã chuyển khoản 1.250.000đ tới tài khoản ngân hàng của shop.',
    );
    expect(mine[2]!.content).toContain('Thiếu chứng từ');
    expect((await created()).map((e) => e.email)).toEqual([false, true, true, true]);
  });
});
