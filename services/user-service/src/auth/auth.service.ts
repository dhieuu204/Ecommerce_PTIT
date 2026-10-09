import { Injectable, Logger } from '@nestjs/common';
import { AppError } from '@san/nest-common';
import type { Request, Response } from 'express';
import { checkPassword, hashPassword } from '../common/password';
import { AppConfig } from '../config';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma.service';
import { SessionService, type LoginResult } from '../sessions/session.service';
import type { CodePurpose, User } from '../../generated/prisma';
import { CodeService } from './code.service';
import type { LoginDto, RegisterDto, ResetPasswordDto, VerifyCodeDto } from './dto/auth.dto';

/** Đăng ký, xác minh email, đăng nhập bằng mật khẩu, quên mật khẩu (ACC-01..03). */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly codes: CodeService,
    private readonly mail: MailService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Đăng ký: tạo tài khoản UNVERIFIED và gửi mã. Email đã xác minh (hoặc bị khóa) → 409 EMAIL_TAKEN.
   * Email đã đăng ký nhưng chưa xác minh → ghi đè họ tên, mật khẩu và gửi mã mới
   * (trong 60 giây kể từ mã trước thì không gửi thêm, mã trước vẫn dùng được).
   */
  async register(dto: RegisterDto): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing && existing.status !== 'UNVERIFIED') {
      throw new AppError(409, 'EMAIL_TAKEN', 'Email này đã có tài khoản. Bạn hãy đăng nhập.');
    }
    const passwordHash = await hashPassword(dto.password);
    const canSend = !existing || (await this.codes.cooldownLeft(existing.id, 'VERIFY_EMAIL')) === 0;

    const code = await this.prisma.$transaction(async (tx) => {
      const user = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: { fullName: dto.fullName, passwordHash },
          })
        : await tx.user.create({
            data: { email: dto.email, fullName: dto.fullName, passwordHash },
          });
      return canSend ? this.codes.issue(tx, user.id, 'VERIFY_EMAIL') : null;
    });
    if (code) await this.sendCode(dto.email, 'VERIFY_EMAIL', code, true);
  }

  /** Xác minh email bằng mã 6 số. Đúng → tài khoản ACTIVE và đăng nhập luôn. */
  async verifyEmail(dto: VerifyCodeDto, req: Request, res: Response): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    await this.codes.consume(
      user?.status === 'UNVERIFIED' ? user.id : undefined,
      'VERIFY_EMAIL',
      dto.code,
    );
    return this.prisma.$transaction(async (tx) => {
      const active = await tx.user.update({
        where: { id: user!.id },
        data: { status: 'ACTIVE', lastLoginAt: new Date() },
      });
      return this.sessions.start(active, req, res, tx);
    });
  }

  /** Gửi lại mã xác minh. Luôn im lặng (không lộ email có tồn tại không), cách nhau ít nhất 60 giây. */
  async resendVerification(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== 'UNVERIFIED') return;
    await this.issueAndSend(user, 'VERIFY_EMAIL');
  }

  /**
   * Đăng nhập bằng email + mật khẩu. Thứ tự kiểm: đang bị khóa tạm → mật khẩu → trạng thái tài khoản,
   * để chỉ người biết đúng mật khẩu mới biết tài khoản chưa xác minh hay bị admin khóa.
   */
  async login(dto: LoginDto, req: Request, res: Response): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.');
    }
    this.throwIfLoginLocked(user.loginLockedUntil);

    const ok = user.passwordHash ? await checkPassword(dto.password, user.passwordHash) : false;
    if (!ok) await this.recordFailedLogin(user);

    if (user.status === 'LOCKED') {
      throw new AppError(
        403,
        'ACCOUNT_LOCKED',
        `Tài khoản đã bị khóa${user.lockReason ? `: ${user.lockReason}` : ''}. Liên hệ hỗ trợ để mở khóa.`,
      );
    }
    if (user.status === 'UNVERIFIED') {
      throw new AppError(
        403,
        'EMAIL_NOT_VERIFIED',
        'Email chưa được xác minh. Nhập mã 6 số đã gửi tới email của bạn.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const fresh = await tx.user.update({
        where: { id: user.id },
        data: { failedLogins: 0, loginLockedUntil: null, lastLoginAt: new Date() },
      });
      return this.sessions.start(fresh, req, res, tx);
    });
  }

  /** Quên mật khẩu: gửi mã đặt lại. Luôn im lặng. Tài khoản bị admin khóa thì không gửi. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status === 'LOCKED') return;
    await this.issueAndSend(user, 'RESET_PASSWORD');
  }

  /**
   * Đặt lại mật khẩu bằng mã. Thành công → đăng xuất mọi nơi; mở khóa đăng nhập tạm;
   * tài khoản chưa xác minh thành ACTIVE (nhận được mã nghĩa là đúng chủ email).
   */
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    await this.codes.consume(
      user && user.status !== 'LOCKED' ? user.id : undefined,
      'RESET_PASSWORD',
      dto.code,
    );
    const passwordHash = await hashPassword(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user!.id },
        data: {
          passwordHash,
          status: 'ACTIVE',
          failedLogins: 0,
          loginLockedUntil: null,
        },
      });
      await this.sessions.revokeAll(user!.id, tx);
    });
  }

  private throwIfLoginLocked(lockedUntil: Date | null): void {
    if (!lockedUntil || lockedUntil <= new Date()) return;
    const retryAfterSeconds = Math.ceil((lockedUntil.getTime() - Date.now()) / 1000);
    throw new AppError(
      423,
      'LOGIN_LOCKED',
      `Bạn đã nhập sai ${this.config.loginMaxFails} lần. Thử lại sau ${Math.ceil(retryAfterSeconds / 60)} phút.`,
      { retryAfterSeconds },
    );
  }

  /**
   * Ghi một lần sai, tính ngay trong câu lệnh SQL (đăng nhập sai cùng lúc nhiều lần không lách được).
   * Đủ số lần thì khóa tạm và đếm lại từ 0. Luôn ném lỗi.
   */
  private async recordFailedLogin(user: User): Promise<never> {
    const max = this.config.loginMaxFails;
    const [row] = await this.prisma.$queryRaw<
      Array<{ failed_logins: number; login_locked_until: Date | null }>
    >`
      UPDATE users SET
        failed_logins = CASE WHEN failed_logins + 1 >= ${max} THEN 0 ELSE failed_logins + 1 END,
        login_locked_until = CASE WHEN failed_logins + 1 >= ${max}
          THEN now() + make_interval(mins => ${this.config.loginLockMinutes}::int)
          ELSE login_locked_until END
      WHERE id = ${user.id}::uuid
      RETURNING failed_logins, login_locked_until`;
    this.throwIfLoginLocked(row?.login_locked_until ?? null);
    const attemptsLeft = max - (row?.failed_logins ?? 0);
    const googleHint =
      !user.passwordHash && user.googleId ? ' Tài khoản này đăng ký bằng Google.' : '';
    throw new AppError(
      401,
      'INVALID_CREDENTIALS',
      `Email hoặc mật khẩu không đúng. Còn ${attemptsLeft} lần thử.${googleHint}`,
      { attemptsLeft },
    );
  }

  private async issueAndSend(user: User, purpose: CodePurpose): Promise<void> {
    if ((await this.codes.cooldownLeft(user.id, purpose)) > 0) return;
    const code = await this.prisma.$transaction((tx) => this.codes.issue(tx, user.id, purpose));
    await this.sendCode(user.email, purpose, code, false);
  }

  /**
   * Gửi mã qua mail. mustSucceed: báo lỗi 503 cho người dùng (đăng ký);
   * còn lại chỉ ghi log để API "luôn trả 202" không lộ gì.
   */
  private async sendCode(
    email: string,
    purpose: CodePurpose,
    code: string,
    mustSucceed: boolean,
  ): Promise<void> {
    const minutes = this.config.codeTtlMinutes;
    const message =
      purpose === 'VERIFY_EMAIL'
        ? {
            subject: `${code} là mã xác minh tài khoản của bạn`,
            text: `Mã xác minh email của bạn là ${code}. Mã có hiệu lực trong ${minutes} phút.\n\nNếu bạn không đăng ký tài khoản, hãy bỏ qua email này.`,
          }
        : {
            subject: `${code} là mã đặt lại mật khẩu của bạn`,
            text: `Mã đặt lại mật khẩu của bạn là ${code}. Mã có hiệu lực trong ${minutes} phút.\n\nNếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này; mật khẩu hiện tại vẫn giữ nguyên.`,
          };
    try {
      await this.mail.send({ to: email, ...message });
    } catch (e) {
      this.logger.error(`Không gửi được mail ${purpose}: ${(e as Error).message}`);
      if (mustSucceed) {
        throw new AppError(
          503,
          'MAIL_SEND_FAILED',
          'Chưa gửi được email. Bạn hãy bấm "Gửi lại mã" sau ít phút.',
        );
      }
    }
  }
}
