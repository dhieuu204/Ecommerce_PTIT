#!/usr/bin/env node
/**
 * Kiểm thử tổng hợp P6 (`pnpm test:e2e`): chạy MỘT kịch bản thật qua cả 4 service đang chạy,
 * ngoài bộ test riêng của từng service.
 *
 * Kịch bản: người mua đặt 1 món COD của shop Galaxy Hub → shop xác nhận → đơn vị vận chuyển MÔ PHỎNG
 * lấy hàng và giao → người mua bấm "Đã nhận" → nhận thông báo (trong app, realtime, email) → đánh giá
 * → shop trả lời → theo dõi shop, thả tim → chat qua Socket.IO → báo cáo vi phạm, admin gỡ rồi khôi phục
 * sản phẩm → shop bật bán lại → xem báo cáo vận hành và tài chính.
 *
 * Cần trước khi chạy: hạ tầng (`pnpm infra:up`), database đã migrate, dữ liệu demo (`pnpm seed:demo`),
 * 4 service đang chạy (`pnpm dev`) ở chế độ MÔ PHỎNG GHN (không đặt GHN_TOKEN).
 * Đổi địa chỉ bằng biến môi trường: E2E_USER_URL, E2E_MARKET_URL, E2E_PAYMENT_URL, E2E_APPROVAL_URL,
 * E2E_MAILPIT_URL (mặc định cổng local 3001–3004 và 8025).
 * Chạy lại nhiều lần được: mỗi lần tạo một đơn mới; sản phẩm dùng thử được trả về trạng thái đang bán.
 */
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const env = (k, d) => process.env[k] ?? d;
const URLS = {
  user: env('E2E_USER_URL', 'http://localhost:3001') + '/api/user/v1',
  market: env('E2E_MARKET_URL', 'http://localhost:3002') + '/api/market/v1',
  payment: env('E2E_PAYMENT_URL', 'http://localhost:3003') + '/api/payment/v1',
  approval: env('E2E_APPROVAL_URL', 'http://localhost:3004') + '/api/approval/v1',
  mailpit: env('E2E_MAILPIT_URL', 'http://localhost:8025'),
};
const MARKET_ORIGIN = env('E2E_MARKET_URL', 'http://localhost:3002');
const PASSWORD = 'demo12345';
const PRODUCT_QUERY = 'tote'; // "Túi tote vải canvas có khoá kéo" của Galaxy Hub (giá nhỏ, COD không cần duyệt)

// socket.io-client nằm trong apps/web (web dùng nó), nạp từ đó để không thêm thư viện ở gốc
const requireWeb = createRequire(
  fileURLToPath(new URL('../apps/web/package.json', import.meta.url)),
);
const { io } = requireWeb('socket.io-client');

let step = 0;
const started = Date.now();
function ok(text) {
  step += 1;
  console.log(`  ✓ ${String(step).padStart(2, '0')}. ${text}`);
}
function fail(text) {
  throw new Error(text);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Gọi API, lỗi thì dừng kèm mã lỗi để dễ tìm. `expect` = mã HTTP mong đợi khác 2xx. */
async function call(base, path, { token, method = 'GET', body, key, expect } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (key) headers['idempotency-key'] = key;
  const res = await fetch(URLS[base] + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (expect !== undefined) {
    if (res.status !== expect)
      fail(`${method} ${path}: mong ${expect}, nhận ${res.status} ${text}`);
    return data;
  }
  if (!res.ok) fail(`${method} ${path}: ${res.status} ${text}`);
  return data;
}

/** Chờ tới khi `fn` trả giá trị khác rỗng (sự kiện đi qua RabbitMQ nên có độ trễ). */
async function waitFor(label, fn, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) {
      last = e;
    }
    await sleep(400);
  }
  fail(`Hết giờ chờ: ${label}${last instanceof Error ? ` (${last.message})` : ''}`);
}

async function login(email) {
  const r = await call('user', '/auth/login', {
    method: 'POST',
    body: { email, password: PASSWORD },
  });
  return r.accessToken;
}

