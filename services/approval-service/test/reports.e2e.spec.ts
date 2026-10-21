import { randomUUID } from 'node:crypto';
import { AppError, type AuthUser } from '@san/nest-common';
import { MarketplaceClient, type PublicProductInfo } from '../src/clients/marketplace.client';
import { createTestApp, describeDb, makeUser, resetDb, submitted, type TestApp } from './helpers';

const API = '/api/approval/v1';

describeDb('Báo cáo vi phạm và kiểm duyệt (MOD-01)', () => {
  let t: TestApp;
  let market: jest.SpyInstance<Promise<PublicProductInfo>, [string]>;
  const admin = makeUser('Kiểm Duyệt', ['MODERATION']);
  const admin2 = makeUser('Kiểm Duyệt Hai', ['MODERATION']);
  const seller = makeUser('Nguyễn Văn An');
  const buyer = makeUser('Trần Thị Bình');
  const buyer2 = makeUser('Lê Văn Cường');
  let shopId: string;
  let productId: string;
  /** Sản phẩm đang bán theo marketplace giả: mã → shop */
  let products: Map<string, PublicProductInfo>;

  beforeAll(async () => {
    t = await createTestApp();
    market = jest.spyOn(t.app.get(MarketplaceClient), 'product');
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    shopId = randomUUID();
    productId = randomUUID();
    await approve(shopId, seller, 'Shop Hoa Mai');
    products = new Map([
      [productId, { id: productId, name: 'Điện thoại X', image: 'http://img/x.png', shopId }],
    ]);
    market.mockReset();
    market.mockImplementation(async (id: string) => {
      const p = products.get(id);
      if (!p) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy sản phẩm.');
      return p;
    });
  });

  /** Hồ sơ mở shop đã được duyệt (approval biết chủ shop từ đây) */
  async function approve(id: string, owner: AuthUser, name: string) {
    const base = submitted({ shopId: id, owner });
    await t.submit({ ...base, data: { ...base.data, name } });
    await t.prisma.shopApproval.update({
      where: { shopId_version: { shopId: id, version: 1 } },
      data: { status: 'APPROVED', decidedAt: new Date() },
    });
  }

  const auth = (u: AuthUser) => ({ Authorization: `Bearer ${t.token(u)}` });
  const imageKey = (u: AuthUser, ext = 'png') => `report-images/${u.id}/${randomUUID()}.${ext}`;
  const report = (
    body: Record<string, unknown> = {},
    user: AuthUser = buyer,
    key: string | null = randomUUID(),
  ) => {
    const req = t.http().post(`${API}/reports`).set(auth(user));
    if (key) req.set('Idempotency-Key', key);
    return req.send({
      targetType: 'PRODUCT',
      targetId: productId,
      reason: 'COUNTERFEIT',
      note: 'Hàng nhái, logo in lệch',
      ...body,
    });
  };
  const resolve = (id: string, body: object, user: AuthUser = admin) =>
    t.http().post(`${API}/admin/reports/${id}/resolve`).set(auth(user)).send(body);
  const restore = (id: string, user: AuthUser = admin, reason = 'Đã sửa thông tin') =>
    t.http().post(`${API}/admin/products/${id}/restore`).set(auth(user)).send({ reason });
  const outbox = async (type: string) =>
    (await t.prisma.outboxEvent.findMany({ where: { type }, orderBy: { createdAt: 'asc' } })).map(
      (e) => (e.payload as { payload: Record<string, unknown> }).payload,
    );

  describe('gửi báo cáo', () => {
    it('báo cáo sản phẩm: tên, ảnh, shop từ marketplace; chủ shop từ hồ sơ đã duyệt', async () => {
      const images = [imageKey(buyer), imageKey(buyer, 'webp')];
      const res = await report({ images, note: '  Hàng nhái, logo in lệch  ' }).expect(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        targetType: 'PRODUCT',
        targetId: productId,
        targetName: 'Điện thoại X',
        targetImage: 'http://img/x.png',
        shopId,
        reason: 'COUNTERFEIT',
        note: 'Hàng nhái, logo in lệch',
        images,
        status: 'PENDING',
        adminNote: null,
        handledAt: null,
        createdAt: expect.any(String),
      });
      expect(market).toHaveBeenCalledWith(productId);
      const row = await t.prisma.violation.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row).toMatchObject({
        ownerId: seller.id,
        reporterId: buyer.id,
        reporterName: buyer.name,
        action: null,
      });
      // Báo cáo không phải quyết định: không phát sự kiện, lịch sử đình chỉ shop (P2) không đổi
      expect(await t.prisma.outboxEvent.count()).toBe(0);
      const hist = await t
        .http()
        .get(`${API}/admin/shops/${shopId}/violations`)
        .set(auth(admin))
        .expect(200);
      expect(hist.body).toEqual({ suspended: false, items: [] });
    });

    it('báo cáo shop: lấy từ hồ sơ shop đã duyệt, không gọi marketplace', async () => {
      const res = await report({ targetType: 'SHOP', targetId: shopId, reason: 'SCAM' }).expect(
        201,
      );
      expect(res.body).toMatchObject({ targetType: 'SHOP', targetName: 'Shop Hoa Mai', shopId });
      expect(market).not.toHaveBeenCalled();
      // Shop chưa được duyệt (hoặc mã lạ) → 404
      const pending = randomUUID();
      await t.submit(submitted({ shopId: pending, owner: seller }));
      for (const id of [pending, randomUUID()]) {
        expect((await report({ targetType: 'SHOP', targetId: id }).expect(404)).body.code).toBe(
          'NOT_FOUND',
        );
      }
    });

    it('sản phẩm không đang bán → 404; marketplace lỗi → 503', async () => {
      expect((await report({ targetId: randomUUID() }).expect(404)).body.code).toBe('NOT_FOUND');
      market.mockRejectedValueOnce(
        new AppError(503, 'MARKETPLACE_SERVICE_UNAVAILABLE', 'Chưa kiểm tra được sản phẩm.'),
      );
      expect((await report().expect(503)).body.code).toBe('MARKETPLACE_SERVICE_UNAVAILABLE');
      expect(await t.prisma.violation.count()).toBe(0);
    });

    it('sản phẩm/shop của chính mình → 409 OWN_TARGET', async () => {
      expect((await report({}, seller).expect(409)).body.code).toBe('OWN_TARGET');
      const res = await report({ targetType: 'SHOP', targetId: shopId }, seller).expect(409);
      expect(res.body.code).toBe('OWN_TARGET');
      expect(await t.prisma.violation.count()).toBe(0);
    });

    it('đang có báo cáo chờ cho cùng đối tượng → 409 ALREADY_REPORTED; người khác vẫn báo được', async () => {
      await report().expect(201);
      expect((await report({ reason: 'SCAM' }).expect(409)).body.code).toBe('ALREADY_REPORTED');
      await report({}, buyer2).expect(201);
      // Báo cáo shop là đối tượng khác
      await report({ targetType: 'SHOP', targetId: shopId }).expect(201);
      // Một người bấm hai lần cùng lúc (hai key khác nhau): chỉ một báo cáo
      const same = makeUser('Bấm Nhanh');
      const racing = await Promise.all([report({}, same), report({}, same)]);
      expect(racing.map((r) => r.status).sort()).toEqual([201, 409]);
    });

    it('báo cáo cũ đã được xử lý thì được báo cáo lại', async () => {
      const first = await report().expect(201);
      await resolve(first.body.id, { decision: 'DISMISS', reason: 'Không đủ bằng chứng' }).expect(
        200,
      );
      await report().expect(201);
    });

    it('Idempotency-Key: thiếu → 400; gửi lại → báo cáo cũ; key của người khác → 409', async () => {
      expect((await report({}, buyer, null).expect(400)).body.code).toBe(
        'IDEMPOTENCY_KEY_REQUIRED',
      );
      const key = randomUUID();
      const a = await report({}, buyer, key).expect(201);
      const b = await report({ reason: 'SCAM' }, buyer, key).expect(201);
      expect(b.body.id).toBe(a.body.id);
      expect(b.body.reason).toBe('COUNTERFEIT');
      expect((await report({}, buyer2, key).expect(409)).body.code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(await t.prisma.violation.count()).toBe(1);
    });

    it('khóa ảnh sai (của người khác, sai thư mục, sai đuôi) → 400 INVALID_IMAGE_KEY; quá 5 ảnh → 400', async () => {
      for (const key of [
        imageKey(buyer2),
        `return-images/${buyer.id}/${randomUUID()}.png`,
        `report-images/${buyer.id}/${randomUUID()}.gif`,
        `report-images/${buyer.id}/../${randomUUID()}.png`,
        'http://evil/x.png',
      ]) {
        const res = await report({ images: [imageKey(buyer), key] }).expect(400);
        expect(res.body.code).toBe('INVALID_IMAGE_KEY');
      }
      const six = Array.from({ length: 6 }, () => imageKey(buyer));
      const res = await report({ images: six }).expect(400);
      expect(res.body.details.fields.images).toBeDefined();
      expect(await t.prisma.violation.count()).toBe(0);
    });

    it('dữ liệu sai → 400 VALIDATION_ERROR', async () => {
      for (const body of [
        { targetType: 'USER' },
        { targetId: 'abc' },
        { reason: 'SPAM' },
        { note: 'ngắn' },
        { note: 'x'.repeat(1001) },
      ]) {
        expect((await report(body).expect(400)).body.code).toBe('VALIDATION_ERROR');
      }
      await t.http().post(`${API}/reports`).send({}).expect(401);
    });

    it('GET /me/reports: chỉ báo cáo của mình, mới nhất trước, kèm ghi chú của admin khi đã xử lý', async () => {
      const first = await report().expect(201);
      await report({ targetType: 'SHOP', targetId: shopId }).expect(201);
      await report({}, buyer2).expect(201);
      await resolve(first.body.id, { decision: 'DISMISS', reason: 'Không đủ bằng chứng' }).expect(
        200,
      );
      const res = await t.http().get(`${API}/me/reports`).set(auth(buyer)).expect(200);
      expect(res.body.total).toBe(2);
      expect(res.body.items.map((r: { targetType: string }) => r.targetType)).toEqual([
        'SHOP',
        'PRODUCT',
      ]);
      expect(res.body.items[1]).toMatchObject({
        status: 'DISMISSED',
        adminNote: 'Không đủ bằng chứng',
        handledAt: expect.any(String),
      });
    });
  });

  describe('admin xử lý', () => {
    it('không có bộ quyền MODERATION → 403', async () => {
      const r = await report().expect(201);
      for (const u of [buyer, makeUser('Hỗ Trợ', ['SUPPORT'])]) {
        await t.http().get(`${API}/admin/reports`).set(auth(u)).expect(403);
        await t.http().get(`${API}/admin/reports/${r.body.id}`).set(auth(u)).expect(403);
        await resolve(r.body.id, { decision: 'DISMISS', reason: 'Không vi phạm' }, u).expect(403);
        await restore(productId, u).expect(403);
        await t
          .http()
          .get(`${API}/admin/products/${productId}/violations`)
          .set(auth(u))
          .expect(403);
      }
    });

    it('danh sách: lọc trạng thái/loại, chờ lâu nhất trước, kèm số báo cáo đang chờ của cùng đối tượng', async () => {
      const a = await report().expect(201);
      const b = await report({}, buyer2).expect(201);
      const c = await report({ targetType: 'SHOP', targetId: shopId }).expect(201);
      const list = await t.http().get(`${API}/admin/reports`).set(auth(admin)).expect(200);
      expect(list.body.items.map((r: { id: string }) => r.id)).toEqual([
        a.body.id,
        b.body.id,
        c.body.id,
      ]);
      expect(list.body.items[0]).toMatchObject({
        reporter: { id: buyer.id, name: buyer.name },
        ownerId: seller.id,
        pendingCount: 2,
      });
      expect(list.body.items[2].pendingCount).toBe(1);
      const shops = await t
        .http()
        .get(`${API}/admin/reports?targetType=SHOP`)
        .set(auth(admin))
        .expect(200);
      expect(shops.body.total).toBe(1);
      const done = await t
        .http()
        .get(`${API}/admin/reports?status=RESOLVED`)
        .set(auth(admin))
        .expect(200);
      expect(done.body.total).toBe(0);
    });

    it('gỡ sản phẩm: mọi báo cáo đang chờ của sản phẩm RESOLVED, thêm dòng REMOVE, phát product_moderation.decided, ghi nhật ký', async () => {
      const a = await report().expect(201);
      const b = await report({}, buyer2).expect(201);
      const other = await report({ targetType: 'SHOP', targetId: shopId }).expect(201);
      const res = await resolve(a.body.id, {
        decision: 'REMOVE_PRODUCT',
        reason: '  Hàng giả nhãn hiệu  ',
      }).expect(200);
      expect(res.body).toMatchObject({
        id: a.body.id,
        status: 'RESOLVED',
        adminNote: 'Hàng giả nhãn hiệu',
        handledByName: admin.name,
        removed: true,
        suspended: false,
        pendingCount: 0,
      });
      expect(res.body.others).toHaveLength(1);
      expect(res.body.others[0]).toMatchObject({ id: b.body.id, status: 'RESOLVED' });
      expect(res.body.history).toEqual([
        expect.objectContaining({
          targetType: 'PRODUCT',
          targetId: productId,
          targetName: 'Điện thoại X',
          action: 'REMOVE',
          reason: 'Hàng giả nhãn hiệu',
          decidedBy: admin.id,
        }),
      ]);
      // Báo cáo shop không bị đụng tới
      const shopReport = await t.prisma.violation.findUniqueOrThrow({
        where: { id: other.body.id },
      });
      expect(shopReport.status).toBe('PENDING');

      const events = await outbox('product_moderation.decided');
      expect(events).toEqual([
        {
          productId,
          shopId,
          action: 'REMOVE',
          reason: 'Hàng giả nhãn hiệu',
          decidedBy: { userId: admin.id, name: admin.name },
          decidedAt: expect.any(String),
        },
      ]);
      const logs = await t.prisma.auditLog.findMany({ orderBy: { action: 'asc' } });
      expect(logs.map((l) => l.action)).toEqual(['REMOVE_PRODUCT', 'RESOLVE_REPORT']);
      expect(logs[1]).toMatchObject({
        actorId: admin.id,
        targetType: 'REPORT',
        targetId: a.body.id,
        after: expect.objectContaining({ decision: 'REMOVE_PRODUCT', applied: true, reports: 2 }),
      });
      const hist = await t
        .http()
        .get(`${API}/admin/products/${productId}/violations`)
        .set(auth(admin))
        .expect(200);
      expect(hist.body.removed).toBe(true);
      expect(hist.body.items).toHaveLength(1);
    });

    it('đình chỉ shop từ báo cáo sản phẩm: như POST /admin/shops/{id}/suspend', async () => {
      const a = await report().expect(201);
      const res = await resolve(a.body.id, {
        decision: 'SUSPEND_SHOP',
        reason: 'Bán hàng giả nhiều lần',
      }).expect(200);
      expect(res.body).toMatchObject({ status: 'RESOLVED', suspended: true, removed: false });
      expect(res.body.history[0]).toMatchObject({ targetType: 'SHOP', action: 'SUSPEND' });
      const events = await outbox('shop_suspension.decided');
      expect(events).toEqual([expect.objectContaining({ shopId, action: 'SUSPEND' })]);
      expect(await outbox('product_moderation.decided')).toEqual([]);
      const hist = await t
        .http()
        .get(`${API}/admin/shops/${shopId}/violations`)
        .set(auth(admin))
        .expect(200);
      expect(hist.body.suspended).toBe(true);
      expect(hist.body.items).toHaveLength(1);
      // Khôi phục shop bằng API P2 vẫn chạy (lịch sử chỉ đọc dòng quyết định)
      await t
        .http()
        .post(`${API}/admin/shops/${shopId}/restore`)
        .set(auth(admin))
        .send({ reason: 'Đã khắc phục' })
        .expect(200);
    });

    it('đình chỉ từ báo cáo shop; shop đã bị đình chỉ thì chỉ đánh dấu báo cáo', async () => {
      const a = await report({ targetType: 'SHOP', targetId: shopId }).expect(201);
      await t
        .http()
        .post(`${API}/admin/shops/${shopId}/suspend`)
        .set(auth(admin2))
        .send({ reason: 'Đình chỉ trước đó' })
        .expect(200);
      const res = await resolve(a.body.id, {
        decision: 'SUSPEND_SHOP',
        reason: 'Lừa đảo khách hàng',
      }).expect(200);
      expect(res.body).toMatchObject({ status: 'RESOLVED', suspended: true, removed: null });
      expect(await outbox('shop_suspension.decided')).toHaveLength(1);
      const log = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'RESOLVE_REPORT' } });
      expect(log.after).toMatchObject({ applied: false });
    });

    it('sản phẩm đã bị gỡ: báo cáo mới chỉ được đánh dấu, không phát sự kiện mới', async () => {
      const a = await report().expect(201);
      await resolve(a.body.id, { decision: 'REMOVE_PRODUCT', reason: 'Hàng giả' }).expect(200);
      // Marketplace còn trả sản phẩm (ví dụ sự kiện chưa tới) nên người khác vẫn báo cáo được
      const b = await report({}, buyer2).expect(201);
      const res = await resolve(
        b.body.id,
        { decision: 'REMOVE_PRODUCT', reason: 'Lại hàng giả' },
        admin2,
      ).expect(200);
      expect(res.body.status).toBe('RESOLVED');
      expect(await outbox('product_moderation.decided')).toHaveLength(1);
      expect(res.body.history).toHaveLength(1);
    });

    it('bác báo cáo: mọi báo cáo đang chờ cùng đối tượng DISMISSED, không có quyết định nào', async () => {
      const a = await report().expect(201);
      await report({}, buyer2).expect(201);
      const res = await resolve(a.body.id, {
        decision: 'DISMISS',
        reason: 'Không thấy vi phạm',
      }).expect(200);
      expect(res.body).toMatchObject({ status: 'DISMISSED', removed: false });
      expect(res.body.others[0].status).toBe('DISMISSED');
      expect(await t.prisma.violation.count({ where: { action: { not: null } } })).toBe(0);
      expect(await t.prisma.outboxEvent.count()).toBe(0);
      expect((await t.prisma.auditLog.findFirstOrThrow()).action).toBe('DISMISS_REPORT');
      const list = await t
        .http()
        .get(`${API}/admin/reports?status=DISMISSED`)
        .set(auth(admin))
        .expect(200);
      expect(list.body.total).toBe(2);
    });

    it('đã xử lý → 409 REPORT_ALREADY_HANDLED; hai admin cùng lúc → một người được', async () => {
      const a = await report().expect(201);
      const both = await Promise.all([
        resolve(a.body.id, { decision: 'REMOVE_PRODUCT', reason: 'Hàng giả một' }),
        resolve(a.body.id, { decision: 'DISMISS', reason: 'Không vi phạm' }, admin2),
      ]);
      expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(both.find((r) => r.status === 409)!.body.code).toBe('REPORT_ALREADY_HANDLED');
      expect(await t.prisma.violation.count({ where: { action: { not: null } } })).toBeLessThan(2);
    });

    it('admin là chủ shop → 403 SELF_MODERATION_FORBIDDEN (kể cả bác báo cáo)', async () => {
      const a = await report().expect(201);
      const ownerAdmin = { ...seller, permissions: ['MODERATION' as const] };
      for (const decision of ['REMOVE_PRODUCT', 'SUSPEND_SHOP', 'DISMISS']) {
        const res = await resolve(a.body.id, { decision, reason: 'Tự xử lý' }, ownerAdmin).expect(
          403,
        );
        expect(res.body.code).toBe('SELF_MODERATION_FORBIDDEN');
      }
      expect(
        (await t.prisma.violation.findUniqueOrThrow({ where: { id: a.body.id } })).status,
      ).toBe('PENDING');
    });

    it('gỡ sản phẩm với báo cáo shop → 400; thiếu lý do → 400; báo cáo lạ → 404', async () => {
      const a = await report({ targetType: 'SHOP', targetId: shopId }).expect(201);
      const res = await resolve(a.body.id, { decision: 'REMOVE_PRODUCT', reason: 'Hàng giả' });
      expect(res.status).toBe(400);
      expect(res.body.details.fields.decision).toBeDefined();
      for (const body of [{ decision: 'DISMISS' }, { decision: 'DISMISS', reason: 'abc' }, {}]) {
        expect((await resolve(a.body.id, body).expect(400)).body.code).toBe('VALIDATION_ERROR');
      }
      await resolve(randomUUID(), { decision: 'DISMISS', reason: 'Không vi phạm' }).expect(404);
      await t.http().get(`${API}/admin/reports/${randomUUID()}`).set(auth(admin)).expect(404);
      // Dòng quyết định không phải báo cáo
      await t
        .http()
        .post(`${API}/admin/shops/${shopId}/suspend`)
        .set(auth(admin))
        .send({ reason: 'Đình chỉ' })
        .expect(200);
      const decision = await t.prisma.violation.findFirstOrThrow({ where: { action: 'SUSPEND' } });
      await t.http().get(`${API}/admin/reports/${decision.id}`).set(auth(admin)).expect(404);
    });
  });

  describe('khôi phục sản phẩm', () => {
    async function removed() {
      const a = await report().expect(201);
      await resolve(a.body.id, { decision: 'REMOVE_PRODUCT', reason: 'Hàng giả' }).expect(200);
      return a.body.id as string;
    }

    it('thêm dòng RESTORE, phát product_moderation.decided (decidedAt tăng dần), ghi nhật ký', async () => {
      await removed();
      const res = await restore(productId, admin2).expect(200);
      expect(res.body.removed).toBe(false);
      expect(res.body.items.map((i: { action: string }) => i.action)).toEqual([
        'RESTORE',
        'REMOVE',
      ]);
      const events = await outbox('product_moderation.decided');
      expect(events.map((e) => e.action)).toEqual(['REMOVE', 'RESTORE']);
      expect(events[1]).toMatchObject({ productId, shopId, reason: 'Đã sửa thông tin' });
      expect(Date.parse(events[1]!.decidedAt as string)).toBeGreaterThan(
        Date.parse(events[0]!.decidedAt as string),
      );
      expect(
        await t.prisma.auditLog.findFirst({
          where: { action: 'RESTORE_PRODUCT', actorId: admin2.id },
        }),
      ).not.toBeNull();
      // Gỡ lại được sau khi khôi phục
      const b = await report({}, buyer2).expect(201);
      const again = await resolve(b.body.id, { decision: 'REMOVE_PRODUCT', reason: 'Tái phạm' });
      expect(again.body.removed).toBe(true);
      expect(again.body.history).toHaveLength(3);
    });

    it('sản phẩm không bị gỡ → 409 NOT_REMOVED; admin là chủ shop → 403', async () => {
      expect((await restore(productId).expect(409)).body.code).toBe('NOT_REMOVED');
      await removed();
      const ownerAdmin = { ...seller, permissions: ['MODERATION' as const] };
      expect((await restore(productId, ownerAdmin).expect(403)).body.code).toBe(
        'SELF_MODERATION_FORBIDDEN',
      );
      await restore(productId).expect(200);
      expect((await restore(productId).expect(409)).body.code).toBe('NOT_REMOVED');
      const hist = await t
        .http()
        .get(`${API}/admin/products/${randomUUID()}/violations`)
        .set(auth(admin))
        .expect(200);
      expect(hist.body).toEqual({ removed: false, items: [] });
    });
  });
});
