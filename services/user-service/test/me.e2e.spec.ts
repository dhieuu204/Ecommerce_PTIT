import { createTestApp, describeDb, resetDb, signUp, type TestApp } from './helpers';

const API = '/api/user/v1';
const place = { provinceId: 201, districtId: 1442, wardCode: '20109' };
const address = (n = 1) => ({
  receiverName: `Người nhận ${n}`,
  phone: '0912345678',
  ...place,
  street: `${n} Điện Biên Phủ`,
});

describeDb('Hồ sơ, đổi mật khẩu, sổ địa chỉ (ACC-03, ACC-04)', () => {
  let t: TestApp;
  let token: string;
  let cookie: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    ({ accessToken: token, cookie } = await signUp(t));
  });

  it('cần đăng nhập', async () => {
    const res = await t.http().get(`${API}/me`).expect(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  describe('hồ sơ', () => {
    it('sửa họ tên, SĐT, ngày sinh, giới tính; gửi null để xóa', async () => {
      const res = await t
        .http()
        .patch(`${API}/me`)
        .set(auth())
        .send({
          fullName: 'An Nguyễn',
          phone: '0987654321',
          birthday: '2003-05-20',
          gender: 'MALE',
        })
        .expect(200);
      expect(res.body).toMatchObject({
        fullName: 'An Nguyễn',
        phone: '0987654321',
        birthday: '2003-05-20',
        gender: 'MALE',
        hasPassword: true,
        hasGoogle: false,
      });
      expect(res.body.passwordHash).toBeUndefined();

      const cleared = await t
        .http()
        .patch(`${API}/me`)
        .set(auth())
        .send({ phone: null })
        .expect(200);
      expect(cleared.body.phone).toBeNull();
      expect(cleared.body.fullName).toBe('An Nguyễn');
    });

    it('không đổi được email, trạng thái, bộ quyền qua PATCH /me', async () => {
      await t
        .http()
        .patch(`${API}/me`)
        .set(auth())
        .send({ email: 'khac@gmail.com', status: 'LOCKED', permissions: ['SYSTEM'] })
        .expect(200);
      const user = await t.prisma.user.findFirstOrThrow();
      expect(user).toMatchObject({ email: 'an@gmail.com', status: 'ACTIVE', permissions: [] });
    });

    it('SĐT sai dạng, họ tên rỗng, ngày sinh tương lai → 400', async () => {
      const res = await t
        .http()
        .patch(`${API}/me`)
        .set(auth())
        .send({ phone: '912345678', fullName: '  ' })
        .expect(400);
      expect(Object.keys(res.body.details.fields).sort()).toEqual(['fullName', 'phone']);
      await t.http().patch(`${API}/me`).set(auth()).send({ fullName: null }).expect(400);
      await t.http().patch(`${API}/me`).set(auth()).send({ birthday: '2999-01-01' }).expect(400);
    });
  });

  describe('đổi mật khẩu', () => {
    it('sai mật khẩu hiện tại → 400 WRONG_PASSWORD', async () => {
      const res = await t
        .http()
        .post(`${API}/me/password`)
        .set(auth())
        .send({ currentPassword: 'sai12345', newPassword: 'matkhaumoi1' })
        .expect(400);
      expect(res.body.code).toBe('WRONG_PASSWORD');
    });

    it('đổi xong: thiết bị đang dùng vẫn đăng nhập, thiết bị khác bị đăng xuất', async () => {
      const other = await t
        .http()
        .post(`${API}/auth/login`)
        .send({ email: 'an@gmail.com', password: 'matkhau123' })
        .expect(200);
      const otherCookie = other.headers['set-cookie'] as unknown as string[];

      await t
        .http()
        .post(`${API}/me/password`)
        .set(auth())
        .send({ currentPassword: 'matkhau123', newPassword: 'matkhaumoi1' })
        .expect(204);

      await t.http().post(`${API}/auth/refresh`).set('Cookie', `san_refresh=${cookie}`).expect(200);
      await t
        .http()
        .post(`${API}/auth/refresh`)
        .set('Cookie', otherCookie[0]!.split(';')[0]!)
        .expect(401);
    });

    it('tài khoản chỉ có Google đặt mật khẩu lần đầu không cần mật khẩu hiện tại', async () => {
      await t.prisma.user.updateMany({ data: { passwordHash: null, googleId: 'g-1' } });
      await t
        .http()
        .post(`${API}/me/password`)
        .set(auth())
        .send({ newPassword: 'matkhaumoi1' })
        .expect(204);
      await t
        .http()
        .post(`${API}/auth/login`)
        .send({ email: 'an@gmail.com', password: 'matkhaumoi1' })
        .expect(200);
    });
  });

  describe('sổ địa chỉ', () => {
    const add = (body: object) => t.http().post(`${API}/me/addresses`).set(auth()).send(body);

    it('địa chỉ đầu tiên tự thành mặc định, lưu tên tỉnh/huyện/xã', async () => {
      const res = await add(address(1)).expect(201);
      expect(res.body).toMatchObject({
        isDefault: true,
        provinceName: 'Hà Nội',
        districtName: 'Quận Ba Đình',
        wardName: 'Phường Điện Biên',
      });
      expect(res.body.userId).toBeUndefined();
      const second = await add(address(2)).expect(201);
      expect(second.body.isDefault).toBe(false);
    });

    it('thêm địa chỉ mặc định mới → địa chỉ cũ thôi mặc định; danh sách mặc định lên đầu', async () => {
      await add(address(1));
      const second = await add({ ...address(2), isDefault: true }).expect(201);
      const list = await t.http().get(`${API}/me/addresses`).set(auth()).expect(200);
      expect(list.body).toHaveLength(2);
      expect(list.body[0].id).toBe(second.body.id);
      expect(list.body.filter((a: { isDefault: boolean }) => a.isDefault)).toHaveLength(1);
    });

    it('tối đa 10 địa chỉ → 409 ADDRESS_LIMIT', async () => {
      for (let i = 1; i <= 10; i++) await add(address(i)).expect(201);
      const res = await add(address(11)).expect(409);
      expect(res.body.code).toBe('ADDRESS_LIMIT');
    });

    it('mã phường/xã không khớp → 400 chỉ rõ ô sai', async () => {
      const res = await add({ ...address(1), wardCode: '99999' }).expect(400);
      expect(res.body.details.fields.wardCode).toBeDefined();
    });

    it('xóa địa chỉ mặc định → địa chỉ mới nhất còn lại thành mặc định', async () => {
      const first = await add(address(1));
      await add(address(2));
      const third = await add(address(3));
      await t.http().delete(`${API}/me/addresses/${first.body.id}`).set(auth()).expect(204);
      const list = await t.http().get(`${API}/me/addresses`).set(auth());
      expect(list.body[0]).toMatchObject({ id: third.body.id, isDefault: true });
    });

    it('đặt mặc định, sửa địa chỉ', async () => {
      await add(address(1));
      const second = await add(address(2));
      await t.http().post(`${API}/me/addresses/${second.body.id}/default`).set(auth()).expect(204);
      const updated = await t
        .http()
        .patch(`${API}/me/addresses/${second.body.id}`)
        .set(auth())
        .send({ street: '10 Trần Phú', isDefault: false })
        .expect(200);
      expect(updated.body).toMatchObject({ street: '10 Trần Phú', isDefault: true });
    });

    it('đổi khu vực phải gửi đủ 3 mã', async () => {
      const a = await add(address(1));
      await t
        .http()
        .patch(`${API}/me/addresses/${a.body.id}`)
        .set(auth())
        .send({ provinceId: 201 })
        .expect(400);
    });

    it('địa chỉ của người khác → 404', async () => {
      const mine = await add(address(1));
      const other = await signUp(t, 'binh@gmail.com');
      const asOther = `Bearer ${other.accessToken}`;
      const url = `${API}/me/addresses/${mine.body.id}`;
      await t.http().patch(url).set('Authorization', asOther).send({ street: 'x' }).expect(404);
      await t.http().delete(url).set('Authorization', asOther).expect(404);
      await t.http().post(`${url}/default`).set('Authorization', asOther).expect(404);
      await t.http().delete(`${API}/me/addresses/khong-phai-uuid`).set(auth()).expect(404);
    });
  });
});
