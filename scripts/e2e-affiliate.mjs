#!/usr/bin/env node
/**
 * Kiểm thử tổng hợp P7 (`pnpm test:e2e:affiliate`): vòng cộng tác viên qua cả 4 service đang chạy, kiểm các
 * sự kiện đi qua RabbitMQ mà test riêng của từng service không thấy được.
 *
 * Kịch bản: người dùng đăng ký CTV → admin duyệt ở approval-service → marketplace nhận quyết định, cấp mã →
 * shop bật hoa hồng 10% cho một sản phẩm → người mua mở link (ghi lượt bấm) rồi đặt COD → đơn gắn CTV,
 * payment ghi hoa hồng và trừ vào tiền shop → giao hàng MÔ PHỎNG → hoa hồng vào ngăn đang giữ của ví CTV →
 * người mua bấm "Đã nhận" → admin khóa CTV (link ngừng tính) rồi mở lại.
 *
 * Cần trước khi chạy: hạ tầng, database đã migrate, dữ liệu demo (`pnpm seed:demo`), 4 service đang chạy
 * với vận chuyển MÔ PHỎNG (không đặt GHN_TOKEN). Chạy lại nhiều lần được: CTV đã duyệt thì bỏ qua bước đăng ký.
 * Đổi địa chỉ bằng E2E_USER_URL, E2E_MARKET_URL, E2E_PAYMENT_URL, E2E_APPROVAL_URL (mặc định cổng 3001–3004).
 */
import { randomUUID } from 'node:crypto';

const env = (k, d) => process.env[k] ?? d;
const URLS = {
  user: env('E2E_USER_URL', 'http://localhost:3001') + '/api/user/v1',
  market: env('E2E_MARKET_URL', 'http://localhost:3002') + '/api/market/v1',
  payment: env('E2E_PAYMENT_URL', 'http://localhost:3003') + '/api/payment/v1',
  approval: env('E2E_APPROVAL_URL', 'http://localhost:3004') + '/api/approval/v1',
};
const PASSWORD = 'demo12345';
/** Tài khoản demo chưa có shop hoạt động: dùng làm cộng tác viên */
const CTV_EMAIL = 'phocongnghe@example.com';
const SELLER_EMAIL = 'galaxyhub@example.com';
const RATE = 1000; // 10%

