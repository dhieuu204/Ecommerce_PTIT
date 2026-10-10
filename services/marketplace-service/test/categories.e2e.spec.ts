import { seedCategories, SEED_CATEGORIES } from '../src/categories/seed-categories';
import { createProduct, createShop, loadCategories, simpleBody } from './catalog-fixtures';
import { API, createTestApp, describeDb, makeUser, resetDb, type TestApp } from './helpers';

describeDb('Danh mục (CAT-01)', () => {
  let t: TestApp;
  const admin = makeUser('Trần Thị Bình', ['MODERATION']);
  const support = makeUser('Lê Văn Cường', ['SUPPORT']);

  const adminReq = (method: 'get' | 'post' | 'patch' | 'delete', path: string, user = admin) =>
    t.http()[method](`${API}/admin/categories${path}`).set('Authorization', `Bearer ${user.token}`);
  const audits = (action: string) => t.prisma.auditLog.findMany({ where: { action } });

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());
  beforeEach(() => resetDb(t.prisma));

  it('lệnh seed: đủ danh mục mẫu, chạy lại không tạo trùng và không ghi đè chỗ admin đã sửa', async () => {
    const total = SEED_CATEGORIES.reduce((n, c) => n + 1 + c.children.length, 0);
    expect(await seedCategories(t.prisma)).toBe(total);
    await t.prisma.category.update({ where: { slug: 'iphone' }, data: { name: 'Apple iPhone' } });
    expect(await seedCategories(t.prisma)).toBe(0);
    expect(await t.prisma.category.count()).toBe(total);
    expect((await t.prisma.category.findUnique({ where: { slug: 'iphone' } }))!.name).toBe(
      'Apple iPhone',
    );
    // Danh mục cấp 1 nào cũng có icon
    expect(await t.prisma.category.count({ where: { parentId: null, icon: null } })).toBe(0);
  });

  it('GET /categories công khai: cây chưa ẩn theo thứ tự, công nghệ trước', async () => {
    await seedCategories(t.prisma);
    await t.prisma.category.update({ where: { slug: 'oppo' }, data: { hidden: true } });
    await t.prisma.category.update({ where: { slug: 'lam-dep' }, data: { hidden: true } });

    const res = await t.http().get(`${API}/categories`).expect(200);
    expect(res.body.map((c: { slug: string }) => c.slug)).toEqual([
      'dien-thoai',
      'may-tinh-bang',
      'laptop',
      'dong-ho-thong-minh',
      'am-thanh',
      'phu-kien',
      'thoi-trang',
      'nha-cua',
    ]);
    expect(res.body[0]).toEqual({
      id: expect.any(String),
      name: 'Điện thoại',
      slug: 'dien-thoai',
      icon: 'smartphone',
      children: [
        { id: expect.any(String), name: 'iPhone', slug: 'iphone', icon: null },
        { id: expect.any(String), name: 'Samsung', slug: 'samsung', icon: null },
        { id: expect.any(String), name: 'Xiaomi', slug: 'xiaomi', icon: null },
      ],
    });
  });

  it('cùng thứ tự thì xếp theo tên', async () => {
    for (const [name, slug] of [
      ['Tranh', 'tranh'],
      ['Bút', 'but'],
      ['Kẹo', 'keo'],
    ]) {
      await adminReq('post', '').send({ name, slug, icon: 'box' }).expect(201);
    }
    const res = await t.http().get(`${API}/categories`).expect(200);
    expect(res.body.map((c: { name: string }) => c.name)).toEqual(['Bút', 'Kẹo', 'Tranh']);
  });

  it('API admin cần bộ quyền MODERATION', async () => {
    await t.http().get(`${API}/admin/categories`).expect(401);
    expect((await adminReq('get', '', support).expect(403)).body.code).toBe('FORBIDDEN');
    await adminReq('post', '', support).send({ name: 'X', slug: 'x' }).expect(403);
  });

  it('admin xem cả danh mục ẩn kèm số sản phẩm', async () => {
    const cat = await loadCategories(t);
    await t.prisma.category.update({ where: { slug: 'oppo' }, data: { hidden: true } });
    const seller = makeUser();
    await createShop(t, seller);
    await createProduct(t, seller, simpleBody(seller.id, cat('iphone')));
    await createProduct(t, seller, simpleBody(seller.id, cat('samsung')));

    const res = await adminReq('get', '').expect(200);
    const phone = res.body.find((c: { slug: string }) => c.slug === 'dien-thoai');
    expect(phone).toMatchObject({
      parentId: null,
      icon: 'smartphone',
      hidden: false,
      productCount: 2,
    });
    expect(phone.children).toHaveLength(4);
    expect(phone.children.find((c: { slug: string }) => c.slug === 'iphone')).toMatchObject({
      parentId: phone.id,
      productCount: 1,
    });
    expect(phone.children.find((c: { slug: string }) => c.slug === 'oppo')).toMatchObject({
      hidden: true,
      productCount: 0,
    });
  });

  it('thêm danh mục cấp 1 và cấp 2, ghi nhật ký', async () => {
    const root = await adminReq('post', '')
      .send({ name: ' Sách ', slug: 'sach', icon: 'book-open', sort: 5 })
      .expect(201);
    expect(root.body).toEqual({
      id: expect.any(String),
      parentId: null,
      name: 'Sách',
      slug: 'sach',
      icon: 'book-open',
      sort: 5,
      hidden: false,
      productCount: 0,
      createdAt: expect.any(String),
    });
    const child = await adminReq('post', '')
      .send({ name: 'Sách thiếu nhi', slug: 'sach-thieu-nhi', parentId: root.body.id })
      .expect(201);
    expect(child.body).toMatchObject({ parentId: root.body.id, icon: null, sort: 0 });

    const logs = await audits('CREATE_CATEGORY');
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({ actorId: admin.id, targetType: 'CATEGORY' });
  });

  it('thêm: slug trùng → SLUG_TAKEN; cha không phải cấp 1 → INVALID_PARENT; slug sai dạng → VALIDATION_ERROR', async () => {
    const cat = await loadCategories(t);
    const taken = await adminReq('post', '').send({ name: 'Điện thoại 2', slug: 'dien-thoai' });
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe('SLUG_TAKEN');

    const childParent = await adminReq('post', '').send({
      name: 'iPhone 16',
      slug: 'iphone-16',
      parentId: cat('iphone'),
    });
    expect(childParent.status).toBe(400);
    expect(childParent.body.code).toBe('INVALID_PARENT');

    const missingParent = await adminReq('post', '').send({
      name: 'Khác',
      slug: 'khac',
      parentId: '00000000-0000-4000-8000-000000000000',
    });
    expect(missingParent.body.code).toBe('INVALID_PARENT');

    const bad = await adminReq('post', '').send({ name: 'Điện thoại', slug: 'Điện Thoại' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('VALIDATION_ERROR');
    expect(bad.body.details.fields.slug).toBeDefined();
  });

  it('sửa tên, slug, icon, thứ tự, ẩn; ghi nhật ký phần thay đổi', async () => {
    const cat = await loadCategories(t);
    const res = await adminReq('patch', `/${cat('am-thanh')}`)
      .send({
        name: 'Âm thanh và loa',
        slug: 'am-thanh-loa',
        icon: 'speaker',
        sort: 1,
        hidden: true,
      })
      .expect(200);
    expect(res.body).toMatchObject({
      name: 'Âm thanh và loa',
      slug: 'am-thanh-loa',
      icon: 'speaker',
      sort: 1,
      hidden: true,
    });
    const [log] = await audits('UPDATE_CATEGORY');
    expect(log).toMatchObject({ targetId: cat('am-thanh'), targetType: 'CATEGORY' });
    expect(log!.before).toMatchObject({ name: 'Âm thanh', hidden: false });
    expect(log!.after).toMatchObject({ name: 'Âm thanh và loa', hidden: true });

    const slugTaken = await adminReq('patch', `/${cat('laptop')}`).send({ slug: 'iphone' });
    expect(slugTaken.status).toBe(409);
    expect(slugTaken.body.code).toBe('SLUG_TAKEN');
    await adminReq('patch', '/00000000-0000-4000-8000-000000000000')
      .send({ name: 'X' })
      .expect(404);
    await adminReq('patch', '/khong-phai-uuid').send({ name: 'X' }).expect(404);
  });

  it('đổi cha: cấp 2 sang cấp 1 khác được; cấp 1 có con không thành cấp 2; cấp 2 có sản phẩm không thành cấp 1', async () => {
    const cat = await loadCategories(t);
    const moved = await adminReq('patch', `/${cat('tai-nghe')}`)
      .send({ parentId: cat('phu-kien') })
      .expect(200);
    expect(moved.body.parentId).toBe(cat('phu-kien'));

    const hasChildren = await adminReq('patch', `/${cat('am-thanh')}`).send({
      parentId: cat('phu-kien'),
    });
    expect(hasChildren.status).toBe(409);
    expect(hasChildren.body.code).toBe('CATEGORY_HAS_CHILDREN');

    const toChild = await adminReq('patch', `/${cat('phu-kien')}`).send({ parentId: cat('loa') });
    expect(toChild.status).toBe(400);
    expect(toChild.body.code).toBe('INVALID_PARENT');

    const seller = makeUser();
    await createShop(t, seller);
    await createProduct(t, seller, simpleBody(seller.id, cat('op-lung')));
    const inUse = await adminReq('patch', `/${cat('op-lung')}`).send({ parentId: null });
    expect(inUse.status).toBe(409);
    expect(inUse.body.code).toBe('CATEGORY_IN_USE');

    // Cấp 2 chưa có sản phẩm thành cấp 1
    const promoted = await adminReq('patch', `/${cat('loa')}`)
      .send({ parentId: null })
      .expect(200);
    expect(promoted.body.parentId).toBeNull();
  });

  it('xóa: còn con hoặc đã có sản phẩm → CATEGORY_IN_USE; trống thì xóa và ghi nhật ký', async () => {
    const cat = await loadCategories(t);
    const withChildren = await adminReq('delete', `/${cat('dien-thoai')}`);
    expect(withChildren.status).toBe(409);
    expect(withChildren.body.code).toBe('CATEGORY_IN_USE');

    const seller = makeUser();
    await createShop(t, seller);
    await createProduct(t, seller, simpleBody(seller.id, cat('iphone')));
    expect((await adminReq('delete', `/${cat('iphone')}`).expect(409)).body.code).toBe(
      'CATEGORY_IN_USE',
    );

    await adminReq('delete', `/${cat('xiaomi')}`).expect(204);
    expect(await t.prisma.category.findUnique({ where: { slug: 'xiaomi' } })).toBeNull();
    const [log] = await audits('DELETE_CATEGORY');
    expect(log).toMatchObject({ targetId: cat('xiaomi'), targetType: 'CATEGORY' });
    expect(log!.before).toMatchObject({ slug: 'xiaomi' });
    await adminReq('delete', `/${cat('xiaomi')}`).expect(404);
  });
});
