import {
  createProduct,
  createShop,
  img,
  loadCategories,
  phoneBody,
  simpleBody,
  type TestUser,
} from './catalog-fixtures';
import {
  API,
  createTestApp,
  describeDb,
  loadSampleLocations,
  makeUser,
  resetDb,
  type TestApp,
} from './helpers';

describeDb('Xem hàng công khai (CAT-04, SRC-01)', () => {
  let t: TestApp;
  let cat: (slug: string) => string;
  let sellerA: TestUser;
  let sellerB: TestUser;
  let shopA: { id: string; name: string | null };
  let shopB: { id: string; name: string | null };
  /** Sản phẩm theo tên ngắn */
  const p: Record<string, Awaited<ReturnType<typeof createProduct>>> = {};

  const search = (query: object = {}) => t.http().get(`${API}/products`).query(query).expect(200);
  const ids = async (query: object = {}) =>
    (await search(query)).body.items.map((c: { id: string }) => c.id);

  beforeAll(async () => {
    t = await createTestApp();
    await loadSampleLocations(t);
    await resetDb(t.prisma);
    cat = await loadCategories(t);
    sellerA = makeUser('Nguyễn Văn An');
    sellerB = makeUser('Trần Thị Bình');
    shopA = await createShop(t, sellerA, 'ACTIVE', 'Shop Táo Xanh');
    shopB = await createShop(t, sellerB, 'ACTIVE', 'Shop Điện Máy');
    const suspended = makeUser('Lê Văn Cường');
    await createShop(t, suspended, 'SUSPENDED', 'Shop Bị Đình Chỉ');

    p.iphone = await createProduct(
      t,
      sellerA,
      phoneBody(sellerA.id, cat('iphone'), { name: 'Điện thoại iPhone 16 Pro Max' }),
    );
    p.case = await createProduct(
      t,
      sellerA,
      simpleBody(sellerA.id, cat('op-lung'), { name: 'Ốp lưng iPhone 16 trong suốt' }),
    );
    p.samsung = await createProduct(
      t,
      sellerB,
      simpleBody(sellerB.id, cat('samsung'), {
        name: 'Điện thoại Samsung Galaxy S24',
        variants: [{ price: 18000000, originalPrice: 20000000, stock: 3 }],
      }),
    );
    p.headphone = await createProduct(
      t,
      sellerB,
      simpleBody(sellerB.id, cat('tai-nghe'), {
        name: 'Tai nghe không dây chống ồn',
        variants: [{ price: 2500000, stock: 2 }],
      }),
    );
    p.hidden = await createProduct(
      t,
      sellerB,
      simpleBody(sellerB.id, cat('iphone'), { name: 'Điện thoại iPhone cũ đã ẩn' }),
    );
    await t.prisma.product.update({ where: { id: p.hidden.id }, data: { status: 'HIDDEN' } });
    p.suspended = await createProduct(
      t,
      suspended,
      simpleBody(suspended.id, cat('iphone'), { name: 'Điện thoại iPhone của shop bị đình chỉ' }),
    );
    // Thời gian tạo cách nhau 1 phút theo thứ tự trên (không phụ thuộc tốc độ máy)
    for (const [i, key] of [
      'iphone',
      'case',
      'samsung',
      'headphone',
      'hidden',
      'suspended',
    ].entries()) {
      await t.prisma.product.update({
        where: { id: p[key]!.id },
        data: { createdAt: new Date(Date.UTC(2026, 9, 1, 0, i)) },
      });
    }
    // Tai nghe hết hàng (còn 2 nhưng đang giữ 2), bán chạy nhất
    await t.prisma.productVariant.updateMany({
      where: { productId: p.headphone.id },
      data: { reserved: 2 },
    });
    await t.prisma.product.update({ where: { id: p.headphone.id }, data: { soldCount: 50 } });
    await t.prisma.product.update({ where: { id: p.samsung.id }, data: { soldCount: 10 } });
  });
  afterAll(() => t.app.close());

  describe('GET /products', () => {
    it('không cần đăng nhập; chỉ hàng đang bán, mới nhất trước', async () => {
      const res = await search();
      expect(res.body.total).toBe(4);
      expect(res.body.items.map((c: { id: string }) => c.id)).toEqual([
        p.headphone!.id,
        p.samsung!.id,
        p.case!.id,
        p.iphone!.id,
      ]);
    });

    it('thẻ sản phẩm: ảnh, khoảng giá, giá gốc của biến thể rẻ nhất, lựa chọn nhóm 1, còn hàng, shop', async () => {
      const items = (await search()).body.items as Array<{ id: string }>;
      expect(items.find((c) => c.id === p.iphone!.id)).toEqual({
        id: p.iphone!.id,
        name: 'Điện thoại iPhone 16 Pro Max',
        image: img(sellerA.id, 'cover'),
        minPrice: 25000000,
        maxPrice: 28000000,
        originalPrice: 28000000,
        option1Name: 'Màu sắc',
        option1Values: ['Đen', 'Trắng'],
        soldCount: 0,
        inStock: true,
        shop: { id: shopA.id, name: 'Shop Táo Xanh' },
        createdAt: expect.any(String),
        ratingAvg: null,
        ratingCount: 0,
      });
      expect(items.find((c) => c.id === p.case!.id)).toMatchObject({
        originalPrice: null,
        option1Name: null,
        option1Values: [],
      });
      expect(items.find((c) => c.id === p.headphone!.id)).toMatchObject({ inStock: false });
    });

    it('tìm không phân biệt dấu, hoa thường, khớp đầu từ', async () => {
      const phones = [p.samsung!.id, p.iphone!.id];
      expect(await ids({ q: 'dien thoai', sort: 'newest' })).toEqual(phones);
      expect(await ids({ q: 'Điện Thoại', sort: 'newest' })).toEqual(phones);
      expect(await ids({ q: 'ĐIỆN THOẠI', sort: 'newest' })).toEqual(phones);
      expect(await ids({ q: 'ip', sort: 'newest' })).toEqual([p.case!.id, p.iphone!.id]);
      expect(await ids({ q: 'dien thoai ip' })).toEqual([p.iphone!.id]);
      expect(await ids({ q: 'khong day' })).toEqual([p.headphone!.id]);
      expect(await ids({ q: 'xyz' })).toEqual([]);
      expect(await ids({ q: 'thoai dien' })).toHaveLength(2);
      // Ký tự đặc biệt không làm lỗi truy vấn
      expect((await search({ q: "ip' & | !:*()" })).body.total).toBe(2);
      expect((await search({ q: '&&&' })).body.total).toBe(4);
    });

    it('có q thì mặc định xếp theo độ liên quan', async () => {
      // "iphone 16" khớp cả hai; tên ngắn hơn khớp nhiều hơn nên lên trước
      const res = await ids({ q: 'iphone' });
      expect(res).toHaveLength(2);
      expect(res).toEqual(await ids({ q: 'iphone', sort: 'relevance' }));
    });

    it('lọc danh mục (cấp 1 gồm con), giá thấp nhất, shop', async () => {
      expect(await ids({ categoryId: cat('dien-thoai') })).toEqual([p.samsung!.id, p.iphone!.id]);
      expect(await ids({ categoryId: cat('iphone') })).toEqual([p.iphone!.id]);
      expect(await ids({ categoryId: cat('phu-kien') })).toEqual([p.case!.id]);
      expect(await ids({ minPrice: 2500000, maxPrice: 20000000 })).toEqual([
        p.headphone!.id,
        p.samsung!.id,
      ]);
      expect(await ids({ shopId: shopA.id })).toEqual([p.case!.id, p.iphone!.id]);
      expect(await ids({ shopId: shopB.id, q: 'tai nghe' })).toEqual([p.headphone!.id]);
    });

    it('sắp xếp giá tăng, giá giảm, bán chạy', async () => {
      expect(await ids({ sort: 'price_asc' })).toEqual([
        p.case!.id,
        p.headphone!.id,
        p.samsung!.id,
        p.iphone!.id,
      ]);
      expect(await ids({ sort: 'price_desc' })).toEqual([
        p.iphone!.id,
        p.samsung!.id,
        p.headphone!.id,
        p.case!.id,
      ]);
      expect((await ids({ sort: 'best_selling' })).slice(0, 2)).toEqual([
        p.headphone!.id,
        p.samsung!.id,
      ]);
    });

    it('phân trang; tham số sai → VALIDATION_ERROR', async () => {
      const page2 = await search({ pageSize: 3, page: 2 });
      expect(page2.body).toMatchObject({ total: 4, page: 2, pageSize: 3 });
      expect(page2.body.items.map((c: { id: string }) => c.id)).toEqual([p.iphone!.id]);
      const empty = await search({ page: 9 });
      expect(empty.body).toMatchObject({ total: 4, items: [] });

      for (const query of [{ sort: 'cheap' }, { categoryId: 'abc' }, { minPrice: -1 }]) {
        const res = await t.http().get(`${API}/products`).query(query).expect(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      }
    });

    it('shop bị đình chỉ rồi khôi phục: hàng biến mất rồi hiện lại', async () => {
      await t.prisma.shop.update({ where: { id: shopB.id }, data: { status: 'SUSPENDED' } });
      expect(await ids()).toEqual([p.case!.id, p.iphone!.id]);
      await t.prisma.shop.update({ where: { id: shopB.id }, data: { status: 'ACTIVE' } });
      expect(await ids()).toHaveLength(4);
    });
  });

  describe('GET /products/{productId}', () => {
    it('chi tiết hàng đang bán, không lộ tồn và lượng đang giữ', async () => {
      // Một biến thể đã bỏ không hiện
      await t.prisma.productVariant.updateMany({
        where: { productId: p.iphone!.id, option1Value: 'Trắng' },
        data: { active: false },
      });
      await t.prisma.productVariant.updateMany({
        where: { productId: p.iphone!.id, option2Value: '256GB' },
        data: { reserved: 2 },
      });
      const res = await t.http().get(`${API}/products/${p.iphone!.id}`).expect(200);
      expect(res.body).toEqual({
        id: p.iphone!.id,
        name: 'Điện thoại iPhone 16 Pro Max',
        description: 'Hàng chính hãng VN/A, nguyên seal, bảo hành 12 tháng.',
        status: 'ACTIVE',
        weight: 400,
        soldCount: 0,
        minPrice: 25000000,
        maxPrice: 28000000,
        option1Name: 'Màu sắc',
        option2Name: 'Dung lượng',
        category: {
          id: cat('iphone'),
          name: 'iPhone',
          slug: 'iphone',
          parent: { id: cat('dien-thoai'), name: 'Điện thoại', slug: 'dien-thoai' },
        },
        images: [
          { url: img(sellerA.id, 'cover'), option1Value: null },
          { url: img(sellerA.id, 'side'), option1Value: null },
          { url: img(sellerA.id, 'black'), option1Value: 'Đen' },
        ],
        variants: [
          {
            id: expect.any(String),
            option1Value: 'Đen',
            option2Value: '128GB',
            price: 25000000,
            originalPrice: 28000000,
            available: 10,
          },
          {
            id: expect.any(String),
            option1Value: 'Đen',
            option2Value: '256GB',
            price: 28000000,
            originalPrice: null,
            available: 3,
          },
        ],
        shop: {
          id: shopA.id,
          name: 'Shop Táo Xanh',
          logoUrl: `http://localhost:9000/san-public/shop-logos/${sellerA.id}/logo.png`,
          productCount: 2,
          joinedAt: expect.any(String),
        },
        ratingAvg: null,
        ratingCount: 0,
        likeCount: 0,
        liked: false,
      });
      await t.prisma.productVariant.updateMany({
        where: { productId: p.iphone!.id },
        data: { active: true, reserved: 0 },
      });
    });

    it('sản phẩm ẩn, shop bị đình chỉ, không có hoặc mã sai → 404', async () => {
      for (const id of [
        p.hidden!.id,
        p.suspended!.id,
        '00000000-0000-4000-8000-000000000000',
        'khong-phai-uuid',
      ]) {
        const res = await t.http().get(`${API}/products/${id}`).expect(404);
        expect(res.body.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('GET /shops/{shopId}', () => {
    it('trang shop đang hoạt động; ngày tham gia là lúc hồ sơ được duyệt', async () => {
      const approvedAt = new Date('2026-09-01T03:00:00Z');
      await t.prisma.shopApplication.create({
        data: {
          shopId: shopA.id,
          version: 1,
          type: 'REGISTER',
          status: 'APPROVED',
          data: {},
          requestKey: `key-${shopA.id}`,
          decidedAt: approvedAt,
        },
      });
      const res = await t.http().get(`${API}/shops/${shopA.id}`).expect(200);
      expect(res.body).toEqual({
        id: shopA.id,
        name: 'Shop Táo Xanh',
        logoUrl: `http://localhost:9000/san-public/shop-logos/${sellerA.id}/logo.png`,
        description: 'Shop bán đồ công nghệ chính hãng',
        provinceName: 'Hà Nội',
        productCount: 2,
        joinedAt: approvedAt.toISOString(),
        status: 'ACTIVE',
        suspended: false,
        ratingAvg: null,
        ratingCount: 0,
        followerCount: 0,
        following: false,
      });
    });

    it('shop bị đình chỉ vẫn mở được, ghi tạm ngừng bán, không còn sản phẩm đang bán', async () => {
      const shop = await t.prisma.shop.findFirstOrThrow({ where: { name: 'Shop Bị Đình Chỉ' } });
      const res = await t.http().get(`${API}/shops/${shop.id}`).expect(200);
      expect(res.body).toMatchObject({ status: 'SUSPENDED', suspended: true, productCount: 0 });
    });

    it('shop chưa duyệt hoặc mã sai → 404; GET /shops/me vẫn là shop của tôi', async () => {
      const pendingOwner = makeUser();
      const pending = await createShop(t, pendingOwner, 'PENDING');
      await t.http().get(`${API}/shops/${pending.id}`).expect(404);
      await t.http().get(`${API}/shops/khong-phai-uuid`).expect(404);

      await t.http().get(`${API}/shops/me`).expect(401);
      const me = await t
        .http()
        .get(`${API}/shops/me`)
        .set('Authorization', `Bearer ${sellerA.token}`)
        .expect(200);
      expect(me.body).toMatchObject({ status: 'ACTIVE', shop: { id: shopA.id } });
    });
  });
});
