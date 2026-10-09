import { Injectable } from '@nestjs/common';
import { AppError } from '@san/nest-common';
import { AppConfig } from '../config';

/** Thông tin người dùng Google trả về sau khi đồng ý */
export interface GoogleProfile {
  /** Mã tài khoản Google (không đổi kể cả khi đổi email) */
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

/** Gọi Google OAuth 2.0 (đăng nhập Google, ACC-01/02). Tách riêng để test thay bằng bản giả. */
@Injectable()
export class GoogleClient {
  constructor(private readonly config: AppConfig) {}

  get configured(): boolean {
    return Boolean(this.config.googleClientId && this.config.googleClientSecret);
  }

  /** Địa chỉ trang chọn tài khoản của Google */
  authorizeUrl(state: string): string {
    this.ensureConfigured();
    const params = new URLSearchParams({
      client_id: this.config.googleClientId,
      redirect_uri: this.config.googleRedirectUrl,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  /** Đổi mã Google gửi về lấy thông tin người dùng */
  async exchangeCode(code: string): Promise<GoogleProfile> {
    this.ensureConfigured();
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.config.googleClientId,
        client_secret: this.config.googleClientSecret,
        redirect_uri: this.config.googleRedirectUrl,
        grant_type: 'authorization_code',
      }),
    });
    if (!res.ok) throw new Error(`Google từ chối đổi mã (${res.status})`);
    const { id_token: idToken } = (await res.json()) as { id_token?: string };
    if (!idToken) throw new Error('Google không trả id_token');

    // id_token nhận thẳng từ Google qua HTTPS bằng client secret của mình nên không cần kiểm chữ ký
    // (OpenID Connect Core 3.1.3.7), chỉ kiểm đúng người phát và đúng ứng dụng.
    const claims = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString()) as {
      iss?: string;
      aud?: string;
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    };
    const issuerOk =
      claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
    if (!issuerOk || claims.aud !== this.config.googleClientId || !claims.sub || !claims.email) {
      throw new Error('id_token của Google không hợp lệ');
    }
    return {
      googleId: claims.sub,
      email: claims.email.toLowerCase(),
      emailVerified: claims.email_verified === true,
      name: (claims.name || claims.email.split('@')[0]!).slice(0, 100),
    };
  }

  private ensureConfigured(): void {
    if (!this.configured) {
      throw new AppError(
        503,
        'GOOGLE_NOT_CONFIGURED',
        'Đăng nhập bằng Google chưa được cấu hình. Bạn hãy đăng nhập bằng email.',
      );
    }
  }
}
