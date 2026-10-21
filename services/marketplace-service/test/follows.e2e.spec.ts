import type { Product, Shop } from '../generated/prisma';
import { makeProduct, makeShop } from './fixtures-p2';
import { API, createTestApp, describeDb, makeUser, resetDb, type TestApp } from './helpers';

type User = ReturnType<typeof makeUser>;

describeDb('Theo dõi shop, thả tim, lọc và sắp xếp theo sao (P6: ENG-03, SRC-01)', () => {
  let t: TestApp;
  let buyer: User;
  let other: User;
  let seller: User;
  let shop: Shop;
  let phone: Product;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    await resetDb(t.prisma);
    buyer = makeUser('Người Mua');
    other = makeUser('Người Khác');
    seller = makeUser('Chủ Shop');
    shop = await makeShop(t.prisma, seller.id, { name: 'Shop Theo Dõi' });
    phone = (await makeProduct(t.prisma, shop.id, { name: 'Điện thoại B' })).product;
  });

  const auth = (u: User) => ({ Authorization: `Bearer ${u.token}` });
  const follow = (u: User, shopId = shop.id) =>
    t.http().put(`${API}/shops/${shopId}/follow`).set(auth(u));
  const unfollow = (u: User, shopId = shop.id) =>
    t.http().delete(`${API}/shops/${shopId}/follow`).set(auth(u));
  const like = (u: User, productId = phone.id) =>
    t.http().put(`${API}/products/${productId}/like`).set(auth(u));
  const unlike = (u: User, productId = phone.id) =>
    t.http().delete(`${API}/products/${productId}/like`).set(auth(u));

  describe('Theo dõi shop', () => {
    it('theo dõi làm lại không tạo dòng trùng; bỏ theo dõi làm lại không lỗi', async () => {
      expect((await follow(buyer).expect(200)).body).toEqual({ following: true, followerCount: 1 });
      expect((await follow(buyer).expect(200)).body).toEqual({ following: true, followerCount: 1 });
      expect((await follow(other).expect(200)).body).toEqual({ following: true, followerCount: 2 });
      expect(await t.prisma.shopFollow.count()).toBe(2);
      expect((await unfollow(buyer).expect(200)).body).toEqual({
        following: false,
        followerCount: 1,
      });
      expect((await unfollow(buyer).expect(200)).body).toEqual({
        following: false,
        followerCount: 1,
      });
    });

    it('cần đăng nhập; shop của mình → 409 OWN_SHOP; shop chưa duyệt → 404', async () => {
      await t.http().put(`${API}/shops/${shop.id}/follow`).expect(401);
      expect((await follow(seller).expect(409)).body.code).toBe('OWN_SHOP');
      const pending = await makeShop(t.prisma, makeUser().id, { status: 'PENDING' });
      await follow(buyer, pending.id).expect(404);
      await follow(buyer, '00000000-0000-4000-8000-000000000000').expect(404);
      // Shop bị đình chỉ vẫn là shop đã duyệt: theo dõi được
      const suspended = await makeShop(t.prisma, makeUser().id, { status: 'SUSPENDED' });
      await follow(buyer, suspended.id).expect(200);
    });

    it('trang shop báo đang theo dõi theo người xem; Shop của tôi thấy số người theo dõi', async () => {
      await follow(buyer).expect(200);
      const guest = await t.http().get(`${API}/shops/${shop.id}`).expect(200);
      expect(guest.body).toMatchObject({ followerCount: 1, following: false });
      const mine = await t.http().get(`${API}/shops/${shop.id}`).set(auth(buyer)).expect(200);
      expect(mine.body).toMatchObject({ followerCount: 1, following: true });
      // Vé hỏng ở API công khai: vẫn xem được như khách
      const broken = await t
        .http()
        .get(`${API}/shops/${shop.id}`)
        .set('Authorization', 'Bearer abc')
        .expect(200);
      expect(broken.body.following).toBe(false);
      const owner = await t.http().get(`${API}/shops/me`).set(auth(seller)).expect(200);
      expect(owner.body.shop).toMatchObject({ followerCount: 1, ratingAvg: null, ratingCount: 0 });
    });

    it('danh sách shop đang theo dõi: mới theo dõi trước, kèm sao, số sản phẩm, đình chỉ', async () => {
      const s2 = await makeShop(t.prisma, makeUser().id, {
        name: 'Shop Hai',
        ratingCount: 2,
        ratingTotal: 9,
      });
      await follow(buyer).expect(200);
      await new Promise((r) => setTimeout(r, 5));
      await follow(buyer, s2.id).expect(200);
      await t.prisma.shop.update({ where: { id: shop.id }, data: { status: 'SUSPENDED' } });
      const res = await t.http().get(`${API}/me/followed-shops`).set(auth(buyer)).expect(200);
      expect(res.body.total).toBe(2);
      expect(res.body.items[0]).toMatchObject({
        id: s2.id,
        name: 'Shop Hai',
        ratingAvg: 4.5,
        ratingCount: 2,
        productCount: 0,
        suspended: false,
      });
      expect(res.body.items[1]).toMatchObject({ id: shop.id, suspended: true, productCount: 0 });
      const none = await t.http().get(`${API}/me/followed-shops`).set(auth(other)).expect(200);
      expect(none.body.total).toBe(0);
    });
  });

  describe('Thả tim sản phẩm', () => {
    it('thả tim làm lại không trùng; bỏ tim làm lại không lỗi; trang sản phẩm báo liked', async () => {
      expect((await like(buyer).expect(200)).body).toEqual({ liked: true, likeCount: 1 });
      expect((await like(buyer).expect(200)).body).toEqual({ liked: true, likeCount: 1 });
      await like(other).expect(200);
      expect(await t.prisma.productLike.count()).toBe(2);
      const mine = await t.http().get(`${API}/products/${phone.id}`).set(auth(buyer)).expect(200);
      expect(mine.body).toMatchObject({ likeCount: 2, liked: true });
      const guest = await t.http().get(`${API}/products/${phone.id}`).expect(200);
      expect(guest.body).toMatchObject({ likeCount: 2, liked: false });
      expect((await unlike(buyer).expect(200)).body).toEqual({ liked: false, likeCount: 1 });
      expect((await unlike(buyer).expect(200)).body).toEqual({ liked: false, likeCount: 1 });
    });

    it('chỉ thả tim hàng đang bán (404); bỏ tim luôn được', async () => {
      await like(buyer).expect(200);
      await t.prisma.product.update({ where: { id: phone.id }, data: { status: 'HIDDEN' } });
      await like(other).expect(404);
      const removed = (await makeProduct(t.prisma, shop.id, { status: 'REMOVED' })).product;
      await like(buyer, removed.id).expect(404);
      expect((await unlike(buyer).expect(200)).body).toEqual({ liked: false, likeCount: 0 });
    });

    it('sản phẩm yêu thích: thẻ như tìm kiếm, mới thả tim trước, hàng không còn bán ghi available=false', async () => {
      const second = (
        await makeProduct(t.prisma, shop.id, {
          name: 'Ốp lưng B',
          variants: [{ price: 50_000, originalPrice: 100_000 }],
        })
      ).product;
      await like(buyer).expect(200);
      await new Promise((r) => setTimeout(r, 5));
      await like(buyer, second.id).expect(200);
      await t.prisma.product.update({ where: { id: phone.id }, data: { status: 'HIDDEN' } });
      const res = await t.http().get(`${API}/me/liked-products`).set(auth(buyer)).expect(200);
      expect(res.body.total).toBe(2);
      expect(res.body.items[0]).toMatchObject({
        id: second.id,
        name: 'Ốp lưng B',
        minPrice: 50_000,
        originalPrice: 100_000,
        shop: { id: shop.id, name: 'Shop Theo Dõi' },
        ratingAvg: null,
        ratingCount: 0,
        available: true,
      });
      expect(res.body.items[1]).toMatchObject({ id: phone.id, available: false });
    });
  });

  describe('Tìm kiếm: lọc theo sao, sắp xếp theo đánh giá', () => {
    /** Đặt sẵn bộ đếm sao cho sản phẩm (như đã có đánh giá) */
    async function rated(name: string, count: number, total: number) {
      const p = (await makeProduct(t.prisma, shop.id, { name })).product;
      await t.prisma.product.update({
        where: { id: p.id },
        data: { ratingCount: count, ratingTotal: total },
      });
      return p.id;
    }

    let ids: Record<string, string>;
    beforeEach(async () => {
      // Bỏ sản phẩm mặc định khỏi kết quả (ẩn) để chỉ còn các sản phẩm dưới đây
      await t.prisma.product.update({ where: { id: phone.id }, data: { status: 'HIDDEN' } });
      ids = {
        a: await rated('A năm sao ít', 1, 5), // 5,0 · 1 đánh giá
        b: await rated('B năm sao nhiều', 3, 15), // 5,0 · 3 đánh giá
        c: await rated('C gần bốn', 20, 79), // 3,95 → hiện 4,0
        d: await rated('D ba sao', 2, 6), // 3,0
        e: await rated('E chưa đánh giá', 0, 0),
        f: await rated('F chưa đánh giá', 0, 0),
      };
    });

    const search = (query: Record<string, string | number>) =>
      t.http().get(`${API}/products`).query(query).expect(200);
    const names = (body: { items: Array<{ id: string }> }) =>
      body.items.map((i) => Object.keys(ids).find((k) => ids[k] === i.id));

    it('sort=rating: sao cao trước, bằng sao thì nhiều đánh giá trước, chưa có đánh giá xếp cuối', async () => {
      const res = await search({ sort: 'rating' });
      expect(names(res.body).slice(0, 4)).toEqual(['b', 'a', 'c', 'd']);
      expect(names(res.body).slice(4).sort()).toEqual(['e', 'f']);
      expect(res.body.items[2]).toMatchObject({ ratingAvg: 4, ratingCount: 20 });
    });

    it('phân trang ổn định: ghép các trang ra đúng thứ tự, không trùng, không sót', async () => {
      const all = names((await search({ sort: 'rating' })).body);
      const pages: Array<string | undefined> = [];
      for (let page = 1; page <= 3; page++) {
        pages.push(...names((await search({ sort: 'rating', pageSize: 2, page })).body));
      }
      expect(pages).toEqual(all);
    });

    it('minRating: sao trung bình (đã làm tròn) ≥ số chọn; chưa có đánh giá không ra', async () => {
      const four = await search({ minRating: 4, sort: 'rating' });
      expect(names(four.body)).toEqual(['b', 'a', 'c']);
      expect(four.body.total).toBe(3);
      const three = await search({ minRating: 3 });
      expect(names(three.body).sort()).toEqual(['a', 'b', 'c', 'd']);
      const five = await search({ minRating: 5, q: 'nam sao' });
      expect(names(five.body).sort()).toEqual(['a', 'b']);
    });

    it('minRating, sort sai → 400', async () => {
      for (const minRating of [0, 6, 'abc']) {
        const res = await t.http().get(`${API}/products`).query({ minRating }).expect(400);
        expect(res.body.details.fields).toHaveProperty('minRating');
      }
      await t.http().get(`${API}/products`).query({ sort: 'stars' }).expect(400);
    });
  });
});