let step = 0;
function ok(text) {
  step += 1;
  console.log(`  ✓ ${String(step).padStart(2, '0')}. ${text}`);
}
function fail(text) {
  throw new Error(text);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

/** Chờ tới khi `fn` trả giá trị khác rỗng (sự kiện đi qua RabbitMQ nên có độ trễ) */
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
    await sleep(500);
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

async function main() {
  console.log('Kiểm thử tổng hợp P7: cộng tác viên (vận chuyển MÔ PHỎNG, đơn COD)\n');
  const [ctv, seller, buyer, admin] = await Promise.all([
    login(CTV_EMAIL),
    login(SELLER_EMAIL),
    login('buyer@example.com'),
    login('admin@example.com'),
  ]);
  ok('Đăng nhập cộng tác viên, chủ shop Galaxy Hub, người mua và admin');

  // Vận chuyển phải là MÔ PHỎNG: không tạo vận đơn GHN thật khi chạy thử
  await call('market', '/admin/carrier-simulator', { token: admin });

  // ----- Đăng ký và duyệt CTV -----
  let me = await call('market', '/affiliates/me', { token: ctv });
  if (me.status === 'NONE' || me.status === 'REJECTED') {
    await call('market', '/affiliates/me/application', {
      token: ctv,
      method: 'POST',
      key: randomUUID(),
      body: {
        displayName: 'Review Công Nghệ',
        channels: ['https://www.tiktok.com/@reviewcongnghe'],
        phone: '0912345678',
        bankAccount: {
          bankName: 'Techcombank',
          accountNumber: '1903456789',
          accountName: 'TRAN THI BINH',
        },
      },
    });
    me = await call('market', '/affiliates/me', { token: ctv });
    ok('Người dùng nộp hồ sơ cộng tác viên');
  }
  if (me.status === 'PENDING') {
    const approval = await waitFor('hồ sơ CTV tới approval-service', async () => {
      const page = await call('approval', '/admin/affiliate-approvals?status=PENDING&pageSize=50', {
        token: admin,
      });
      return page.items.find((a) => a.affiliateId === me.affiliate.id);
    });
    await call('approval', `/admin/affiliate-approvals/${approval.id}/decision`, {
      token: admin,
      method: 'POST',
      body: { decision: 'APPROVE' },
    });
    ok('Admin duyệt hồ sơ ở approval-service');
  }
  me = await waitFor('marketplace áp quyết định duyệt', async () => {
    const m = await call('market', '/affiliates/me', { token: ctv });
    return m.status === 'ACTIVE' && m.affiliate.code ? m : null;
  });
  const code = me.affiliate.code;
  ok(`CTV đang hoạt động, mã ${code}`);

  // ----- Shop bật hoa hồng -----
  const products = await call('market', '/shops/me/products?status=ACTIVE&pageSize=50', {
    token: seller,
  });
  const product = products.items
    .filter((p) => p.totalAvailable > 0)
    .sort((a, b) => a.minPrice - b.minPrice)[0];
  if (!product) fail('Shop demo không còn sản phẩm có hàng, đã chạy `pnpm seed:demo` chưa?');
  await call('market', '/shops/me/product-commissions', {
    token: seller,
    method: 'PUT',
    body: { productIds: [product.id], rate: RATE },
  });
  ok(`Shop bật hoa hồng 10% cho "${product.name}"`);

  // ----- Người mua mở link, đặt COD -----
  const detail = await call('market', `/products/${product.id}`, { token: buyer });
  const variant = detail.variants.find((v) => v.available > 0) ?? fail('Sản phẩm hết hàng.');
  const click = await call('market', '/affiliate-clicks', {
    token: buyer,
    method: 'POST',
    body: { code, productId: product.id },
  });
  ok('Người mua mở link tiếp thị, ghi lượt bấm');

  const cart = await call('market', '/cart', { token: buyer });
  const stale = cart.shops.flatMap((s) => s.items).map((i) => i.id);
  if (stale.length) {
    await call('market', '/cart/items/remove', {
      token: buyer,
      method: 'POST',
      body: { itemIds: stale },
    });
  }
  await call('market', '/cart/items', {
    token: buyer,
    method: 'POST',
    body: { variantId: variant.id, quantity: 1 },
  });
  const itemIds = (await call('market', '/cart', { token: buyer })).shops
    .flatMap((s) => s.items)
    .map((i) => i.id);
  const preview = await call('market', '/checkout/preview', {
    token: buyer,
    method: 'POST',
    body: { itemIds, paymentMethod: 'COD' },
  });
  const order = await call('market', '/orders', {
    token: buyer,
    method: 'POST',
    body: { checkoutId: preview.checkoutId, affiliateClickIds: [click.clickId] },
  });
  const shopOrderId = (await call('market', `/orders/${order.orderId}`, { token: buyer }))
    .shopOrders[0].id;
  const so = await call('market', `/shops/me/orders/${shopOrderId}`, { token: seller });
  if (!so.affiliate) fail('Đơn không gắn cộng tác viên.');
  const commission = so.affiliate.commission;
  const base = so.subtotal - so.shopDiscount;
  if (commission !== Math.floor((base * RATE) / 10_000)) {
    fail(`Hoa hồng ${commission} khác 10% tiền hàng sau voucher shop (${base}).`);
  }
  ok(`Đặt COD ${order.code}: gắn CTV, hoa hồng ${commission.toLocaleString('vi-VN')}đ`);

  // ----- payment ghi hoa hồng, trừ vào tiền shop -----
  const sellerAmount = await waitFor('payment ghi nhận tiền đơn con', async () => {
    const s = await call('market', `/shops/me/orders/${shopOrderId}`, { token: seller });
    return s.sellerAmount;
  });
  const fee = Math.floor((base * 500) / 10_000);
  if (sellerAmount !== base - fee - commission) {
    fail(`Tiền shop nhận ${sellerAmount} khác ${base} - phí ${fee} - hoa hồng ${commission}.`);
  }
  ok('payment-service trừ hoa hồng vào tiền shop nhận, phí sàn vẫn tính trên tiền hàng');

  const mine = await call('market', '/affiliates/me/orders?pageSize=5', { token: ctv });
  if (!mine.items.some((o) => o.id === shopOrderId)) fail('CTV không thấy đơn qua link.');
  if (JSON.stringify(mine).includes('buyer@example.com')) fail('CTV thấy thông tin người mua.');
  ok('CTV thấy đơn trong "Đơn qua link của tôi", không lộ người mua');

  // ----- Giao hàng MÔ PHỎNG → hoa hồng vào ngăn đang giữ -----
  const walletBefore = await call('payment', '/affiliates/me/wallet', { token: ctv });
  await waitFor('đơn chờ shop xác nhận', async () => {
    const s = await call('market', `/shops/me/orders/${shopOrderId}`, { token: seller });
    return s.status === 'TO_CONFIRM';
  });
  await call('market', `/shops/me/orders/${shopOrderId}/confirm`, {
    token: seller,
    method: 'POST',
  });
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
  await waitFor('hoa hồng vào ngăn đang giữ của ví CTV', async () => {
    const w = await call('payment', '/affiliates/me/wallet', { token: ctv });
    return w.pending === walletBefore.pending + commission ? w : null;
  });
  ok('Giao thành công: hoa hồng vào ngăn đang giữ của ví CTV');

  await call('market', `/orders/${order.orderId}/shop-orders/${shopOrderId}/received`, {
    token: buyer,
    method: 'POST',
  });
  const row = await waitFor('payment nhận đơn hoàn tất', async () => {
    const page = await call('payment', '/affiliates/me/commissions?pageSize=10', { token: ctv });
    const c = page.items.find((x) => x.shopOrderId === shopOrderId);
    return c?.completedAt ? c : null;
  });
  if (row.status !== 'HELD')
    fail(`Hoa hồng đơn COD chưa đối soát phải đang giữ, đang ${row.status}.`);
  ok(`Đơn hoàn tất; hoa hồng chờ đối soát COD (${row.waitingFor})`);

  await waitFor('thông báo đơn mới của CTV', async () => {
    const { items } = await call('market', '/me/notifications?pageSize=20', { token: ctv });
    return items.some((n) => n.type === 'AFFILIATE_ORDER' && n.content.includes(so.code));
  });
  ok('CTV có thông báo AFFILIATE_ORDER');

  // ----- Khóa rồi mở CTV -----
  await call('approval', `/admin/affiliates/${me.affiliate.id}/suspension`, {
    token: admin,
    method: 'POST',
    body: { action: 'SUSPEND', reason: 'Kiểm thử tổng hợp: khóa tạm' },
  });
  await waitFor('marketplace khóa CTV', async () => {
    const m = await call('market', '/affiliates/me', { token: ctv });
    return m.status === 'SUSPENDED';
  });
  await call('market', '/affiliate-clicks', {
    method: 'POST',
    body: { code, productId: product.id },
    expect: 404,
  });
  ok('Admin khóa CTV: link ngừng ghi lượt bấm');
  await call('approval', `/admin/affiliates/${me.affiliate.id}/suspension`, {
    token: admin,
    method: 'POST',
    body: { action: 'RESTORE', reason: 'Kiểm thử tổng hợp: mở lại' },
  });
  await waitFor('marketplace mở CTV', async () => {
    const m = await call('market', '/affiliates/me', { token: ctv });
    return m.status === 'ACTIVE';
  });
  ok('Admin mở lại CTV');

  console.log(`\nXong ${step} bước.`);
}

main().catch((e) => {
  console.error(`\n  ✗ ${e.message}`);
  process.exit(1);
});