/** Mở kết nối Socket.IO như web, gom các sự kiện nhận được. */
function connectSocket(token) {
  const events = [];
  const socket = io(MARKET_ORIGIN, {
    path: '/api/market/v1/socket.io',
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
  });
  for (const name of ['notification:new', 'chat:message', 'chat:read']) {
    socket.on(name, (payload) => events.push({ name, payload }));
  }
  const ready = new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', (e) =>
      reject(new Error(`Socket.IO không kết nối được: ${e.message}`)),
    );
  });
  return { socket, events, ready };
}

/** Thông báo tạo ra trong lần chạy này (bỏ qua thông báo của các lần chạy trước) */
async function notificationsOf(token) {
  const { items } = await call('market', '/me/notifications?pageSize=50', { token });
  return items.filter((n) => new Date(n.createdAt).getTime() >= started - 1000);
}

async function main() {
  console.log('Kiểm thử tổng hợp P6 (đơn vị vận chuyển và thanh toán ở chế độ MÔ PHỎNG)\n');

  // ----- Đăng nhập -----
  const buyer = await login('buyer@example.com');
  const seller = await login('galaxyhub@example.com');
  const admin = await login('admin@example.com');
  ok('Đăng nhập người mua, chủ shop Galaxy Hub và admin');

  const buyerSocket = connectSocket(buyer);
  const sellerSocket = connectSocket(seller);
  await Promise.all([buyerSocket.ready, sellerSocket.ready]);
  ok('Người mua và chủ shop kết nối Socket.IO');

  // ----- Đặt hàng COD -----
  const found = await call('market', `/products?q=${PRODUCT_QUERY}&pageSize=5`);
  const card = found.items.find((p) => p.shop.name === 'Galaxy Hub');
  if (!card) fail('Không thấy sản phẩm demo, đã chạy `pnpm seed:demo` chưa?');
  const product = await call('market', `/products/${card.id}`, { token: buyer });
  const variant = product.variants.find((v) => v.available > 0) ?? fail('Sản phẩm demo hết hàng.');
  const shopId = product.shop.id;
  const ratingBefore = product.ratingCount;

  // Người mua demo chưa có địa chỉ thì thêm một địa chỉ mặc định (tỉnh/huyện/xã lấy từ danh sách địa chỉ)
  const addresses = await call('user', '/me/addresses', { token: buyer });
  if (!(Array.isArray(addresses) ? addresses : addresses.items).length) {
    const province = (await call('market', '/locations/provinces'))[0];
    const district = (await call('market', `/locations/provinces/${province.id}/districts`))[0];
    const ward = (await call('market', `/locations/districts/${district.id}/wards`))[0];
    await call('user', '/me/addresses', {
      token: buyer,
      method: 'POST',
      body: {
        receiverName: 'Nguyễn Văn An',
        phone: '0912345678',
        provinceId: province.id,
        districtId: district.id,
        wardCode: ward.code,
        street: '12 Nguyễn Trãi',
        isDefault: true,
      },
    });
  }

  const cart = await call('market', '/cart', { token: buyer });
  const stale = cart.shops.flatMap((s) => s.items).map((i) => i.id);
  if (stale.length)
    await call('market', '/cart/items/remove', {
      token: buyer,
      method: 'POST',
      body: { itemIds: stale },
    });
  await call('market', '/cart/items', {
    token: buyer,
    method: 'POST',
    body: { variantId: variant.id, quantity: 1 },
  });
  const cartNow = await call('market', '/cart', { token: buyer });
  const itemIds = cartNow.shops.flatMap((s) => s.items).map((i) => i.id);
  const preview = await call('market', '/checkout/preview', {
    token: buyer,
    method: 'POST',
    body: { itemIds, paymentMethod: 'COD' },
  });
  const order = await call('market', '/orders', {
    token: buyer,
    method: 'POST',
    body: { checkoutId: preview.checkoutId },
    key: randomUUID(),
  });
  const orderId = order.orderId;
  const detail = await call('market', `/orders/${orderId}`, { token: buyer });
  const shopOrderId = detail.shopOrders[0].id;
  ok(`Đặt đơn COD ${order.code} gồm 1 món "${product.name}"`);

  // ----- Shop xác nhận, giao hàng MÔ PHỎNG -----
  await waitFor('đơn con chờ shop xác nhận', async () => {
    const so = await call('market', `/shops/me/orders/${shopOrderId}`, { token: seller });
    return so.status === 'TO_CONFIRM';
  });
  await call('market', `/shops/me/orders/${shopOrderId}/confirm`, {
    token: seller,
    method: 'POST',
  });
  ok('Shop xác nhận đơn, hệ thống tạo vận đơn');

  const shipmentId = await waitFor('vận đơn MÔ PHỎNG', async () => {
    const sim = await call('market', '/admin/carrier-simulator', { token: admin });
    return sim.find((s) => s.shopOrderId === shopOrderId)?.id;
  });
  for (const event of ['PICKED', 'DELIVERED']) {
    await call('market', `/admin/carrier-simulator/${shipmentId}/events`, {
      token: admin,
      method: 'POST',
      body: { event },
    });
  }
  ok('Đơn vị vận chuyển MÔ PHỎNG: đã lấy hàng, giao thành công');

  await call('market', `/orders/${orderId}/shop-orders/${shopOrderId}/received`, {
    token: buyer,
    method: 'POST',
  });
  ok('Người mua bấm "Đã nhận", đơn con hoàn tất');

  // ----- Thông báo -----
  const wanted = ['ORDER_CONFIRMED', 'ORDER_SHIPPING', 'ORDER_DELIVERED', 'ORDER_COMPLETED'];
  await waitFor('thông báo đơn hàng của người mua', async () => {
    const types = (await notificationsOf(buyer))
      .filter((n) => n.link?.includes(orderId))
      .map((n) => n.type);
    return wanted.every((t) => types.includes(t));
  });
  ok(`Người mua có đủ thông báo trong app: ${wanted.join(', ')}`);

  await waitFor('thông báo đơn mới của shop', async () =>
    (await notificationsOf(seller)).some((n) => n.type === 'SHOP_ORDER_NEW'),
  );
  ok('Chủ shop có thông báo SHOP_ORDER_NEW');

  await waitFor('Socket.IO đẩy notification:new cho người mua', async () =>
    buyerSocket.events.some(
      (e) => e.name === 'notification:new' && e.payload?.notification?.type === 'ORDER_COMPLETED',
    ),
  );
  ok('Socket.IO đẩy thông báo mới tới người mua ngay lúc đơn hoàn tất');

  await waitFor('email "giao thành công" trong hộp thư giả', async () => {
    const res = await fetch(
      `${URLS.mailpit}/api/v1/search?query=${encodeURIComponent('to:buyer@example.com')}&limit=20`,
    );
    if (!res.ok) return false;
    const list = await res.json();
    return list.messages?.some((m) => /giao/i.test(m.Subject));
  });
  ok('Email thông báo giao thành công tới hộp thư giả (Mailpit)');

  // ----- Đánh giá -----
  const pending = await call('market', '/me/reviews?state=PENDING&pageSize=50', { token: buyer });
  const line = pending.items.find((i) => i.shopOrderId === shopOrderId || i.orderId === orderId);
  if (!line) fail('Không thấy dòng hàng chờ đánh giá của đơn vừa hoàn tất.');
  const review = await call('market', '/me/reviews', {
    token: buyer,
    method: 'POST',
    body: {
      orderItemId: line.orderItemId ?? line.id,
      rating: 5,
      content: 'Túi đẹp, đường may chắc chắn, giao nhanh. (kiểm thử tự động)',
      images: [],
    },
  });
  await call('market', '/me/reviews', {
    token: buyer,
    method: 'POST',
    body: { orderItemId: line.orderItemId ?? line.id, rating: 4, content: '', images: [] },
    expect: 409,
  });
  const after = await call('market', `/products/${product.id}`);
  if (after.ratingCount !== ratingBefore + 1) fail('Số đánh giá của sản phẩm không tăng đúng 1.');
  ok(`Người mua đánh giá 5 sao; đánh giá lần 2 bị chặn; sản phẩm có ${after.ratingCount} đánh giá`);

  await waitFor('thông báo đánh giá mới cho shop', async () =>
    (await notificationsOf(seller)).some((n) => n.type === 'SHOP_REVIEW_NEW'),
  );
  await call('market', `/shops/me/reviews/${review.id}/reply`, {
    token: seller,
    method: 'PUT',
    body: { content: 'Cảm ơn bạn đã ủng hộ shop!' },
  });
  const publicReviews = await call('market', `/products/${product.id}/reviews?pageSize=50`);
  const shown = publicReviews.items.find((r) => r.id === review.id);
  if (!shown?.sellerReply) fail('Đánh giá công khai chưa có câu trả lời của shop.');
  if (shown.buyerName && !shown.buyerName.includes('*')) fail('Tên người mua chưa được che bớt.');
  ok('Shop nhận thông báo, trả lời đánh giá; tên người mua công khai được che bớt');

  // ----- Theo dõi shop, thả tim -----
  const follow = await call('market', `/shops/${shopId}/follow`, { token: buyer, method: 'PUT' });
  const followAgain = await call('market', `/shops/${shopId}/follow`, {
    token: buyer,
    method: 'PUT',
  });
  if (!follow.following || followAgain.followerCount !== follow.followerCount)
    fail('Theo dõi lần 2 không được tạo trùng.');
  const like = await call('market', `/products/${product.id}/like`, {
    token: buyer,
    method: 'PUT',
  });
  if (!like.liked) fail('Thả tim không thành công.');
  const likedList = await call('market', '/me/liked-products?pageSize=50', { token: buyer });
  if (!likedList.items.some((p) => p.id === product.id))
    fail('Không thấy sản phẩm trong Yêu thích.');
  ok(`Theo dõi shop (${follow.followerCount} người theo dõi), thả tim, làm lại không tạo trùng`);

  const filtered = await call('market', `/products?q=${PRODUCT_QUERY}&minRating=4&sort=rating`);
  if (!filtered.items.some((p) => p.id === product.id)) fail('Lọc "Từ 4 sao" không thấy sản phẩm.');
  ok('Tìm kiếm lọc "Từ 4 sao" và sắp xếp "Đánh giá cao" có sản phẩm vừa được đánh giá');

  // ----- Chat realtime -----
  const conv = await call('market', '/conversations', {
    token: buyer,
    method: 'POST',
    body: { shopId },
  });
  const hello = `Shop ơi còn màu khác không? #${randomUUID().slice(0, 6)}`;
  const clientKey = randomUUID();
  const msg = await call('market', `/conversations/${conv.id}/messages`, {
    token: buyer,
    method: 'POST',
    body: { clientKey, type: 'TEXT', text: hello },
  });
  const resent = await call('market', `/conversations/${conv.id}/messages`, {
    token: buyer,
    method: 'POST',
    body: { clientKey, type: 'TEXT', text: hello },
  });
  if (resent.id !== msg.id) fail('Gửi lại cùng clientKey tạo tin trùng.');
  await waitFor('chủ shop nhận chat:message qua Socket.IO', async () =>
    sellerSocket.events.some((e) => e.name === 'chat:message' && e.payload?.message?.id === msg.id),
  );
  const unread = await call('market', '/conversations/unread-count', { token: seller });
  if (unread.shop < 1) fail('Shop chưa thấy tin chưa đọc.');
  await call('market', `/conversations/${conv.id}/read`, { token: seller, method: 'POST' });
  await call('market', `/conversations/${conv.id}/messages`, {
    token: seller,
    method: 'POST',
    body: { clientKey: randomUUID(), type: 'TEXT', text: 'Dạ còn màu Đen ạ.' },
  });
  await waitFor('người mua nhận tin trả lời qua Socket.IO', async () =>
    buyerSocket.events.some(
      (e) => e.name === 'chat:message' && e.payload?.message?.senderRole === 'SHOP',
    ),
  );
  ok('Chat: người mua hỏi, shop nhận ngay qua Socket.IO, đọc và trả lời; gửi lặp không tạo trùng');

  // ----- Báo cáo vi phạm -----
  const report = await call('approval', '/reports', {
    token: buyer,
    method: 'POST',
    key: randomUUID(),
    body: {
      targetType: 'PRODUCT',
      targetId: product.id,
      reason: 'WRONG_INFO',
      note: 'Mô tả chất liệu không đúng thực tế (kiểm thử tự động).',
      images: [],
    },
  });
  const queue = await call('approval', '/admin/reports?status=PENDING&pageSize=100', {
    token: admin,
  });
  if (!queue.items.some((r) => r.id === report.id)) fail('Admin không thấy báo cáo đang chờ.');
  await call('approval', `/admin/reports/${report.id}/resolve`, {
    token: admin,
    method: 'POST',
    body: { decision: 'REMOVE_PRODUCT', reason: 'Kiểm thử tự động: gỡ sản phẩm.' },
  });
  await waitFor('marketplace gỡ sản phẩm', async () => {
    const res = await fetch(`${URLS.market}/products/${product.id}`);
    return res.status === 404;
  });
  await waitFor('thông báo PRODUCT_REMOVED cho shop', async () =>
    (await notificationsOf(seller)).some((n) => n.type === 'PRODUCT_REMOVED'),
  );
  await call('market', `/shops/me/products/${product.id}/status`, {
    token: seller,
    method: 'PATCH',
    body: { status: 'ACTIVE' },
    expect: 409,
  });
  ok(
    'Báo cáo vi phạm → admin gỡ sản phẩm → sản phẩm ẩn khỏi sàn, shop được báo, không tự bật lại được',
  );

  await call('approval', `/admin/products/${product.id}/restore`, {
    token: admin,
    method: 'POST',
    body: { reason: 'Kiểm thử tự động: khôi phục sản phẩm.' },
  });
  await waitFor('sản phẩm về trạng thái ẩn', async () => {
    const own = await call('market', `/shops/me/products/${product.id}`, { token: seller });
    return own.status === 'HIDDEN';
  });
  await call('market', `/shops/me/products/${product.id}/status`, {
    token: seller,
    method: 'PATCH',
    body: { status: 'ACTIVE' },
  });
  const mine = await call('approval', '/me/reports?pageSize=50', { token: buyer });
  if (mine.items.find((r) => r.id === report.id)?.status !== 'RESOLVED')
    fail('Báo cáo của người mua chưa chuyển sang "Đã xử lý".');
  ok('Admin khôi phục → sản phẩm về "ẩn", shop bật bán lại; người mua thấy báo cáo đã xử lý');

  // ----- Báo cáo vận hành, tài chính -----
  const ops = await call('market', '/shops/me/reports/operations', { token: seller });
  if (ops.summary.orderCount < 1) fail('Báo cáo vận hành của shop chưa có đơn.');
  const adminOps = await call('market', '/admin/reports/operations', { token: admin });
  const fin = await call('payment', '/shops/me/reports/finance', { token: seller });
  const adminFin = await call('payment', '/admin/reports/finance', { token: admin });
  const money = [fin.summary, adminFin.summary].flatMap((s) => Object.values(s));
  if (money.some((v) => typeof v === 'number' && !Number.isInteger(v)))
    fail('Báo cáo tài chính có số tiền không phải số nguyên đồng.');
  ok(
    `Báo cáo: shop ${ops.summary.orderCount} đơn / 30 ngày, sàn ${adminOps.summary.orderCount} đơn, ` +
      `${adminOps.shopCount} shop; tài chính trả số nguyên đồng`,
  );

  buyerSocket.socket.close();
  sellerSocket.socket.close();
  console.log(`\nXong ${step} bước trong ${((Date.now() - started) / 1000).toFixed(1)} giây.`);
}

main().catch((e) => {
  console.error(`\n  ✗ Bước ${step + 1} lỗi: ${e.message}`);
  process.exit(1);
});
