import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '@san/nest-common';
import { ChangePasswordDto, UpdateProfileDto } from './dto/me.dto';
import { MeService, type Profile } from './me.service';

@ApiTags('Hồ sơ của tôi')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  /** Hồ sơ của người đang đăng nhập (ACC-04) */
  @Get()
  get(@CurrentUser() user: AuthUser): Promise<Profile> {
    return this.me.get(user.id);
  }

  /** Sửa họ tên, SĐT, ngày sinh, giới tính. Không đổi email ở P1 (ACC-04) */
  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto): Promise<Profile> {
    return this.me.update(user.id, dto);
  }

  /** Đổi mật khẩu; đăng xuất các thiết bị khác (ACC-03) */
  @Post('password')
  @HttpCode(204)
  @ApiResponse({ status: 400, description: 'WRONG_PASSWORD: mật khẩu hiện tại không đúng' })
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto): Promise<void> {
    return this.me.changePassword(user, dto);
  }
}
