import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '@san/nest-common';
import type { Request, Response } from 'express';
import { SessionService, type LoginResult } from '../sessions/session.service';
import { AuthService } from './auth.service';
import { EmailDto, LoginDto, RegisterDto, ResetPasswordDto, VerifyCodeDto } from './dto/auth.dto';

/**
 * Đăng ký, đăng nhập, phiên đăng nhập, quên mật khẩu (ACC-01..03).
 * Refresh token nằm trong cookie httpOnly `san_refresh`, chỉ gửi tới /api/user/v1/auth.
 */
@ApiTags('Đăng nhập')
@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  /** Đăng ký bằng email: tạo tài khoản chưa xác minh và gửi mã 6 số qua email (ACC-01) */
  @Post('register')
  @ApiResponse({ status: 409, description: 'EMAIL_TAKEN: email đã có tài khoản' })
  @ApiResponse({
    status: 503,
    description: 'MAIL_SEND_FAILED: chưa gửi được email, bấm gửi lại mã',
  })
  register(@Body() dto: RegisterDto): Promise<void> {
    return this.auth.register(dto);
  }

  /** Nhập mã 6 số: đúng thì tài khoản được kích hoạt và đăng nhập luôn (ACC-01) */
  @Post('verify-email')
  @HttpCode(200)
  @ApiResponse({ status: 400, description: 'CODE_INVALID (kèm attemptsLeft) hoặc CODE_EXPIRED' })
  verifyEmail(
    @Body() dto: VerifyCodeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResult> {
    return this.auth.verifyEmail(dto, req, res);
  }

  /** Gửi lại mã xác minh. Luôn trả 202, cách nhau ít nhất 60 giây (ACC-01) */
  @Post('resend-verification')
  @HttpCode(202)
  resend(@Body() dto: EmailDto): Promise<void> {
    return this.auth.resendVerification(dto.email);
  }

  /** Đăng nhập bằng email + mật khẩu (ACC-02) */
  @Post('login')
  @HttpCode(200)
  @ApiResponse({ status: 401, description: 'INVALID_CREDENTIALS (kèm attemptsLeft)' })
  @ApiResponse({ status: 403, description: 'EMAIL_NOT_VERIFIED hoặc ACCOUNT_LOCKED' })
  @ApiResponse({
    status: 423,
    description: 'LOGIN_LOCKED: sai 5 lần, khóa 15 phút (kèm retryAfterSeconds)',
  })
  login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResult> {
    return this.auth.login(dto, req, res);
  }

  /** Lấy access token mới bằng cookie refresh; refresh token cũng được đổi mới (dùng một lần) (ACC-02) */
  @Post('refresh')
  @HttpCode(200)
  @ApiResponse({ status: 401, description: 'UNAUTHENTICATED: phiên hết hạn hoặc đã thu hồi' })
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<LoginResult> {
    return this.sessions.refresh(req, res);
  }

  /** Đăng xuất thiết bị này: thu hồi refresh token, xóa cookie (ACC-02) */
  @Post('logout')
  @HttpCode(204)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    return this.sessions.logout(req, res);
  }

  /** Quên mật khẩu: gửi mã 6 số qua email. Luôn trả 202 (ACC-03) */
  @Post('forgot-password')
  @HttpCode(202)
  forgotPassword(@Body() dto: EmailDto): Promise<void> {
    return this.auth.forgotPassword(dto.email);
  }

  /** Đặt mật khẩu mới bằng mã; thành công thì đăng xuất mọi nơi (ACC-03) */
  @Post('reset-password')
  @HttpCode(204)
  @ApiResponse({ status: 400, description: 'CODE_INVALID (kèm attemptsLeft) hoặc CODE_EXPIRED' })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.auth.resetPassword(dto);
  }
}
