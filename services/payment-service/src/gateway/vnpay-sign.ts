import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Ký và kiểm chữ ký dữ liệu VNPay (tài liệu VNPay 2.1.0). Hàm thuần để test được không cần mạng.
 * Chuỗi ký = các tham số sắp theo tên, nối `tên=giá trị` bằng `&`, mã hóa URL (dấu cách thành `+`),
 * rồi HMAC-SHA512 bằng khóa bí mật.
 */

export function vnpEncode(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, '+');
}

/** Chuỗi để ký (cũng là query string gửi đi) */
export function signData(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== '')
    .sort()
    .map((k) => `${vnpEncode(k)}=${vnpEncode(params[k]!)}`)
    .join('&');
}

export function hmac512(secret: string, data: string): string {
  return createHmac('sha512', secret).update(Buffer.from(data, 'utf-8')).digest('hex');
}

/** Query string đã ký: `...&vnp_SecureHash=...` */
export function signedQuery(params: Record<string, string>, secret: string): string {
  const data = signData(params);
  return `${data}&vnp_SecureHash=${hmac512(secret, data)}`;
}

/** Kiểm chữ ký các tham số VNPay gửi về (bỏ vnp_SecureHash, vnp_SecureHashType trước khi ký lại) */
export function verifySignature(params: Record<string, string>, secret: string): boolean {
  const given = params.vnp_SecureHash;
  if (!given) return false;
  const rest: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (k.startsWith('vnp_') && k !== 'vnp_SecureHash' && k !== 'vnp_SecureHashType') rest[k] = v;
  }
  const expected = hmac512(secret, signData(rest));
  const a = Buffer.from(expected, 'utf-8');
  const b = Buffer.from(given.toLowerCase(), 'utf-8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Thời gian theo định dạng VNPay yyyyMMddHHmmss, giờ Việt Nam (GMT+7) */
export function vnpDate(d: Date): string {
  const vn = new Date(d.getTime() + 7 * 3600_000).toISOString();
  return vn.slice(0, 19).replace(/[-T:]/g, '');
}

/** Đọc thời gian yyyyMMddHHmmss (GMT+7) */
export function parseVnpDate(s: string | undefined | null): Date | null {
  if (!s || !/^\d{14}$/.test(s)) return null;
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}+07:00`;
  return new Date(iso);
}
