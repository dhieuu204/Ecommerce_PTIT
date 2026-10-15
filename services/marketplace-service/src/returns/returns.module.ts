import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { ReturnJobs } from './return.jobs';
import { ReturnLifecycle } from './return-lifecycle.service';
import {
  AdminReturnsController,
  BuyerReturnsController,
  ReturnImagesController,
  SellerReturnsController,
} from './returns.controller';
import { ReturnsService } from './returns.service';

/**
 * Hậu mãi: yêu cầu trả hàng, vận đơn trả, khiếu nại (P5: RET-01..04, DIS-01). Dùng OrderLifecycle và
 * ShipmentsService của OrdersModule (module Global).
 */
@Module({
  imports: [UploadsModule],
  controllers: [
    BuyerReturnsController,
    SellerReturnsController,
    AdminReturnsController,
    ReturnImagesController,
  ],
  providers: [ReturnLifecycle, ReturnsService, ReturnJobs],
})
export class ReturnsModule {}
