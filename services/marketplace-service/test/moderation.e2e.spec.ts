import { randomUUID } from 'node:crypto';
import type { ProductModerationDecidedPayload } from '@san/shared';
import { ProductModerationEvents } from '../src/moderation/product-moderation.events';
import {
  createProduct,
  createShop,
  loadCategories,
  simpleBody,
  type TestUser,
} from './catalog-fixtures';
import { API, createTestApp, describeDb, makeUser, resetDb, type TestApp } from './helpers';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(100),
]);

describeDb('Báo cáo vi phạm: phần marketplace (MOD-01)', () => {
  let t: TestApp;
  let seller: TestUser;
  let buyer: TestUser;
  let shopId: string;
  let product: Awaited<ReturnType<typeof createProduct>>;
  let cat: (slug: string) => string;

  const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
  const base = `${API}/shops/me/products`;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    await t.prisma.$executeRawUnsafe('TRUNCATE notifications CASCADE');
    t.storage.privateFiles.clear();
    t.storage.fail = false;
    cat = await loadCategories(t);
    seller = makeUser('Chủ Shop');
    buyer = makeUser('Người Mua');
    shopId = (await createShop(t, seller)).id;
    product = await createProduct(t, seller, simpleBody(seller.id, cat('op-lung')));
  });

  const decided = (
    action: ProductModerationDecidedPayload['action'],
    decidedAt: string,
    reason = 'Hàng giả nhãn hiệu',
    productId = product.id,
  ): ProductModerationDecidedPayload => ({
    productId,
    shopId,
    action,
    reason,
    decidedBy: { userId: randomUUID(), name: 'Kiểm Duyệt' },
    decidedAt,
  });
  const apply = (p: ProductModerationDecidedPayload) =>
    t.prisma.$transaction((tx) => t.app.get(ProductModerationEvents).apply(p, tx));
  const productOf = () => t.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
  const setStatus = (status: string) =>
    t.http().patch(`${base}/${product.id}/status`).set(auth(seller)).send({ status });

  describe('nhận product_moderation.decided', () => {
    it('REMOVE → REMOVED kèm lý do, báo chủ shop; RESTORE → HIDDEN, xóa lý do, báo chủ shop', async () => {
      await apply(decided('REMOVE', '2026-10-21T10:00:00.000Z'));
      expect(await productOf()).toMatchObject({
        status: 'REMOVED',
        removedReason: 'Hàng giả nhãn hiệu',
        moderatedAt: new Date('2026-10-21T10:00:00.000Z'),
      });
      await apply(decided('RESTORE', '2026-10-21T11:00:00.000Z', 'Đã sửa thông tin'));
      expect(await productOf()).toMatchObject({
        status: 'HIDDEN',
        removedReason: null,
        moderatedAt: new Date('2026-10-21T11:00:00.000Z'),
      });

      const notes = await t.prisma.notification.findMany({ orderBy: { createdAt: 'asc' } });
      expect(notes).toEqual([
        expect.objectContaining({
          userId: seller.id,
          type: 'PRODUCT_REMOVED',
          link: `/kenh-nguoi-ban/san-pham/${product.id}`,
          content: expect.stringContaining('Hàng giả nhãn hiệu'),
        }),
        expect.objectContaining({
          userId: seller.id,
          type: 'PRODUCT_RESTORED',
          link: `/kenh-nguoi-ban/san-pham/${product.id}`,
        }),
      ]);
      // Mỗi thông báo phát notification.created (PRODUCT_REMOVED gửi thêm email)
      const events = await t.prisma.outboxEvent.findMany({
        where: { type: 'notification.created' },
        orderBy: { createdAt: 'asc' },
      });
      expect(
        events.map((e) => (e.payload as { payload: { type: string; email: boolean } }).payload),
      ).toEqual([
        expect.objectContaining({ type: 'PRODUCT_REMOVED', email: true }),
        expect.objectContaining({ type: 'PRODUCT_RESTORED', email: false }),
      ]);
    });

    it('sự kiện tới sai thứ tự: quyết định cũ tới sau bị bỏ qua, không báo thêm', async () => {
      // Gỡ lúc 10h rồi khôi phục lúc 11h, nhưng RESTORE tới trước
      await apply(decided('RESTORE', '2026-10-21T11:00:00.000Z'));
      await apply(decided('REMOVE', '2026-10-21T10:00:00.000Z'));
      expect(await productOf()).toMatchObject({ status: 'HIDDEN', removedReason: null });
      // Cùng thời điểm (nhận lại) cũng bỏ qua
      await apply(decided('REMOVE', '2026-10-21T11:00:00.000Z'));
      expect((await productOf()).status).toBe('HIDDEN');
      expect(await t.prisma.notification.count()).toBe(1);
      // Quyết định mới hơn thì áp
      await apply(decided('REMOVE', '2026-10-21T12:00:00.000Z', 'Tái phạm'));
      expect(await productOf()).toMatchObject({ status: 'REMOVED', removedReason: 'Tái phạm' });
      expect(await t.prisma.notification.count()).toBe(2);
    });

    it('sản phẩm không có → bỏ qua, không lỗi', async () => {
      await apply(decided('REMOVE', '2026-10-21T10:00:00.000Z', 'Hàng giả', randomUUID()));
      expect(await t.prisma.notification.count()).toBe(0);
    });
  });

  describe('sản phẩm bị gỡ', () => {
    beforeEach(() => apply(decided('REMOVE', '2026-10-21T10:00:00.000Z')));

    it('không ra ở API công khai: trang sản phẩm 404, tìm kiếm, trang shop', async () => {
      await t.http().get(`${API}/products/${product.id}`).expect(404);
      const search = await t.http().get(`${API}/products?q=op lung`).expect(200);
      expect(search.body.total).toBe(0);
      const byShop = await t.http().get(`${API}/products?shopId=${shopId}`).expect(200);
      expect(byShop.body.total).toBe(0);
      const shop = await t.http().get(`${API}/shops/${shopId}`).expect(200);
      expect(shop.body.productCount).toBe(0);
    });

    it('giỏ hàng: không thêm được; dòng đã có thành "không còn bán", xem trước đơn không đặt được', async () => {
      await apply(decided('RESTORE', '2026-10-21T11:00:00.000Z'));
      await setStatus('ACTIVE').expect(200);
      const added = await t
        .http()
        .post(`${API}/cart/items`)
        .set(auth(buyer))
        .send({ variantId: product.variants[0]!.id, quantity: 1 })
        .expect(201);
      await apply(decided('REMOVE', '2026-10-21T12:00:00.000Z'));

      const cart = await t.http().get(`${API}/cart`).set(auth(buyer)).expect(200);
      expect(cart.body.shops[0].items[0]).toMatchObject({ state: 'UNAVAILABLE' });
      const preview = await t
        .http()
        .post(`${API}/checkout/preview`)
        .set(auth(buyer))
        .send({ itemIds: [added.body.itemId] })
        .expect(201);
      expect(preview.body.canPlace).toBe(false);
      expect(preview.body.problems[0].message).toContain('không còn bán');
      const again = await t
        .http()
        .post(`${API}/cart/items`)
        .set(auth(buyer))
        .send({ variantId: product.variants[0]!.id, quantity: 1 });
      expect(again.status).toBeGreaterThanOrEqual(400);
    });

    it('seller: PATCH status → 409 PRODUCT_REMOVED; vẫn xem và sửa nội dung, trạng thái giữ REMOVED', async () => {
      for (const status of ['ACTIVE', 'HIDDEN']) {
        expect((await setStatus(status).expect(409)).body.code).toBe('PRODUCT_REMOVED');
      }
      const detail = await t.http().get(`${base}/${product.id}`).set(auth(seller)).expect(200);
      expect(detail.body).toMatchObject({
        status: 'REMOVED',
        removedReason: 'Hàng giả nhãn hiệu',
      });
      const put = await t
        .http()
        .put(`${base}/${product.id}`)
        .set(auth(seller))
        .send(
          simpleBody(seller.id, cat('op-lung'), {
            name: 'Ốp lưng chính hãng',
            variants: [{ id: product.variants[0]!.id, price: 99000 }],
          }),
        )
        .expect(200);
      expect(put.body).toMatchObject({ name: 'Ốp lưng chính hãng', status: 'REMOVED' });
      // Shop khác vẫn 404
      const other = makeUser('Shop Khác');
      await createShop(t, other);
      await t
        .http()
        .patch(`${base}/${product.id}/status`)
        .set(auth(other))
        .send({ status: 'ACTIVE' })
        .expect(404);
    });

    it('seller: danh sách lọc được REMOVED, trả removedReason; sau khôi phục bật bán lại được', async () => {
      await createProduct(t, seller, simpleBody(seller.id, cat('op-lung'), { name: 'Ốp khác' }));
      const removed = await t.http().get(`${base}?status=REMOVED`).set(auth(seller)).expect(200);
      expect(removed.body.total).toBe(1);
      expect(removed.body.items[0]).toMatchObject({
        id: product.id,
        status: 'REMOVED',
        removedReason: 'Hàng giả nhãn hiệu',
      });
      const active = await t.http().get(`${base}?status=ACTIVE`).set(auth(seller)).expect(200);
      expect(active.body.items[0]).toMatchObject({ status: 'ACTIVE', removedReason: null });

      await apply(decided('RESTORE', '2026-10-21T11:00:00.000Z'));
      await t.http().get(`${API}/products/${product.id}`).expect(404);
      await setStatus('ACTIVE').expect(200);
      await t.http().get(`${API}/products/${product.id}`).expect(200);
    });

    it('admin chi tiết shop đếm số sản phẩm bị gỡ', async () => {
      const admin = makeUser('Kiểm Duyệt', ['MODERATION']);
      const res = await t.http().get(`${API}/admin/shops/${shopId}`).set(auth(admin)).expect(200);
      expect(res.body.productCounts).toEqual({ ACTIVE: 0, HIDDEN: 0, REMOVED: 1 });
    });
  });

  describe('ảnh bằng chứng', () => {
    const upload = (u: TestUser, buf = PNG) =>
      t.http().post(`${API}/uploads/report-image`).set(auth(u)).attach('file', buf, 'a.png');

    it('tải lên bucket riêng tư report-images/<userId>/; chỉ người tải và admin MODERATION xem được', async () => {
      const res = await upload(buyer).expect(201);
      const key = res.body.key as string;
      expect(key).toMatch(new RegExp(`^report-images/${buyer.id}/[0-9a-f-]{36}\\.png$`));
      expect(t.storage.privateFiles.has(key)).toBe(true);
      const path = `${API}/${key}`;
      const mine = await t.http().get(path).set(auth(buyer)).expect(200);
      expect(mine.headers['content-type']).toBe('image/png');
      await t
        .http()
        .get(path)
        .set(auth(makeUser('Kiểm Duyệt', ['MODERATION'])))
        .expect(200);
      for (const u of [seller, makeUser('Hỗ Trợ', ['SUPPORT']), makeUser('Người Lạ')]) {
        await t.http().get(path).set(auth(u)).expect(404);
      }
      await t.http().get(path).expect(401);
      await t
        .http()
        .get(`${API}/report-images/${buyer.id}/..%2F..%2Fx.png`)
        .set(auth(buyer))
        .expect(404);
      await t
        .http()
        .get(`${API}/report-images/${buyer.id}/${randomUUID()}.png`)
        .set(auth(buyer))
        .expect(404);
    });

    it('không phải ảnh, quá cỡ, thiếu file → 400; MinIO lỗi → 503; chưa đăng nhập → 401', async () => {
      expect((await upload(buyer, Buffer.from('<svg></svg>')).expect(400)).body.code).toBe(
        'INVALID_IMAGE',
      );
      const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
      expect((await upload(buyer, big).expect(400)).body.code).toBe('FILE_TOO_LARGE');
      const none = await t.http().post(`${API}/uploads/report-image`).set(auth(buyer)).expect(400);
      expect(none.body.code).toBe('FILE_REQUIRED');
      t.storage.fail = true;
      expect((await upload(buyer).expect(503)).body.code).toBe('STORAGE_UNAVAILABLE');
      await t.http().post(`${API}/uploads/report-image`).attach('file', PNG, 'a.png').expect(401);
    });
  });
});
