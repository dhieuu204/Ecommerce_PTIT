import { randomUUID } from 'node:crypto';
import { NOTIFICATION_CREATED, type NotificationCreatedPayload, type SanEvent } from '@san/shared';
import { NotificationPush } from '../src/notifications/notification-push';
import { RealtimeGateway } from '../src/realtime/realtime.gateway';
import type { Product, ProductVariant, Shop } from '../generated/prisma';
import { makeProduct, makeShop } from './fixtures-p2';
import { API, createTestApp, describeDb, makeUser, resetDb, type TestApp } from './helpers';
import { makeShopOrder, resetRealtime } from './rt-fixtures';

type User = ReturnType<typeof makeUser>;

/** Ảnh PNG giả: chỉ cần đúng 8 byte đầu để được nhận là ảnh */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

describeDb('Chat người mua – shop và thông báo trong app (P6: MSG-01, MSG-02)', () => {
  let t: TestApp;
  let buyer: User;
  let seller: User;
  let stranger: User;
  let shop: Shop;
  let product: Product;
  let variant: ProductVariant;
  let emit: jest.SpyInstance;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    await resetRealtime(t.prisma);
    t.storage.privateFiles.clear();
    buyer = makeUser('Người Mua');
    seller = makeUser('Chủ Shop');
    stranger = makeUser('Người Lạ');
    shop = await makeShop(t.prisma, seller.id, { name: 'Shop Chat' });
    const p = await makeProduct(t.prisma, shop.id, {
      name: 'Áo thun',
      variants: [{ price: 150_000 }],
      images: [{ url: 'http://localhost:9000/san-public/product-images/x/ao.png' }],
    });
    product = p.product;
    variant = p.variants[0]!;
    emit = jest.spyOn(t.app.get(RealtimeGateway), 'emitToUser');
  });
  afterEach(() => emit.mockRestore());

  const auth = (u: User) => ({ Authorization: `Bearer ${u.token}` });
  const open = (u: User = buyer, shopId = shop.id) =>
    t.http().post(`${API}/conversations`).set(auth(u)).send({ shopId });
  const send = (u: User, conversationId: string, body: Record<string, unknown>) =>
    t
      .http()
      .post(`${API}/conversations/${conversationId}/messages`)
      .set(auth(u))
      .send({ clientKey: randomUUID(), ...body });
  const text = (u: User, conversationId: string, s: string) =>
    send(u, conversationId, { type: 'TEXT', text: s });
  const notifications = (userId: string) =>
    t.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  const conv = (id: string) => t.prisma.conversation.findUniqueOrThrow({ where: { id } });

  async function opened(): Promise<string> {
    return (await open().expect(200)).body.id as string;
  }

  // ----- mở chat -----

  it('mở chat: một cặp người mua – shop đúng một cuộc; shop chưa duyệt → 404; shop mình → 409', async () => {
    const a = await open().expect(200);
    expect(a.body).toMatchObject({
      role: 'BUYER',
      shop: { id: shop.id, name: 'Shop Chat', suspended: false },
      buyer: { id: buyer.id, name: 'Người Mua' },
      unread: 0,
      lastMessageAt: null,
    });
    const b = await open().expect(200);
    expect(b.body.id).toBe(a.body.id);
    expect(await t.prisma.conversation.count()).toBe(1);

    const pending = await makeShop(t.prisma, stranger.id, { status: 'PENDING' });
    await open(buyer, pending.id).expect(404);
    await open(buyer, randomUUID()).expect(404);
    expect((await open(seller).expect(409)).body.code).toBe('OWN_SHOP');
  });

  it('shop bị đình chỉ vẫn chat được', async () => {
    await t.prisma.shop.update({ where: { id: shop.id }, data: { status: 'SUSPENDED' } });
    const res = await open().expect(200);
    expect(res.body.shop.suspended).toBe(true);
    await text(buyer, res.body.id, 'Đơn của tôi thế nào?').expect(201);
  });

  // ----- quyền -----

  it('chỉ hai bên đọc và gửi; người khác → 404 (kể cả admin)', async () => {
    const id = await opened();
    const admin = makeUser('Admin', ['SUPPORT', 'MODERATION', 'SYSTEM', 'FINANCE']);
    for (const u of [stranger, admin]) {
      await t.http().get(`${API}/conversations/${id}`).set(auth(u)).expect(404);
      await t.http().get(`${API}/conversations/${id}/messages`).set(auth(u)).expect(404);
      await text(u, id, 'Xin chào').expect(404);
      await t.http().post(`${API}/conversations/${id}/read`).set(auth(u)).expect(404);
    }
    const s = await t.http().get(`${API}/conversations/${id}`).set(auth(seller)).expect(200);
    expect(s.body.role).toBe('SHOP');
    await t.http().get(`${API}/conversations/${randomUUID()}`).set(auth(buyer)).expect(404);
  });

  // ----- gửi tin -----

  it('gửi chữ: số chưa đọc của bên kia tăng, đẩy chat:message cho cả hai sau khi lưu', async () => {
    const id = await opened();
    const res = await text(buyer, id, '  Áo còn size M không shop?  ').expect(201);
    expect(res.body).toMatchObject({
      conversationId: id,
      senderRole: 'BUYER',
      type: 'TEXT',
      text: 'Áo còn size M không shop?',
      imageKey: null,
      card: null,
    });
    await text(buyer, id, 'Shop ơi').expect(201);
    expect(await conv(id)).toMatchObject({
      shopUnread: 2,
      buyerUnread: 0,
      lastMessagePreview: 'Shop ơi',
    });
    const pushed = emit.mock.calls.filter((c) => c[1] === 'chat:message');
    expect(pushed.map((c) => c[0]).sort()).toEqual(
      [buyer.id, seller.id, buyer.id, seller.id].sort(),
    );
    expect(pushed[0]![2]).toMatchObject({ conversationId: id, message: { id: res.body.id } });

    // Tin không hợp lệ
    expect((await text(buyer, id, '   ').expect(400)).body.code).toBe('INVALID_MESSAGE');
    await text(buyer, id, 'a'.repeat(1001)).expect(400);
    await send(buyer, id, { type: 'VIDEO' }).expect(400);
  });

  it('clientKey gửi lại trả tin cũ, không tạo tin mới, không tăng chưa đọc', async () => {
    const id = await opened();
    const clientKey = randomUUID();
    const body = { clientKey, type: 'TEXT', text: 'Xin chào' };
    const a = await t
      .http()
      .post(`${API}/conversations/${id}/messages`)
      .set(auth(buyer))
      .send(body)
      .expect(201);
    emit.mockClear();
    const b = await t
      .http()
      .post(`${API}/conversations/${id}/messages`)
      .set(auth(buyer))
      .send(body)
      .expect(201);
    expect(b.body.id).toBe(a.body.id);
    expect(await t.prisma.message.count()).toBe(1);
    expect((await conv(id)).shopUnread).toBe(1);
    expect(emit).not.toHaveBeenCalled();
    // Bên kia dùng trùng mã: không trả tin của người khác
    await t
      .http()
      .post(`${API}/conversations/${id}/messages`)
      .set(auth(seller))
      .send(body)
      .expect(409);
  });

  it('thẻ sản phẩm: chụp lại lúc gửi; sản phẩm không còn bán → 404', async () => {
    const id = await opened();
    const res = await send(buyer, id, { type: 'PRODUCT', productId: product.id }).expect(201);
    expect(res.body.card).toEqual({
      kind: 'PRODUCT',
      productId: product.id,
      name: 'Áo thun',
      image: 'http://localhost:9000/san-public/product-images/x/ao.png',
      minPrice: 150_000,
      maxPrice: 150_000,
      shopName: 'Shop Chat',
    });
    // Đổi tên sau khi gửi: thẻ vẫn giữ bản chụp
    await t.prisma.product.update({ where: { id: product.id }, data: { name: 'Áo mới' } });
    const list = await t.http().get(`${API}/conversations/${id}/messages`).set(auth(seller));
    expect(list.body.items[0].card.name).toBe('Áo thun');

    await t.prisma.product.update({ where: { id: product.id }, data: { status: 'HIDDEN' } });
    await send(buyer, id, { type: 'PRODUCT', productId: product.id }).expect(404);
    expect((await send(buyer, id, { type: 'PRODUCT' }).expect(400)).body.code).toBe(
      'INVALID_MESSAGE',
    );
  });

  it('thẻ đơn: chỉ đơn con của chính người mua ở shop này (cả shop gửi cũng vậy)', async () => {
    const id = await opened();
    const mine = await makeShopOrder(t.prisma, {
      buyerId: buyer.id,
      shopId: shop.id,
      productId: product.id,
      variantId: variant.id,
    });
    const res = await send(buyer, id, { type: 'ORDER', shopOrderId: mine.id }).expect(201);
    expect(res.body.card).toMatchObject({
      kind: 'ORDER',
      shopOrderId: mine.id,
      orderId: mine.orderId,
      code: mine.code,
      status: 'DELIVERED',
      total: 230_000,
      itemCount: 2,
      firstItemName: 'Áo thun',
    });
    await send(seller, id, { type: 'ORDER', shopOrderId: mine.id }).expect(201);

    // Đơn của người khác ở shop này, và đơn của mình ở shop khác
    const other = await makeShopOrder(t.prisma, {
      buyerId: stranger.id,
      shopId: shop.id,
      productId: product.id,
      variantId: variant.id,
    });
    const shopB = await makeShop(t.prisma, makeUser('Chủ B').id);
    const elsewhere = await makeShopOrder(t.prisma, {
      buyerId: buyer.id,
      shopId: shopB.id,
      productId: product.id,
      variantId: variant.id,
    });
    await send(buyer, id, { type: 'ORDER', shopOrderId: other.id }).expect(404);
    await send(seller, id, { type: 'ORDER', shopOrderId: other.id }).expect(404);
    await send(buyer, id, { type: 'ORDER', shopOrderId: elsewhere.id }).expect(404);
  });

  it('ảnh chat: tải lên bucket riêng tư theo cuộc trò chuyện, chỉ hai bên xem; khóa sai → 400', async () => {
    const id = await opened();
    const up = (u: User, conversationId = id) =>
      t
        .http()
        .post(`${API}/uploads/chat-image?conversationId=${conversationId}`)
        .set(auth(u))
        .attach('file', PNG, 'anh.png');
    await up(stranger).expect(404);
    await t
      .http()
      .post(`${API}/uploads/chat-image?conversationId=${id}`)
      .set(auth(buyer))
      .attach('file', Buffer.from('khong phai anh'), 'a.txt')
      .expect(400);
    const key = (await up(buyer).expect(201)).body.key as string;
    expect(key).toMatch(new RegExp(`^chat-images/${id}/[0-9a-f-]{36}\\.png$`));
    expect(t.storage.privateFiles.has(key)).toBe(true);

    const msg = await send(buyer, id, { type: 'IMAGE', imageKey: key }).expect(201);
    expect(msg.body).toMatchObject({ type: 'IMAGE', imageKey: key });
    expect((await conv(id)).lastMessagePreview).toBe('[Hình ảnh]');

    await t.http().get(`${API}/${key}`).set(auth(seller)).expect(200);
    await t.http().get(`${API}/${key}`).set(auth(buyer)).expect(200);
    await t.http().get(`${API}/${key}`).set(auth(stranger)).expect(404);

    // Khóa của cuộc trò chuyện khác
    const shopB = await makeShop(t.prisma, makeUser('Chủ B').id);
    const otherId = (await open(buyer, shopB.id).expect(200)).body.id as string;
    const otherKey = (await up(buyer, otherId).expect(201)).body.key as string;
    expect(
      (await send(buyer, id, { type: 'IMAGE', imageKey: otherKey }).expect(400)).body.code,
    ).toBe('INVALID_MESSAGE');
  });

  // ----- đọc, số chưa đọc, danh sách -----

  it('đọc tin: về 0 ở vai của mình, đẩy chat:read; số chưa đọc theo vai', async () => {
    const id = await opened();
    await text(buyer, id, 'Một').expect(201);
    await text(buyer, id, 'Hai').expect(201);
    const counts = (u: User) =>
      t.http().get(`${API}/conversations/unread-count`).set(auth(u)).expect(200);
    expect((await counts(seller)).body).toEqual({ buyer: 0, shop: 2 });
    expect((await counts(buyer)).body).toEqual({ buyer: 0, shop: 0 });

    emit.mockClear();
    const read = await t.http().post(`${API}/conversations/${id}/read`).set(auth(seller));
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ role: 'SHOP', unread: 0 });
    expect((await counts(seller)).body.shop).toBe(0);
    expect(emit.mock.calls.map((c) => [c[0], c[1], c[2]])).toEqual(
      expect.arrayContaining([
        [buyer.id, 'chat:read', { conversationId: id, role: 'SHOP' }],
        [seller.id, 'chat:read', { conversationId: id, role: 'SHOP' }],
      ]),
    );
    // Thông báo "có tin nhắn mới" của cuộc này cũng thành đã đọc
    expect((await notifications(seller.id)).every((n) => n.readAt)).toBe(true);

    await text(seller, id, 'Dạ còn ạ').expect(201);
    expect((await counts(buyer)).body).toEqual({ buyer: 1, shop: 0 });
    const viewed = await t.http().get(`${API}/conversations/${id}`).set(auth(buyer));
    expect(viewed.body).toMatchObject({ unread: 1, otherUnread: 0 });
  });

  it('danh sách theo vai: shop chỉ thấy cuộc đã có tin; chưa có shop → rỗng; tin mới nhất trước', async () => {
    const shopB = await makeShop(t.prisma, makeUser('Chủ B').id, { name: 'Shop B' });
    const a = await opened();
    const b = (await open(buyer, shopB.id).expect(200)).body.id as string;
    const list = (u: User, role: string) =>
      t.http().get(`${API}/conversations?role=${role}`).set(auth(u)).expect(200);
    expect((await list(seller, 'SHOP')).body.total).toBe(0);
    await text(buyer, a, 'Tin cho shop A').expect(201);
    await text(buyer, b, 'Tin cho shop B').expect(201);
    const mine = await list(buyer, 'BUYER');
    expect(mine.body.items.map((c: { id: string }) => c.id)).toEqual([b, a]);
    const forShop = await list(seller, 'SHOP');
    expect(forShop.body.items).toHaveLength(1);
    expect(forShop.body.items[0]).toMatchObject({
      id: a,
      role: 'SHOP',
      buyer: { name: 'Người Mua' },
      unread: 1,
      lastMessagePreview: 'Tin cho shop A',
    });
    expect((await list(stranger, 'SHOP')).body).toMatchObject({ items: [], total: 0 });
    await t.http().get(`${API}/conversations?role=ADMIN`).set(auth(buyer)).expect(400);
  });

  it('tải tin cũ hơn: before + limit, trả theo thứ tự thời gian', async () => {
    const id = await opened();
    const ids: string[] = [];
    for (let i = 1; i <= 5; i++) ids.push((await text(buyer, id, `Tin ${i}`).expect(201)).body.id);
    const page1 = await t
      .http()
      .get(`${API}/conversations/${id}/messages?limit=2`)
      .set(auth(seller))
      .expect(200);
    expect(page1.body.items.map((m: { text: string }) => m.text)).toEqual(['Tin 4', 'Tin 5']);
    expect(page1.body.hasMore).toBe(true);
    const page2 = await t
      .http()
      .get(`${API}/conversations/${id}/messages?limit=3&before=${ids[3]}`)
      .set(auth(seller))
      .expect(200);
    expect(page2.body.items.map((m: { text: string }) => m.text)).toEqual([
      'Tin 1',
      'Tin 2',
      'Tin 3',
    ]);
    expect(page2.body.hasMore).toBe(false);
    await t
      .http()
      .get(`${API}/conversations/${id}/messages?limit=51`)
      .set(auth(seller))
      .expect(400);
    await t
      .http()
      .get(`${API}/conversations/${id}/messages?before=${randomUUID()}`)
      .set(auth(seller))
      .expect(404);
  });

  // ----- thông báo CHAT_MESSAGE -----

  it('thông báo CHAT_MESSAGE chỉ khi bên kia chuyển từ 0 sang có tin chưa đọc', async () => {
    const id = await opened();
    await text(buyer, id, 'Tin 1').expect(201);
    await text(buyer, id, 'Tin 2').expect(201);
    let forSeller = await notifications(seller.id);
    expect(forSeller).toHaveLength(1);
    expect(forSeller[0]).toMatchObject({
      type: 'CHAT_MESSAGE',
      title: 'Tin nhắn mới từ Người Mua',
      content: 'Tin 1',
      link: `/kenh-nguoi-ban/tin-nhan/${id}`,
    });
    // Shop đọc rồi người mua gửi tiếp: thêm một thông báo
    await t.http().post(`${API}/conversations/${id}/read`).set(auth(seller)).expect(200);
    await text(buyer, id, 'Tin 3').expect(201);
    forSeller = await notifications(seller.id);
    expect(forSeller).toHaveLength(2);
    // Shop trả lời: người mua nhận thông báo, link về trang chat người mua
    await text(seller, id, 'Dạ shop đây').expect(201);
    expect(await notifications(buyer.id)).toEqual([
      expect.objectContaining({
        type: 'CHAT_MESSAGE',
        title: 'Tin nhắn mới từ Shop Chat',
        link: `/tin-nhan/${id}`,
      }),
    ]);
    const ev = await t.prisma.outboxEvent.findMany({ where: { type: NOTIFICATION_CREATED } });
    expect(ev).toHaveLength(3);
    expect(ev.every((e) => (e.payload as unknown as SanEvent).payload)).toBe(true);
  });

  // ----- API thông báo -----

  describe('API thông báo (/me/notifications)', () => {
    async function seed(userId: string, n: number) {
      for (let i = 1; i <= n; i++) {
        await t.prisma.notification.create({
          data: {
            userId,
            type: 'ORDER_CONFIRMED',
            title: `Thông báo ${i}`,
            content: 'Nội dung',
            link: '/tai-khoan/don-mua/x',
            createdAt: new Date(Date.now() + i * 1000),
          },
        });
      }
    }

    it('danh sách mới nhất trước, lọc chưa đọc, số chưa đọc, đọc một, đọc hết', async () => {
      await seed(buyer.id, 3);
      await seed(stranger.id, 1);
      const get = (q = '') =>
        t.http().get(`${API}/me/notifications${q}`).set(auth(buyer)).expect(200);
      const all = await get();
      expect(all.body).toMatchObject({ total: 3, page: 1 });
      expect(all.body.items.map((n: { title: string }) => n.title)).toEqual([
        'Thông báo 3',
        'Thông báo 2',
        'Thông báo 1',
      ]);
      expect(all.body.items[0]).toMatchObject({
        type: 'ORDER_CONFIRMED',
        content: 'Nội dung',
        link: '/tai-khoan/don-mua/x',
        read: false,
      });
      const count = () =>
        t.http().get(`${API}/me/notifications/unread-count`).set(auth(buyer)).expect(200);
      expect((await count()).body).toEqual({ count: 3 });

      const first = all.body.items[0].id as string;
      const r = await t
        .http()
        .post(`${API}/me/notifications/${first}/read`)
        .set(auth(buyer))
        .expect(200);
      expect(r.body).toEqual({ count: 2 });
      // Đọc lại không lỗi
      await t.http().post(`${API}/me/notifications/${first}/read`).set(auth(buyer)).expect(200);
      expect((await get('?unread=true')).body.total).toBe(2);
      expect((await get('?unread=false')).body.total).toBe(3);

      const done = await t
        .http()
        .post(`${API}/me/notifications/read-all`)
        .set(auth(buyer))
        .expect(200);
      expect(done.body).toEqual({ count: 0 });
      expect((await count()).body).toEqual({ count: 0 });
      // Không đụng thông báo của người khác
      expect(await t.prisma.notification.count({ where: { readAt: null } })).toBe(1);
    });

    it('thông báo của người khác → 404; cần đăng nhập', async () => {
      await seed(stranger.id, 1);
      const other = await t.prisma.notification.findFirstOrThrow();
      await t.http().post(`${API}/me/notifications/${other.id}/read`).set(auth(buyer)).expect(404);
      await t
        .http()
        .post(`${API}/me/notifications/khong-phai-id/read`)
        .set(auth(buyer))
        .expect(404);
      expect((await t.prisma.notification.findFirstOrThrow()).readAt).toBeNull();
      await t.http().get(`${API}/me/notifications`).expect(401);
    });

    it('nhận lại notification.created: đẩy notification:new kèm số chưa đọc tới đúng phòng', async () => {
      await seed(buyer.id, 2);
      const p: NotificationCreatedPayload = {
        notificationId: randomUUID(),
        userId: buyer.id,
        type: 'ORDER_DELIVERED',
        title: 'Giao hàng thành công',
        content: 'Đơn đã giao',
        link: '/tai-khoan/don-mua/x',
        email: true,
        createdAt: new Date().toISOString(),
      };
      await t.prisma.$transaction((tx) => t.app.get(NotificationPush).push(p, tx));
      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith(buyer.id, 'notification:new', {
        notification: expect.objectContaining({
          id: p.notificationId,
          type: 'ORDER_DELIVERED',
          title: 'Giao hàng thành công',
          read: false,
        }),
        unreadCount: 2,
      });
    });
  });
});
