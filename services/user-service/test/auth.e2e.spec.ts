import { createTestApp, describeDb, refreshCookie, resetDb, signUp, type TestApp } from './helpers';

const API = '/api/user/v1';

describeDb('Đăng ký, xác minh, đăng nhập, phiên (ACC-01..03)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.mail.sent = [];
    t.mail.fail = false;
  });

  describe('đăng ký và xác minh email', () => {
    it('tạo tài khoản chưa xác minh, gửi mã; đúng mã thì kích hoạt và đăng nhập luôn', async () => {
      await t
        .http()
        .post(`${API}/auth/register`)
        .send({ email: ' An@Gmail.com ', password: 'matkhau123', fullName: 'Nguyễn Văn An' })
        .expect(201);
      const user = await t.prisma.user.findUniqueOrThrow({ where: { email: 'an@gmail.com' } });
      expect(user.status).toBe('UNVERIFIED');
      expect(user.passwordHash).not.toContain('matkhau123');

      const res = await t
        .http()
        .post(`${API}/auth/verify-email`)
        .send({ email: 'an@gmail.com', code: t.mail.lastCode('an@gmail.com') })
        .expect(200);
      expect(res.body).toMatchObject({
        expiresIn: 900,
        user: { email: 'an@gmail.com', fullName: 'Nguyễn Văn An', permissions: [] },
      });
      expect(refreshCookie(res)).toBeDefined();
      const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/api/user/v1/auth');

      const me = await t
        .http()
        .get(`${API}/me`)
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);
      expect(me.body.status).toBe('ACTIVE');
    });

    it('mật khẩu dưới 8 ký tự bị từ chối với câu báo tiếng Việt', async () => {
      const res = await t
        .http()
        .post(`${API}/auth/register`)
        .send({ email: 'an@gmail.com', password: '1234567', fullName: 'An' })
        .expect(400);
      expect(res.body.details.fields.password).toBe('Mật khẩu cần ít nhất 8 ký tự.');
    });

    it('email đã xác minh → 409 EMAIL_TAKEN', async () => {
      await signUp(t);
      const res = await t
        .http()
        .post(`${API}/auth/register`)
        .send({ email: 'an@gmail.com', password: 'matkhau456', fullName: 'Kẻ khác' })
        .expect(409);
      expect(res.body.code).toBe('EMAIL_TAKEN');
    });

    it('email chưa xác minh đăng ký lại → cập nhật thông tin; trong 60 giây không gửi thêm mã', async () => {
      const body = { email: 'an@gmail.com', password: 'matkhau123', fullName: 'An' };
      await t.http().post(`${API}/auth/register`).send(body).expect(201);
      await t
        .http()
        .post(`${API}/auth/register`)
        .send({ ...body, fullName: 'Nguyễn Văn An' })
        .expect(201);
      expect(t.mail.sent).toHaveLength(1);
      const user = await t.prisma.user.findUniqueOrThrow({ where: { email: 'an@gmail.com' } });
      expect(user.fullName).toBe('Nguyễn Văn An');
    });

    it('sai mã → CODE_INVALID kèm số lần còn lại; sai 5 lần → CODE_EXPIRED kể cả khi nhập đúng', async () => {
      await t
        .http()
        .post(`${API}/auth/register`)
        .send({ email: 'an@gmail.com', password: 'matkhau123', fullName: 'An' });
      const right = t.mail.lastCode('an@gmail.com');
      const wrong = right === '000000' ? '111111' : '000000';
      for (let left = 4; left >= 1; left--) {
        const res = await t
          .http()
          .post(`${API}/auth/verify-email`)
          .send({ email: 'an@gmail.com', code: wrong })
          .expect(400);
        expect(res.body).toMatchObject({ code: 'CODE_INVALID', details: { attemptsLeft: left } });
      }
      const fifth = await t
        .http()
        .post(`${API}/auth/verify-email`)
        .send({ email: 'an@gmail.com', code: wrong })
        .expect(400);
      expect(fifth.body.code).toBe('CODE_EXPIRED');
      const after = await t
        .http()
        .post(`${API}/auth/verify-email`)
        .send({ email: 'an@gmail.com', code: right })
        .expect(400);
      expect(after.body.code).toBe('CODE_EXPIRED');
    });

    it('mã hết hạn → CODE_EXPIRED', async () => {
      await t
        .http()
        .post(`${API}/auth/register`)
        .send({ email: 'an@gmail.com', password: 'matkhau123', fullName: 'An' });
      await t.prisma.verificationCode.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const res = await t
        .http()
        .post(`${API}/auth/verify-email`)
        .send({ email: 'an@gmail.com', code: t.mail.lastCode('an@gmail.com') })
        .expect(400);
      expect(res.body.code).toBe('CODE_EXPIRED');
    });

    it('mã chỉ dùng được một lần', async () => {
      await signUp(t);
      const res = await t
        .http()
        .post(`${API}/auth/verify-email`)
        .send({ email: 'an@gmail.com', code: t.mail.lastCode('an@gmail.com') })
        .expect(400);
      expect(res.body.code).toBe('CODE_EXPIRED');
    });

    it('gửi lại mã: luôn 202, cách nhau ít nhất 60 giây, mã mới thay mã cũ', async () => {
      await t
        .http()
        .post(`${API}/auth/register`)
        .send({ email: 'an@gmail.com', password: 'matkhau123', fullName: 'An' });
      const first = t.mail.lastCode('an@gmail.com');
      await t
        .http()
        .post(`${API}/auth/resend-verification`)
        .send({ email: 'an@gmail.com' })
        .expect(202);
      expect(t.mail.sent).toHaveLength(1); // chưa đủ 60 giây

      await t.prisma.verificationCode.updateMany({
        data: { createdAt: new Date(Date.now() - 61_000) },
      });
      await t
        .http()
        .post(`${API}/auth/resend-verification`)
        .send({ email: 'an@gmail.com' })
        .expect(202);
      expect(t.mail.sent).toHaveLength(2);
      expect(await t.prisma.verificationCode.count()).toBe(1);
      const second = t.mail.lastCode('an@gmail.com');
      if (first !== second) {
        await t
          .http()
          .post(`${API}/auth/verify-email`)
          .send({ email: 'an@gmail.com', code: first })
          .expect(400);
      }

      // email không tồn tại cũng 202, không gửi gì
      await t
        .http()
        .post(`${API}/auth/resend-verification`)
        .send({ email: 'khong@co.vn' })
        .expect(202);
      expect(t.mail.sent).toHaveLength(2);
    });

    it('không gửi được mail khi đăng ký → 503 MAIL_SEND_FAILED, tài khoản vẫn được tạo', async () => {
      t.mail.fail = true;
      const res = await t
        .http()
        .post(`${API}/auth/register`)
        .send({ email: 'an@gmail.com', password: 'matkhau123', fullName: 'An' })
        .expect(503);
      expect(res.body.code).toBe('MAIL_SEND_FAILED');
      expect(await t.prisma.user.count()).toBe(1);
    });
  });

  describe('đăng nhập', () => {
    const login = (password: string, email = 'an@gmail.com') =>
      t.http().post(`${API}/auth/login`).send({ email, password });

    it('đúng mật khẩu → access token + cookie refresh', async () => {
      await signUp(t);
      const res = await login('matkhau123').expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(refreshCookie(res)).toBeDefined();
    });

    it('sai → 401 kèm số lần còn lại; sai 5 lần → khóa 15 phút (423), đúng mật khẩu cũng không vào được', async () => {
      await signUp(t);
      for (let left = 4; left >= 1; left--) {
        const res = await login('saimatkhau').expect(401);
        expect(res.body).toMatchObject({
          code: 'INVALID_CREDENTIALS',
          details: { attemptsLeft: left },
        });
      }
      const locked = await login('saimatkhau').expect(423);
      expect(locked.body.code).toBe('LOGIN_LOCKED');
      expect(locked.body.details.retryAfterSeconds).toBeGreaterThan(14 * 60);
      await login('matkhau123').expect(423);

      // hết 15 phút thì đăng nhập lại được, số lần sai đếm lại từ đầu
      await t.prisma.user.updateMany({ data: { loginLockedUntil: new Date(Date.now() - 1000) } });
      const again = await login('saimatkhau').expect(401);
      expect(again.body.details.attemptsLeft).toBe(4);
      await login('matkhau123').expect(200);
      const user = await t.prisma.user.findFirstOrThrow();
      expect(user.failedLogins).toBe(0);
    });

    it('email không có tài khoản → 401 INVALID_CREDENTIALS', async () => {
      const res = await login('matkhau123', 'khong@co.vn').expect(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('chưa xác minh → 403 EMAIL_NOT_VERIFIED (chỉ khi đúng mật khẩu)', async () => {
      await t
        .http()
        .post(`${API}/auth/register`)
        .send({ email: 'an@gmail.com', password: 'matkhau123', fullName: 'An' });
      await login('saimatkhau').expect(401);
      const res = await login('matkhau123').expect(403);
      expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('bị admin khóa → 403 ACCOUNT_LOCKED kèm lý do', async () => {
      await signUp(t);
      await t.prisma.user.updateMany({ data: { status: 'LOCKED', lockReason: 'Lừa đảo' } });
      const res = await login('matkhau123').expect(403);
      expect(res.body.code).toBe('ACCOUNT_LOCKED');
      expect(res.body.message).toContain('Lừa đảo');
    });
  });

  describe('phiên đăng nhập', () => {
    const refresh = (cookie?: string) => {
      const req = t.http().post(`${API}/auth/refresh`);
      return cookie ? req.set('Cookie', `san_refresh=${cookie}`) : req;
    };

    it('làm mới → vé mới và refresh token mới; token cũ dùng lại → 401', async () => {
      const { cookie } = await signUp(t);
      const res = await refresh(cookie).expect(200);
      const next = refreshCookie(res)!;
      expect(next).not.toBe(cookie);
      expect(res.body.user.email).toBe('an@gmail.com');

      const reused = await refresh(cookie).expect(401);
      expect(reused.body.code).toBe('UNAUTHENTICATED');
      await refresh(next).expect(200);
    });

    it('không có cookie → 401', async () => {
      await refresh().expect(401);
    });

    it('phiên hết hạn → 401', async () => {
      const { cookie } = await signUp(t);
      await t.prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      await refresh(cookie).expect(401);
    });

    it('vé mang mã phiên; làm mới lấy họ tên và bộ quyền mới nhất', async () => {
      const { cookie, userId } = await signUp(t);
      await t.prisma.user.update({ where: { id: userId }, data: { permissions: ['MODERATION'] } });
      const res = await refresh(cookie).expect(200);
      expect(res.body.user.permissions).toEqual(['MODERATION']);
      const payload = JSON.parse(
        Buffer.from(res.body.accessToken.split('.')[1], 'base64url').toString(),
      );
      const session = await t.prisma.session.findFirstOrThrow();
      expect(payload).toMatchObject({ sub: userId, sid: session.id, perms: ['MODERATION'] });
    });

    it('đăng xuất → thu hồi phiên, xóa cookie', async () => {
      const { cookie } = await signUp(t);
      const res = await t
        .http()
        .post(`${API}/auth/logout`)
        .set('Cookie', `san_refresh=${cookie}`)
        .expect(204);
      expect((res.headers['set-cookie'] as unknown as string[])[0]).toMatch(/^san_refresh=;/);
      await refresh(cookie).expect(401);
    });
  });

  describe('quên mật khẩu', () => {
    it('gửi mã, đặt mật khẩu mới, đăng xuất mọi nơi', async () => {
      const { cookie } = await signUp(t);
      await t
        .http()
        .post(`${API}/auth/forgot-password`)
        .send({ email: 'an@gmail.com' })
        .expect(202);
      const code = t.mail.lastCode('an@gmail.com');
      await t
        .http()
        .post(`${API}/auth/reset-password`)
        .send({ email: 'an@gmail.com', code, newPassword: 'matkhaumoi1' })
        .expect(204);

      await t.http().post(`${API}/auth/refresh`).set('Cookie', `san_refresh=${cookie}`).expect(401);
      await t
        .http()
        .post(`${API}/auth/login`)
        .send({ email: 'an@gmail.com', password: 'matkhau123' })
        .expect(401);
      await t
        .http()
        .post(`${API}/auth/login`)
        .send({ email: 'an@gmail.com', password: 'matkhaumoi1' })
        .expect(200);
    });

    it('mở luôn khóa đăng nhập tạm', async () => {
      await signUp(t);
      await t.prisma.user.updateMany({
        data: { loginLockedUntil: new Date(Date.now() + 600_000) },
      });
      await t.http().post(`${API}/auth/forgot-password`).send({ email: 'an@gmail.com' });
      await t
        .http()
        .post(`${API}/auth/reset-password`)
        .send({
          email: 'an@gmail.com',
          code: t.mail.lastCode('an@gmail.com'),
          newPassword: 'matkhaumoi1',
        })
        .expect(204);
      await t
        .http()
        .post(`${API}/auth/login`)
        .send({ email: 'an@gmail.com', password: 'matkhaumoi1' })
        .expect(200);
    });

    it('email không tồn tại hoặc bị admin khóa: vẫn 202, không gửi mail', async () => {
      await signUp(t);
      await t.prisma.user.updateMany({ data: { status: 'LOCKED' } });
      t.mail.sent = [];
      await t
        .http()
        .post(`${API}/auth/forgot-password`)
        .send({ email: 'an@gmail.com' })
        .expect(202);
      await t.http().post(`${API}/auth/forgot-password`).send({ email: 'khong@co.vn' }).expect(202);
      expect(t.mail.sent).toHaveLength(0);
    });

    it('mã xác minh email không dùng để đặt lại mật khẩu được', async () => {
      await t
        .http()
        .post(`${API}/auth/register`)
        .send({ email: 'an@gmail.com', password: 'matkhau123', fullName: 'An' });
      const res = await t
        .http()
        .post(`${API}/auth/reset-password`)
        .send({
          email: 'an@gmail.com',
          code: t.mail.lastCode('an@gmail.com'),
          newPassword: 'matkhaumoi1',
        })
        .expect(400);
      expect(res.body.code).toBe('CODE_EXPIRED');
    });
  });

  describe('đăng nhập Google', () => {
    const google = {
      googleId: 'g-123',
      email: 'an@gmail.com',
      emailVerified: true,
      name: 'An Google',
    };

    async function callback(profile = google, returnTo = '/gio-hang') {
      const start = await t.http().get(`${API}/auth/google/start?returnTo=${returnTo}`).expect(302);
      const stateCookie = (start.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
      const state = new URL(start.headers.location as string).searchParams.get('state');
      t.google.exchangeCode.mockResolvedValueOnce(profile);
      return t
        .http()
        .get(`${API}/auth/google/callback?code=abc&state=${state}`)
        .set('Cookie', stateCookie)
        .expect(302);
    }

    it('email mới → tạo tài khoản ACTIVE, đặt cookie refresh, chuyển về returnTo', async () => {
      const res = await callback();
      expect(res.headers.location).toBe('http://localhost:5173/gio-hang');
      expect(refreshCookie(res)).toBeDefined();
      const user = await t.prisma.user.findUniqueOrThrow({ where: { email: 'an@gmail.com' } });
      expect(user).toMatchObject({ status: 'ACTIVE', googleId: 'g-123', passwordHash: null });
    });

    it('email đã có tài khoản mật khẩu → tự gộp, đăng nhập được cả hai cách', async () => {
      await signUp(t);
      await callback();
      expect(await t.prisma.user.count()).toBe(1);
      await t
        .http()
        .post(`${API}/auth/login`)
        .send({ email: 'an@gmail.com', password: 'matkhau123' })
        .expect(200);
    });

    it('gộp vào tài khoản chưa xác minh → xóa mật khẩu người khác đã đặt trước', async () => {
      await t
        .http()
        .post(`${API}/auth/register`)
        .send({ email: 'an@gmail.com', password: 'kegia1234', fullName: 'Kẻ giả' });
      await callback();
      const user = await t.prisma.user.findUniqueOrThrow({ where: { email: 'an@gmail.com' } });
      expect(user).toMatchObject({ status: 'ACTIVE', passwordHash: null });
    });

    it('state sai → về trang đăng nhập báo lỗi', async () => {
      const res = await t.http().get(`${API}/auth/google/callback?code=abc&state=gia`).expect(302);
      expect(res.headers.location).toBe('http://localhost:5173/dang-nhap?error=google_state');
    });

    it('returnTo trỏ ra trang ngoài → về trang chủ', async () => {
      const res = await callback(google, '//evil.com');
      expect(res.headers.location).toBe('http://localhost:5173/');
    });

    it('tài khoản bị khóa → không đăng nhập', async () => {
      await signUp(t);
      await t.prisma.user.updateMany({ data: { status: 'LOCKED' } });
      const res = await callback();
      expect(res.headers.location).toBe('http://localhost:5173/dang-nhap?error=account_locked');
      expect(refreshCookie(res)).toBeUndefined();
    });
  });
});
