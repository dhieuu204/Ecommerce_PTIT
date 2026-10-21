import { randomUUID } from 'node:crypto';
import type {
  CancelActor,
  OrderPaymentStatus,
  ProductVariant,
  ReturnStatus,
  Shop,
  ShopOrderStatus,
} from '../generated/prisma';
import { makeProduct, makeShop } from './fixtures-p2';
import { API, createTestApp, describeDb, makeUser, resetDb, type TestApp } from './helpers';

type User = ReturnType<typeof makeUser>;

/** Một đơn con mẫu ghi thẳng vào database (mỗi đơn tổng một đơn con, trừ khi cần voucher sàn) */
interface OrderSpec {
  shop: Shop;
  /** Lúc đặt (UTC) */
  at: string;
  status: ShopOrderStatus;
  items: Array<{ variant: ProductVariant; price: number; quantity: number }>;
  paymentStatus?: OrderPaymentStatus;
  shopDiscount?: number;
  shopVoucherId?: string;
  platformVoucherId?: string;
  platformDiscount?: number;
  delivered?: boolean;
  cancelledBy?: CancelActor;
  /** Lúc hủy (mặc định sau lúc đặt 20 phút) */
  cancelledAt?: string;
  /** Hạn thanh toán (mặc định sau lúc đặt 15 phút với đơn chưa trả) */
  payBefore?: string | null;
  ret?: {
    status: ReturnStatus;
    refundAmount: number;
    sellerBase: number;
    decidedRefund?: number;
    platformCovers?: boolean;
  };
}

