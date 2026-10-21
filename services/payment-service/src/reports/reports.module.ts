import { Module } from '@nestjs/common';
import {
  AdminFinanceReportsController,
  SellerFinanceReportsController,
} from './reports.controller';
import { FinanceReportsService } from './reports.service';

/** Báo cáo tài chính của shop và của sàn (RPT-02) */
@Module({
  controllers: [SellerFinanceReportsController, AdminFinanceReportsController],
  providers: [FinanceReportsService],
})
export class ReportsModule {}
