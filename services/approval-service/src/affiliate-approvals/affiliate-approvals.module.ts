import { Module } from '@nestjs/common';
import { AffiliateApprovalsController } from './affiliate-approvals.controller';
import { AffiliateApprovalsService } from './affiliate-approvals.service';

/** Cộng tác viên (P7, AFF-01): nhận hồ sơ qua sự kiện, admin duyệt/từ chối/khóa/mở, phát quyết định */
@Module({
  controllers: [AffiliateApprovalsController],
  providers: [AffiliateApprovalsService],
})
export class AffiliateApprovalsModule {}
