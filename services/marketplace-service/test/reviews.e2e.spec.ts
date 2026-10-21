import { SettingsService } from '@san/nest-common';
import { NOTIFICATION_CREATED, type SanEvent } from '@san/shared';
import { randomUUID } from 'node:crypto';
import type { OrderItem, Product, ProductVariant, Shop, ShopOrder } from '../generated/prisma';
import { makeProduct, makeShop } from './fixtures-p2';
import { API, createTestApp, describeDb, makeUser, resetDb, type TestApp } from './helpers';

type User = ReturnType<typeof makeUser>;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const DAY = 86_400_000;

describeDb('Đánh giá sản phẩm và shop trả lời (P6: ENG-01, ENG-02)', () => {
  let t: TestApp;
  let buyer: User;
  let other: User;
  let seller: User;
  let seller2: User;
  let shop: Shop;
  let shop2: Shop;
  let phone: { product: Product; variants: ProductVariant[] };
  let caseP: { product: Product; variants: ProductVariant[] };
  let other2: { product: Product; variants: ProductVariant[] };

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    await resetDb(t.prisma);
    await t.prisma.$executeRawUnsafe('TRUNCATE notifications');
    t.storage.files.clear();
    buyer = makeUser('Nguyễn Văn An');
    other = makeUser('Trần Thị Bình');
    seller = makeUser('Chủ Shop');
    seller2 = makeUser('Chủ Shop Hai');
    shop = await makeShop(t.prisma, seller.id, { name: 'Shop Đánh Giá' });
    shop2 = await makeShop(t.prisma, seller2.id, { name: 'Shop Khác' });
    phone = await makeProduct(t.prisma, shop.id, {
      name: 'Điện thoại A',
      option1Name: 'Màu',
      variants: [{ option1Value: 'Đen', price: 1_000_000 }],
    });
    caseP = await makeProduct(t.prisma, shop.id, { name: 'Ốp lưng' });
    other2 = await makeProduct(t.prisma, shop2.id, { name: 'Tai nghe' });
  });

  const auth = (u: User) => ({ Authorization: `Bearer ${u.token}` });
  let seq = 0;

  /**
   * Đơn con ghi thẳng vào database (không qua đặt hàng): mặc định đã hoàn tất 1 ngày trước.
   * Trả đơn con và các dòng hàng theo thứ tự `lines`.
   */
  async function order(
    who: User,
    lines: Array<{
      p: { product: Product; variants: ProductVariant[] };
      quantity?: number;
      returned?: number;
    }>,
    opts: { status?: ShopOrder['status']; completedAt?: Date | null; shopId?: string } = {},
  ): Promise<{ so: ShopOrder; items: OrderItem[] }> {
    const n = ++seq;
    const o = await t.prisma.order.create({
      data: {
        code: `T${Date.now().toString(36)}${n}`.toUpperCase().slice(0, 20),
        buyerId: who.id,
        buyerName: who.name,
        buyerEmail: who.email,
        receiverName: who.name,
        receiverPhone: '0987654321',
        provinceId: 90001,
        districtId: 90101,
        wardCode: '9010101',
        address: '1 Điện Biên Phủ',
        subtotal: 0,
        shippingFee: 0,
        total: 0,
        paymentStatus: 'PAID',
        checkStatus: 'PASSED',
      },
    });
    const status = opts.status ?? 'COMPLETED';
    const so = await t.prisma.shopOrder.create({
      data: {
        code: `${o.code}-1`,
        orderId: o.id,
        shopId: opts.shopId ?? lines[0]!.p.product.shopId,
        shopName: 'Shop',
        status,
        subtotal: 0,
        shippingFee: 0,
        shippingFeeSource: 'FIXED',
        total: 0,
        completedAt:
          opts.completedAt !== undefined
            ? opts.completedAt
            : status === 'COMPLETED'
              ? new Date(Date.now() - DAY)
              : null,
      },
    });
    const items: OrderItem[] = [];
    for (const l of lines) {
      const v = l.p.variants[0]!;
      items.push(
        await t.prisma.orderItem.create({
          data: {
            shopOrderId: so.id,
            productId: l.p.product.id,
            variantId: v.id,
            productName: l.p.product.name,
            variantName: v.option1Value,
            image: 'http://localhost:9000/san-public/product-images/x/a.png',
            price: v.price,
            quantity: l.quantity ?? 1,
            weight: 500,
            returnedQuantity: l.returned ?? 0,
          },
        }),
      );
    }
    return { so, items };
  }

  const review = (u: User, orderItemId: string, body: Record<string, unknown> = {}) =>
    t
      .http()
      .post(`${API}/me/reviews`)
      .set(auth(u))
      .send({ orderItemId, rating: 5, content: 'Hàng tốt', ...body });
  /** Chờ vài ms để thời điểm tạo của các đánh giá khác nhau (kiểm thứ tự "mới nhất trước") */
  const tick = () => new Promise((r) => setTimeout(r, 5));

  const edit = (u: User, id: string, body: Record<string, unknown>) =>
    t.http().put(`${API}/me/reviews/${id}`).set(auth(u)).send(body);

  const counters = async () => ({
    phone: await t.prisma.product.findUniqueOrThrow({
      where: { id: phone.product.id },
      select: { ratingCount: true, ratingTotal: true },
    }),
    caseP: await t.prisma.product.findUniqueOrThrow({
      where: { id: caseP.product.id },
      select: { ratingCount: true, ratingTotal: true },
    }),
    shop: await t.prisma.shop.findUniqueOrThrow({
      where: { id: shop.id },
      select: { ratingCount: true, ratingTotal: true },
    }),
  });

  /** Ảnh đánh giá hợp lệ của một người (như đã tải qua POST /uploads/review-image) */
  const img = (u: User) =>
    `http://localhost:9000/san-public/review-images/${u.id}/${randomUUID()}.png`;

  describe('Tải ảnh đánh giá', () => {
    it('lưu vào thư mục review-images của người tải, trả đường dẫn công khai', async () => {
      const res = await t
        .http()
        .post(`${API}/uploads/review-image`)
        .set(auth(buyer))
        .attach('file', PNG, 'a.png')
        .expect(201);
      expect(res.body.url).toMatch(
        new RegExp(
          `^http://localhost:9000/san-public/review-images/${buyer.id}/[0-9a-f-]{36}\\.png$`,
        ),
      );
      // Ảnh vừa tải dùng được ngay khi gửi đánh giá
      const { items } = await order(buyer, [{ p: phone }]);
      await review(buyer, items[0]!.id, { images: [res.body.url] }).expect(201);
    });

    it('cần đăng nhập; không phải ảnh → INVALID_IMAGE', async () => {
      await t.http().post(`${API}/uploads/review-image`).attach('file', PNG, 'a.png').expect(401);
      const res = await t
        .http()
        .post(`${API}/uploads/review-image`)
        .set(auth(buyer))
        .attach('file', Buffer.from('hello'), 'a.png')
        .expect(400);
      expect(res.body.code).toBe('INVALID_IMAGE');
    });
  });

  describe('Điều kiện được đánh giá', () => {
    it('dòng hàng của người khác hoặc không có → 404', async () => {
      const { items } = await order(other, [{ p: phone }]);
      expect((await review(buyer, items[0]!.id).expect(404)).body.code).toBe('NOT_FOUND');
      await review(buyer, randomUUID()).expect(404);
    });

    it('đơn con chưa hoàn tất hoặc món đã trả hết → 409 REVIEW_NOT_ALLOWED', async () => {
      const delivered = await order(buyer, [{ p: phone }], { status: 'DELIVERED' });
      expect((await review(buyer, delivered.items[0]!.id).expect(409)).body.code).toBe(
        'REVIEW_NOT_ALLOWED',
      );
      const returned = await order(buyer, [{ p: phone, quantity: 2, returned: 2 }]);
      expect((await review(buyer, returned.items[0]!.id).expect(409)).body.code).toBe(
        'REVIEW_NOT_ALLOWED',
      );
      // Trả một phần: vẫn đánh giá được
      const partly = await order(buyer, [{ p: phone, quantity: 2, returned: 1 }]);
      await review(buyer, partly.items[0]!.id).expect(201);
    });

    it('quá review_days ngày từ lúc hoàn tất → 409 REVIEW_WINDOW_CLOSED; hạn đọc từ cấu hình', async () => {
      const old = await order(buyer, [{ p: phone }], {
        completedAt: new Date(Date.now() - 31 * DAY),
      });
      const res = await review(buyer, old.items[0]!.id).expect(409);
      expect(res.body.code).toBe('REVIEW_WINDOW_CLOSED');

      const recent = await order(buyer, [{ p: caseP }], {
        completedAt: new Date(Date.now() - 11 * DAY),
      });
      const admin = makeUser('Admin', ['SYSTEM']);
      await t.app.get(SettingsService).update(admin, 'review_days', 10, 'Thử hạn ngắn');
      expect((await review(buyer, recent.items[0]!.id).expect(409)).body.code).toBe(
        'REVIEW_WINDOW_CLOSED',
      );
      await t.app.get(SettingsService).update(admin, 'review_days', 60, 'Thử hạn dài');
      await review(buyer, old.items[0]!.id).expect(201);
    });

    it('đã đánh giá → 409 ALREADY_REVIEWED, kể cả hai lần gửi cùng lúc', async () => {
      const { items } = await order(buyer, [{ p: phone }]);
      await review(buyer, items[0]!.id).expect(201);
      expect((await review(buyer, items[0]!.id).expect(409)).body.code).toBe('ALREADY_REVIEWED');

      const second = await order(buyer, [{ p: caseP }]);
      const results = await Promise.all([
        review(buyer, second.items[0]!.id),
        review(buyer, second.items[0]!.id),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect((await counters()).caseP).toEqual({ ratingCount: 1, ratingTotal: 5 });
    });

    it('kiểm dữ liệu: số sao 1–5, nội dung ≤ 1000, ảnh của chính mình, tối đa 5 ảnh', async () => {
      const { items } = await order(buyer, [{ p: phone }]);
      const id = items[0]!.id;
      for (const rating of [0, 6, 4.5]) {
        const res = await review(buyer, id, { rating }).expect(400);
        expect(res.body.details.fields).toHaveProperty('rating');
      }
      await review(buyer, id, { content: 'a'.repeat(1001) }).expect(400);
      const foreign = await review(buyer, id, { images: [img(other)] }).expect(400);
      expect(foreign.body.code).toBe('INVALID_IMAGE_URL');
      const external = await review(buyer, id, { images: ['https://evil.example/a.png'] });
      expect(external.body.code).toBe('INVALID_IMAGE_URL');
      const many = await review(buyer, id, {
        images: Array.from({ length: 6 }, () => img(buyer)),
      }).expect(400);
      expect(many.body.details.fields).toHaveProperty('images');
      // Chỉ chấm sao, không viết gì: được
      const ok = await review(buyer, id, { content: undefined, images: [img(buyer)] }).expect(201);
      expect(ok.body).toMatchObject({ rating: 5, content: '', images: [expect.any(String)] });
    });
  });

  describe('Viết, sửa và bộ đếm sao', () => {
    it('tạo đánh giá: cộng sao sản phẩm và shop, báo chủ shop', async () => {
      const { so, items } = await order(buyer, [{ p: phone }, { p: caseP }]);
      const res = await review(buyer, items[0]!.id, { rating: 4 }).expect(201);
      expect(res.body).toMatchObject({
        orderItemId: items[0]!.id,
        productId: phone.product.id,
        productName: 'Điện thoại A',
        variantName: 'Đen',
        shopOrderCode: so.code,
        buyerName: 'Nguyễn Văn An',
        rating: 4,
        content: 'Hàng tốt',
        edited: false,
        canEdit: true,
        sellerReply: null,
      });
      await review(buyer, items[1]!.id, { rating: 3 }).expect(201);
      expect(await counters()).toEqual({
        phone: { ratingCount: 1, ratingTotal: 4 },
        caseP: { ratingCount: 1, ratingTotal: 3 },
        shop: { ratingCount: 2, ratingTotal: 7 },
      });
      const notes = await t.prisma.notification.findMany({ where: { userId: seller.id } });
      expect(notes).toHaveLength(2);
      expect(notes[0]).toMatchObject({ type: 'SHOP_REVIEW_NEW', link: '/kenh-nguoi-ban/danh-gia' });
      expect(notes[0]!.content).not.toContain('Nguyễn Văn An');
      const events = await t.prisma.outboxEvent.findMany({ where: { type: NOTIFICATION_CREATED } });
      expect(
        events.map((e) => (e.payload as unknown as SanEvent).payload as { userId: string }),
      ).toEqual([
        expect.objectContaining({ userId: seller.id }),
        expect.objectContaining({ userId: seller.id }),
      ]);

      // Trang sản phẩm, trang shop, thẻ sản phẩm và Shop của tôi thấy sao mới
      const detail = await t.http().get(`${API}/products/${phone.product.id}`).expect(200);
      expect(detail.body).toMatchObject({ ratingAvg: 4, ratingCount: 1 });
      const pub = await t.http().get(`${API}/shops/${shop.id}`).expect(200);
      expect(pub.body).toMatchObject({ ratingAvg: 3.5, ratingCount: 2 });
      const cards = await t.http().get(`${API}/products`).query({ shopId: shop.id }).expect(200);
      expect(
        (cards.body.items as Array<{ id: string; ratingAvg: number }>).find(
          (c) => c.id === caseP.product.id,
        ),
      ).toMatchObject({ ratingAvg: 3, ratingCount: 1 });
      const mine = await t.http().get(`${API}/shops/me`).set(auth(seller)).expect(200);
      expect(mine.body.shop).toMatchObject({ ratingAvg: 3.5, ratingCount: 2, followerCount: 0 });
    });

    it('sửa một lần: sao sản phẩm và shop đổi theo chênh lệch; lần hai → REVIEW_EDIT_USED', async () => {
      const { items } = await order(buyer, [{ p: phone }, { p: caseP }]);
      const a = (await review(buyer, items[0]!.id, { rating: 5 }).expect(201)).body;
      await review(buyer, items[1]!.id, { rating: 4 }).expect(201);
      const changed = await edit(buyer, a.id, {
        rating: 2,
        content: 'Dùng một tuần thì hỏng',
        images: [img(buyer)],
      }).expect(200);
      expect(changed.body).toMatchObject({
        rating: 2,
        content: 'Dùng một tuần thì hỏng',
        edited: true,
        canEdit: false,
      });
      expect(await counters()).toEqual({
        phone: { ratingCount: 1, ratingTotal: 2 },
        caseP: { ratingCount: 1, ratingTotal: 4 },
        shop: { ratingCount: 2, ratingTotal: 6 },
      });
      const again = await edit(buyer, a.id, { rating: 5 }).expect(409);
      expect(again.body.code).toBe('REVIEW_EDIT_USED');
      expect((await counters()).phone).toEqual({ ratingCount: 1, ratingTotal: 2 });
    });

    it('sửa quá hạn → REVIEW_WINDOW_CLOSED; đánh giá của người khác → 404', async () => {
      const { so, items } = await order(buyer, [{ p: phone }]);
      const a = (await review(buyer, items[0]!.id).expect(201)).body;
      await edit(other, a.id, { rating: 1 }).expect(404);
      await t.prisma.shopOrder.update({
        where: { id: so.id },
        data: { completedAt: new Date(Date.now() - 31 * DAY) },
      });
      const res = await edit(buyer, a.id, { rating: 1 }).expect(409);
      expect(res.body.code).toBe('REVIEW_WINDOW_CLOSED');
      const done = await t
        .http()
        .get(`${API}/me/reviews`)
        .query({ state: 'DONE' })
        .set(auth(buyer))
        .expect(200);
      expect(done.body.items[0]).toMatchObject({ id: a.id, canEdit: false, edited: false });
    });
  });

  describe('Đánh giá của tôi', () => {
    it('PENDING: chỉ dòng hàng còn đánh giá được, kèm hạn; DONE: đánh giá đã viết, tên đầy đủ', async () => {
      const ok = await order(buyer, [{ p: phone }, { p: caseP, quantity: 3, returned: 1 }]);
      await order(buyer, [{ p: phone }], { status: 'DELIVERED' });
      await order(buyer, [{ p: phone, quantity: 1, returned: 1 }]);
      await order(buyer, [{ p: phone }], { completedAt: new Date(Date.now() - 40 * DAY) });
      await order(other, [{ p: phone }]);

      const pending = await t.http().get(`${API}/me/reviews`).set(auth(buyer)).expect(200);
      expect(pending.body.total).toBe(2);
      const caseRow = (
        pending.body.items as Array<{ orderItemId: string; reviewBefore: string }>
      ).find((i) => i.orderItemId === ok.items[1]!.id);
      expect(caseRow).toMatchObject({
        productName: 'Ốp lưng',
        quantity: 2,
        shopOrderCode: ok.so.code,
        orderId: ok.so.orderId,
        shop: { id: shop.id },
      });
      expect(new Date(caseRow!.reviewBefore).getTime()).toBe(
        ok.so.completedAt!.getTime() + 30 * DAY,
      );

      await review(buyer, ok.items[0]!.id).expect(201);
      const after = await t.http().get(`${API}/me/reviews`).set(auth(buyer)).expect(200);
      expect(after.body.items.map((i: { orderItemId: string }) => i.orderItemId)).toEqual([
        ok.items[1]!.id,
      ]);
      const done = await t
        .http()
        .get(`${API}/me/reviews`)
        .query({ state: 'DONE' })
        .set(auth(buyer))
        .expect(200);
      expect(done.body).toMatchObject({ total: 1 });
      expect(done.body.items[0]).toMatchObject({ buyerName: 'Nguyễn Văn An', canEdit: true });
      const otherDone = await t
        .http()
        .get(`${API}/me/reviews`)
        .query({ state: 'DONE' })
        .set(auth(other))
        .expect(200);
      expect(otherDone.body.total).toBe(0);
    });
  });

  describe('Xem công khai', () => {
    it('theo sản phẩm: tên che bớt, tóm tắt từng mức sao, lọc sao và có ảnh, mới nhất trước', async () => {
      const a = await order(buyer, [{ p: phone }]);
      const b = await order(other, [{ p: phone }]);
      const c = await order(other, [{ p: caseP }]);
      await review(buyer, a.items[0]!.id, { rating: 5, images: [img(buyer)] }).expect(201);
      await tick();
      await review(other, b.items[0]!.id, { rating: 2 }).expect(201);
      await review(other, c.items[0]!.id, { rating: 4 }).expect(201);

      const res = await t.http().get(`${API}/products/${phone.product.id}/reviews`).expect(200);
      expect(res.body.summary).toEqual({
        ratingAvg: 3.5,
        ratingCount: 2,
        stars: { '1': 0, '2': 1, '3': 0, '4': 0, '5': 1 },
        withImages: 1,
      });
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0]).toMatchObject({ buyerName: 'T***h', rating: 2 });
      expect(res.body.items[1]).toMatchObject({ buyerName: 'N***n', variantName: 'Đen' });
      expect(JSON.stringify(res.body)).not.toContain('Nguyễn Văn An');
      expect(res.body.items[0]).not.toHaveProperty('buyerId');

      const five = await t
        .http()
        .get(`${API}/products/${phone.product.id}/reviews`)
        .query({ rating: 5 })
        .expect(200);
      expect(five.body.total).toBe(1);
      const withImg = await t
        .http()
        .get(`${API}/products/${phone.product.id}/reviews`)
        .query({ withImages: 'true' })
        .expect(200);
      expect(withImg.body.items.map((r: { rating: number }) => r.rating)).toEqual([5]);
    });

    it('sản phẩm không đang bán hoặc shop chưa duyệt → 404', async () => {
      await t.prisma.product.update({
        where: { id: phone.product.id },
        data: { status: 'HIDDEN' },
      });
      await t.http().get(`${API}/products/${phone.product.id}/reviews`).expect(404);
      const pending = await makeShop(t.prisma, makeUser().id, { status: 'PENDING' });
      await t.http().get(`${API}/shops/${pending.id}/reviews`).expect(404);
    });

    it('theo shop: mọi sản phẩm của shop, kèm tên và mã sản phẩm; phân trang ổn định', async () => {
      for (let i = 0; i < 3; i++) {
        const o = await order(buyer, [{ p: i % 2 ? caseP : phone }]);
        await review(buyer, o.items[0]!.id, { rating: 3 + i }).expect(201);
        await tick();
      }
      const o2 = await order(buyer, [{ p: other2 }]);
      await review(buyer, o2.items[0]!.id).expect(201);
      const res = await t.http().get(`${API}/shops/${shop.id}/reviews`).expect(200);
      expect(res.body.summary).toMatchObject({ ratingAvg: 4, ratingCount: 3 });
      expect(res.body.items.map((r: { product: { name: string } }) => r.product.name)).toEqual([
        'Điện thoại A',
        'Ốp lưng',
        'Điện thoại A',
      ]);
      const p1 = await t
        .http()
        .get(`${API}/shops/${shop.id}/reviews`)
        .query({ pageSize: 2 })
        .expect(200);
      const p2 = await t
        .http()
        .get(`${API}/shops/${shop.id}/reviews`)
        .query({ pageSize: 2, page: 2 })
        .expect(200);
      expect([...p1.body.items, ...p2.body.items].map((r: { id: string }) => r.id)).toEqual(
        res.body.items.map((r: { id: string }) => r.id),
      );
    });
  });

  describe('Seller trả lời', () => {
    it('chỉ thấy và trả lời đánh giá của shop mình; sửa được câu trả lời; lọc đã/chưa trả lời', async () => {
      const a = await order(buyer, [{ p: phone }]);
      const b = await order(buyer, [{ p: other2 }]);
      const ra = (await review(buyer, a.items[0]!.id, { rating: 2 }).expect(201)).body;
      const rb = (await review(buyer, b.items[0]!.id).expect(201)).body;

      const list = await t.http().get(`${API}/shops/me/reviews`).set(auth(seller)).expect(200);
      expect(list.body).toMatchObject({ total: 1 });
      expect(list.body.summary).toMatchObject({ ratingAvg: 2, ratingCount: 1, unreplied: 1 });
      expect(list.body.items[0]).toMatchObject({
        id: ra.id,
        buyerName: 'N***n',
        product: { id: phone.product.id, name: 'Điện thoại A' },
        shopOrderId: a.so.id,
        shopOrderCode: a.so.code,
      });

      // Đánh giá của shop khác → 404
      await t
        .http()
        .put(`${API}/shops/me/reviews/${rb.id}/reply`)
        .set(auth(seller))
        .send({ content: 'Cảm ơn bạn' })
        .expect(404);
      await t
        .http()
        .put(`${API}/shops/me/reviews/${ra.id}/reply`)
        .set(auth(seller))
        .send({ content: '   ' })
        .expect(400);

      const replied = await t
        .http()
        .put(`${API}/shops/me/reviews/${ra.id}/reply`)
        .set(auth(seller))
        .send({ content: 'Shop xin lỗi, sẽ đổi hàng cho bạn', rating: 5 })
        .expect(200);
      expect(replied.body).toMatchObject({
        sellerReply: 'Shop xin lỗi, sẽ đổi hàng cho bạn',
        rating: 2,
        content: 'Hàng tốt',
      });
      const edited = await t
        .http()
        .put(`${API}/shops/me/reviews/${ra.id}/reply`)
        .set(auth(seller))
        .send({ content: 'Shop đã liên hệ đổi hàng' })
        .expect(200);
      expect(edited.body.sellerReply).toBe('Shop đã liên hệ đổi hàng');

      const yes = await t
        .http()
        .get(`${API}/shops/me/reviews`)
        .query({ replied: 'true' })
        .set(auth(seller))
        .expect(200);
      expect(yes.body.total).toBe(1);
      const no = await t
        .http()
        .get(`${API}/shops/me/reviews`)
        .query({ replied: 'false' })
        .set(auth(seller))
        .expect(200);
      expect(no.body.total).toBe(0);
      // Người mua và trang sản phẩm thấy câu trả lời; sao không đổi
      const pub = await t.http().get(`${API}/products/${phone.product.id}/reviews`).expect(200);
      expect(pub.body.items[0]).toMatchObject({ sellerReply: 'Shop đã liên hệ đổi hàng' });
      expect((await counters()).phone).toEqual({ ratingCount: 1, ratingTotal: 2 });
    });

    it('chưa có shop → 409 SHOP_NOT_ACTIVE', async () => {
      const res = await t.http().get(`${API}/shops/me/reviews`).set(auth(buyer)).expect(409);
      expect(res.body.code).toBe('SHOP_NOT_ACTIVE');
    });
  });
});
