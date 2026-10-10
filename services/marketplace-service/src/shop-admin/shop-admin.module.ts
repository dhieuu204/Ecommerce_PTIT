import { Module } from '@nestjs/common';
import { ShopAdminController } from './shop-admin.controller';
import { ShopAdminService } from './shop-admin.service';
import { ShopSuspensionEvents } from './shop-suspension.events';

/** Admin xem shop; nhận quyết định đình chỉ/khôi phục từ approval-service (SHP-04) */
@Module({
  controllers: [ShopAdminController],
  providers: [ShopAdminService, ShopSuspensionEvents],
})
export class ShopAdminModule {}
