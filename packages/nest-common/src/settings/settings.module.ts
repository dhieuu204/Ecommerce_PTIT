import { DynamicModule, Global, Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SETTING_DEFINITIONS, SettingsService, type SettingDefinition } from './settings.service';

/**
 * Cấu hình có phiên bản (bảng `settings` của service) + 3 API `/admin/settings`.
 * Import một lần trong AppModule với danh sách con số của service:
 *
 *   SettingsModule.forRoot(MARKET_SETTINGS)
 *
 * Sau đó inject SettingsService ở mọi module để đọc giá trị đang dùng.
 */
@Global()
@Module({})
export class SettingsModule {
  static forRoot(definitions: SettingDefinition[]): DynamicModule {
    return {
      module: SettingsModule,
      controllers: [SettingsController],
      providers: [{ provide: SETTING_DEFINITIONS, useValue: definitions }, SettingsService],
      exports: [SettingsService],
    };
  }
}
