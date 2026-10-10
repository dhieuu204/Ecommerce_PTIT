import { randomUUID } from 'node:crypto';
import { AppConfig } from '../src/config';
import { makeProduct, makeShop } from './fixtures-p2';
import { API, createTestApp, describeDb, makeUser, resetDb, type TestApp } from './helpers';

type User = ReturnType<typeof makeUser>;

describeDb('Giỏ hàng (CRT-01)', () => {
  let t: TestApp;
  let buyer: User;
  let seller: User;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    buyer = makeUser('Người Mua');
    seller = makeUser('Chủ Shop');
  });

  const auth = (u: User) => ({ Authorization: `Bearer ${u.token}` });
  const add = (variantId: string, quantity = 1, u: User = buyer) =>
    t.http().post(`${API}/cart/items`).set(auth(u)).send({ variantId, quantity });
  const cart = async (u: User = buyer) =>
    (await t.http().get(`${API}/cart`).set(auth(u)).expect(200)).body;
  const patch = (itemId: string, body: object, u: User = buyer) =>
    t.http().patch(`${API}/cart/items/${itemId}`).set(auth(u)).send(body);

  /** Shop của seller + 1 sản phẩm Màu × Dung lượng */
  async function phone(opts: Parameters<typeof makeProduct>[2] = {}) {
    const shop = await makeShop(t.prisma, seller.id, { name: 'Shop Điện Thoại' });
    return {
      shop,
      ...(await makeProduct(t.prisma, shop.id, {
        name: 'iPhone 15',
        option1Name: 'Màu',
        option2Name: 'Dung lượng',
        variants: [
          {
            option1Value: 'Đen',
            option2Value: '128GB',
            price: 20_000_000,
            originalPrice: 22_000_000,
            stock: 5,
            reserved: 2,
          },
          { option1Value: 'Trắng', option2Value: '128GB', price: 21_000_000, stock: 10 },
          { option1Value: 'Trắng', option2Value: '256GB', price: 25_000_000, stock: 0 },
        ],
        images: [
          { url: 'http://img/chung-1.png' },
          { url: 'http://img/den.png', option1Value: 'Đen' },
          { url: 'http://img/chung-2.png' },
        ],
        ...opts,
      })),
    };
  }

  it('chưa đăng nhập → 401', async () => {
    await t.http().get(`${API}/cart`).expect(401);
    await t.http().get(`${API}/cart/count`).expect(401);
    await t
      .http()
      .post(`${API}/cart/items`)
      .send({ variantId: randomUUID(), quantity: 1 })
      .expect(401);
  });

  it('thêm vào giỏ; thêm lại cùng biến thể thì cộng dồn; GET /cart đúng dạng', async () => {
    const { shop, product, variants } = await phone();
    const first = await add(variants[0]!.id, 1).expect(201);
    expect(first.body).toEqual({ itemId: expect.any(String), quantity: 1, count: 1 });
    const again = await add(variants[0]!.id, 2).expect(201);
    expect(again.body).toEqual({ itemId: first.body.itemId, quantity: 3, count: 1 });

    expect(await cart()).toEqual({
      shops: [
        {
          shop: { id: shop.id, name: 'Shop Điện Thoại', logoUrl: shop.logoUrl },
          items: [
            {
              id: first.body.itemId,
              variantId: variants[0]!.id,
              productId: product.id,
              productName: 'iPhone 15',
              image: 'http://img/den.png',
              option1Name: 'Màu',
              option2Name: 'Dung lượng',
              option1Value: 'Đen',
              option2Value: '128GB',
              price: 20_000_000,
              originalPrice: 22_000_000,
              available: 3,
              quantity: 3,
              selected: true,
              state: 'OK',
            },
          ],
        },
      ],
      selectedCount: 1,
      selectedTotal: 60_000_000,
    });
    expect((await t.http().get(`${API}/cart/count`).set(auth(buyer)).expect(200)).body).toEqual({
      count: 1,
    });
  });

  it('vượt số còn bán được (tồn - đang giữ) → 409 NOT_ENOUGH_STOCK kèm available', async () => {
    const { variants } = await phone();
    await add(variants[0]!.id, 2).expect(201);
    const res = await add(variants[0]!.id, 2).expect(409);
    expect(res.body).toMatchObject({ code: 'NOT_ENOUGH_STOCK', details: { available: 3 } });
    const out = await add(variants[2]!.id, 1).expect(409);
    expect(out.body).toMatchObject({ code: 'NOT_ENOUGH_STOCK', details: { available: 0 } });
    expect((await t.prisma.cartItem.findFirstOrThrow()).quantity).toBe(2);
  });

  it('hàng không còn bán (sản phẩm ẩn, biến thể bị bỏ, shop đình chỉ) → 409 PRODUCT_UNAVAILABLE', async () => {
    const shop = await makeShop(t.prisma, seller.id);
    const hidden = await makeProduct(t.prisma, shop.id, { status: 'HIDDEN' });
    const dropped = await makeProduct(t.prisma, shop.id, { variants: [{ active: false }] });
    const other = await makeShop(t.prisma, randomUUID(), { status: 'SUSPENDED' });
    const suspended = await makeProduct(t.prisma, other.id);
    for (const p of [hidden, dropped, suspended]) {
      const res = await add(p.variants[0]!.id).expect(409);
      expect(res.body.code).toBe('PRODUCT_UNAVAILABLE');
    }
    expect(await t.prisma.cartItem.count()).toBe(0);
  });

  it('hàng của shop mình → 409 OWN_PRODUCT; biến thể không có → 404; dữ liệu sai → 400', async () => {
    const { variants } = await phone();
    expect((await add(variants[0]!.id, 1, seller).expect(409)).body.code).toBe('OWN_PRODUCT');
    expect((await add(randomUUID()).expect(404)).body.code).toBe('NOT_FOUND');
    for (const quantity of [0, -1, 1.5]) {
      expect((await add(variants[0]!.id, quantity).expect(400)).body.code).toBe('VALIDATION_ERROR');
    }
  });

  it('giỏ đã đủ số dòng tối đa → 409 CART_FULL (thêm vào dòng có sẵn vẫn được)', async () => {
    const config = t.app.get(AppConfig) as { cartMaxItems: number };
    const old = config.cartMaxItems;
    config.cartMaxItems = 2;
    try {
      const { variants } = await phone();
      await add(variants[0]!.id).expect(201);
      await add(variants[1]!.id).expect(201);
      const other = await makeProduct(t.prisma, (await t.prisma.shop.findFirstOrThrow()).id);
      expect((await add(other.variants[0]!.id).expect(409)).body.code).toBe('CART_FULL');
      await add(variants[1]!.id).expect(201);
    } finally {
      config.cartMaxItems = old;
    }
  });

  it('bấm thêm 2 lần cùng lúc → vẫn một dòng, số lượng cộng đúng', async () => {
    const { variants } = await phone();
    const results = await Promise.all([add(variants[1]!.id, 1), add(variants[1]!.id, 1)]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    const rows = await t.prisma.cartItem.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.quantity).toBe(2);
  });

  it('GET /cart: nhóm theo shop (dòng mới nhất trước), ảnh, tình trạng, tổng chỉ tính dòng chọn OK', async () => {
    const { shop, variants } = await phone();
    const seller2 = makeUser('Chủ Shop Hai');
    const shop2 = await makeShop(t.prisma, seller2.id, { name: 'Shop Hai' });
    const noImage = await makeProduct(t.prisma, shop2.id, {
      variants: [{ price: 50_000, stock: 3 }],
    });
    const generalOnly = await makeProduct(t.prisma, shop2.id, {
      option1Name: 'Màu',
      variants: [{ option1Value: 'Xanh', price: 70_000 }],
      images: [
        { url: 'http://img/rieng-do.png', option1Value: 'Đỏ' },
        { url: 'http://img/chung.png' },
      ],
    });

    const a = (await add(variants[0]!.id, 1)).body.itemId; // shop 1, OK
    const b = (await add(noImage.variants[0]!.id, 2)).body.itemId; // shop 2, OK
    const c = (await add(variants[1]!.id, 4)).body.itemId; // shop 1, OK
    const d = (await add(generalOnly.variants[0]!.id, 1)).body.itemId; // shop 2

    // Sau khi thêm: hết hàng, không đủ hàng, ẩn sản phẩm, bỏ chọn
    await t.prisma.productVariant.update({ where: { id: variants[0]!.id }, data: { stock: 2 } }); // còn 0
    await t.prisma.productVariant.update({ where: { id: variants[1]!.id }, data: { stock: 3 } }); // 4 > 3
    await t.prisma.cartItem.update({ where: { id: b }, data: { selected: false } });

    let body = await cart();
    expect(body.shops.map((g: { shop: { id: string } }) => g.shop.id)).toEqual([shop2.id, shop.id]);
    const byId = Object.fromEntries(
      body.shops
        .flatMap((g: { items: Array<{ id: string }> }) => g.items)
        .map((i: { id: string }) => [i.id, i]),
    );
    expect(body.shops[0].items.map((i: { id: string }) => i.id)).toEqual([d, b]);
    expect(body.shops[1].items.map((i: { id: string }) => i.id)).toEqual([c, a]);
    expect(byId[a]).toMatchObject({ state: 'OUT_OF_STOCK', available: 0 });
    expect(byId[c]).toMatchObject({
      state: 'NOT_ENOUGH_STOCK',
      available: 3,
      image: 'http://img/chung-1.png',
    });
    expect(byId[b]).toMatchObject({ state: 'OK', image: null, selected: false });
    expect(byId[d]).toMatchObject({ state: 'OK', image: 'http://img/chung.png' });
    expect(body).toMatchObject({ selectedCount: 1, selectedTotal: 70_000 });

    // Shop 2 bị đình chỉ → UNAVAILABLE, không tính tiền
    await t.prisma.shop.update({ where: { id: shop2.id }, data: { status: 'SUSPENDED' } });
    body = await cart();
    expect(
      body.shops[0].items.map((i: { state: string; available: number }) => [i.state, i.available]),
    ).toEqual([
      ['UNAVAILABLE', 0],
      ['UNAVAILABLE', 0],
    ]);
    expect(body).toMatchObject({ selectedCount: 0, selectedTotal: 0 });
  });

  describe('sửa dòng giỏ', () => {
    it('đổi số lượng (kiểm số còn bán được), tick chọn', async () => {
      const { variants } = await phone();
      const id = (await add(variants[0]!.id, 1)).body.itemId;
      const res = await patch(id, { quantity: 3, selected: false }).expect(200);
      expect(res.body.shops[0].items[0]).toMatchObject({ quantity: 3, selected: false });
      expect(res.body).toMatchObject({ selectedCount: 0, selectedTotal: 0 });

      const over = await patch(id, { quantity: 4 }).expect(409);
      expect(over.body).toMatchObject({ code: 'NOT_ENOUGH_STOCK', details: { available: 3 } });
      expect((await patch(id, { quantity: 0 }).expect(400)).body.code).toBe('VALIDATION_ERROR');
    });

    it('hàng đã ngừng bán: không tăng số lượng được, vẫn bỏ chọn được', async () => {
      const { product, variants } = await phone();
      const id = (await add(variants[1]!.id, 1)).body.itemId;
      await t.prisma.product.update({ where: { id: product.id }, data: { status: 'HIDDEN' } });
      expect((await patch(id, { quantity: 2 }).expect(409)).body.code).toBe('PRODUCT_UNAVAILABLE');
      await patch(id, { selected: false }).expect(200);
    });

    it('đổi sang biến thể khác của cùng sản phẩm; trùng dòng có sẵn thì gộp', async () => {
      const { variants } = await phone();
      const id = (await add(variants[0]!.id, 2)).body.itemId;
      let res = await patch(id, { variantId: variants[1]!.id }).expect(200);
      expect(res.body.shops[0].items).toHaveLength(1);
      expect(res.body.shops[0].items[0]).toMatchObject({
        id,
        variantId: variants[1]!.id,
        option1Value: 'Trắng',
        quantity: 2,
        image: 'http://img/chung-1.png',
      });

      const other = (await add(variants[0]!.id, 1)).body.itemId;
      res = await patch(other, { variantId: variants[1]!.id, quantity: 3 }).expect(200);
      const items = res.body.shops[0].items;
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ id, variantId: variants[1]!.id, quantity: 5 });
      expect(await t.prisma.cartItem.count()).toBe(1);

      // Gộp vượt số còn bán được
      const third = (await add(variants[0]!.id, 1)).body.itemId;
      const over = await patch(third, { variantId: variants[1]!.id, quantity: 6 }).expect(409);
      expect(over.body).toMatchObject({ code: 'NOT_ENOUGH_STOCK', details: { available: 10 } });
      // Biến thể hết hàng
      const out = await patch(third, { variantId: variants[2]!.id }).expect(409);
      expect(out.body.code).toBe('NOT_ENOUGH_STOCK');
    });

    it('biến thể của sản phẩm khác → 400 INVALID_VARIANT; dòng của người khác → 404', async () => {
      const { shop, variants } = await phone();
      const other = await makeProduct(t.prisma, shop.id);
      const id = (await add(variants[0]!.id, 1)).body.itemId;
      expect((await patch(id, { variantId: other.variants[0]!.id }).expect(400)).body.code).toBe(
        'INVALID_VARIANT',
      );
      expect((await patch(id, { variantId: randomUUID() }).expect(400)).body.code).toBe(
        'INVALID_VARIANT',
      );
      const stranger = makeUser('Người Lạ');
      expect((await patch(id, { quantity: 2 }, stranger).expect(404)).body.code).toBe('NOT_FOUND');
      await t.http().delete(`${API}/cart/items/${id}`).set(auth(stranger)).expect(404);
      await patch('abc', { quantity: 2 }).expect(404);
      expect((await t.prisma.cartItem.findFirstOrThrow()).quantity).toBe(1);
    });
  });

  it('xóa một dòng, chọn nhiều dòng, xóa nhiều dòng (dòng của người khác không bị đụng)', async () => {
    const { variants } = await phone();
    const a = (await add(variants[0]!.id)).body.itemId;
    const b = (await add(variants[1]!.id)).body.itemId;
    const stranger = makeUser('Người Lạ');
    const s = (await add(variants[1]!.id, 1, stranger)).body.itemId;

    let res = await t
      .http()
      .post(`${API}/cart/selection`)
      .set(auth(buyer))
      .send({ itemIds: [a, b, s], selected: false })
      .expect(200);
    expect(res.body.shops[0].items.map((i: { selected: boolean }) => i.selected)).toEqual([
      false,
      false,
    ]);
    expect((await t.prisma.cartItem.findUniqueOrThrow({ where: { id: s } })).selected).toBe(true);

    res = await t.http().delete(`${API}/cart/items/${a}`).set(auth(buyer)).expect(200);
    expect(res.body.shops[0].items.map((i: { id: string }) => i.id)).toEqual([b]);

    res = await t
      .http()
      .post(`${API}/cart/items/remove`)
      .set(auth(buyer))
      .send({ itemIds: [b, s] })
      .expect(200);
    expect(res.body).toEqual({ shops: [], selectedCount: 0, selectedTotal: 0 });
    expect(await t.prisma.cartItem.count({ where: { id: s } })).toBe(1);

    await t
      .http()
      .post(`${API}/cart/items/remove`)
      .set(auth(buyer))
      .send({ itemIds: [] })
      .expect(400);
    await t
      .http()
      .post(`${API}/cart/selection`)
      .set(auth(buyer))
      .send({ itemIds: ['x'], selected: true })
      .expect(400);
  });
});
