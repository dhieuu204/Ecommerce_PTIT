// Kiểm khóa của các đối tác đã điền trong services/*/.env có dùng được không: `pnpm check:integrations`.
// Chỉ gọi các API đọc (VNPay: mở thử trang thanh toán, không trả tiền): không tạo giao dịch, không tạo vận đơn, không gửi mail. Không in giá trị bí mật.
import { createHmac, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { readFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv(service) {
  let file = {};
  try {
    file = parseEnv(readFileSync(join(root, 'services', service, '.env'), 'utf8'));
  } catch {
    // chưa có .env: coi như chưa cấu hình
  }
  return (name, fallback = '') => process.env[name] || file[name] || fallback;
}

/** Ngày giờ VNPay (GMT+7) */
const vnpDate = (d = new Date()) =>
  new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 19).replace(/[-T:]/g, '');

async function ghn() {
  const env = loadEnv('marketplace-service');
  const token = env('GHN_TOKEN');
  if (!token) return { skip: 'Chưa có GHN_TOKEN: đang dùng MÔ PHỎNG.' };
  const shopId = env('GHN_SHOP_ID');
  if (!shopId) return { fail: 'Có GHN_TOKEN nhưng thiếu GHN_SHOP_ID.' };
  const base = env('GHN_API_URL', 'https://dev-online-gateway.ghn.vn/shiip/public-api');
  const call = async (path, init = {}) => {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { Token: token, ShopId: shopId, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    const json = await res.json().catch(() => null);
    if (json?.code !== 200) {
      throw new Error(
        `${path}: HTTP ${res.status} ${json?.code_message_value ?? json?.message ?? ''}`,
      );
    }
    return json.data;
  };
  const province = (await call('/master-data/province')).find((p) =>
    /^(Hà Nội|Hồ Chí Minh)$/.test(p.ProvinceName),
  );
  if (!province) return { fail: 'Danh sách tỉnh của GHN không có Hà Nội hoặc Hồ Chí Minh.' };
  const [district] = await call(`/master-data/district?province_id=${province.ProvinceID}`);
  const [ward] = await call(`/master-data/ward?district_id=${district.DistrictID}`);
  const fee = await call('/v2/shipping-order/fee', {
    method: 'POST',
    body: JSON.stringify({
      service_type_id: 2,
      from_district_id: district.DistrictID,
      from_ward_code: ward.WardCode,
      to_district_id: district.DistrictID,
      to_ward_code: ward.WardCode,
      weight: 500,
      length: 20,
      width: 15,
      height: 10,
    }),
  });
  const warn = env('GHN_WEBHOOK_TOKEN') ? '' : ' Thiếu GHN_WEBHOOK_TOKEN: webhook sẽ bị từ chối.';
  return { ok: `Tính phí thử được ${fee.total}đ (${province.ProvinceName}).${warn}` };
}

async function vnpay() {
  const env = loadEnv('payment-service');
  const tmn = env('VNPAY_TMN_CODE');
  const secret = env('VNPAY_HASH_SECRET');
  if (!tmn && !secret) return { skip: 'Chưa có khóa VNPay: đang dùng cổng MÔ PHỎNG.' };
  if (!tmn || !secret) return { fail: 'Phải điền cả VNPAY_TMN_CODE và VNPAY_HASH_SECRET.' };
  const sign = (data) => createHmac('sha512', secret).update(data, 'utf8').digest('hex');

  // 1) Mở thử trang thanh toán (không trả tiền thì không có giao dịch): khóa đúng thì VNPay chuyển
  //    sang trang chọn phương thức, sai thì sang trang lỗi kèm mã (70 = sai chữ ký).
  const now = new Date();
  const params = {
    vnp_Amount: '1000000',
    vnp_Command: 'pay',
    vnp_CreateDate: vnpDate(now),
    vnp_CurrCode: 'VND',
    vnp_ExpireDate: vnpDate(new Date(now.getTime() + 15 * 60_000)),
    vnp_IpAddr: '127.0.0.1',
    vnp_Locale: 'vn',
    vnp_OrderInfo: 'Kiem tra ket noi',
    vnp_OrderType: 'other',
    vnp_ReturnUrl: 'http://localhost/kiem-tra',
    vnp_TmnCode: tmn,
    vnp_TxnRef: `CHECK${Date.now()}`,
    vnp_Version: '2.1.0',
  };
  const qs = Object.keys(params)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(params[k]).replace(/%20/g, '+')}`)
    .join('&');
  const payRes = await fetch(
    `${env('VNPAY_PAY_URL', 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html')}?${qs}&vnp_SecureHash=${sign(qs)}`,
    { redirect: 'manual', signal: AbortSignal.timeout(15_000) },
  );
  const location = payRes.headers.get('location') ?? '';
  const errCode = /Error\.html\?code=(\w+)/.exec(location)?.[1];
  if (errCode === '70') return { fail: 'VNPay báo sai chữ ký (70): kiểm tra VNPAY_HASH_SECRET.' };
  if (errCode)
    return { fail: `Trang thanh toán VNPay báo lỗi mã ${errCode}: kiểm tra VNPAY_TMN_CODE.` };
  if (!/PaymentMethod/.test(location)) {
    return { fail: `Trang thanh toán VNPay trả về bất thường (HTTP ${payRes.status}).` };
  }

  // 2) Tra cứu một mã không tồn tại qua API (dùng cho đối soát và hoàn tiền): 91 = "không có giao dịch".
  const body = {
    vnp_RequestId: randomUUID().replace(/-/g, ''),
    vnp_Version: '2.1.0',
    vnp_Command: 'querydr',
    vnp_TmnCode: tmn,
    vnp_TxnRef: params.vnp_TxnRef,
    vnp_TransactionDate: params.vnp_CreateDate,
    vnp_CreateDate: params.vnp_CreateDate,
    vnp_IpAddr: '127.0.0.1',
    vnp_OrderInfo: 'Kiem tra ket noi',
  };
  const res = await fetch(
    env('VNPAY_API_URL', 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, vnp_SecureHash: sign(Object.values(body).join('|')) }),
      signal: AbortSignal.timeout(15_000),
    },
  ).catch(() => null);
  const json = await res?.json().catch(() => null);
  const code = String(json?.vnp_ResponseCode ?? `HTTP ${res?.status ?? 'lỗi mạng'}`);
  if (code === '91')
    return { ok: 'Mã website và khóa bí mật đúng; API tra cứu/hoàn tiền trả lời bình thường.' };
  return {
    ok:
      'Mã website và khóa bí mật đúng (trang thanh toán nhận chữ ký). ' +
      `Lưu ý: API tra cứu/hoàn tiền đang trả mã ${code}; đối soát và hoàn tiền tự động sẽ cần thử lại sau.`,
  };
}

