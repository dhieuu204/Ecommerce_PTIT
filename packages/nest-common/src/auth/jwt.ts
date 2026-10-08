import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  KeyObject,
  type JsonWebKey,
} from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { JwtClaims, Permission } from '@san/shared';

/** Người đang gọi API, lấy từ access token. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  permissions: Permission[];
}

export const JWT_ISSUER = 'user-service';
export const JWT_AUDIENCE = 'san';
/** Access token sống 15 phút */
export const ACCESS_TOKEN_SECONDS = 15 * 60;

/** Đọc khóa riêng từ biến môi trường (PEM; dấu xuống dòng có thể viết là \n). */
export function loadPrivateKey(pem: string): KeyObject {
  return createPrivateKey(pem.replace(/\\n/g, '\n'));
}

/**
 * Khóa tạm cho máy dev khi chưa đặt JWT_PRIVATE_KEY: mỗi lần khởi động user-service là một khóa mới,
 * nên vé cũ mất hiệu lực. Chạy thật (NODE_ENV=production) thì bắt buộc đặt khóa, không dùng hàm này.
 */
export function generateDevPrivateKey(): string {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
}

/** Mã khóa (kid) = 16 ký tự đầu của SHA-256 khóa công khai, để nhận ra khóa khi đổi khóa. */
export function keyId(publicKey: KeyObject): string {
  const der = publicKey.export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(der).digest('hex').slice(0, 16);
}

/** Bộ khóa công khai (JWKS) để user-service trả ở /.well-known/jwks.json. */
export function toJwks(privateKey: KeyObject): { keys: JsonWebKey[] } {
  const publicKey = createPublicKey(privateKey);
  return {
    keys: [
      { ...publicKey.export({ format: 'jwk' }), kid: keyId(publicKey), alg: 'RS256', use: 'sig' },
    ],
  };
}

/** Ký access token. Chỉ user-service gọi (lúc đăng nhập, làm mới phiên). Test cũng dùng để tạo vé giả. */
export function signAccessToken(user: AuthUser, privateKey: KeyObject): string {
  const claims: Pick<JwtClaims, 'email' | 'name' | 'perms'> = {
    email: user.email,
    name: user.name,
    perms: user.permissions,
  };
  return jwt.sign(claims, privateKey, {
    algorithm: 'RS256',
    keyid: keyId(createPublicKey(privateKey)),
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    subject: user.id,
    expiresIn: ACCESS_TOKEN_SECONDS,
  });
}

/** Lỗi khi kiểm vé: hết hạn hoặc không hợp lệ. */
export class TokenError extends Error {
  constructor(readonly expired: boolean) {
    super(expired ? 'Token expired' : 'Invalid token');
  }
}

/**
 * Nơi lấy khóa công khai để kiểm vé.
 * - user-service: tự suy ra từ khóa riêng của mình.
 * - 3 service còn lại: tải từ JWKS của user-service, lưu lại; gặp kid lạ thì tải lại (khi đổi khóa).
 */
export class JwtVerifier {
  private keys = new Map<string, KeyObject>();
  private lastFetch = 0;

  constructor(private readonly source: { privateKey: KeyObject } | { jwksUrl: string }) {
    if ('privateKey' in source) {
      const pub = createPublicKey(source.privateKey);
      this.keys.set(keyId(pub), pub);
    }
  }

  async verify(token: string): Promise<AuthUser> {
    const decoded = jwt.decode(token, { complete: true });
    const kid = decoded?.header.kid;
    if (!kid) throw new TokenError(false);
    const key = await this.getKey(kid);
    if (!key) throw new TokenError(false);
    try {
      const c = jwt.verify(token, key, {
        algorithms: ['RS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      }) as JwtClaims;
      return { id: c.sub, email: c.email, name: c.name, permissions: c.perms ?? [] };
    } catch (e) {
      throw new TokenError(e instanceof jwt.TokenExpiredError);
    }
  }

  private async getKey(kid: string): Promise<KeyObject | undefined> {
    const known = this.keys.get(kid);
    // Không tải lại quá 1 lần mỗi 30 giây, tránh bị spam bằng kid giả
    if (known || !('jwksUrl' in this.source) || Date.now() - this.lastFetch < 30_000) return known;
    this.lastFetch = Date.now();
    const res = await fetch(this.source.jwksUrl);
    if (!res.ok) throw new Error(`Không tải được JWKS (${res.status}) từ ${this.source.jwksUrl}`);
    const body = (await res.json()) as { keys: Array<JsonWebKey & { kid?: string }> };
    for (const jwk of body.keys) {
      if (jwk.kid) this.keys.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }));
    }
    return this.keys.get(kid);
  }
}
