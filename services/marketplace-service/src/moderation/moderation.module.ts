import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { ProductModerationEvents } from './product-moderation.events';
import { ReportImagesController } from './report-images.controller';

/**
 * Phần marketplace của báo cáo vi phạm (MOD-01): ảnh bằng chứng (bucket riêng tư) và áp quyết định
 * gỡ/khôi phục sản phẩm nhận từ approval-service. Báo cáo và quyết định nằm ở approval-service.
 */
@Module({
  imports: [UploadsModule],
  controllers: [ReportImagesController],
  providers: [ProductModerationEvents],
})
export class ModerationModule {}
