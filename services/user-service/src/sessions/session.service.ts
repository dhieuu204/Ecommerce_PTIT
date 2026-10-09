import { Inject, Injectable } from '@nestjs/common';
import { ACCESS_TOKEN_SECONDS, AppError, JWT_SIGNING_KEY, signAccessToken } from '@san/nest-common';
import type { Permission } from '@san/shared';
import type { Request, Response } from 'express';
import { createHash, randomBytes, type KeyObject } from 'node:crypto';
import { AppConfig } from '../config';
import { PrismaService } from '../prisma.service';
import type { Prisma } from '../../generated/prisma';

/** Cookie giữ refresh token: chỉ trình duyệt gửi tới /api/user/v1/auth, JavaScript không đọc được. */
export const REFRESH_COOKIE = 'san_refresh';
export const REFRESH_COOKIE_PATH = '/api/user/v1/auth';

/** Kết quả đăng nhập trả cho web */
export interface LoginResult {
  /** Access token (JWT), gửi kèm header Authorization: Bearer ... */
  accessToken: string;
  /** Số giây access token còn sống */
  expiresIn: number;
  user: { id: string; email: string; fullName: string; permissions: Permission[] };
}

type SessionUser = LoginResult['user'];
type Db = Prisma.TransactionClient | PrismaService;

/** SHA-256 của refresh token: bảng sessions chỉ lưu bản băm, lộ database cũng không dùng được token. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Đọc một cookie từ header (không cần thêm thư viện cookie-parser). */
export function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

/**
 * Phiên đăng nhập (ACC-02). Mỗi thiết bị một dòng bảng sessions giữ refresh token 7 ngày.
 * Access token sống 15 phút, mang mã phiên (sid) để "đăng xuất các máy khác" khi đổi mật khẩu.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    @Inject(JWT_SIGNING_KEY) private readonly signingKey: KeyObject,
  ) {}

  /** Tạo phiên mới, đặt cookie refresh, trả access token. */
  async start(
    user: SessionUser,
    req: Request,
    res: Response,
    db: Db = this.prisma,
  ): Promise<LoginResult> {
    const token = randomBytes(32).toString('base64url');
    const session = await db.session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: this.expiry(),
        device: req.headers['user-agent']?.slice(0, 255) ?? null,
      },
    });
    this.setCookie(res, token);
    return this.result(user, session.id);
  }

  /**
   * Làm mới: đổi refresh token sang token mới (token cũ dùng một lần) và cấp access token mới
   * với họ tên, bộ quyền mới nhất. Token cũ, đã thu hồi hoặc hết hạn → 401.
   */
  async refresh(req: Request, res: Response): Promise<LoginResult> {
    const oldToken = readCookie(req, REFRESH_COOKIE);
    const expired = () => {
      this.clearCookie(res);
      return new AppError(
        401,
        'UNAUTHENTICATED',
        'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.',
      );
    };
    if (!oldToken) throw expired();

    const oldHash = hashToken(oldToken);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: oldHash },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) throw expired();
    if (session.user.status !== 'ACTIVE') throw expired();

    const newToken = randomBytes(32).toString('base64url');
    // Chỉ đổi nếu token vẫn là token hiện tại: hai yêu cầu làm mới cùng lúc thì chỉ một cái thắng
    const { count } = await this.prisma.session.updateMany({
      where: { id: session.id, tokenHash: oldHash, revokedAt: null },
      data: { tokenHash: hashToken(newToken), expiresAt: this.expiry() },
    });
    if (count === 0) throw expired();

    this.setCookie(res, newToken);
    return this.result(session.user, session.id);
  }

  /** Đăng xuất thiết bị đang dùng: thu hồi phiên theo cookie, xóa cookie. */
  async logout(req: Request, res: Response): Promise<void> {
    const token = readCookie(req, REFRESH_COOKIE);
    if (token) {
      await this.prisma.session.updateMany({
        where: { tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    this.clearCookie(res);
  }

  /** Thu hồi mọi phiên của một người (trừ phiên exceptSessionId nếu có). */
  async revokeAll(userId: string, db: Db = this.prisma, exceptSessionId?: string): Promise<void> {
    await db.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }

  private result(
    user: { id: string; email: string; fullName: string; permissions: Permission[] },
    sessionId: string,
  ): LoginResult {
    const { id, email, fullName, permissions } = user;
    return {
      accessToken: signAccessToken(
        { id, email, name: fullName, permissions, sessionId },
        this.signingKey,
      ),
      expiresIn: ACCESS_TOKEN_SECONDS,
      user: { id, email, fullName, permissions },
    };
  }

  private expiry(): Date {
    return new Date(Date.now() + this.config.refreshTokenDays * 24 * 3600 * 1000);
  }

  private setCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.config.production,
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      maxAge: this.config.refreshTokenDays * 24 * 3600 * 1000,
    });
  }

  private clearCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }
}
