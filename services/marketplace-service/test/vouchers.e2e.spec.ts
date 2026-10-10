import { randomUUID } from 'node:crypto';
import { makeShop } from './fixtures-p2';
import { API, createTestApp, describeDb, makeUser, resetDb, type TestApp } from './helpers';

type User = ReturnType<typeof makeUser>;
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

describeDb('Voucher (VCH-01)', () => {
  let t: TestApp;
  let seller: User;
  let shopId: string;
  const finance = makeUser('Tài Chính', ['FINANCE']);

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    seller = makeUser('Chủ Shop');
    shopId = (await makeShop(t.prisma, seller.id)).id;
  });

  const auth = (u: User) => ({ Authorization: `Bearer ${u.token}` });
  const body = (o: object = {}) => ({
    code: 'giam50k',
    name: 'Giảm 50K đơn từ 500K',
    discountType: 'AMOUNT',
    value: 50_000,
    minOrder: 500_000,
    startAt: at(HOUR),
    endAt: at(7 * DAY),
    quantity: 100,
    perUserLimit: 1,
    ...o,
  });
  const base = (u: User | 'admin') =>
    u === 'admin' ? `${API}/admin/vouchers` : `${API}/shops/me/vouchers`;
  const create = (o: object = {}, u: User | 'admin' = seller) =>
    t
      .http()
      .post(base(u))
      .set(auth(u === 'admin' ? finance : u))
      .send(body(o));
  const put = (id: string, o: object, u: User | 'admin' = seller) =>
    t
      .http()
      .put(`${base(u)}/${id}`)
      .set(auth(u === 'admin' ? finance : u))
      .send(o);
  /** Dời thời gian voucher trong database để giả lập voucher đang chạy / đã kết thúc */
  const setTimes = (id: string, startAt: number, endAt: number) =>
    t.prisma.voucher.update({
      where: { id },
      data: { startAt: new Date(Date.now() + startAt), endAt: new Date(Date.now() + endAt) },
    });

  describe('voucher shop', () => {
    it('tạo: mã đổi in hoa, trả đúng dạng, state UPCOMING', async () => {
      const res = await create().expect(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        shopId,
        code: 'GIAM50K',
        name: 'Giảm 50K đơn từ 500K',
        discountType: 'AMOUNT',
        value: 50_000,
        maxDiscount: null,
        minOrder: 500_000,
        startAt: expect.any(String),
        endAt: expect.any(String),
        quantity: 100,
        perUserLimit: 1,
        usedCount: 0,
        state: 'UPCOMING',
        createdAt: expect.any(String),
      });
      // Voucher shop không ghi nhật ký admin
      expect(await t.prisma.auditLog.count()).toBe(0);
    });

    it('PERCENT: bắt buộc maxDiscount, % từ 1 đến 90; AMOUNT bỏ qua maxDiscount', async () => {
      const ok = await create({
        code: 'PCT10',
        discountType: 'PERCENT',
        value: 10,
        maxDiscount: 30_000,
      }).expect(201);
      expect(ok.body).toMatchObject({ discountType: 'PERCENT', value: 10, maxDiscount: 30_000 });
      const amount = await create({ code: 'AMT1', maxDiscount: 5000 }).expect(201);
      expect(amount.body.maxDiscount).toBeNull();

      const cases: Array<[object, string]> = [
        [{ discountType: 'PERCENT', value: 10 }, 'maxDiscount'],
        [{ discountType: 'PERCENT', value: 10, maxDiscount: 500 }, 'maxDiscount'],
        [{ discountType: 'PERCENT', value: 91, maxDiscount: 10_000 }, 'value'],
        [{ discountType: 'AMOUNT', value: 999 }, 'value'],
        [{ code: 'AB' }, 'code'],
        [{ code: 'GIẢM50' }, 'code'],
        [{ code: 'A'.repeat(21) }, 'code'],
        [{ minOrder: -1 }, 'minOrder'],
        [{ quantity: 0 }, 'quantity'],
        [{ quantity: 1_000_001 }, 'quantity'],
        [{ perUserLimit: 0 }, 'perUserLimit'],
        [{ startAt: at(-10 * 60_000) }, 'startAt'],
        [{ startAt: 'hôm nay' }, 'startAt'],
        [{ endAt: at(HOUR) }, 'endAt'],
        [{ startAt: at(HOUR), endAt: at(181 * DAY) }, 'endAt'],
        [{ name: '' }, 'name'],
      ];
      for (const [o, field] of cases) {
        const res = await create({ code: 'NEWCODE', ...o }).expect(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(Object.keys(res.body.details.fields)).toContain(field);
      }
      // startAt lệch về trước dưới 1 phút vẫn nhận (đồng hồ máy người dùng)
      await create({ code: 'NOWNOW', startAt: at(-20_000) }).expect(201);
    });

    it('mã trùng trên toàn sàn (kể cả voucher sàn, khác hoa thường) → 409 VOUCHER_CODE_TAKEN', async () => {
      await create({ code: 'SALE1010' }, 'admin').expect(201);
      const res = await create({ code: 'sale1010' }).expect(409);
      expect(res.body.code).toBe('VOUCHER_CODE_TAKEN');
    });

    it('danh sách: mới tạo trước, lọc theo state; không thấy voucher shop khác/voucher sàn', async () => {
      const up = (await create({ code: 'UP01' })).body.id;
      const run = (await create({ code: 'RUN01' })).body.id;
      const end = (await create({ code: 'END01' })).body.id;
      await setTimes(run, -HOUR, DAY);
      await setTimes(end, -2 * DAY, -DAY);
      await create({ code: 'ADMIN01' }, 'admin').expect(201);
      const other = makeUser('Shop Khác');
      await makeShop(t.prisma, other.id);
      await create({ code: 'OTHER01' }, other).expect(201);

      const all = await t.http().get(base(seller)).set(auth(seller)).expect(200);
      expect(all.body).toMatchObject({ total: 3, page: 1, pageSize: 20 });
      expect(all.body.items.map((v: { id: string }) => v.id)).toEqual([end, run, up]);
      expect(all.body.items.map((v: { state: string }) => v.state)).toEqual([
        'ENDED',
        'RUNNING',
        'UPCOMING',
      ]);
      for (const [state, id] of [
        ['UPCOMING', up],
        ['RUNNING', run],
        ['ENDED', end],
      ]) {
        const res = await t
          .http()
          .get(`${base(seller)}?state=${state}`)
          .set(auth(seller))
          .expect(200);
        expect(res.body.items.map((v: { id: string }) => v.id)).toEqual([id]);
      }
      await t
        .http()
        .get(`${base(seller)}?state=X`)
        .set(auth(seller))
        .expect(400);
    });

    it('sửa voucher chưa bắt đầu: sửa mọi trường', async () => {
      const id = (await create()).body.id;
      const res = await put(
        id,
        body({
          code: 'GIAM10',
          discountType: 'PERCENT',
          value: 10,
          maxDiscount: 20_000,
          quantity: 5,
        }),
      ).expect(200);
      expect(res.body).toMatchObject({
        code: 'GIAM10',
        discountType: 'PERCENT',
        value: 10,
        quantity: 5,
      });
      await put(id, body({ code: 'GIAM10', endAt: at(-HOUR) })).expect(400);
    });

    it('sửa voucher đang chạy: chỉ lùi endAt, tăng quantity; khác → 409 VOUCHER_STARTED', async () => {
      const created = (await create()).body;
      await setTimes(created.id, -HOUR, DAY);
      const v = (await t.http().get(base(seller)).set(auth(seller))).body.items[0];
      const same = { ...body(), code: v.code, startAt: v.startAt, endAt: v.endAt };

      const res = await put(v.id, { ...same, endAt: at(3 * DAY), quantity: 200 }).expect(200);
      expect(res.body).toMatchObject({ quantity: 200, state: 'RUNNING' });
      const now = res.body;
      const base2 = { ...same, endAt: now.endAt, quantity: 200 };
      for (const o of [
        { name: 'Tên khác hẳn' },
        { value: 60_000 },
        { minOrder: 0 },
        { quantity: 199 },
        { endAt: at(2 * DAY) },
        { startAt: at(-30 * 60_000) },
        { code: 'KHAC1' },
        { perUserLimit: 2 },
      ]) {
        const r = await put(v.id, { ...base2, ...o }).expect(409);
        expect(r.body.code).toBe('VOUCHER_STARTED');
      }
      // Lùi quá số ngày tối đa tính từ lúc bắt đầu → 400
      await put(v.id, { ...base2, endAt: at(200 * DAY) }).expect(400);
    });

    it('voucher đã kết thúc: sửa, kết thúc → 409 VOUCHER_ENDED; xóa → 409', async () => {
      const id = (await create()).body.id;
      await setTimes(id, -2 * DAY, -DAY);
      expect((await put(id, body()).expect(409)).body.code).toBe('VOUCHER_ENDED');
      expect(
        (
          await t
            .http()
            .post(`${base(seller)}/${id}/end`)
            .set(auth(seller))
            .expect(409)
        ).body.code,
      ).toBe('VOUCHER_ENDED');
      expect(
        (
          await t
            .http()
            .delete(`${base(seller)}/${id}`)
            .set(auth(seller))
            .expect(409)
        ).body.code,
      ).toBe('VOUCHER_ENDED');
    });

    it('kết thúc sớm: đang chạy hoặc chưa bắt đầu → ENDED', async () => {
      const running = (await create({ code: 'RUN001' })).body.id;
      await setTimes(running, -HOUR, DAY);
      const r1 = await t
        .http()
        .post(`${base(seller)}/${running}/end`)
        .set(auth(seller))
        .expect(200);
      expect(r1.body.state).toBe('ENDED');
      expect(Date.parse(r1.body.endAt)).toBeLessThanOrEqual(Date.now());

      const upcoming = (await create({ code: 'UP001' })).body.id;
      const r2 = await t
        .http()
        .post(`${base(seller)}/${upcoming}/end`)
        .set(auth(seller))
        .expect(200);
      expect(r2.body.state).toBe('ENDED');
      expect(r2.body.startAt).toBe(r2.body.endAt);
    });

    it('xóa: chỉ voucher chưa bắt đầu; đang chạy → 409 VOUCHER_STARTED', async () => {
      const up = (await create({ code: 'UP001' })).body.id;
      await t
        .http()
        .delete(`${base(seller)}/${up}`)
        .set(auth(seller))
        .expect(204);
      expect(await t.prisma.voucher.count({ where: { id: up } })).toBe(0);
      const run = (await create({ code: 'RUN001' })).body.id;
      await setTimes(run, -HOUR, DAY);
      const res = await t
        .http()
        .delete(`${base(seller)}/${run}`)
        .set(auth(seller))
        .expect(409);
      expect(res.body.code).toBe('VOUCHER_STARTED');
    });

    it('voucher shop khác, voucher sàn hoặc mã lạ → 404', async () => {
      const other = makeUser('Shop Khác');
      await makeShop(t.prisma, other.id);
      const theirs = (await create({ code: 'THEIRS' }, other)).body.id;
      const platform = (await create({ code: 'PLATFORM' }, 'admin')).body.id;
      for (const id of [theirs, platform, randomUUID()]) {
        await put(id, body()).expect(404);
        await t
          .http()
          .post(`${base(seller)}/${id}/end`)
          .set(auth(seller))
          .expect(404);
        await t
          .http()
          .delete(`${base(seller)}/${id}`)
          .set(auth(seller))
          .expect(404);
      }
      await t
        .http()
        .delete(`${base(seller)}/abc`)
        .set(auth(seller))
        .expect(404);
    });

    it('chưa có shop hoặc shop chưa duyệt → 409 SHOP_NOT_ACTIVE; shop bị đình chỉ vẫn quản lý được', async () => {
      const noShop = makeUser('Chưa Có Shop');
      expect((await create({}, noShop).expect(409)).body.code).toBe('SHOP_NOT_ACTIVE');
      const pending = makeUser('Đang Chờ');
      await makeShop(t.prisma, pending.id, { status: 'PENDING' });
      expect((await t.http().get(base(pending)).set(auth(pending)).expect(409)).body.code).toBe(
        'SHOP_NOT_ACTIVE',
      );
      await t.prisma.shop.update({ where: { id: shopId }, data: { status: 'SUSPENDED' } });
      await create().expect(201);
    });

    it('GET /shops/me vẫn chạy (không bị nhầm với /shops/{shopId})', async () => {
      const res = await t.http().get(`${API}/shops/me`).set(auth(seller)).expect(200);
      expect(res.body.status).toBe('ACTIVE');
    });
  });

  describe('voucher sàn (admin FINANCE)', () => {
    it('không có bộ quyền FINANCE → 403', async () => {
      for (const u of [seller, makeUser('Kiểm Duyệt', ['MODERATION'])]) {
        await t.http().get(`${API}/admin/vouchers`).set(auth(u)).expect(403);
        await t.http().post(`${API}/admin/vouchers`).set(auth(u)).send(body()).expect(403);
      }
    });

    it('tạo, sửa, kết thúc, xóa đều ghi nhật ký; shopId = null; không thấy voucher shop', async () => {
      const created = await create({ code: 'SAN01' }, 'admin').expect(201);
      expect(created.body.shopId).toBeNull();
      const id = created.body.id;
      await create({ code: 'SHOP01' }).expect(201);
      const list = await t.http().get(`${API}/admin/vouchers`).set(auth(finance)).expect(200);
      expect(list.body.items.map((v: { code: string }) => v.code)).toEqual(['SAN01']);

      await put(id, body({ code: 'SAN01', quantity: 50 }), 'admin').expect(200);
      await t.http().post(`${API}/admin/vouchers/${id}/end`).set(auth(finance)).expect(200);
      const del = (await create({ code: 'SAN02' }, 'admin')).body.id;
      await t.http().delete(`${API}/admin/vouchers/${del}`).set(auth(finance)).expect(204);

      const logs = await t.prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
      expect(logs.map((l) => [l.action, l.targetType, l.actorId])).toEqual([
        ['CREATE_VOUCHER', 'VOUCHER', finance.id],
        ['UPDATE_VOUCHER', 'VOUCHER', finance.id],
        ['END_VOUCHER', 'VOUCHER', finance.id],
        ['CREATE_VOUCHER', 'VOUCHER', finance.id],
        ['DELETE_VOUCHER', 'VOUCHER', finance.id],
      ]);
      expect(logs[1]!.before).toMatchObject({ quantity: 100 });
      expect(logs[1]!.after).toMatchObject({ quantity: 50 });

      // Voucher shop không sửa được qua API admin
      const shopVoucher = (await t.prisma.voucher.findFirstOrThrow({ where: { code: 'SHOP01' } }))
        .id;
      await put(shopVoucher, body({ code: 'SHOP01' }), 'admin').expect(404);
    });
  });

  describe('voucher công khai của shop', () => {
    it('chỉ voucher đang chạy và còn lượt; không cần đăng nhập', async () => {
      const run = (await create({ code: 'RUN001' })).body.id;
      await setTimes(run, -HOUR, DAY);
      const soldOut = (await create({ code: 'HET001', quantity: 5 })).body.id;
      await setTimes(soldOut, -HOUR, DAY);
      await t.prisma.voucher.update({ where: { id: soldOut }, data: { usedCount: 5 } });
      await create({ code: 'UP001' }).expect(201);
      const ended = (await create({ code: 'END001' })).body.id;
      await setTimes(ended, -2 * DAY, -DAY);

      const res = await t.http().get(`${API}/shops/${shopId}/vouchers`).expect(200);
      expect(res.body.map((v: { id: string }) => v.id)).toEqual([run]);
      expect(res.body[0]).toMatchObject({ code: 'RUN001', state: 'RUNNING' });
    });

    it('shop bị đình chỉ → mảng rỗng; shop chưa duyệt hoặc không có → 404', async () => {
      const run = (await create({ code: 'RUN001' })).body.id;
      await setTimes(run, -HOUR, DAY);
      await t.prisma.shop.update({ where: { id: shopId }, data: { status: 'SUSPENDED' } });
      expect((await t.http().get(`${API}/shops/${shopId}/vouchers`).expect(200)).body).toEqual([]);

      const pending = await makeShop(t.prisma, randomUUID(), { status: 'PENDING' });
      for (const id of [pending.id, randomUUID(), 'abc']) {
        await t.http().get(`${API}/shops/${id}/vouchers`).expect(404);
      }
    });
  });
});
