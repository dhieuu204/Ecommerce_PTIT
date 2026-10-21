import { Module } from '@nestjs/common';
import { MarketplaceClient } from '../clients/marketplace.client';
import { ShopModerationModule } from '../shop-moderation/shop-moderation.module';
import { AdminReportsController, ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/** Báo cáo vi phạm của người mua, gỡ/khôi phục sản phẩm (MOD-01): lưu báo cáo và quyết định */
@Module({
  imports: [ShopModerationModule],
  controllers: [ReportsController, AdminReportsController],
  providers: [ReportsService, MarketplaceClient],
})
export class ReportsModule {}
