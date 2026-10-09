import { Controller, Get, Logger, Query, Req, Res } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '@san/nest-common';
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { AppConfig } from '../config';
import { PrismaService } from '../prisma.service';
import { readCookie, SessionService } from '../sessions/session.service';
import { GoogleClient, type GoogleProfile } from './google.client';

const STATE_COOKIE = 'san_google';
const STATE_COOKIE_PATH = '/api/user/v1/auth/google';

/** Chỉ chuyển về đường dẫn trong web (bắt đầu bằng "/"), tránh bị lợi dụng chuyển sang trang lạ. */
export function safeReturnTo(value: unknown): string {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value.slice(0, 500) : '/';
}

/**
 * Đăng nhập bằng Google (ACC-01, ACC-02). Web mở /auth/google/start; Google chuyển về /auth/google/callback;
 * user-service đặt cookie refresh rồi chuyển về web, web gọi /auth/refresh để lấy access token như khi mở lại trang.
 */
@ApiTags('Đăng nhập')
@Public()
@Controller('auth/google')
export class GoogleController {
  private readonly logger = new Logger(GoogleController.name);

  constructor(
    private readonly google: GoogleClient,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly config: AppConfig,
  ) {}

  /** Bắt đầu: chuyển sang trang chọn tài khoản Google. returnTo: trang web quay về sau khi xong */
  @Get('start')
  @ApiResponse({ status: 302, description: 'Chuyển sang Google' })
  @ApiResponse({ status: 503, description: 'GOOGLE_NOT_CONFIGURED' })
  start(@Query('returnTo') returnTo: string | undefined, @Res() res: Response): void {
    const state = randomBytes(16).toString('base64url');
    const url = this.google.authorizeUrl(state);
    // Ghi state vào cookie, lúc Google gọi về so lại để chặn yêu cầu giả mạo (CSRF)
    res.cookie(STATE_COOKIE, JSON.stringify({ state, returnTo: safeReturnTo(returnTo) }), {
      httpOnly: true,
      secure: this.config.production,
      sameSite: 'lax',
      path: STATE_COOKIE_PATH,
      maxAge: 10 * 60 * 1000,
    });
    res.redirect(url);
  }

  /** Google gọi về. Thành công → chuyển về returnTo; lỗi → về trang đăng nhập kèm ?error=... */
  @Get('callback')
  @ApiResponse({ status: 302, description: 'Chuyển về web' })
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    let saved: { state?: string; returnTo?: string } = {};
    try {
      saved = JSON.parse(readCookie(req, STATE_COOKIE) ?? '{}') as typeof saved;
    } catch {
      // cookie hỏng: coi như không có
    }
    res.clearCookie(STATE_COOKIE, { path: STATE_COOKIE_PATH });
    const fail = (error: string) => res.redirect(`${this.config.webUrl}/dang-nhap?error=${error}`);

    if (!code || !state || state !== saved.state) return fail('google_state');
    let profile: GoogleProfile;
    try {
      profile = await this.google.exchangeCode(code);
    } catch (e) {
      this.logger.warn(`Đăng nhập Google lỗi: ${(e as Error).message}`);
      return fail('google_failed');
    }
    if (!profile.emailVerified) return fail('google_email_unverified');

    const user = await this.findOrCreate(profile);
    if (user.status === 'LOCKED') return fail('account_locked');

    await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.user.update({
        where: { id: user.id },
        data: { failedLogins: 0, loginLockedUntil: null, lastLoginAt: new Date() },
      });
      await this.sessions.start(fresh, req, res, tx);
    });
    res.redirect(`${this.config.webUrl}${safeReturnTo(saved.returnTo)}`);
  }

  /**
   * Tìm tài khoản theo mã Google, rồi theo email (tự gộp, quyết định 07/10); chưa có thì tạo mới ACTIVE.
   * Gộp vào tài khoản chưa xác minh thì xóa mật khẩu cũ: người đặt mật khẩu đó chưa chứng minh
   * là chủ email, có thể là kẻ đăng ký trước bằng email của người khác.
   */
  async findOrCreate(profile: GoogleProfile) {
    const byGoogle = await this.prisma.user.findUnique({ where: { googleId: profile.googleId } });
    if (byGoogle) return byGoogle;

    const byEmail = await this.prisma.user.findUnique({ where: { email: profile.email } });
    if (byEmail) {
      return this.prisma.user.update({
        where: { id: byEmail.id },
        data: {
          googleId: profile.googleId,
          ...(byEmail.status === 'UNVERIFIED' ? { status: 'ACTIVE', passwordHash: null } : {}),
        },
      });
    }
    return this.prisma.user.create({
      data: {
        email: profile.email,
        googleId: profile.googleId,
        fullName: profile.name,
        status: 'ACTIVE',
      },
    });
  }
}
