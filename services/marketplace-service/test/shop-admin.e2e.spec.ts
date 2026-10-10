import { randomUUID } from 'node:crypto';
import type { ShopSuspensionDecidedPayload } from '@san/shared';
import { ShopSuspensionEvents } from '../src/shop-admin/shop-suspension.events';
import { makeProduct, makeShop } from './fixtures-p2';
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

describeDb('Đình chỉ shop và admin xem shop (SHP-04)', () => {
  let t: TestApp;
  const admin = makeUser('Kiểm Duyệt', ['MODERATION']);

  beforeAll(async () => {
    t = await createTestApp();
    await loadSampleLocations(t);
  });
  afterAll(() => t.app.close());
  beforeEach(() => resetDb(t.prisma));

  const decided = (
    shopId: string,
    action: ShopSuspensionDecidedPayload['action'],
    decidedAt: string,
    reason = 'Bán hàng giả',
  ): ShopSuspensionDecidedPayload => ({
    shopId,
    action,
    reason,
    decidedBy: { userId: randomUUID(), name: 'Admin' },
    decidedAt,
  });
  const apply = (p: ShopSuspensionDecidedPayload) =>
    t.prisma.$transaction((tx) => t.app.get(ShopSuspensionEvents).apply(p, tx));
  const shopOf = (id: string) => t.prisma.shop.findUniqueOrThrow({ where: { id } });

  describe('nhận shop_suspension.decided', () => {
    it('SUSPEND → SUSPENDED kèm lý do; RESTORE → ACTIVE, xóa lý do', async () => {
      const shop = await makeShop(t.prisma, randomUUID());
      await apply(decided(shop.id, 'SUSPEND', '2026-10-09T10:00:00.000Z'));
      expect(await shopOf(shop.id)).toMatchObject({
        status: 'SUSPENDED',
        suspendReason: 'Bán hàng giả',
        moderatedAt: new Date('2026-10-09T10:00:00.000Z'),
      });
      await apply(decided(shop.id, 'RESTORE', '2026-10-09T11:00:00.000Z', 'Đã sửa'));
      expect(await shopOf(shop.id)).toMatchObject({
        status: 'ACTIVE',
        suspendReason: null,
        moderatedAt: new Date('2026-10-09T11:00:00.000Z'),
      });
    });

    it('sự kiện tới sai thứ tự: quyết định cũ tới sau bị bỏ qua', async () => {
      const shop = await makeShop(t.prisma, randomUUID());
      // Admin đình chỉ lúc 10h rồi khôi phục lúc 11h, nhưng RESTORE tới trước
      await apply(decided(shop.id, 'RESTORE', '2026-10-09T11:00:00.000Z'));
      await apply(decided(shop.id, 'SUSPEND', '2026-10-09T10:00:00.000Z'));
      expect(await shopOf(shop.id)).toMatchObject({
        status: 'ACTIVE',
        suspendReason: null,
        moderatedAt: new Date('2026-10-09T11:00:00.000Z'),
      });
      // Cùng thời điểm (nhận lại) cũng bỏ qua
      await apply(decided(shop.id, 'SUSPEND', '2026-10-09T11:00:00.000Z'));
      expect((await shopOf(shop.id)).status).toBe('ACTIVE');
      // Quyết định mới hơn thì áp
      await apply(decided(shop.id, 'SUSPEND', '2026-10-09T12:00:00.000Z', 'Lần hai'));
      expect(await shopOf(shop.id)).toMatchObject({
        status: 'SUSPENDED',
        suspendReason: 'Lần hai',
      });
    });

    it('shop chưa có hoặc chưa được duyệt → ném lỗi để gửi lại sau, không đổi gì', async () => {
      await expect(
        apply(decided(randomUUID(), 'SUSPEND', new Date().toISOString())),
      ).rejects.toThrow();
      const pending = await makeShop(t.prisma, randomUUID(), { status: 'PENDING' });
      await expect(
        apply(decided(pending.id, 'SUSPEND', new Date().toISOString())),
      ).rejects.toThrow();
      expect(await shopOf(pending.id)).toMatchObject({ status: 'PENDING', moderatedAt: null });
    });

    it('shop bị đình chỉ không nộp lại hồ sơ mở shop được', async () => {
      const seller = makeUser('Chủ Shop');
      await makeShop(t.prisma, seller.id, { status: 'SUSPENDED', suspendReason: 'x' });
      const res = await t
        .http()
        .post(`${API}/shops/me/applications`)
        .set('Authorization', `Bearer ${seller.token}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          name: 'Shop Mới',
          description: 'Mô tả shop mới',
          logoUrl: `http://localhost:9000/san-public/shop-logos/${seller.id}/a.png`,
          phone: '0912345678',
          pickupAddress: PICKUP,
          bankAccount: {
            bankName: 'Vietcombank',
            accountNumber: '0123456789',
            accountName: 'NGUYEN VAN AN',
          },
        });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SHOP_ALREADY_ACTIVE');
      const shop = await t.prisma.shop.findFirstOrThrow({ where: { ownerId: seller.id } });
      expect(shop.status).toBe('SUSPENDED');
    });
  });

  describe('admin xem shop', () => {
    const asAdmin = () => ({ Authorization: `Bearer ${admin.token}` });

    it('không có bộ quyền MODERATION → 403', async () => {
      for (const user of [makeUser('Người Mua'), makeUser('Tài Chính', ['FINANCE'])]) {
        await t
          .http()
          .get(`${API}/admin/shops`)
          .set('Authorization', `Bearer ${user.token}`)
          .expect(403);
        await t
          .http()
          .get(`${API}/admin/shops/${randomUUID()}`)
          .set('Authorization', `Bearer ${user.token}`)
          .expect(403);
      }
    });

    it('danh sách: chỉ shop đã duyệt, mới nhất trước, lọc trạng thái, tìm theo tên, đếm sản phẩm', async () => {
      const a = await makeShop(t.prisma, randomUUID(), {
        name: 'Shop Hoa Mai',
        createdAt: new Date('2026-10-01T00:00:00Z'),
      });
      const b = await makeShop(t.prisma, randomUUID(), {
        name: 'Điện Máy Xanh',
        status: 'SUSPENDED',
        suspendReason: 'Hàng giả',
        createdAt: new Date('2026-10-02T00:00:00Z'),
      });
      await makeShop(t.prisma, randomUUID(), { name: 'Đang Chờ', status: 'PENDING' });
      await makeProduct(t.prisma, a.id);
      await makeProduct(t.prisma, a.id, { status: 'HIDDEN' });

      const all = await t.http().get(`${API}/admin/shops`).set(asAdmin()).expect(200);
      expect(all.body).toMatchObject({ total: 2, page: 1, pageSize: 20 });
      expect(all.body.items.map((s: { id: string }) => s.id)).toEqual([b.id, a.id]);
      expect(all.body.items[1]).toEqual({
        id: a.id,
        name: 'Shop Hoa Mai',
        logoUrl: a.logoUrl,
        ownerId: a.ownerId,
        status: 'ACTIVE',
        suspendReason: null,
        productCount: 2,
        approvedAt: '2026-10-01T03:00:00.000Z',
        createdAt: '2026-10-01T00:00:00.000Z',
      });

      const suspended = await t
        .http()
        .get(`${API}/admin/shops?status=SUSPENDED`)
        .set(asAdmin())
        .expect(200);
      expect(suspended.body.items).toHaveLength(1);
      expect(suspended.body.items[0]).toMatchObject({ id: b.id, suspendReason: 'Hàng giả' });

      const found = await t.http().get(`${API}/admin/shops?q=hoa%20MAI`).set(asAdmin()).expect(200);
      expect(found.body.items.map((s: { id: string }) => s.id)).toEqual([a.id]);

      await t.http().get(`${API}/admin/shops?status=PENDING`).set(asAdmin()).expect(400);
    });

    it('chi tiết: thông tin đang dùng, số tài khoản che, số sản phẩm theo trạng thái', async () => {
      const a = await makeShop(t.prisma, randomUUID(), { name: 'Shop Hoa Mai' });
      await makeProduct(t.prisma, a.id);
      await makeProduct(t.prisma, a.id);
      await makeProduct(t.prisma, a.id, { status: 'HIDDEN' });
      const res = await t.http().get(`${API}/admin/shops/${a.id}`).set(asAdmin()).expect(200);
      expect(res.body).toMatchObject({
        id: a.id,
        name: 'Shop Hoa Mai',
        status: 'ACTIVE',
        description: 'Shop bán đồ công nghệ',
        phone: '0912345678',
        pickupAddress: '12 Kim Mã, Phường Điện Biên, Quận Ba Đình, Hà Nội',
        bankAccount: {
          bankName: 'Vietcombank',
          accountNumber: '****6789',
          accountName: 'NGUYEN VAN AN',
        },
        productCount: 3,
        productCounts: { ACTIVE: 2, HIDDEN: 1 },
        moderatedAt: null,
      });
    });

    it('shop chưa duyệt hoặc mã lạ → 404', async () => {
      const pending = await makeShop(t.prisma, randomUUID(), { status: 'PENDING' });
      for (const id of [pending.id, randomUUID(), 'abc']) {
        const res = await t.http().get(`${API}/admin/shops/${id}`).set(asAdmin()).expect(404);
        expect(res.body.code).toBe('NOT_FOUND');
      }
    });
  });
});
