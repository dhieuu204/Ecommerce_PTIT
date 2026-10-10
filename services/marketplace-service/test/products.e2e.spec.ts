import {
  createProduct,
  createShop,
  img,
  loadCategories,
  phoneBody,
  simpleBody,
  type TestUser,
} from './catalog-fixtures';
import { API, createTestApp, describeDb, makeUser, resetDb, type TestApp } from './helpers';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(100),
]);

describeDb('Sản phẩm của seller và tồn kho (CAT-02, CAT-03, INV-01)', () => {
  let t: TestApp;
  let seller: TestUser;
  let cat: (slug: string) => string;

  const auth = (user: TestUser = seller) => ({ Authorization: `Bearer ${user.token}` });
  const base = `${API}/shops/me/products`;
  const post = (body: object, user = seller) => t.http().post(base).set(auth(user)).send(body);
  const put = (id: string, body: object, user = seller) =>
    t.http().put(`${base}/${id}`).set(auth(user)).send(body);
  const get = (id: string, user = seller) => t.http().get(`${base}/${id}`).set(auth(user));
  const adjust = (productId: string, variantId: string, body: object, user = seller) =>
    t.http().post(`${base}/${productId}/variants/${variantId}/stock`).set(auth(user)).send(body);
  const fields = (res: { body: { code: string; details?: { fields?: object } } }) => {
    expect(res.body.code).toBe('VALIDATION_ERROR');
    return res.body.details!.fields as Record<string, string>;
  };

  beforeAll(async () => {
    t = await createTestApp();
    // Mở cổng một lần: supertest gửi nhiều request cùng lúc (test tồn kho) dùng chung cổng này
    await t.app.listen(0);
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    cat = await loadCategories(t);
    seller = makeUser();
    await createShop(t, seller);
  });

  describe('Tải ảnh sản phẩm', () => {
    const upload = (user: TestUser, buf = PNG) =>
      t.http().post(`${API}/uploads/product-image`).set(auth(user)).attach('file', buf, 'a.png');

    it('chủ shop đã duyệt (kể cả đang bị đình chỉ) → lưu vào product-images/<userId>/', async () => {
      const res = await upload(seller).expect(201);
      expect(res.body.url).toMatch(
        new RegExp(
          `^http://localhost:9000/san-public/product-images/${seller.id}/[0-9a-f-]{36}\\.png$`,
        ),
      );
      const suspended = makeUser();
      await createShop(t, suspended, 'SUSPENDED');
      await upload(suspended).expect(201);
    });

    it('chưa có shop hoặc shop chưa duyệt → 409 SHOP_NOT_ACTIVE', async () => {
      expect((await upload(makeUser()).expect(409)).body.code).toBe('SHOP_NOT_ACTIVE');
      const pending = makeUser();
      await createShop(t, pending, 'PENDING');
      expect((await upload(pending).expect(409)).body.code).toBe('SHOP_NOT_ACTIVE');
    });

    it('quá 5 MB → FILE_TOO_LARGE; không phải ảnh → INVALID_IMAGE', async () => {
      const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
      expect((await upload(seller, big).expect(400)).body.code).toBe('FILE_TOO_LARGE');
      const between = Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]);
      await upload(seller, between).expect(201);
      expect((await upload(seller, Buffer.from('hello')).expect(400)).body.code).toBe(
        'INVALID_IMAGE',
      );
    });
  });

  describe('Tạo sản phẩm', () => {
    it('2 nhóm phân loại: bán ngay, tồn ban đầu ghi lịch sử, khoảng giá tính từ biến thể', async () => {
      const res = await post(phoneBody(seller.id, cat('iphone'))).expect(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        name: 'Điện thoại iPhone 16 Pro',
        description: 'Hàng chính hãng VN/A, nguyên seal, bảo hành 12 tháng.',
        status: 'ACTIVE',
        categoryId: cat('iphone'),
        category: {
          id: cat('iphone'),
          name: 'iPhone',
          slug: 'iphone',
          parent: { id: cat('dien-thoai'), name: 'Điện thoại', slug: 'dien-thoai' },
        },
        weight: 400,
        option1Name: 'Màu sắc',
        option2Name: 'Dung lượng',
        minPrice: 25000000,
        maxPrice: 28000000,
        soldCount: 0,
        images: [
          { url: img(seller.id, 'cover'), option1Value: null },
          { url: img(seller.id, 'side'), option1Value: null },
          { url: img(seller.id, 'black'), option1Value: 'Đen' },
        ],
        variants: [
          {
            id: expect.any(String),
            option1Value: 'Đen',
            option2Value: '128GB',
            price: 25000000,
            originalPrice: 28000000,
            stock: 10,
            reserved: 0,
            available: 10,
          },
          {
            id: expect.any(String),
            option1Value: 'Đen',
            option2Value: '256GB',
            price: 28000000,
            originalPrice: null,
            stock: 5,
            reserved: 0,
            available: 5,
          },
          {
            id: expect.any(String),
            option1Value: 'Trắng',
            option2Value: '128GB',
            price: 25500000,
            originalPrice: null,
            stock: 0,
            reserved: 0,
            available: 0,
          },
        ],
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
      const history = await t.prisma.stockHistory.findMany({ orderBy: { change: 'desc' } });
      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({
        change: 10,
        stockAfter: 10,
        reason: 'Nhập ban đầu',
        createdBy: seller.id,
      });
    });

    it('không phân loại: đúng 1 biến thể, gửi 2 biến thể → VALIDATION_ERROR', async () => {
      const res = await post(simpleBody(seller.id, cat('op-lung'))).expect(201);
      expect(res.body.variants).toEqual([
        expect.objectContaining({ option1Value: null, option2Value: null, price: 99000 }),
      ]);
      const two = await post(
        simpleBody(seller.id, cat('op-lung'), {
          variants: [
            { price: 99000, stock: 1 },
            { price: 99000, stock: 1 },
          ],
        }),
      ).expect(400);
      expect(fields(two).variants).toBeDefined();
    });

    it('shop chưa duyệt → 409 SHOP_NOT_ACTIVE; chưa đăng nhập → 401', async () => {
      const noShop = makeUser();
      expect(
        (await post(simpleBody(noShop.id, cat('op-lung')), noShop).expect(409)).body.code,
      ).toBe('SHOP_NOT_ACTIVE');
      const rejected = makeUser();
      await createShop(t, rejected, 'REJECTED');
      expect(
        (await post(simpleBody(rejected.id, cat('op-lung')), rejected).expect(409)).body.code,
      ).toBe('SHOP_NOT_ACTIVE');
      await t
        .http()
        .post(base)
        .send(simpleBody(seller.id, cat('op-lung')))
        .expect(401);
    });

    it('shop đang bị đình chỉ vẫn đăng và sửa được', async () => {
      const s = makeUser();
      await createShop(t, s, 'SUSPENDED');
      await post(simpleBody(s.id, cat('op-lung')), s).expect(201);
      await t.http().get(base).set(auth(s)).expect(200);
    });

    it('danh mục cấp 1, đang ẩn, hoặc cha đang ẩn → 400 INVALID_CATEGORY', async () => {
      for (const c of ['dien-thoai', 'oppo', 'tai-nghe']) {
        if (c === 'oppo')
          await t.prisma.category.update({ where: { slug: c }, data: { hidden: true } });
        if (c === 'tai-nghe') {
          await t.prisma.category.update({ where: { slug: 'am-thanh' }, data: { hidden: true } });
        }
        const res = await post(simpleBody(seller.id, cat(c))).expect(400);
        expect(res.body.code).toBe('INVALID_CATEGORY');
      }
      const missing = await post(
        simpleBody(seller.id, '00000000-0000-4000-8000-000000000000'),
      ).expect(400);
      expect(missing.body.code).toBe('INVALID_CATEGORY');
    });

    it('kiểm tên, mô tả, khối lượng, giá, giá gốc, tồn', async () => {
      const res = await post(
        simpleBody(seller.id, cat('op-lung'), {
          name: 'Ốp',
          description: 'ngắn quá',
          weight: 30001,
          variants: [{ price: 999, originalPrice: 500, stock: 1000000 }],
        }),
      ).expect(400);
      expect(Object.keys(fields(res)).sort()).toEqual(['description', 'name']);

      const res2 = await post(
        simpleBody(seller.id, cat('op-lung'), {
          weight: 30001,
          variants: [{ price: 999, originalPrice: 500, stock: 1000000 }],
        }),
      ).expect(400);
      expect(fields(res2)).toMatchObject({
        weight: expect.any(String),
        'variants.0.price': 'Giá từ 1.000đ đến 500.000.000đ.',
        'variants.0.originalPrice': 'Giá gốc phải lớn hơn giá bán.',
        'variants.0.stock': expect.any(String),
      });

      const noStock = await post(
        simpleBody(seller.id, cat('op-lung'), { variants: [{ price: 5000 }] }),
      ).expect(400);
      expect(fields(noStock)['variants.0.stock']).toBe('Vui lòng nhập tồn kho.');
      const tooHigh = await post(
        simpleBody(seller.id, cat('op-lung'), { variants: [{ price: 500000001, stock: 1 }] }),
      ).expect(400);
      expect(fields(tooHigh)['variants.0.price']).toBeDefined();
    });

    it('kiểm lựa chọn theo nhóm: thiếu giá trị, thừa nhóm, nhóm 2 không có nhóm 1, quá 10 lựa chọn', async () => {
      const body = phoneBody(seller.id, cat('iphone'));
      const missing = await post({
        ...body,
        variants: [{ option1Value: 'Đen', price: 25000000, stock: 1 }],
      }).expect(400);
      expect(fields(missing)['variants.0.option2Value']).toBe('Vui lòng nhập Dung lượng.');

      const extra = await post(
        simpleBody(seller.id, cat('op-lung'), {
          variants: [{ option1Value: 'Đỏ', price: 99000, stock: 1 }],
        }),
      ).expect(400);
      expect(fields(extra)['variants.0.option1Value']).toBeDefined();

      const onlyGroup2 = await post({ ...body, option1Name: '' }).expect(400);
      expect(fields(onlyGroup2).option2Name).toBeDefined();

      const many = await post({
        ...body,
        option2Name: null,
        variants: Array.from({ length: 11 }, (_, i) => ({
          option1Value: `Màu ${i}`,
          price: 1000000,
          stock: 1,
        })),
        images: [{ url: img(seller.id) }],
      }).expect(400);
      expect(fields(many).variants).toBe('Mỗi nhóm phân loại tối đa 10 lựa chọn.');

      // 10 × 10 thì được, không cần đủ mọi tổ hợp
      const ok = await post({
        ...body,
        variants: Array.from({ length: 10 }, (_, i) => ({
          option1Value: `Màu ${i}`,
          option2Value: `${i + 1}TB`,
          price: 1000000,
          stock: 1,
        })),
        images: [{ url: img(seller.id) }],
      });
      expect(ok.status).toBe(201);
    });

    it('trùng tổ hợp (không phân biệt hoa thường) → 409 DUPLICATE_VARIANT', async () => {
      const body = phoneBody(seller.id, cat('iphone'));
      const res = await post({
        ...body,
        variants: [
          ...body.variants,
          { option1Value: 'đen', option2Value: '128gb', price: 25000000, stock: 1 },
        ],
      }).expect(409);
      expect(res.body).toMatchObject({ code: 'DUPLICATE_VARIANT', details: { index: 3 } });
    });

    it('kiểm ảnh: 1–9 ảnh chung, ảnh theo lựa chọn phải có trong biến thể và mỗi lựa chọn 1 ảnh', async () => {
      const body = phoneBody(seller.id, cat('iphone'));
      const none = await post({
        ...body,
        images: [{ url: img(seller.id), option1Value: 'Đen' }],
      }).expect(400);
      expect(fields(none).images).toBe('Cần từ 1 đến 9 ảnh chung.');

      const ten = Array.from({ length: 10 }, (_, i) => ({ url: img(seller.id, `g${i}`) }));
      expect(fields(await post({ ...body, images: ten }).expect(400)).images).toBeDefined();
      await post({ ...body, images: ten.slice(0, 9) }).expect(201);

      const unknownValue = await post({
        ...body,
        images: [{ url: img(seller.id) }, { url: img(seller.id, 'x'), option1Value: 'Xanh' }],
      }).expect(400);
      expect(fields(unknownValue)['images.1.option1Value']).toBeDefined();

      const twice = await post({
        ...body,
        images: [
          { url: img(seller.id) },
          { url: img(seller.id, 'b1'), option1Value: 'Đen' },
          { url: img(seller.id, 'b2'), option1Value: 'Đen' },
        ],
      }).expect(400);
      expect(fields(twice)['images.2.option1Value']).toBe('Mỗi lựa chọn chỉ có 1 ảnh riêng.');
    });

    it('ảnh không nằm trong thư mục ảnh sản phẩm của mình → 400 INVALID_IMAGE_URL', async () => {
      const other = makeUser();
      for (const url of [
        img(other.id),
        `http://localhost:9000/san-public/shop-logos/${seller.id}/a.png`,
        `http://localhost:9000/san-public/product-images/${seller.id}/../${other.id}/a.png`,
        `https://evil.example/product-images/${seller.id}/a.png`,
      ]) {
        const res = await post(simpleBody(seller.id, cat('op-lung'), { images: [{ url }] })).expect(
          400,
        );
        expect(res.body).toMatchObject({ code: 'INVALID_IMAGE_URL', details: { index: 0 } });
      }
    });
  });

  describe('Xem, danh sách, ẩn/hiện', () => {
    it('sản phẩm của shop khác → 404 ở mọi API seller', async () => {
      const p = await createProduct(t, seller, simpleBody(seller.id, cat('op-lung')));
      const other = makeUser();
      await createShop(t, other);
      const v = p.variants[0]!.id;
      await get(p.id, other).expect(404);
      await put(p.id, simpleBody(other.id, cat('op-lung')), other).expect(404);
      await t
        .http()
        .patch(`${base}/${p.id}/status`)
        .set(auth(other))
        .send({ status: 'HIDDEN' })
        .expect(404);
      await adjust(p.id, v, { change: 1, reason: 'x' }, other).expect(404);
      await t.http().get(`${base}/${p.id}/stock-history`).set(auth(other)).expect(404);
      await get('khong-phai-uuid').expect(404);
    });

    it('danh sách: lọc trạng thái, danh mục (cấp 1 gồm con), tên không dấu; mới sửa lên đầu', async () => {
      const phone = await createProduct(t, seller, phoneBody(seller.id, cat('iphone')));
      const caseP = await createProduct(t, seller, simpleBody(seller.id, cat('op-lung')));
      const samsung = await createProduct(
        t,
        seller,
        simpleBody(seller.id, cat('samsung'), { name: 'Samsung Galaxy S24 Ultra' }),
      );
      await t
        .http()
        .patch(`${base}/${caseP.id}/status`)
        .set(auth())
        .send({ status: 'HIDDEN' })
        .expect(200);
      await t.prisma.productVariant.updateMany({
        where: { productId: phone.id, option2Value: '128GB', option1Value: 'Đen' },
        data: { reserved: 4 },
      });
      // Shop khác không hiện
      const other = makeUser();
      await createShop(t, other);
      await createProduct(t, other, simpleBody(other.id, cat('op-lung')));

      const all = await t.http().get(base).set(auth()).expect(200);
      expect(all.body.total).toBe(3);
      expect(all.body.items.map((r: { id: string }) => r.id)).toEqual([
        caseP.id,
        samsung.id,
        phone.id,
      ]);
      expect(all.body.items[2]).toEqual({
        id: phone.id,
        name: 'Điện thoại iPhone 16 Pro',
        status: 'ACTIVE',
        image: img(seller.id, 'cover'),
        minPrice: 25000000,
        maxPrice: 28000000,
        totalStock: 15,
        totalAvailable: 11,
        variantCount: 3,
        soldCount: 0,
        categoryName: 'iPhone',
        updatedAt: expect.any(String),
      });

      const list = async (query: object) =>
        (await t.http().get(base).query(query).set(auth()).expect(200)).body.items.map(
          (r: { id: string }) => r.id,
        );
      expect(await list({ status: 'HIDDEN' })).toEqual([caseP.id]);
      expect(await list({ categoryId: cat('dien-thoai') })).toEqual([samsung.id, phone.id]);
      expect(await list({ categoryId: cat('iphone') })).toEqual([phone.id]);
      expect(await list({ q: 'dien thoai' })).toEqual([phone.id]);
      expect(await list({ q: 'GALAXY s2' })).toEqual([samsung.id]);
      expect(await list({ pageSize: 1, page: 2 })).toEqual([samsung.id]);
    });

    it('ẩn rồi bán lại', async () => {
      const p = await createProduct(t, seller, simpleBody(seller.id, cat('op-lung')));
      const hidden = await t
        .http()
        .patch(`${base}/${p.id}/status`)
        .set(auth())
        .send({ status: 'HIDDEN' })
        .expect(200);
      expect(hidden.body.status).toBe('HIDDEN');
      expect((await get(p.id).expect(200)).body.status).toBe('HIDDEN');
      await t
        .http()
        .patch(`${base}/${p.id}/status`)
        .set(auth())
        .send({ status: 'ACTIVE' })
        .expect(200);
      const bad = await t
        .http()
        .patch(`${base}/${p.id}/status`)
        .set(auth())
        .send({ status: 'DELETED' });
      expect(bad.status).toBe(400);
    });
  });

  describe('Sửa sản phẩm (PUT)', () => {
    type V = {
      id: string;
      option1Value: string | null;
      option2Value: string | null;
      stock: number;
      price: number;
    };
    const variantInput = (v: V, extra: object = {}) => ({
      id: v.id,
      option1Value: v.option1Value,
      option2Value: v.option2Value,
      price: v.price,
      ...extra,
    });

    it('đổi thông tin, giữ tồn biến thể cũ (bỏ qua stock), thêm biến thể mới có tồn ban đầu, tính lại khoảng giá, thay ảnh', async () => {
      const p = await createProduct(t, seller, phoneBody(seller.id, cat('iphone')));
      const [b128, b256, w128] = p.variants as V[];
      const res = await put(
        p.id,
        phoneBody(seller.id, cat('samsung'), {
          name: 'Điện thoại iPhone 16 Pro (mới)',
          variants: [
            variantInput(b128!, { price: 24000000, stock: 999 }),
            variantInput(b256!),
            variantInput(w128!),
            { option1Value: 'Trắng', option2Value: '256GB', price: 30000000, stock: 7 },
          ],
          images: [{ url: img(seller.id, 'new') }],
        }),
      ).expect(200);
      expect(res.body).toMatchObject({
        name: 'Điện thoại iPhone 16 Pro (mới)',
        categoryId: cat('samsung'),
        minPrice: 24000000,
        maxPrice: 30000000,
        images: [{ url: img(seller.id, 'new'), option1Value: null }],
      });
      expect(res.body.variants).toHaveLength(4);
      expect(res.body.variants[0]).toMatchObject({ id: b128!.id, price: 24000000, stock: 10 });
      expect(res.body.variants[3]).toMatchObject({
        option1Value: 'Trắng',
        option2Value: '256GB',
        stock: 7,
      });
      const logs = await t.prisma.stockHistory.findMany({
        where: { variantId: res.body.variants[3].id },
      });
      expect(logs).toMatchObject([{ change: 7, stockAfter: 7, reason: 'Nhập ban đầu' }]);
      expect(await t.prisma.productImage.count({ where: { productId: p.id } })).toBe(1);
    });

    it('bỏ biến thể → ngừng bán (không xóa dòng); thêm lại đúng tổ hợp → bật lại dòng cũ, giữ tồn cũ', async () => {
      const p = await createProduct(t, seller, phoneBody(seller.id, cat('iphone')));
      const [b128, b256, w128] = p.variants as V[];
      const body = phoneBody(seller.id, cat('iphone'));

      const removed = await put(p.id, {
        ...body,
        variants: [variantInput(b128!), variantInput(w128!)],
      }).expect(200);
      expect(removed.body.variants.map((v: V) => v.id)).toEqual([b128!.id, w128!.id]);
      expect(removed.body.maxPrice).toBe(25500000);
      expect(await t.prisma.productVariant.findUnique({ where: { id: b256!.id } })).toMatchObject({
        active: false,
        stock: 5,
      });

      const readded = await put(p.id, {
        ...body,
        variants: [
          variantInput(b128!),
          variantInput(w128!),
          { option1Value: 'Đen', option2Value: '256GB', price: 27000000, stock: 100 },
        ],
      }).expect(200);
      expect(readded.body.variants[2]).toMatchObject({ id: b256!.id, price: 27000000, stock: 5 });
      expect(await t.prisma.productVariant.count({ where: { productId: p.id } })).toBe(3);
    });

    it('bỏ biến thể đang được giữ cho đơn → 409 VARIANT_RESERVED, không đổi gì', async () => {
      const p = await createProduct(t, seller, phoneBody(seller.id, cat('iphone')));
      const [b128, b256, w128] = p.variants as V[];
      await t.prisma.productVariant.update({ where: { id: b256!.id }, data: { reserved: 1 } });
      const res = await put(
        p.id,
        phoneBody(seller.id, cat('iphone'), {
          name: 'Tên mới hoàn toàn',
          variants: [variantInput(b128!), variantInput(w128!)],
        }),
      ).expect(409);
      expect(res.body).toMatchObject({
        code: 'VARIANT_RESERVED',
        details: { variantId: b256!.id },
      });
      expect((await get(p.id).expect(200)).body).toMatchObject({
        name: 'Điện thoại iPhone 16 Pro',
      });
    });

    it('đổi tên lựa chọn, hai biến thể đổi tổ hợp cho nhau, chuyển sang không phân loại', async () => {
      const p = await createProduct(t, seller, phoneBody(seller.id, cat('iphone')));
      const [b128, b256, w128] = p.variants as V[];
      const body = phoneBody(seller.id, cat('iphone'));
      const swapped = await put(p.id, {
        ...body,
        variants: [
          variantInput(b128!, { option2Value: '256GB' }),
          variantInput(b256!, { option2Value: '128GB' }),
          variantInput(w128!, { option1Value: 'Titan' }),
        ],
        images: [{ url: img(seller.id) }, { url: img(seller.id, 'ti'), option1Value: 'Titan' }],
      }).expect(200);
      expect(swapped.body.variants).toMatchObject([
        { id: b128!.id, option1Value: 'Đen', option2Value: '256GB', stock: 10 },
        { id: b256!.id, option1Value: 'Đen', option2Value: '128GB', stock: 5 },
        { id: w128!.id, option1Value: 'Titan', option2Value: '128GB', stock: 0 },
      ]);

      const simple = await put(
        p.id,
        simpleBody(seller.id, cat('iphone'), { variants: [{ id: b128!.id, price: 20000000 }] }),
      ).expect(200);
      expect(simple.body).toMatchObject({
        option1Name: null,
        option2Name: null,
        variants: [{ id: b128!.id, option1Value: null, option2Value: null, stock: 10 }],
      });
    });

    it('đổi tên thành tổ hợp của biến thể đã bỏ → 409 DUPLICATE_VARIANT', async () => {
      const p = await createProduct(t, seller, phoneBody(seller.id, cat('iphone')));
      const [b128, b256, w128] = p.variants as V[];
      const body = phoneBody(seller.id, cat('iphone'));
      await put(p.id, { ...body, variants: [variantInput(b128!), variantInput(w128!)] }).expect(
        200,
      );
      const res = await put(p.id, {
        ...body,
        variants: [
          variantInput(b128!),
          variantInput(w128!, { option1Value: 'Đen', option2Value: '256GB' }),
        ],
      }).expect(409);
      expect(res.body.code).toBe('DUPLICATE_VARIANT');
      expect(b256).toBeDefined();
    });

    it('id lạ → 400; biến thể mới thiếu tồn → 400; danh mục đã ẩn: giữ nguyên được, đổi sang thì không', async () => {
      const p = await createProduct(t, seller, simpleBody(seller.id, cat('op-lung')));
      const other = await createProduct(t, seller, simpleBody(seller.id, cat('op-lung')));
      const body = simpleBody(seller.id, cat('op-lung'));

      const foreign = await put(p.id, {
        ...body,
        variants: [{ id: other.variants[0]!.id, price: 1000 }],
      }).expect(400);
      expect(fields(foreign)['variants.0.id']).toBeDefined();

      const noStock = await put(p.id, {
        ...phoneBody(seller.id, cat('op-lung')),
        variants: [{ option1Value: 'Đỏ', option2Value: 'S', price: 1000 }],
        images: [{ url: img(seller.id) }],
      }).expect(400);
      expect(fields(noStock)['variants.0.stock']).toBeDefined();

      await t.prisma.category.update({ where: { slug: 'op-lung' }, data: { hidden: true } });
      await put(p.id, { ...body, variants: [{ id: p.variants[0]!.id, price: 120000 }] }).expect(
        200,
      );
      await t.prisma.category.update({ where: { slug: 'oppo' }, data: { hidden: true } });
      const hidden = await put(p.id, {
        ...body,
        categoryId: cat('oppo'),
        variants: [{ id: p.variants[0]!.id, price: 1000 }],
      });
      expect(hidden.status).toBe(400);
      expect(hidden.body.code).toBe('INVALID_CATEGORY');
    });
  });

  describe('Điều chỉnh tồn và lịch sử', () => {
    let p: Awaited<ReturnType<typeof createProduct>>;
    let v: string;
    beforeEach(async () => {
      p = await createProduct(t, seller, simpleBody(seller.id, cat('op-lung')));
      v = p.variants[0]!.id;
    });

    it('nhập thêm / bớt: trả tồn mới, ghi lịch sử kèm lý do và người làm', async () => {
      const res = await adjust(p.id, v, { change: 25, reason: ' Nhập thêm lô tháng 10 ' }).expect(
        200,
      );
      expect(res.body).toEqual({ variantId: v, stock: 125, reserved: 0, available: 125 });
      await adjust(p.id, v, { change: -5, reason: 'Kiểm kho thấy thiếu' }).expect(200);

      const history = await t.http().get(`${base}/${p.id}/stock-history`).set(auth()).expect(200);
      expect(history.body.total).toBe(3);
      expect(history.body.items[0]).toEqual({
        id: expect.any(String),
        variantId: v,
        option1Value: null,
        option2Value: null,
        change: -5,
        stockAfter: 120,
        reason: 'Kiểm kho thấy thiếu',
        createdBy: seller.id,
        createdAt: expect.any(String),
      });
      expect(history.body.items.map((h: { reason: string }) => h.reason)).toEqual([
        'Kiểm kho thấy thiếu',
        'Nhập thêm lô tháng 10',
        'Nhập ban đầu',
      ]);
    });

    it('xuống dưới lượng đang giữ hoặc âm → 409 STOCK_BELOW_RESERVED; vượt 999.999 → 400 STOCK_TOO_LARGE', async () => {
      await t.prisma.productVariant.update({ where: { id: v }, data: { reserved: 30 } });
      const below = await adjust(p.id, v, { change: -71, reason: 'Bớt' }).expect(409);
      expect(below.body).toMatchObject({
        code: 'STOCK_BELOW_RESERVED',
        details: { stock: 100, reserved: 30 },
      });
      await adjust(p.id, v, { change: -70, reason: 'Bớt' }).expect(200);

      await t.prisma.productVariant.update({ where: { id: v }, data: { reserved: 0 } });
      expect((await adjust(p.id, v, { change: -31, reason: 'Bớt' }).expect(409)).body.code).toBe(
        'STOCK_BELOW_RESERVED',
      );
      expect(
        (await adjust(p.id, v, { change: 999970, reason: 'Nhập' }).expect(400)).body.code,
      ).toBe('STOCK_TOO_LARGE');
      expect((await adjust(p.id, v, { change: 5e9, reason: 'Nhập' }).expect(400)).body.code).toBe(
        'STOCK_TOO_LARGE',
      );
      await adjust(p.id, v, { change: 999969, reason: 'Nhập' }).expect(200);
      expect(await t.prisma.stockHistory.count({ where: { variantId: v } })).toBe(3);
    });

    it('change = 0 hoặc thiếu lý do → VALIDATION_ERROR; biến thể của sản phẩm khác hoặc đã bỏ → 404', async () => {
      expect(
        fields(await adjust(p.id, v, { change: 0, reason: 'x' }).expect(400)).change,
      ).toBeDefined();
      expect(
        fields(await adjust(p.id, v, { change: 1, reason: '  ' }).expect(400)).reason,
      ).toBeDefined();
      const other = await createProduct(t, seller, simpleBody(seller.id, cat('op-lung')));
      await adjust(p.id, other.variants[0]!.id, { change: 1, reason: 'x' }).expect(404);
      await t.prisma.productVariant.update({ where: { id: v }, data: { active: false } });
      await adjust(p.id, v, { change: 1, reason: 'x' }).expect(404);
    });

    it('nhiều lần bớt cùng lúc không làm tồn xuống dưới lượng đang giữ', async () => {
      // tồn 100, giữ 30 → chỉ bớt được 70: 10 lần bớt 10 cùng lúc thì đúng 7 lần thành công
      await t.prisma.productVariant.update({ where: { id: v }, data: { reserved: 30 } });
      const results = await Promise.all(
        Array.from({ length: 10 }, () => adjust(p.id, v, { change: -10, reason: 'Bớt cùng lúc' })),
      );
      const statuses = results.map((r) => r.status).sort();
      expect(statuses.filter((s) => s === 200)).toHaveLength(7);
      expect(statuses.filter((s) => s === 409)).toHaveLength(3);
      const after = await t.prisma.productVariant.findUniqueOrThrow({ where: { id: v } });
      expect(after.stock).toBe(30);
      const logs = await t.prisma.stockHistory.findMany({
        where: { variantId: v, reason: 'Bớt cùng lúc' },
      });
      expect(logs).toHaveLength(7);
      expect(logs.map((l) => l.stockAfter).sort((a, b) => a - b)).toEqual([
        30, 40, 50, 60, 70, 80, 90,
      ]);
    });

    it('hai lần bớt cùng lúc không làm tồn âm', async () => {
      await adjust(p.id, v, { change: -90, reason: 'Còn 10' }).expect(200);
      const [a, b] = await Promise.all([
        adjust(p.id, v, { change: -6, reason: 'A' }),
        adjust(p.id, v, { change: -6, reason: 'B' }),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect((await t.prisma.productVariant.findUniqueOrThrow({ where: { id: v } })).stock).toBe(4);
    });

    it('lịch sử: lọc theo biến thể, phân trang', async () => {
      const phone = await createProduct(t, seller, phoneBody(seller.id, cat('iphone')));
      const [b128] = phone.variants;
      await adjust(phone.id, b128!.id, { change: 1, reason: 'Nhập 1' }).expect(200);
      const all = await t.http().get(`${base}/${phone.id}/stock-history`).set(auth()).expect(200);
      expect(all.body.total).toBe(3);
      const one = await t
        .http()
        .get(`${base}/${phone.id}/stock-history`)
        .query({ variantId: b128!.id, pageSize: 1 })
        .set(auth())
        .expect(200);
      expect(one.body).toMatchObject({ total: 2, page: 1, pageSize: 1 });
      expect(one.body.items[0]).toMatchObject({
        reason: 'Nhập 1',
        option1Value: 'Đen',
        option2Value: '128GB',
        stockAfter: 11,
      });
    });
  });
});
