import { Module } from '@nestjs/common';
import { ShopApprovalEvents } from './shop-approval.events';
import { ShopApprovalsController } from './shop-approvals.controller';
import { ShopApprovalsService } from './shop-approvals.service';

/** Duyệt shop (SHP-02): nhận hồ sơ qua sự kiện, admin duyệt/từ chối, phát quyết định */
@Module({
  controllers: [ShopApprovalsController],
  providers: [ShopApprovalsService, ShopApprovalEvents],
})
export class ShopApprovalsModule {}
