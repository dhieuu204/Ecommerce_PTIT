import type { AffiliateDecidedPayload } from '@san/shared';
import { randomUUID } from 'node:crypto';
import type { Affiliate, Product, ProductVariant, Shop } from '../generated/prisma';
import { AffiliatesService } from '../src/affiliates/affiliates.service';
import { makeProduct, makeShop } from './fixtures-p2';
import { API, createTestApp, describeDb, makeUser, resetDb, type TestApp } from './helpers';

type User = ReturnType<typeof makeUser>;

const APPLICATION = {
  displayName: 'Review Công Nghệ',
  channels: ['https://www.tiktok.com/@reviewcongnghe'],
  phone: '0912345678',
  bankAccount: {
    bankName: 'Vietcombank',
    accountNumber: '0123456789',
    accountName: 'tran thi binh',
  },
};

describeDb('Cộng tác viên (P7: AFF-01..06)', () => {
  let t: TestApp;
  let buyer: User;
  let seller: User;
  let ctv: User;
  let shop: Shop;
  /** Điện thoại 1.000.000đ, hoa hồng 5% */
  let phone: { product: Product; variant: ProductVariant };
  /** Ốp lưng 100.000đ, chưa bật hoa hồng */
  let caseItem: { product: Product; variant: ProductVariant };

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    buyer = makeUser('Người Mua');
    seller = makeUser('Chủ Shop');
    ctv = makeUser('Trần Thị Bình');
    shop = await makeShop(t.prisma, seller.id, { name: 'Táo Xanh' });
    const p1 = await makeProduct(t.prisma, shop.id, {
      name: 'iPhone 15',
      variants: [{ price: 1_000_000, stock: 10 }],
    });
    phone = { product: p1.product, variant: p1.variants[0]! };
    const p2 = await makeProduct(t.prisma, shop.id, {
      name: 'Ốp lưng',
      variants: [{ price: 100_000, stock: 10 }],
    });
    caseItem = { product: p2.product, variant: p2.variants[0]! };
  });

  const auth = (u: User) => ({ Authorization: `Bearer ${u.token}` });
  const service = () => t.app.get(AffiliatesService);
  const decide = (
    p: Partial<AffiliateDecidedPayload> & Pick<AffiliateDecidedPayload, 'affiliateId' | 'action'>,
  ) =>
    t.prisma.$transaction((tx) =>
      service().applyDecision(
        {
          version: p.action === 'APPROVE' || p.action === 'REJECT' ? 1 : null,
          reason: p.action === 'APPROVE' ? null : 'Lý do thử nghiệm.',
          decidedBy: { userId: randomUUID(), name: 'Admin' },
          decidedAt: new Date().toISOString(),
          ...p,
        },
        tx,
      ),
    );
  const submit = (u: User = ctv, key = randomUUID()) =>
    t
      .http()
      .post(`${API}/affiliates/me/application`)
      .set(auth(u))
      .set('Idempotency-Key', key)
      .send(APPLICATION);

  /** CTV đã được duyệt */
  async function activeAffiliate(u: User = ctv): Promise<Affiliate> {
    const res = await submit(u).expect(201);
    await decide({ affiliateId: res.body.affiliate.id, action: 'APPROVE' });
    return t.prisma.affiliate.findUniqueOrThrow({ where: { id: res.body.affiliate.id } });
  }

  const setRate = (productIds: string[], rate: number | null, u: User = seller) =>
    t.http().put(`${API}/shops/me/product-commissions`).set(auth(u)).send({ productIds, rate });

  const click = (code: string, body: object, u?: User) => {
    const req = t.http().post(`${API}/affiliate-clicks`);
    if (u) req.set(auth(u));
    return req.send({ code, ...body });
  };

  async function order(items: Array<[string, number]>, clickIds: string[] = [], u: User = buyer) {
    const ids: string[] = [];
    for (const [variantId, quantity] of items) {
      const r = await t.http().post(`${API}/cart/items`).set(auth(u)).send({ variantId, quantity });
      ids.push(r.body.itemId as string);
    }
    const p = await t
      .http()
      .post(`${API}/checkout/preview`)
      .set(auth(u))
      .send({ itemIds: ids, paymentMethod: 'COD' })
      .expect(201);
    const res = await t
      .http()
      .post(`${API}/orders`)
      .set(auth(u))
      .send({ checkoutId: p.body.checkoutId, affiliateClickIds: clickIds })
      .expect(201);
    return t.prisma.shopOrder.findFirstOrThrow({
      where: { orderId: res.body.orderId },
      include: { items: { orderBy: { price: 'desc' } } },
    });
  }

  describe('hồ sơ CTV (AFF-01)', () => {
    it('chưa đăng ký thì status NONE', async () => {
      const res = await t.http().get(`${API}/affiliates/me`).set(auth(ctv)).expect(200);
      expect(res.body).toEqual({ status: 'NONE', affiliate: null });
    });

    it('nộp hồ sơ → PENDING, gửi approval sự kiện chỉ có 4 số cuối tài khoản', async () => {
      const res = await submit().expect(201);
      expect(res.body.status).toBe('PENDING');
      expect(res.body.affiliate.bankAccount.accountName).toBe('TRAN THI BINH');
      const ev = await t.prisma.outboxEvent.findFirstOrThrow({
        where: { type: 'affiliate_application.submitted' },
      });
      const payload = (ev.payload as { payload: Record<string, unknown> }).payload;
      expect(payload).toMatchObject({
        version: 1,
        user: { userId: ctv.id },
        data: { bankAccount: { accountNumberMasked: '****6789' } },
      });
      expect(JSON.stringify(payload)).not.toContain('0123456789');
    });

    it('gửi lại cùng mã thì trả hồ sơ cũ; đang chờ duyệt thì không nộp được nữa', async () => {
      const key = randomUUID();
      await submit(ctv, key).expect(201);
      await submit(ctv, key).expect(201);
      expect(await t.prisma.outboxEvent.count()).toBe(1);
      const again = await submit().expect(409);
      expect(again.body.code).toBe('AFFILIATE_APPLICATION_NOT_ALLOWED');
    });

    it('bị từ chối thì nộp lại được, phiên bản tăng; quyết định của bản cũ bị bỏ qua', async () => {
      const first = await submit().expect(201);
      const id = first.body.affiliate.id as string;
      await decide({ affiliateId: id, action: 'REJECT', version: 1 });
      expect((await t.prisma.affiliate.findUniqueOrThrow({ where: { id } })).status).toBe(
        'REJECTED',
      );
      const second = await submit().expect(201);
      expect(second.body.affiliate.version).toBe(2);
      await decide({ affiliateId: id, action: 'APPROVE', version: 1 });
      expect((await t.prisma.affiliate.findUniqueOrThrow({ where: { id } })).status).toBe(
        'PENDING',
      );
      await decide({ affiliateId: id, action: 'APPROVE', version: 2 });
      const a = await t.prisma.affiliate.findUniqueOrThrow({ where: { id } });
      expect(a.status).toBe('ACTIVE');
      expect(a.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
      const notes = await t.prisma.notification.findMany({ where: { userId: ctv.id } });
      expect(notes.map((n) => n.type).sort()).toEqual(['AFFILIATE_APPROVED', 'AFFILIATE_REJECTED']);
    });

    it('khóa/mở: quyết định cũ tới sau không ghi đè quyết định mới', async () => {
      const a = await activeAffiliate();
      const later = new Date();
      const earlier = new Date(later.getTime() - 60_000);
      await decide({ affiliateId: a.id, action: 'SUSPEND', decidedAt: later.toISOString() });
      await decide({ affiliateId: a.id, action: 'RESTORE', decidedAt: earlier.toISOString() });
      const now = await t.prisma.affiliate.findUniqueOrThrow({ where: { id: a.id } });
      expect(now.status).toBe('SUSPENDED');
      expect(now.suspendReason).toBe('Lý do thử nghiệm.');
    });
  });

  describe('hoa hồng của shop (AFF-02)', () => {
    it('chỉ trong khoảng sàn cho phép (mặc định 1–30%)', async () => {
      const res = await setRate([phone.product.id], 3001).expect(400);
      expect(res.body.details).toEqual({ min: 100, max: 3000 });
      await setRate([phone.product.id], 500).expect(200, { updated: 1 });
      await setRate([phone.product.id], null).expect(200, { updated: 1 });
      const p = await t.prisma.product.findUniqueOrThrow({ where: { id: phone.product.id } });
      expect(p.commissionRate).toBeNull();
    });

    it('không đặt được cho sản phẩm của shop khác', async () => {
      const other = makeUser('Shop Khác');
      await makeShop(t.prisma, other.id);
      await setRate([phone.product.id], 500, other).expect(404);
    });
  });

  describe('link và gắn đơn (AFF-03, AFF-04)', () => {
    beforeEach(async () => {
      await setRate([phone.product.id], 500).expect(200);
    });

    it('mã sai, CTV chưa duyệt, link tới shop của chính CTV → 404', async () => {
      await click('ABCDEFGH', { productId: phone.product.id }).expect(404);
      const pending = await submit().expect(201);
      expect(pending.body.status).toBe('PENDING');
      const ownerCtv = await activeAffiliate(seller);
      const res = await click(ownerCtv.code!, { productId: phone.product.id }).expect(404);
      expect(res.body.code).toBe('AFFILIATE_LINK_INVALID');
    });

    it('đặt qua link: gắn CTV, hoa hồng từng dòng, sản phẩm không bật thì 0', async () => {
      const a = await activeAffiliate();
      const c = await click(a.code!, { productId: phone.product.id }).expect(201);
      expect(c.body.shopId).toBe(shop.id);
      const so = await order(
        [
          [phone.variant.id, 2],
          [caseItem.variant.id, 1],
        ],
        [c.body.clickId],
      );
      expect(so.affiliateId).toBe(a.id);
      expect(so.affiliateClickId).toBe(c.body.clickId);
      // 2 × 1.000.000 × 5% = 100.000; ốp lưng không bật
      expect(so.items.map((i) => [i.commissionRate, i.commission])).toEqual([
        [500, 100_000],
        [0, 0],
      ]);
      expect(so.commission).toBe(100_000);
      const ev = await t.prisma.outboxEvent.findFirstOrThrow({ where: { type: 'order.placed' } });
      const placed = (ev.payload as { payload: { shopOrders: Array<Record<string, unknown>> } })
        .payload.shopOrders[0]!;
      expect(placed.affiliate).toEqual({
        affiliateId: a.id,
        userId: ctv.id,
        name: 'Review Công Nghệ',
        commission: 100_000,
      });
      const note = await t.prisma.notification.findFirstOrThrow({
        where: { userId: ctv.id, type: 'AFFILIATE_ORDER' },
      });
      expect(note.content).toContain('100.000đ');
    });

    it('voucher shop được trừ trước khi tính hoa hồng', async () => {
      await t.prisma.voucher.create({
        data: {
          shopId: shop.id,
          code: 'SHOP100',
          createdBy: seller.id,
          name: 'Giảm 100k',
          discountType: 'AMOUNT',
          value: 100_000,
          minOrder: 0,
          quantity: 10,
          perUserLimit: 1,
          startAt: new Date(Date.now() - 3600_000),
          endAt: new Date(Date.now() + 86_400_000),
        },
      });
      const a = await activeAffiliate();
      const c = await click(a.code!, { shopId: shop.id }).expect(201);
      const so = await order([[phone.variant.id, 1]], [c.body.clickId]);
      expect(so.shopDiscount).toBe(100_000);
      expect(so.commission).toBe(45_000);
    });

    it('lượt bấm gắn tài khoản người mua: đổi máy (không gửi mã) vẫn tính, lượt mới nhất thắng', async () => {
      const a1 = await activeAffiliate();
      const other = makeUser('Lê Văn Cường');
      const a2 = await activeAffiliate(other);
      await click(a1.code!, { productId: phone.product.id }, buyer).expect(201);
      await click(a2.code!, { shopId: shop.id }, buyer).expect(201);
      const so = await order([[phone.variant.id, 1]]);
      expect(so.affiliateId).toBe(a2.id);
    });

    it('CTV tự mua qua link của mình thì không có hoa hồng', async () => {
      const a = await activeAffiliate();
      const c = await click(a.code!, { productId: phone.product.id }, ctv).expect(201);
      const so = await order([[phone.variant.id, 1]], [c.body.clickId], ctv);
      expect(so.affiliateId).toBeNull();
      expect(so.commission).toBe(0);
    });

    it('CTV bị khóa sau khi bấm thì đơn không gắn CTV', async () => {
      const a = await activeAffiliate();
      const c = await click(a.code!, { productId: phone.product.id }).expect(201);
      await decide({ affiliateId: a.id, action: 'SUSPEND' });
      const so = await order([[phone.variant.id, 1]], [c.body.clickId]);
      expect(so.affiliateId).toBeNull();
    });

    it('đơn không có món nào bật hoa hồng thì không gắn CTV', async () => {
      const a = await activeAffiliate();
      const c = await click(a.code!, { shopId: shop.id }).expect(201);
      const so = await order([[caseItem.variant.id, 1]], [c.body.clickId]);
      expect(so.affiliateId).toBeNull();
    });
  });

  describe('khu Cộng tác viên và seller (AFF-03, AFF-06)', () => {
    it('sản phẩm có hoa hồng: chỉ CTV đang hoạt động, bỏ hàng của shop mình', async () => {
      await setRate([phone.product.id], 800).expect(200);
      await t.http().get(`${API}/affiliate-products`).set(auth(ctv)).expect(409);
      await activeAffiliate();
      const res = await t.http().get(`${API}/affiliate-products`).set(auth(ctv)).expect(200);
      expect(res.body.items).toEqual([
        expect.objectContaining({
          id: phone.product.id,
          commissionRate: 800,
          commissionFrom: 80_000,
          shop: { id: shop.id, name: 'Táo Xanh' },
        }),
      ]);
      await activeAffiliate(seller);
      const own = await t.http().get(`${API}/affiliate-products`).set(auth(seller)).expect(200);
      expect(own.body.items).toEqual([]);
    });

    it('thống kê, đơn của CTV không lộ người mua; seller thấy CTV và hoa hồng trong đơn', async () => {
      await setRate([phone.product.id], 500).expect(200);
      const a = await activeAffiliate();
      const c = await click(a.code!, { productId: phone.product.id }).expect(201);
      await click(a.code!, { productId: phone.product.id }).expect(201);
      const so = await order([[phone.variant.id, 1]], [c.body.clickId]);

      const stats = await t.http().get(`${API}/affiliates/me/stats`).set(auth(ctv)).expect(200);
      expect(stats.body).toMatchObject({ clicks: 2, orders: 1, commission: 50_000 });
      expect(stats.body.topProducts).toEqual([
        { productId: phone.product.id, name: 'iPhone 15', quantity: 1, commission: 50_000 },
      ]);

      const mine = await t.http().get(`${API}/affiliates/me/orders`).set(auth(ctv)).expect(200);
      expect(mine.body.total).toBe(1);
      expect(JSON.stringify(mine.body)).not.toMatch(/Người Mua|0987654321|Điện Biên Phủ/);

      const sellerList = await t
        .http()
        .get(`${API}/shops/me/affiliate-orders`)
        .set(auth(seller))
        .expect(200);
      expect(sellerList.body.items[0]).toMatchObject({
        code: so.code,
        affiliateName: 'Review Công Nghệ',
        commission: 50_000,
      });
      const detail = await t
        .http()
        .get(`${API}/shops/me/orders/${so.id}`)
        .set(auth(seller))
        .expect(200);
      expect(detail.body.affiliate).toMatchObject({ name: 'Review Công Nghệ', commission: 50_000 });
    });

    it('admin Kiểm duyệt xem danh sách CTV kèm số đơn; người thường bị chặn', async () => {
      await activeAffiliate();
      const admin = makeUser('Admin', ['MODERATION']);
      const res = await t.http().get(`${API}/admin/affiliates`).set(auth(admin)).expect(200);
      expect(res.body.items[0]).toMatchObject({
        displayName: 'Review Công Nghệ',
        status: 'ACTIVE',
        orderCount: 0,
      });
      expect(JSON.stringify(res.body)).not.toContain('0123456789');
      await t.http().get(`${API}/admin/affiliates`).set(auth(buyer)).expect(403);
    });
  });
});