async function smtp() {
  const env = loadEnv('user-service');
  const url = env('SMTP_URL', 'smtp://localhost:1025');
  const require = createRequire(join(root, 'services/user-service/package.json'));
  const transport = require('nodemailer').createTransport(url);
  try {
    await transport.verify();
  } finally {
    transport.close();
  }
  return url.includes(':1025')
    ? { skip: 'Mailpit chạy được, nhưng đây là hộp thư giả: mail không tới người nhận thật.' }
    : { ok: `Đăng nhập SMTP được (${new URL(url).host}).` };
}

async function google() {
  const env = loadEnv('user-service');
  const id = env('GOOGLE_CLIENT_ID');
  const secret = env('GOOGLE_CLIENT_SECRET');
  if (!id && !secret)
    return { skip: 'Chưa có khóa Google: nút đăng nhập Google báo chưa cấu hình.' };
  if (!id || !secret) return { fail: 'Phải điền cả GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET.' };
  // Đổi một mã giả: invalid_grant nghĩa là Google đã chấp nhận ứng dụng, chỉ từ chối mã
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: 'kiem-tra-ket-noi',
      client_id: id,
      client_secret: secret,
      redirect_uri: env(
        'GOOGLE_REDIRECT_URL',
        'http://localhost:5173/api/user/v1/auth/google/callback',
      ),
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const { error } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (error === 'invalid_grant') return { ok: 'Client ID và secret đúng.' };
  return { fail: `Google báo ${error}: kiểm tra Client ID, secret và redirect URI.` };
}

const checks = { VNPay: vnpay, GHN: ghn, 'Email (SMTP)': smtp, 'Google OAuth': google };
const LABEL = { ok: 'OK    ', skip: 'CHƯA  ', fail: 'LỖI   ' };
let failed = false;
for (const [name, check] of Object.entries(checks)) {
  let result;
  try {
    result = await check();
  } catch (e) {
    result = { fail: e.message };
  }
  const [kind, message] = Object.entries(result)[0];
  if (kind === 'fail') failed = true;
  console.log(`${LABEL[kind]}${name}: ${message}`);
}
process.exit(failed ? 1 : 0);
