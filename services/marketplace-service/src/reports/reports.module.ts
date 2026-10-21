import { Module } from '@nestjs/common';
import { AdminReportsController, SellerReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/** Báo cáo vận hành của shop và của sàn (RPT-01) */
@Module({
  controllers: [SellerReportsController, AdminReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
