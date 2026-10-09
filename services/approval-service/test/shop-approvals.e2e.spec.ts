import { randomUUID } from 'node:crypto';
import { createTestApp, describeDb, makeUser, resetDb, submitted, type TestApp } from './helpers';

const API = '/api/approval/v1';

describeDb('Duyệt hồ sơ shop (SHP-02)', () => {
  let t: TestApp;
  const admin = makeUser('Kiểm Duyệt', ['MODERATION']);
  const seller = makeUser('Nguyễn Văn An');
  const asAdmin = () => ({ Authorization: `Bearer ${t.token(admin)}` });

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());
  beforeEach(() => resetDb(t.prisma));

  const findBy = (shopId: string, version: number) =>
    t.prisma.shopApproval.findUniqueOrThrow({ where: { shopId_version: { shopId, version } } });

  describe('quyền', () => {
    it('chưa đăng nhập → 401', async () => {
      const res = await t.http().get(`${API}/admin/shop-approvals`).expect(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('không có bộ quyền MODERATION → 403', async () => {
      for (const user of [seller, makeUser('Tài Chính', ['FINANCE'])]) {
        const res = await t
          .http()
          .get(`${API}/admin/shop-approvals`)
          .set('Authorization', `Bearer ${t.token(user)}`)
          .expect(403);
        expect(res.body.code).toBe('FORBIDDEN');
      }
      await t
        .http()
        .post(`${API}/admin/shop-approvals/${randomUUID()}/decision`)
        .set('Authorization', `Bearer ${t.token(seller)}`)
        .send({ decision: 'APPROVE' })
        .expect(403);
    });
  });

  describe('nhận sự kiện shop_application.submitted', () => {
    it('lưu hồ sơ mới ở trạng thái PENDING', async () => {
      const shopId = randomUUID();
      await t.submit(submitted({ shopId, owner: seller }));
      const a = await findBy(shopId, 1);
      expect(a).toMatchObject({
        type: 'REGISTER',
        status: 'PENDING',
        ownerId: seller.id,
        ownerName: seller.name,
        ownerEmail: seller.email,
        change: null,
        submittedAt: new Date('2026-10-08T10:00:00.000Z'),
      });
      expect(a.data).toMatchObject({ name: 'Shop Hoa Mai' });
    });

    it('bản mới thay bản cũ đang chờ (REPLACED); bản đã quyết giữ nguyên', async () => {
      const shopId = randomUUID();
      await t.submit(submitted({ shopId, owner: seller, version: 1 }));
      await t.prisma.shopApproval.update({
        where: { shopId_version: { shopId, version: 1 } },
        data: { status: 'REJECTED', reason: 'Thiếu logo' },
      });
      await t.submit(submitted({ shopId, owner: seller, version: 2 }));
      await t.submit(submitted({ shopId, owner: seller, version: 3 }));
      expect((await findBy(shopId, 1)).status).toBe('REJECTED');
      expect((await findBy(shopId, 2)).status).toBe('REPLACED');
      expect((await findBy(shopId, 3)).status).toBe('PENDING');
    });

    it('sự kiện tới sai thứ tự: bản cũ tới sau được lưu luôn là REPLACED', async () => {
      const shopId = randomUUID();
      await t.submit(submitted({ shopId, owner: seller, version: 2 }));
      await t.submit(submitted({ shopId, owner: seller, version: 1 }));
      expect((await findBy(shopId, 1)).status).toBe('REPLACED');
      expect((await findBy(shopId, 2)).status).toBe('PENDING');
    });

    it('nhận trùng phiên bản → bỏ qua, không lỗi', async () => {
      const shopId = randomUUID();
      await t.submit(submitted({ shopId, owner: seller }));
      await t.submit(
        submitted({
          shopId,
          owner: seller,
          data: { ...submitted({ shopId, owner: seller }).data, name: 'Khác' },
        }),
      );
      const rows = await t.prisma.shopApproval.findMany({ where: { shopId } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.data).toMatchObject({ name: 'Shop Hoa Mai' });
    });

    it('CHANGE: lưu phần muốn đổi', async () => {
      const shopId = randomUUID();
      const change = { fields: ['name' as const], old: { name: 'Shop Cũ' } };
      await t.submit(submitted({ shopId, owner: seller, type: 'CHANGE', change }));
      expect((await findBy(shopId, 1)).change).toEqual(change);
    });
  });

  describe('danh sách và chi tiết', () => {
    it('lọc theo trạng thái, loại; hồ sơ nộp sớm nhất lên đầu', async () => {
      const [s1, s2, s3] = [randomUUID(), randomUUID(), randomUUID()];
      await t.submit(submitted({ shopId: s1, owner: seller, submittedAt: '2026-10-08T12:00:00Z' }));
      await t.submit(
        submitted({
          shopId: s2,
          owner: seller,
          type: 'CHANGE',
          change: { fields: ['bankAccount'], old: {} },
          submittedAt: '2026-10-08T09:00:00Z',
        }),
      );
      await t.submit(submitted({ shopId: s3, owner: seller, submittedAt: '2026-10-08T10:00:00Z' }));
      await t.submit(
        submitted({ shopId: s3, owner: seller, version: 2, submittedAt: '2026-10-08T11:00:00Z' }),
      );

      const all = await t.http().get(`${API}/admin/shop-approvals`).set(asAdmin()).expect(200);
      expect(all.body).toMatchObject({ total: 4, page: 1, pageSize: 20 });
      expect(
        all.body.items.map((r: { shopId: string; version: number }) => [r.shopId, r.version]),
      ).toEqual([
        [s2, 1],
        [s3, 1],
        [s3, 2],
        [s1, 1],
      ]);
      expect(all.body.items[0]).toEqual({
        id: expect.any(String),
        shopId: s2,
        version: 1,
        type: 'CHANGE',
        status: 'PENDING',
        shopName: 'Shop Hoa Mai',
        ownerName: seller.name,
        ownerEmail: seller.email,
        submittedAt: '2026-10-08T09:00:00.000Z',
        decidedAt: null,
      });

      const pending = await t
        .http()
        .get(`${API}/admin/shop-approvals?status=PENDING&type=REGISTER`)
        .set(asAdmin())
        .expect(200);
      expect(pending.body.items.map((r: { shopId: string }) => r.shopId)).toEqual([s3, s1]);

      const page2 = await t
        .http()
        .get(`${API}/admin/shop-approvals?pageSize=3&page=2`)
        .set(asAdmin())
        .expect(200);
      expect(page2.body).toMatchObject({ total: 4, page: 2, pageSize: 3 });
      expect(page2.body.items).toHaveLength(1);

      await t.http().get(`${API}/admin/shop-approvals?status=GIA`).set(asAdmin()).expect(400);
    });

    it('chi tiết kèm lịch sử các phiên bản, mới nhất trước; mã sai → 404', async () => {
      const shopId = randomUUID();
      await t.submit(submitted({ shopId, owner: seller, version: 1 }));
      await t.submit(
        submitted({
          shopId,
          owner: seller,
          version: 2,
          type: 'CHANGE',
          change: { fields: ['name'], old: { name: 'Shop Cũ' } },
        }),
      );
      const v2 = await findBy(shopId, 2);
      const res = await t
        .http()
        .get(`${API}/admin/shop-approvals/${v2.id}`)
        .set(asAdmin())
        .expect(200);
      expect(res.body).toMatchObject({
        id: v2.id,
        ownerId: seller.id,
        status: 'PENDING',
        data: { name: 'Shop Hoa Mai', bankAccount: { bankName: 'Vietcombank' } },
        change: { fields: ['name'], old: { name: 'Shop Cũ' } },
        reason: null,
        decidedBy: null,
      });
      expect(
        res.body.history.map((h: { version: number; status: string }) => [h.version, h.status]),
      ).toEqual([
        [2, 'PENDING'],
        [1, 'REPLACED'],
      ]);

      await t.http().get(`${API}/admin/shop-approvals/abc`).set(asAdmin()).expect(404);
      await t.http().get(`${API}/admin/shop-approvals/${randomUUID()}`).set(asAdmin()).expect(404);
    });
  });

  describe('duyệt / từ chối', () => {
    let shopId: string;
    let approvalId: string;
    const decide = (body: object, user = admin, id = approvalId) =>
      t
        .http()
        .post(`${API}/admin/shop-approvals/${id}/decision`)
        .set('Authorization', `Bearer ${t.token(user)}`)
        .send(body);

    beforeEach(async () => {
      shopId = randomUUID();
      await t.submit(submitted({ shopId, owner: seller }));
      approvalId = (await findBy(shopId, 1)).id;
    });

    it('duyệt → phát shop_application.decided, ghi nhật ký', async () => {
      const res = await decide({ decision: 'APPROVE' }).expect(200);
      expect(res.body).toMatchObject({
        id: approvalId,
        status: 'APPROVED',
        reason: null,
        decidedBy: admin.id,
        decidedByName: admin.name,
        decidedAt: expect.any(String),
      });

      const outbox = await t.prisma.outboxEvent.findMany();
      expect(outbox).toHaveLength(1);
      expect(outbox[0]!.type).toBe('shop_application.decided');
      expect(outbox[0]!.payload).toMatchObject({
        type: 'shop_application.decided',
        producer: 'approval-service',
        payload: {
          shopId,
          version: 1,
          type: 'REGISTER',
          decision: 'APPROVED',
          reason: null,
          decidedBy: { userId: admin.id, name: admin.name },
          decidedAt: res.body.decidedAt,
        },
      });

      const log = await t.prisma.auditLog.findFirstOrThrow();
      expect(log).toMatchObject({
        actorId: admin.id,
        actorName: admin.name,
        action: 'APPROVE_SHOP',
        targetType: 'SHOP',
        targetId: shopId,
        reason: null,
        before: { status: 'PENDING' },
        after: { status: 'APPROVED', version: 1 },
      });
    });

    it('duyệt kèm ghi chú thì lưu; ghi chú chỉ có khoảng trắng coi như không có', async () => {
      const res = await decide({ decision: 'APPROVE', reason: '   ' }).expect(200);
      expect(res.body).toMatchObject({ status: 'APPROVED', reason: null });
    });

    it('từ chối kèm lý do', async () => {
      const res = await decide({ decision: 'REJECT', reason: '  Logo mờ  ' }).expect(200);
      expect(res.body).toMatchObject({ status: 'REJECTED', reason: 'Logo mờ' });
      const event = await t.prisma.outboxEvent.findFirstOrThrow();
      expect(event.payload).toMatchObject({
        payload: { decision: 'REJECTED', reason: 'Logo mờ' },
      });
      const log = await t.prisma.auditLog.findFirstOrThrow();
      expect(log).toMatchObject({ action: 'REJECT_SHOP', reason: 'Logo mờ' });
    });

    it('từ chối thiếu lý do hoặc quyết định lạ → 400, không đổi gì', async () => {
      for (const body of [{ decision: 'REJECT' }, { decision: 'REJECT', reason: '   ' }]) {
        const res = await decide(body).expect(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.details.fields.reason).toBe('Vui lòng nhập lý do từ chối.');
      }
      const long = await decide({ decision: 'REJECT', reason: 'a'.repeat(501) }).expect(400);
      expect(long.body.details.fields.reason).toBe('Lý do tối đa 500 ký tự.');
      const bad = await decide({ decision: 'DUYET' }).expect(400);
      expect(bad.body.details.fields.decision).toBeDefined();
      expect((await findBy(shopId, 1)).status).toBe('PENDING');
      expect(await t.prisma.outboxEvent.count()).toBe(0);
    });

    it('admin là chủ shop → 403 SELF_APPROVAL_FORBIDDEN', async () => {
      const ownerAdmin = { ...seller, permissions: ['MODERATION' as const] };
      const res = await decide({ decision: 'APPROVE' }, ownerAdmin).expect(403);
      expect(res.body.code).toBe('SELF_APPROVAL_FORBIDDEN');
      expect((await findBy(shopId, 1)).status).toBe('PENDING');
    });

    it('đã quyết → 409 ALREADY_DECIDED', async () => {
      await decide({ decision: 'APPROVE' }).expect(200);
      const other = makeUser('Admin Khác', ['MODERATION']);
      const res = await decide({ decision: 'REJECT', reason: 'Sai' }, other).expect(409);
      expect(res.body.code).toBe('ALREADY_DECIDED');
      expect(await t.prisma.outboxEvent.count()).toBe(1);
    });

    it('shop đã nộp bản mới hơn → 409 APPLICATION_REPLACED', async () => {
      await t.submit(submitted({ shopId, owner: seller, version: 2 }));
      const res = await decide({ decision: 'APPROVE' }).expect(409);
      expect(res.body.code).toBe('APPLICATION_REPLACED');
    });

    it('hai admin bấm cùng lúc → chỉ một người quyết được', async () => {
      const other = makeUser('Admin Khác', ['MODERATION']);
      const results = await Promise.all([
        decide({ decision: 'APPROVE' }),
        decide({ decision: 'REJECT', reason: 'Sai' }, other),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await t.prisma.outboxEvent.count()).toBe(1);
      expect(await t.prisma.auditLog.count()).toBe(1);
    });

    it('mã hồ sơ không có → 404', async () => {
      await decide({ decision: 'APPROVE' }, admin, randomUUID()).expect(404);
    });
  });
});
