import { Module } from '@nestjs/common';
import { ShopModerationController } from './shop-moderation.controller';
import { ShopModerationService } from './shop-moderation.service';

/** Đình chỉ và khôi phục shop (SHP-04): lưu quyết định, phát shop_suspension.decided */
@Module({
  controllers: [ShopModerationController],
  providers: [ShopModerationService],
  // Báo cáo vi phạm (MOD-01) dùng lại việc đình chỉ shop
  exports: [ShopModerationService],
})
export class ShopModerationModule {}
