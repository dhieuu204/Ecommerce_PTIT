import { createTestApp, describeDb, resetDb, signUp, type TestApp } from './helpers';

const API = '/api/user/v1';

describeDb('Admin: người dùng, bộ quyền, khóa tài khoản, nhật ký (ACC-05, ADM-02)', () => {
  let t: TestApp;
  let admin: { accessToken: string; userId: string };
  let user: { accessToken: string; userId: string; cookie: string };
  const asAdmin = () => ({ Authorization: `Bearer ${admin.accessToken}` });

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    const a = await signUp(t, 'admin@san.vn', 'matkhau123', 'Quản Trị');
    await t.prisma.user.update({ where: { id: a.userId }, data: { permissions: ['SYSTEM'] } });
    const res = await t
      .http()
      .post(`${API}/auth/refresh`)
      .set('Cookie', `san_refresh=${a.cookie}`)
      .expect(200);
    admin = { accessToken: res.body.accessToken, userId: a.userId };
    user = await signUp(t, 'binh@gmail.com', 'matkhau123', 'Trần Bình');
  });

  it('người không có bộ quyền SYSTEM → 403', async () => {
    const res = await t
      .http()
      .get(`${API}/admin/users`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
    await t
      .http()
      .get(`${API}/admin/audit-logs`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(403);
  });

  it('danh sách lọc theo tên/email, trạng thái, bộ quyền', async () => {
    const all = await t.http().get(`${API}/admin/users`).set(asAdmin()).expect(200);
    expect(all.body).toMatchObject({ total: 2, page: 1, pageSize: 20 });
    const byName = await t.http().get(`${API}/admin/users?q=bÌnh`).set(asAdmin()).expect(200);
    expect(byName.body.items.map((u: { email: string }) => u.email)).toEqual(['binh@gmail.com']);
    const admins = await t
      .http()
      .get(`${API}/admin/users?permission=SYSTEM`)
      .set(asAdmin())
      .expect(200);
    expect(admins.body.total).toBe(1);
    await t.http().get(`${API}/admin/users?status=GIA`).set(asAdmin()).expect(400);
  });

  it('chi tiết: không trả mật khẩu; mã sai → 404', async () => {
    const res = await t.http().get(`${API}/admin/users/${user.userId}`).set(asAdmin()).expect(200);
    expect(res.body).toMatchObject({ email: 'binh@gmail.com', activeSessions: 1 });
    expect(res.body.passwordHash).toBeUndefined();
    await t.http().get(`${API}/admin/users/abc`).set(asAdmin()).expect(404);
  });

  describe('bộ quyền', () => {
    const setPerms = (id: string, permissions: string[], reason = 'Phân công') =>
      t
        .http()
        .put(`${API}/admin/users/${id}/permissions`)
        .set(asAdmin())
        .send({ permissions, reason });

    it('cấp quyền: ghi nhật ký, không đăng xuất người được cấp', async () => {
      const res = await setPerms(user.userId, ['MODERATION', 'SUPPORT']).expect(200);
      expect(res.body.permissions).toEqual(['MODERATION', 'SUPPORT']);
      const log = await t.prisma.auditLog.findFirstOrThrow();
      expect(log).toMatchObject({
        actorId: admin.userId,
        actorName: 'Quản Trị',
        action: 'SET_PERMISSIONS',
        targetType: 'USER',
        targetId: user.userId,
        reason: 'Phân công',
        before: { permissions: [] },
        after: { permissions: ['MODERATION', 'SUPPORT'] },
      });
      await t
        .http()
        .post(`${API}/auth/refresh`)
        .set('Cookie', `san_refresh=${user.cookie}`)
        .expect(200);
    });

    it('bỏ bớt quyền → người đó bị đăng xuất mọi nơi', async () => {
      await setPerms(user.userId, ['MODERATION']).expect(200);
      await setPerms(user.userId, []).expect(200);
      await t
        .http()
        .post(`${API}/auth/refresh`)
        .set('Cookie', `san_refresh=${user.cookie}`)
        .expect(401);
    });

    it('không tự bỏ SYSTEM của mình → 409 CANNOT_REMOVE_OWN_SYSTEM', async () => {
      const res = await setPerms(admin.userId, ['MODERATION']).expect(409);
      expect(res.body.code).toBe('CANNOT_REMOVE_OWN_SYSTEM');
      await setPerms(admin.userId, ['SYSTEM', 'FINANCE']).expect(200);
    });

    it('thiếu lý do hoặc bộ quyền lạ → 400', async () => {
      const res = await setPerms(user.userId, ['MODERATION'], ' ').expect(400);
      expect(res.body.details.fields.reason).toBe('Vui lòng nhập lý do.');
      await setPerms(user.userId, ['ADMIN']).expect(400);
    });
  });

  describe('khóa tài khoản', () => {
    const post = (id: string, action: 'lock' | 'unlock', reason = 'Lừa đảo') =>
      t.http().post(`${API}/admin/users/${id}/${action}`).set(asAdmin()).send({ reason });

    it('khóa → đăng xuất mọi nơi, không đăng nhập được; mở khóa → đăng nhập lại được', async () => {
      const locked = await post(user.userId, 'lock').expect(200);
      expect(locked.body).toMatchObject({
        status: 'LOCKED',
        lockReason: 'Lừa đảo',
        activeSessions: 0,
      });
      await t
        .http()
        .post(`${API}/auth/refresh`)
        .set('Cookie', `san_refresh=${user.cookie}`)
        .expect(401);
      const login = () =>
        t
          .http()
          .post(`${API}/auth/login`)
          .send({ email: 'binh@gmail.com', password: 'matkhau123' });
      expect((await login().expect(403)).body.code).toBe('ACCOUNT_LOCKED');

      await post(user.userId, 'lock').expect(409);
      const unlocked = await post(user.userId, 'unlock', 'Đã xác minh').expect(200);
      expect(unlocked.body).toMatchObject({ status: 'ACTIVE', lockReason: null });
      await login().expect(200);
      await post(user.userId, 'unlock').expect(409);

      const actions = await t.prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
      expect(actions.map((a) => a.action)).toEqual(['LOCK_USER', 'UNLOCK_USER']);
    });

    it('không tự khóa mình → 409 CANNOT_LOCK_SELF', async () => {
      const res = await post(admin.userId, 'lock').expect(409);
      expect(res.body.code).toBe('CANNOT_LOCK_SELF');
    });
  });

  it('nhật ký thao tác: mới nhất lên đầu, lọc theo hành động', async () => {
    await t
      .http()
      .put(`${API}/admin/users/${user.userId}/permissions`)
      .set(asAdmin())
      .send({ permissions: ['SUPPORT'], reason: 'Hỗ trợ khách' });
    await t
      .http()
      .post(`${API}/admin/users/${user.userId}/lock`)
      .set(asAdmin())
      .send({ reason: 'Spam' });

    const res = await t.http().get(`${API}/admin/audit-logs`).set(asAdmin()).expect(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((i: { action: string }) => i.action)).toEqual([
      'LOCK_USER',
      'SET_PERMISSIONS',
    ]);
    const filtered = await t
      .http()
      .get(`${API}/admin/audit-logs?action=SET_PERMISSIONS&actorId=${admin.userId}`)
      .set(asAdmin())
      .expect(200);
    expect(filtered.body.items).toHaveLength(1);
  });
});
