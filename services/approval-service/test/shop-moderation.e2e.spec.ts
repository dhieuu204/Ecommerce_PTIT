import { randomUUID } from 'node:crypto';
import type { AuthUser } from '@san/nest-common';
import { createTestApp, describeDb, makeUser, resetDb, submitted, type TestApp } from './helpers';

const API = '/api/approval/v1';

describeDb('Đình chỉ / khôi phục shop (SHP-04)', () => {
  let t: TestApp;
  const admin = makeUser('Kiểm Duyệt', ['MODERATION']);
  const admin2 = makeUser('Kiểm Duyệt Hai', ['MODERATION']);
  const seller = makeUser('Nguyễn Văn An');
  let shopId: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    shopId = randomUUID();
    await approve(shopId, 1, 'REGISTER', 'Shop Hoa Mai');
  });

  /** Lưu hồ sơ rồi đánh dấu đã duyệt (như admin đã duyệt ở SHP-02) */
  async function approve(id: string, version: number, type: 'REGISTER' | 'CHANGE', name: string) {
    const base = submitted({ shopId: id, owner: seller });
    await t.submit({ ...base, version, type, data: { ...base.data, name } });
    await t.prisma.shopApproval.update({
      where: { shopId_version: { shopId: id, version } },
      data: { status: 'APPROVED', decidedAt: new Date() },
    });
  }

  const act = (
    action: 'suspend' | 'restore',
    body: object = { reason: 'Bán hàng giả' },
    user: AuthUser = admin,
    id = shopId,
  ) =>
    t
      .http()
      .post(`${API}/admin/shops/${id}/${action}`)
      .set('Authorization', `Bearer ${t.token(user)}`)
      .send(body);
  const history = (id = shopId, user: AuthUser = admin) =>
    t
      .http()
      .get(`${API}/admin/shops/${id}/violations`)
      .set('Authorization', `Bearer ${t.token(user)}`);

  it('không có bộ quyền MODERATION → 403', async () => {
    for (const user of [seller, makeUser('Tài Chính', ['FINANCE'])]) {
      expect((await act('suspend', undefined, user).expect(403)).body.code).toBe('FORBIDDEN');
      await act('restore', undefined, user).expect(403);
      await history(shopId, user).expect(403);
    }
    await t.http().get(`${API}/admin/shops/${shopId}/violations`).expect(401);
  });

  it('đình chỉ: lưu violation, ghi nhật ký, phát shop_suspension.decided; lịch sử trả suspended', async () => {
    const res = await act('suspend', { reason: '  Bán hàng giả  ' }).expect(200);
    expect(res.body).toEqual({
      suspended: true,
      items: [
        {
          id: expect.any(String),
          action: 'SUSPEND',
          reason: 'Bán hàng giả',
          decidedBy: admin.id,
          decidedByName: admin.name,
          createdAt: expect.any(String),
          targetName: 'Shop Hoa Mai',
        },
      ],
    });
    const v = await t.prisma.violation.findFirstOrThrow();
    expect(v).toMatchObject({ targetType: 'SHOP', targetId: shopId, ownerId: seller.id });

    const outbox = await t.prisma.outboxEvent.findMany();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.payload).toMatchObject({
      type: 'shop_suspension.decided',
      producer: 'approval-service',
      payload: {
        shopId,
        action: 'SUSPEND',
        reason: 'Bán hàng giả',
        decidedBy: { userId: admin.id, name: admin.name },
        decidedAt: v.createdAt.toISOString(),
      },
    });
    const log = await t.prisma.auditLog.findFirstOrThrow();
    expect(log).toMatchObject({
      actorId: admin.id,
      action: 'SUSPEND_SHOP',
      targetType: 'SHOP',
      targetId: shopId,
      reason: 'Bán hàng giả',
      before: { suspended: false },
      after: { suspended: true },
    });
  });

  it('đình chỉ rồi khôi phục: lịch sử mới nhất trước, decidedAt tăng dần', async () => {
    await act('suspend').expect(200);
    const res = await act('restore', { reason: 'Đã gỡ hàng vi phạm' }, admin2).expect(200);
    expect(res.body.suspended).toBe(false);
    expect(res.body.items.map((i: { action: string }) => i.action)).toEqual(['RESTORE', 'SUSPEND']);
    expect(res.body.items[0]).toMatchObject({ decidedBy: admin2.id, reason: 'Đã gỡ hàng vi phạm' });

    const events = await t.prisma.outboxEvent.findMany({ orderBy: { createdAt: 'asc' } });
    const times = events.map((e) => (e.payload as { payload: { decidedAt: string } }).payload);
    expect(times.map((p) => (p as unknown as { action: string }).action)).toEqual([
      'SUSPEND',
      'RESTORE',
    ]);
    expect(Date.parse(times[1]!.decidedAt)).toBeGreaterThan(Date.parse(times[0]!.decidedAt));
    expect((await t.prisma.auditLog.findMany()).map((l) => l.action).sort()).toEqual([
      'RESTORE_SHOP',
      'SUSPEND_SHOP',
    ]);
    expect((await history().expect(200)).body.suspended).toBe(false);
  });

  it('đang bị đình chỉ → 409 ALREADY_SUSPENDED; không bị đình chỉ → 409 NOT_SUSPENDED', async () => {
    expect((await act('restore').expect(409)).body.code).toBe('NOT_SUSPENDED');
    await act('suspend').expect(200);
    expect((await act('suspend').expect(409)).body.code).toBe('ALREADY_SUSPENDED');
    expect(await t.prisma.violation.count()).toBe(1);
    expect(await t.prisma.outboxEvent.count()).toBe(1);
  });

  it('hai admin đình chỉ cùng lúc → chỉ một người được', async () => {
    const results = await Promise.all([
      act('suspend', { reason: 'Lý do một' }),
      act('suspend', { reason: 'Lý do hai' }, admin2),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await t.prisma.violation.count()).toBe(1);
    expect(await t.prisma.outboxEvent.count()).toBe(1);
  });

  it('admin là chủ shop → 403 SELF_MODERATION_FORBIDDEN', async () => {
    const ownerAdmin = { ...seller, permissions: ['MODERATION' as const] };
    const res = await act('suspend', undefined, ownerAdmin).expect(403);
    expect(res.body.code).toBe('SELF_MODERATION_FORBIDDEN');
    expect(await t.prisma.violation.count()).toBe(0);
  });

  it('shop chưa từng được duyệt (hoặc mã lạ) → 404', async () => {
    const pending = randomUUID();
    await t.submit(submitted({ shopId: pending, owner: seller }));
    for (const id of [pending, randomUUID(), 'abc']) {
      expect((await act('suspend', undefined, admin, id).expect(404)).body.code).toBe('NOT_FOUND');
      await history(id).expect(404);
    }
    // Chỉ có yêu cầu đổi thông tin được duyệt (không có hồ sơ mở shop được duyệt) → vẫn 404
    const changeOnly = randomUUID();
    await approve(changeOnly, 1, 'CHANGE', 'Shop Lạ');
    await act('suspend', undefined, admin, changeOnly).expect(404);
  });

  it('tên shop lấy từ hồ sơ được duyệt mới nhất (kể cả đổi tên)', async () => {
    await approve(shopId, 2, 'CHANGE', 'Shop Hoa Mai Mới');
    const base = submitted({ shopId, owner: seller });
    await t.submit({
      ...base,
      version: 3,
      type: 'CHANGE',
      data: { ...base.data, name: 'Đang Chờ' },
    });
    const res = await act('suspend').expect(200);
    expect(res.body.items[0].targetName).toBe('Shop Hoa Mai Mới');
  });

  it('lý do thiếu, quá ngắn hoặc quá dài → 400', async () => {
    for (const body of [{}, { reason: '   ' }, { reason: 'abc' }, { reason: 'x'.repeat(501) }]) {
      const res = await act('suspend', body).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details.fields.reason).toBeDefined();
    }
    expect(await t.prisma.violation.count()).toBe(0);
  });
});
