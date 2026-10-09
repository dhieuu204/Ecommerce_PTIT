import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CodeService } from './code.service';
import { GoogleClient } from './google.client';
import { GoogleController } from './google.controller';
import { JwksController } from './jwks.controller';

/** Đăng ký, xác minh email, đăng nhập (mật khẩu, Google), phiên, quên mật khẩu (ACC-01..03). */
@Module({
  controllers: [AuthController, GoogleController, JwksController],
  providers: [AuthService, CodeService, GoogleClient],
})
export class AuthModule {}
