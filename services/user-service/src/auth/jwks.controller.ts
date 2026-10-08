import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JWT_SIGNING_KEY, Public, toJwks } from '@san/nest-common';
import type { KeyObject } from 'node:crypto';

@ApiTags('Đăng nhập')
@Controller('.well-known')
export class JwksController {
  constructor(@Inject(JWT_SIGNING_KEY) private readonly signingKey: KeyObject) {}

  /** Khóa công khai để 3 service còn lại tự kiểm access token (không gọi về user-service mỗi lần). */
  @Public()
  @Get('jwks.json')
  jwks() {
    return toJwks(this.signingKey);
  }
}
