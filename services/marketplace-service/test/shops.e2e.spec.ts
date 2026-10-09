import { randomUUID } from 'node:crypto';
import type { ShopApplicationDecidedPayload } from '@san/shared';
import { ShopsService } from '../src/shops/shops.service';
import {
  API,
  createTestApp,
  describeDb,
  loadSampleLocations,
  makeUser,
  PICKUP,
  resetDb,
  type TestApp,
} from './helpers';

describeDb('Shop của tôi và áp quyết định duyệt (SHP-01..03)', () => {
  let t: TestApp;
  let seller: ReturnType<typeof makeUser>;

  const logo = (userId: string) => `http://localhost:9000/san-public/shop-logos/${userId}/a.png`;
  const application = (overrides: object = {}) => ({
    name: 'Shop Áo Đẹp',
    description: 'Áo thun cotton',
    logoUrl: logo(seller.id),
    phone: '0912345678',
    pickupAddress: PICKUP,
    bankAccount: {
      bankName: 'Vietcombank',
      accountNumber: '0123456789',
      accountName: 'nguyen van an',
    },
    ...overrides,
  });
  const submit = (body: object = application(), user = seller, key: string = randomUUID()) =>
    t
      .http()
      .post(`${API}/shops/me/applications`)
      .set('Authorization', `Bearer ${user.token}`)
      .set('Idempotency-Key', key)
      .send(body);
  const myShop = (user = seller) =>
    t.http().get(`${API}/shops/me`).set('Authorization', `Bearer ${user.token}`).expect(200);
  const outbox = () => t.prisma.outboxEvent.findMany({ orderBy: { createdAt: 'asc' } });
  const decide = async (
    version: number,
    decision: 'APPROVED' | 'REJECTED',
    reason: string | null = null,
  ) => {
    const shop = await t.prisma.shop.findFirstOrThrow({ where: { ownerId: seller.id } });
    const app = await t.prisma.shopApplication.findFirstOrThrow({
      where: { shopId: shop.id, version },
    });
    const payload: ShopApplicationDecidedPayload = {
      shopId: shop.id,
      version,
      type: app.type,
      decision,
      reason,
      decidedBy: { userId: randomUUID(), name: 'Admin' },
      decidedAt: new Date().toISOString(),
    };
    await t.prisma.$transaction((tx) => t.app.get(ShopsService).applyDecision(payload, tx));
  };

  beforeAll(async () => {
    t = await createTestApp();
    await loadSampleLocations(t);
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    seller = makeUser();
  });

  it('chưa nộp hồ sơ → NONE', async () => {
    expect((await myShop()).body).toEqual({
      status: 'NONE',
      shop: null,
      application: null,
      changeRequest: null,
    });
  });

  it('nộp hồ sơ → PENDING, phát shop_application.submitted kèm hồ sơ đầy đủ', async () => {
    const res = await submit().expect(201);
    expect(res.body).toMatchObject({
      status: 'PENDING',
      shop: {
        name: 'Shop Áo Đẹp',
        pickupAddress: { fullText: '12 Kim Mã, Phường Điện Biên, Quận Ba Đình, Hà Nội' },
        bankAccount: { accountName: 'NGUYEN VAN AN' },
      },
      application: { version: 1, type: 'REGISTER', status: 'PENDING' },
    });
    const [event] = await outbox();
    expect(event!.type).toBe('shop_application.submitted');
    expect((event!.payload as { payload: unknown }).payload).toMatchObject({
      version: 1,
      type: 'REGISTER',
      owner: { userId: seller.id, email: seller.email, fullName: seller.name },
      data: {
        name: 'Shop Áo Đẹp',
        pickupAddress: { provinceName: 'Hà Nội', wardCode: '9010101', street: '12 Kim Mã' },
      },
    });
  });

  it('gửi lại cùng Idempotency-Key → trả kết quả cũ, không tạo hồ sơ mới; thiếu key → 400', async () => {
    const key = randomUUID();
    await submit(application(), seller, key).expect(201);
    await submit(application(), seller, key).expect(201);
    expect(await t.prisma.shopApplication.count()).toBe(1);
    expect(await t.prisma.outboxEvent.count()).toBe(1);

    const other = makeUser('Trần Bình');
    const reused = await submit(application({ logoUrl: logo(other.id) }), other, key).expect(409);
    expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');

    const res = await t
      .http()
      .post(`${API}/shops/me/applications`)
      .set('Authorization', `Bearer ${seller.token}`)
      .send(application())
      .expect(400);
    expect(res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('hồ sơ thiếu hoặc sai → 400 chỉ rõ ô (kể cả ô lồng nhau, logo của người khác)', async () => {
    const res = await submit(
      application({
        name: 'AB',
        phone: '123',
        bankAccount: { bankName: '', accountNumber: 'x', accountName: '' },
      }),
    ).expect(400);
    expect(Object.keys(res.body.details.fields).sort()).toEqual([
      'bankAccount.accountName',
      'bankAccount.accountNumber',
      'bankAccount.bankName',
      'name',
      'phone',
    ]);
    const wrongLogo = await submit(application({ logoUrl: logo(randomUUID()) })).expect(400);
    expect(wrongLogo.body.details.fields.logoUrl).toBeDefined();
    const wrongWard = await submit(
      application({ pickupAddress: { ...PICKUP, wardCode: '9020101' } }),
    ).expect(400);
    expect(wrongWard.body.details.fields['pickupAddress.wardCode']).toBeDefined();
  });

  it('tên shop trùng (không phân biệt hoa thường) → 409 SHOP_NAME_TAKEN', async () => {
    await submit().expect(201);
    const other = makeUser('Trần Bình');
    const res = await submit(
      application({ name: 'shop áo đẹp', logoUrl: logo(other.id) }),
      other,
    ).expect(409);
    expect(res.body.code).toBe('SHOP_NAME_TAKEN');
  });

  it('nộp lại khi đang chờ → bản mới v2, bản cũ REPLACED; quyết định cho v1 bị bỏ qua', async () => {
    await submit().expect(201);
    await submit(application({ description: 'Bản sửa' })).expect(201);
    const apps = await t.prisma.shopApplication.findMany({ orderBy: { version: 'asc' } });
    expect(apps.map((a) => [a.version, a.status])).toEqual([
      [1, 'REPLACED'],
      [2, 'PENDING'],
    ]);
    await decide(1, 'APPROVED');
    expect((await myShop()).body.status).toBe('PENDING');
  });

  it('từ chối → REJECTED kèm lý do; sửa và nộp lại → v2 PENDING; duyệt → ACTIVE', async () => {
    await submit().expect(201);
    await decide(1, 'REJECTED', 'Logo không rõ');
    let body = (await myShop()).body;
    expect(body).toMatchObject({
      status: 'REJECTED',
      application: { version: 1, status: 'REJECTED', rejectReason: 'Logo không rõ' },
    });

    await submit().expect(201);
    expect((await myShop()).body.status).toBe('PENDING');
    await decide(2, 'APPROVED');
    await decide(2, 'APPROVED'); // sự kiện tới lần hai: không làm gì thêm
    body = (await myShop()).body;
    expect(body).toMatchObject({
      status: 'ACTIVE',
      application: { version: 2, status: 'APPROVED' },
    });

    const again = await submit().expect(409);
    expect(again.body.code).toBe('SHOP_ALREADY_ACTIVE');
  });

  describe('sau khi duyệt', () => {
    beforeEach(async () => {
      await submit().expect(201);
      await decide(1, 'APPROVED');
    });

    it('sửa mô tả, SĐT, địa chỉ lấy hàng: dùng ngay, ghi nhật ký', async () => {
      const res = await t
        .http()
        .patch(`${API}/shops/me`)
        .set('Authorization', `Bearer ${seller.token}`)
        .send({
          phone: '0987654321',
          pickupAddress: { ...PICKUP, districtId: 90102, wardCode: '9010201' },
        })
        .expect(200);
      expect(res.body.shop).toMatchObject({
        phone: '0987654321',
        pickupAddress: { fullText: '12 Kim Mã, Phường Dịch Vọng, Quận Cầu Giấy, Hà Nội' },
      });
      const log = await t.prisma.auditLog.findFirstOrThrow();
      expect(log).toMatchObject({
        actorId: seller.id,
        action: 'UPDATE_SHOP',
        before: expect.objectContaining({ phone: '0912345678' }),
        after: expect.objectContaining({ phone: '0987654321' }),
      });
    });

    it('PATCH không đổi được tên shop hay tài khoản ngân hàng', async () => {
      await t
        .http()
        .patch(`${API}/shops/me`)
        .set('Authorization', `Bearer ${seller.token}`)
        .send({
          name: 'Tên mới',
          bankAccount: { bankName: 'ACB', accountNumber: '111111', accountName: 'X' },
        })
        .expect(200);
      const shop = await t.prisma.shop.findFirstOrThrow();
      expect(shop).toMatchObject({ name: 'Shop Áo Đẹp', bankName: 'Vietcombank' });
    });

    const change = (body: object, key = randomUUID()) =>
      t
        .http()
        .post(`${API}/shops/me/change-requests`)
        .set('Authorization', `Bearer ${seller.token}`)
        .set('Idempotency-Key', key)
        .send(body);

    it('yêu cầu đổi tên: shop vẫn dùng tên cũ, phát CHANGE kèm giá trị cũ; duyệt → đổi tên', async () => {
      const res = await change({ name: 'Shop Áo Xịn' }).expect(201);
      expect(res.body).toMatchObject({
        shop: { name: 'Shop Áo Đẹp' },
        changeRequest: {
          version: 2,
          status: 'PENDING',
          change: { fields: ['name'], name: 'Shop Áo Xịn' },
        },
      });
      const events = await outbox();
      expect((events[1]!.payload as { payload: unknown }).payload).toMatchObject({
        type: 'CHANGE',
        version: 2,
        data: { name: 'Shop Áo Xịn', bankAccount: { bankName: 'Vietcombank' } },
        change: { fields: ['name'], old: { name: 'Shop Áo Đẹp' } },
      });
      await decide(2, 'APPROVED');
      expect((await myShop()).body.shop.name).toBe('Shop Áo Xịn');
    });

    it('đổi tài khoản ngân hàng bị từ chối → giữ tài khoản cũ, lưu lý do', async () => {
      await change({
        bankAccount: { bankName: 'ACB', accountNumber: '99999999', accountName: 'NGUYEN VAN AN' },
      }).expect(201);
      await decide(2, 'REJECTED', 'Tên chủ tài khoản không khớp');
      const body = (await myShop()).body;
      expect(body.shop.bankAccount.bankName).toBe('Vietcombank');
      expect(body.changeRequest).toMatchObject({
        status: 'REJECTED',
        rejectReason: 'Tên chủ tài khoản không khớp',
      });
    });

    it('không đổi gì → 400 NOTHING_TO_CHANGE; tên đã có shop khác → 409', async () => {
      expect((await change({ name: 'Shop Áo Đẹp' }).expect(400)).body.code).toBe(
        'NOTHING_TO_CHANGE',
      );
      const other = makeUser('Trần Bình');
      await submit(application({ name: 'Shop Giày', logoUrl: logo(other.id) }), other).expect(201);
      expect((await change({ name: 'SHOP GIÀY' }).expect(409)).body.code).toBe('SHOP_NAME_TAKEN');
    });

    it('tên mới bị shop khác lấy trong lúc chờ duyệt → tự chuyển thành từ chối', async () => {
      await change({ name: 'Shop Mới' }).expect(201);
      const other = makeUser('Trần Bình');
      await submit(application({ name: 'shop mới', logoUrl: logo(other.id) }), other).expect(201);
      await decide(2, 'APPROVED');
      const body = (await myShop()).body;
      expect(body.shop.name).toBe('Shop Áo Đẹp');
      expect(body.changeRequest.status).toBe('REJECTED');
    });
  });

  it('shop chưa duyệt không sửa được, không gửi yêu cầu đổi được', async () => {
    await submit().expect(201);
    const res = await t
      .http()
      .patch(`${API}/shops/me`)
      .set('Authorization', `Bearer ${seller.token}`)
      .send({ phone: '0987654321' })
      .expect(409);
    expect(res.body.code).toBe('SHOP_NOT_ACTIVE');
  });
});
