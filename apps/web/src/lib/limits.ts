/**
 * Con số nghiệp vụ P1 mà web cần biết trước để hiển thị (đếm ngược, giới hạn).
 * Phải khớp .env của service (user-service: CODE_TTL_MINUTES, RESEND_COOLDOWN_SECONDS, MAX_ADDRESSES;
 * marketplace-service: SHOP_LOGO_MAX_MB). Đổi ở đó thì đặt biến VITE_ tương ứng cho web.
 * Backend vẫn tự kiểm; ở đây chỉ để giao diện báo trước.
 */
const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const LIMITS = {
  /** Gửi lại mã sau bao nhiêu giây */
  resendCooldownSeconds: num(import.meta.env.VITE_RESEND_COOLDOWN_SECONDS, 60),
  /** Mã 6 số hết hạn sau bao nhiêu phút */
  codeTtlMinutes: num(import.meta.env.VITE_CODE_TTL_MINUTES, 10),
  /** Tối đa bao nhiêu địa chỉ trong sổ */
  maxAddresses: num(import.meta.env.VITE_MAX_ADDRESSES, 10),
  /** Logo shop tối đa bao nhiêu MB */
  shopLogoMaxMb: num(import.meta.env.VITE_SHOP_LOGO_MAX_MB, 2),
};
