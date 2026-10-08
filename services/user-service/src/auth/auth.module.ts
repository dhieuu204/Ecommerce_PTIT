import { Module } from '@nestjs/common';
import { JwksController } from './jwks.controller';

/** Đăng ký, đăng nhập, phiên đăng nhập (ACC-01..03). Hiện mới có JWKS. */
@Module({
  controllers: [JwksController],
})
export class AuthModule {}
