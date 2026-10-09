import { Injectable } from '@nestjs/common';

/** Đọc số từ biến môi trường, không đặt thì lấy giá trị mặc định. */
function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Biến môi trường ${name} phải là số dương, đang là "${raw}"`);
  }
  return value;
}

function text(name: string, fallback = ''): string {
  return process.env[name] || fallback;
}

/**
 * Con số và địa chỉ cấu hình của user-service. Đọc từ .env (danh sách ở .env.example),
 * không đặt thì dùng giá trị mặc định đã chốt. Từ P3 con số về đơn và tiền mới vào bảng settings.
 */
@Injectable()
export class AppConfig {
  /** Mã 6 số qua email: hạn dùng (phút) */
  readonly codeTtlMinutes = num('CODE_TTL_MINUTES', 10);
  /** Mã 6 số: số lần nhập sai tối đa */
  readonly codeMaxAttempts = num('CODE_MAX_ATTEMPTS', 5);
  /** Gửi lại mã: cách nhau ít nhất (giây) */
  readonly resendCooldownSeconds = num('RESEND_COOLDOWN_SECONDS', 60);
  /** Đăng nhập sai liên tiếp bao nhiêu lần thì khóa tạm */
  readonly loginMaxFails = num('LOGIN_MAX_FAILS', 5);
  /** Khóa đăng nhập tạm (phút) */
  readonly loginLockMinutes = num('LOGIN_LOCK_MINUTES', 15);
  /** Phiên đăng nhập (refresh token) sống bao nhiêu ngày kể từ lần dùng cuối */
  readonly refreshTokenDays = num('REFRESH_TOKEN_DAYS', 7);
  /** Số địa chỉ tối đa mỗi người */
  readonly maxAddresses = num('MAX_ADDRESSES', 10);

  /** Địa chỉ web, để chuyển về sau khi đăng nhập Google */
  readonly webUrl = text('WEB_URL', 'http://localhost:5173');
  /** API marketplace-service, để kiểm mã tỉnh/huyện/xã */
  readonly marketplaceApiUrl = text('MARKETPLACE_API_URL', 'http://localhost:3002/api/market/v1');

  /** Máy chủ gửi mail. Mặc định Mailpit (hộp thư giả khi dev, xem ở http://localhost:8025) */
  readonly smtpUrl = text('SMTP_URL', 'smtp://localhost:1025');
  readonly mailFrom = text('MAIL_FROM', 'Sàn TMĐT <no-reply@san.local>');

  /** Ứng dụng Google OAuth. Để trống thì nút "Đăng nhập bằng Google" báo chưa cấu hình. */
  readonly googleClientId = text('GOOGLE_CLIENT_ID');
  readonly googleClientSecret = text('GOOGLE_CLIENT_SECRET');
  readonly googleRedirectUrl = text(
    'GOOGLE_REDIRECT_URL',
    'http://localhost:5173/api/user/v1/auth/google/callback',
  );

  readonly production = process.env.NODE_ENV === 'production';
}