describeDb('Báo cáo vận hành (P6: RPT-01)', () => {
  let t: TestApp;
  let sellerA: User;
  let sellerB: User;
  let shopA: Shop;
  let shopB: Shop;
  let p1: ProductVariant;
  let p2: ProductVariant;
  let p3: ProductVariant;
  let p4: ProductVariant;
  let v1: string;
  let pv: string;
  let seq = 0;

  const auth = (u: User) => ({ Authorization: `Bearer ${u.token}` });
  const buyer = makeUser('Người Mua');

  async function place(s: OrderSpec): Promise<string> {
    const at = new Date(s.at);
    const subtotal = s.items.reduce((a, i) => a + i.price * i.quantity, 0);
    const paymentStatus = s.paymentStatus ?? 'PAID';
    const code = `2610${String(++seq).padStart(2, '0')}${randomUUID().slice(0, 6).toUpperCase()}`;
    const payBefore =
      s.payBefore !== undefined
        ? s.payBefore && new Date(s.payBefore)
        : paymentStatus === 'UNPAID'
          ? new Date(at.getTime() + 15 * 60_000)
          : null;
    const order = await t.prisma.order.create({
      data: {
        code,
        buyerId: buyer.id,
        buyerName: buyer.name,
        buyerEmail: buyer.email,
        paymentMethod: paymentStatus === 'COD' ? 'COD' : 'VNPAY',
        receiverName: 'Người Mua',
        receiverPhone: '0987654321',
        provinceId: 90001,
        districtId: 90101,
        wardCode: '9010101',
        address: '1 Điện Biên Phủ, Hà Nội',
        platformVoucherId: s.platformVoucherId ?? null,
        platformDiscount: s.platformDiscount ?? 0,
        subtotal,
        shippingFee: 30_000,
        total: subtotal + 30_000,
        paymentStatus,
        checkStatus: 'PASSED',
        payBefore,
        createdAt: at,
      },
    });
    const cancelled = s.status === 'CANCELLED';
    const so = await t.prisma.shopOrder.create({
      data: {
        code: `${code}-1`,
        orderId: order.id,
        shopId: s.shop.id,
        shopName: s.shop.name ?? '',
        status: s.status,
        subtotal,
        shopVoucherId: s.shopVoucherId ?? null,
        shopDiscount: s.shopDiscount ?? 0,
        platformDiscount: s.platformDiscount ?? 0,
        shippingFee: 30_000,
        shippingFeeSource: 'FIXED',
        total: subtotal - (s.shopDiscount ?? 0) - (s.platformDiscount ?? 0) + 30_000,
        cancelledBy: cancelled ? (s.cancelledBy ?? 'SELLER') : null,
        cancelledAt: cancelled ? new Date(s.cancelledAt ?? at.getTime() + 20 * 60_000) : null,
        deliveredAt: s.delivered ? new Date(at.getTime() + 2 * 86_400_000) : null,
        createdAt: at,
      },
    });
    for (const i of s.items) {
      await t.prisma.orderItem.create({
        data: {
          shopOrderId: so.id,
          productId: i.variant.productId,
          variantId: i.variant.id,
          productName: 'Tên lúc đặt',
          variantName: '',
          image: `http://localhost:9000/san-public/p/${i.variant.productId}.png`,
          price: i.price,
          quantity: i.quantity,
          weight: 500,
        },
      });
    }
    if (s.ret) {
      await t.prisma.returnRequest.create({
        data: {
          code: `${code}-1-TH`,
          shopOrderId: so.id,
          orderId: order.id,
          shopId: s.shop.id,
          buyerId: buyer.id,
          status: s.ret.status,
          reason: 'DEFECTIVE',
          description: 'Hàng lỗi không dùng được',
          refundAmount: s.ret.refundAmount,
          sellerBase: s.ret.sellerBase,
          decidedRefund: s.ret.decidedRefund ?? null,
          platformCovers: s.ret.platformCovers ?? false,
          requestKey: randomUUID(),
        },
      });
    }
    return so.id;
  }

  async function voucher(shopId: string | null, code: string): Promise<string> {
    const v = await t.prisma.voucher.create({
      data: {
        shopId,
        code,
        name: `Voucher ${code}`,
        discountType: 'AMOUNT',
        value: 30_000,
        startAt: new Date('2026-09-01T00:00:00Z'),
        endAt: new Date('2026-12-01T00:00:00Z'),
        quantity: 100,
        createdBy: randomUUID(),
      },
    });
    return v.id;
  }

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    seq = 0;
    sellerA = makeUser('Chủ Shop A');
    sellerB = makeUser('Chủ Shop B');
    shopA = await makeShop(t.prisma, sellerA.id, { name: 'Shop A' });
    shopB = await makeShop(t.prisma, sellerB.id, { name: 'Shop B' });
    p1 = (await makeProduct(t.prisma, shopA.id, { name: 'Áo thun' })).variants[0]!;
    p2 = (await makeProduct(t.prisma, shopA.id, { name: 'Tai nghe' })).variants[0]!;
    p3 = (await makeProduct(t.prisma, shopA.id, { name: 'Ốp lưng' })).variants[0]!;
    p4 = (await makeProduct(t.prisma, shopB.id, { name: 'Điện thoại' })).variants[0]!;
    v1 = await voucher(shopA.id, 'SHOPA30');
    pv = await voucher(null, 'SAN50');
  });

  /**
   * Dữ liệu mẫu, khoảng báo cáo 01–03/10/2026 giờ Việt Nam (= 30/09 17:00 UTC tới 03/10 17:00 UTC).
   * Shop A: 6 đơn trong khoảng, 1 đơn hết hạn thanh toán (bỏ), 2 đơn ngoài khoảng sát nửa đêm.
   * Shop B: 2 đơn hoàn tất (1 có voucher sàn, 1 trả hàng sàn chịu).
   */
  async function seed() {
    // Ngoài khoảng: 23:59:59 ngày 30/09 giờ Việt Nam
    await place({
      shop: shopA,
      at: '2026-09-30T16:59:59Z',
      status: 'COMPLETED',
      delivered: true,
      items: [{ variant: p1, price: 999_000, quantity: 1 }],
    });
    // 00:00 ngày 01/10: hoàn tất, voucher shop 30.000, trả 1 áo đã hoàn đủ (tiền hàng sau voucher 135.000)
    await place({
      shop: shopA,
      at: '2026-09-30T17:00:00Z',
      status: 'COMPLETED',
      delivered: true,
      shopVoucherId: v1,
      shopDiscount: 30_000,
      items: [{ variant: p1, price: 150_000, quantity: 2 }],
      ret: {
        status: 'REFUNDED',
        refundAmount: 135_000,
        sellerBase: 135_000,
        decidedRefund: 135_000,
      },
    });
    // 23:59 ngày 01/10: hoàn tất, trả hàng hoàn một phần 100.000/200.000 → bớt 100.000 tiền hàng
    await place({
      shop: shopA,
      at: '2026-10-01T16:59:00Z',
      status: 'COMPLETED',
      delivered: true,
      items: [{ variant: p2, price: 200_000, quantity: 1 }],
      ret: {
        status: 'REFUNDED',
        refundAmount: 200_000,
        sellerBase: 200_000,
        decidedRefund: 100_000,
      },
    });
    // 00:00 ngày 02/10: shop hủy đơn đã trả (dùng voucher shop: không tính vào hiệu quả voucher)
    await place({
      shop: shopA,
      at: '2026-10-01T17:00:00Z',
      status: 'CANCELLED',
      cancelledBy: 'SELLER',
      shopVoucherId: v1,
      shopDiscount: 10_000,
      items: [{ variant: p1, price: 20_000, quantity: 5 }],
    });
    // 02/10: trả trước chưa thanh toán, hệ thống hủy khi hết hạn → bỏ hẳn khỏi báo cáo
    await place({
      shop: shopA,
      at: '2026-10-02T03:00:00Z',
      status: 'CANCELLED',
      paymentStatus: 'UNPAID',
      cancelledBy: 'SYSTEM',
      items: [{ variant: p3, price: 500_000, quantity: 1 }],
    });
    // 02/10: người mua tự hủy trước khi trả → vẫn là đơn bị hủy
    await place({
      shop: shopA,
      at: '2026-10-02T04:00:00Z',
      status: 'CANCELLED',
      paymentStatus: 'UNPAID',
      cancelledBy: 'BUYER',
      cancelledAt: '2026-10-02T04:05:00Z',
      items: [{ variant: p3, price: 50_000, quantity: 1 }],
    });
    // 03/10: COD đã giao, yêu cầu trả hàng đang chờ (chưa hoàn) → không tính trả hàng
    await place({
      shop: shopA,
      at: '2026-10-03T02:00:00Z',
      status: 'DELIVERED',
      paymentStatus: 'COD',
      delivered: true,
      items: [{ variant: p2, price: 40_000, quantity: 3 }],
      ret: { status: 'REQUESTED', refundAmount: 40_000, sellerBase: 40_000 },
    });
    // 23:59 ngày 03/10: trả trước đang trong hạn thanh toán → vẫn tính là đã đặt
    await place({
      shop: shopA,
      at: '2026-10-03T16:59:00Z',
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      payBefore: '2026-10-03T17:14:00Z',
      items: [{ variant: p3, price: 80_000, quantity: 1 }],
    });
    // Ngoài khoảng: 00:00 ngày 04/10
    await place({
      shop: shopA,
      at: '2026-10-03T17:00:00Z',
      status: 'COMPLETED',
      delivered: true,
      items: [{ variant: p1, price: 777_000, quantity: 1 }],
    });
    // Shop B 02/10: hoàn tất, voucher sàn 50.000 (sàn chịu, không trừ doanh số shop)
    await place({
      shop: shopB,
      at: '2026-10-02T05:00:00Z',
      status: 'COMPLETED',
      delivered: true,
      platformVoucherId: pv,
      platformDiscount: 50_000,
      items: [{ variant: p4, price: 1_000_000, quantity: 1 }],
    });
    // Shop B 03/10: hoàn tất, trả hàng đã hoàn nhưng sàn chịu (kiện trả thất lạc) → doanh số giữ nguyên
    await place({
      shop: shopB,
      at: '2026-10-03T05:00:00Z',
      status: 'COMPLETED',
      delivered: true,
      items: [{ variant: p4, price: 400_000, quantity: 1 }],
      ret: {
        status: 'REFUNDED',
        refundAmount: 400_000,
        sellerBase: 400_000,
        decidedRefund: 400_000,
        platformCovers: true,
      },
    });
  }

  const RANGE = { from: '2026-10-01', to: '2026-10-03' };

  it('seller: số của shop mình theo đúng định nghĩa, theo ngày giờ Việt Nam ở ranh giới nửa đêm', async () => {
    await seed();
    const res = await t
      .http()
      .get(`${API}/shops/me/reports/operations`)
      .query(RANGE)
      .set(auth(sellerA))
      .expect(200);
    const r = res.body;
    expect(r.range).toEqual({ from: '2026-10-01', to: '2026-10-03', days: 3 });
    expect(r.summary).toEqual({
      orderCount: 6,
      orderValue: 850_000,
      completedCount: 2,
      // (300.000 − 30.000 − 135.000) + (200.000 − 100.000)
      revenue: 235_000,
      cancelledCount: 2,
      cancelRate: 333,
      deliveredCount: 3,
      returnedCount: 2,
      returnRate: 667,
    });
    expect(r.daily).toEqual([
      { date: '2026-10-01', orderCount: 2, orderValue: 500_000 },
      { date: '2026-10-02', orderCount: 2, orderValue: 150_000 },
      { date: '2026-10-03', orderCount: 2, orderValue: 200_000 },
    ]);
    expect(
      r.topProducts.map((p: { name: string; quantity: number; amount: number }) => [
        p.name,
        p.quantity,
        p.amount,
      ]),
    ).toEqual([
      ['Tai nghe', 4, 320_000],
      ['Áo thun', 2, 300_000],
      ['Ốp lưng', 1, 80_000],
    ]);
    expect(r.topProducts[0]).toMatchObject({ shopId: shopA.id, shopName: 'Shop A' });
    expect(r.vouchers).toEqual([
      {
        voucherId: v1,
        code: 'SHOPA30',
        name: 'Voucher SHOPA30',
        scope: 'SHOP',
        shopId: shopA.id,
        shopName: 'Shop A',
        orderCount: 1,
        discountTotal: 30_000,
        orderValue: 300_000,
      },
    ]);
    expect(r.shopCount).toBeUndefined();
    expect(r.topShops).toBeUndefined();
  });

  it('seller chỉ thấy shop mình', async () => {
    await seed();
    const r = (
      await t
        .http()
        .get(`${API}/shops/me/reports/operations`)
        .query(RANGE)
        .set(auth(sellerB))
        .expect(200)
    ).body;
    expect(r.summary).toMatchObject({
      orderCount: 2,
      orderValue: 1_400_000,
      completedCount: 2,
      revenue: 1_400_000,
      cancelledCount: 0,
      cancelRate: 0,
      deliveredCount: 2,
      returnedCount: 1,
      returnRate: 500,
    });
    expect(r.topProducts.map((p: { name: string }) => p.name)).toEqual(['Điện thoại']);
    // Voucher sàn không hiện trong báo cáo của shop
    expect(r.vouchers).toEqual([]);
  });

  it('admin: cả sàn, số shop có đơn, 10 shop hàng đầu, voucher sàn', async () => {
    await seed();
    const system = makeUser('Admin Hệ Thống', ['SYSTEM']);
    const r = (
      await t
        .http()
        .get(`${API}/admin/reports/operations`)
        .query(RANGE)
        .set(auth(system))
        .expect(200)
    ).body;
    expect(r.summary).toEqual({
      orderCount: 8,
      orderValue: 2_250_000,
      completedCount: 4,
      revenue: 1_635_000,
      cancelledCount: 2,
      cancelRate: 250,
      deliveredCount: 5,
      returnedCount: 3,
      returnRate: 600,
    });
    expect(r.shopCount).toBe(2);
    expect(r.topShops).toEqual([
      {
        shopId: shopB.id,
        name: 'Shop B',
        orderCount: 2,
        orderValue: 1_400_000,
        revenue: 1_400_000,
      },
      { shopId: shopA.id, name: 'Shop A', orderCount: 6, orderValue: 850_000, revenue: 235_000 },
    ]);
    expect(r.daily.map((d: { orderCount: number }) => d.orderCount)).toEqual([2, 3, 3]);
    expect(
      r.topProducts.map((p: { name: string; quantity: number }) => [p.name, p.quantity]),
    ).toEqual([
      ['Tai nghe', 4],
      ['Điện thoại', 2],
      ['Áo thun', 2],
      ['Ốp lưng', 1],
    ]);
    expect(
      r.vouchers.map(
        (v: {
          code: string;
          scope: string;
          orderCount: number;
          discountTotal: number;
          orderValue: number;
        }) => [v.code, v.scope, v.orderCount, v.discountTotal, v.orderValue],
      ),
    ).toEqual([
      ['SAN50', 'PLATFORM', 1, 50_000, 1_000_000],
      ['SHOPA30', 'SHOP', 1, 30_000, 300_000],
    ]);
    expect(r.vouchers[0]).toMatchObject({ shopId: null, shopName: null });

    // Bộ quyền Tài chính cũng xem được
    const finance = makeUser('Kế Toán', ['FINANCE']);
    await t
      .http()
      .get(`${API}/admin/reports/operations`)
      .query(RANGE)
      .set(auth(finance))
      .expect(200);
  });

  it('mặc định 30 ngày gần nhất, ngày không có đơn trả 0', async () => {
    await place({
      shop: shopA,
      at: new Date().toISOString(),
      status: 'TO_CONFIRM',
      items: [{ variant: p1, price: 100_000, quantity: 1 }],
    });
    const r = (
      await t.http().get(`${API}/shops/me/reports/operations`).set(auth(sellerA)).expect(200)
    ).body;
    expect(r.range.days).toBe(30);
    expect(r.daily).toHaveLength(30);
    expect(r.daily[29]).toMatchObject({ orderCount: 1, orderValue: 100_000 });
    expect(r.daily[0]).toMatchObject({ orderCount: 0, orderValue: 0 });
    expect(r.summary).toMatchObject({ orderCount: 1, cancelRate: 0, returnRate: 0, revenue: 0 });
  });

  it('khoảng ngày sai → 400 INVALID_RANGE; sai dạng → 400 VALIDATION_ERROR', async () => {
    const get = (query: Record<string, string>) =>
      t.http().get(`${API}/shops/me/reports/operations`).query(query).set(auth(sellerA));
    expect((await get({ from: '2026-10-05', to: '2026-10-01' }).expect(400)).body.code).toBe(
      'INVALID_RANGE',
    );
    expect((await get({ from: '2025-01-01', to: '2026-01-02' }).expect(400)).body.code).toBe(
      'INVALID_RANGE',
    );
    expect((await get({ from: '2026-02-30', to: '2026-03-02' }).expect(400)).body.code).toBe(
      'INVALID_RANGE',
    );
    expect((await get({ from: '01/10/2026' }).expect(400)).body.code).toBe('VALIDATION_ERROR');
    await get({ from: '2025-01-02', to: '2026-01-02' }).expect(200);
  });

  it('quyền: chưa có shop / shop chưa duyệt → 409; admin sai bộ quyền → 403; chưa đăng nhập → 401', async () => {
    const noShop = makeUser('Chưa Có Shop');
    expect(
      (await t.http().get(`${API}/shops/me/reports/operations`).set(auth(noShop)).expect(409)).body
        .code,
    ).toBe('SHOP_NOT_ACTIVE');
    const pendingOwner = makeUser('Shop Chờ Duyệt');
    await makeShop(t.prisma, pendingOwner.id, { status: 'PENDING', name: null });
    await t.http().get(`${API}/shops/me/reports/operations`).set(auth(pendingOwner)).expect(409);
    // Shop bị đình chỉ vẫn xem được báo cáo của mình
    await t.prisma.shop.update({ where: { id: shopA.id }, data: { status: 'SUSPENDED' } });
    await t.http().get(`${API}/shops/me/reports/operations`).set(auth(sellerA)).expect(200);

    for (const perms of [[], ['MODERATION'], ['SUPPORT']] as const) {
      const u = makeUser('Admin Khác', [...perms]);
      expect(
        (await t.http().get(`${API}/admin/reports/operations`).set(auth(u)).expect(403)).body.code,
      ).toBe('FORBIDDEN');
    }
    await t.http().get(`${API}/admin/reports/operations`).expect(401);
    await t.http().get(`${API}/shops/me/reports/operations`).expect(401);
  });
});
