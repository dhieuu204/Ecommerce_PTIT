import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Length } from 'class-validator';
import { CurrentUser, RequirePermissions } from '../auth/decorators';
import type { AuthUser } from '../auth/jwt';
import { SettingsService, type SettingVersion, type SettingView } from './settings.service';

export class UpdateSettingDto {
  /** Giá trị mới (số nguyên, trong giới hạn min–max của con số đó) */
  @IsInt({ message: 'Giá trị phải là số nguyên.' })
  value!: number;

  /** Lý do đổi, 5–500 ký tự (ghi vào nhật ký) */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @Length(5, 500, { message: 'Lý do dài từ 5 đến 500 ký tự.' })
  @IsString({ message: 'Lý do phải là chữ.' })
  @IsNotEmpty({ message: 'Vui lòng nhập lý do.' })
  reason!: string;
}

/** Cấu hình chính sách của service này (ADM-01): SYSTEM sửa, FINANCE xem. */
@ApiTags('Cấu hình chính sách')
@ApiBearerAuth()
@RequirePermissions('SYSTEM', 'FINANCE')
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Mọi con số của service, kèm phiên bản đang dùng */
  @Get()
  list(): Promise<SettingView[]> {
    return this.settings.list();
  }

  /** Lịch sử các phiên bản, mới nhất trước (phiên bản 0 = mặc định trong code) */
  @Get(':key/history')
  @ApiResponse({ status: 404, description: 'NOT_FOUND: không có cấu hình này' })
  history(@Param('key') key: string): Promise<SettingVersion[]> {
    return this.settings.history(key);
  }

  /** Tạo phiên bản mới có hiệu lực ngay. Đơn đã đặt giữ con số đã chụp. Ghi nhật ký */
  @Put(':key')
  @RequirePermissions('SYSTEM')
  @ApiResponse({ status: 400, description: 'NOTHING_TO_CHANGE: giống giá trị đang dùng' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: không có cấu hình này' })
  @ApiResponse({ status: 409, description: 'SETTING_CONFLICT: admin khác vừa sửa cùng lúc' })
  update(
    @CurrentUser() admin: AuthUser,
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
  ): Promise<SettingView> {
    return this.settings.update(admin, key, dto.value, dto.reason);
  }
}
