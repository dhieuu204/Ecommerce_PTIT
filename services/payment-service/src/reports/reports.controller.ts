import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions, type AuthUser } from '@san/nest-common';
import { ReportRangeQuery } from './dto/report-range.query';
import {
  FinanceReportsService,
  type AdminFinanceReport,
  type SellerFinanceReport,
} from './reports.service';

const rangeErrors = ApiResponse({
  status: 400,
  description: 'INVALID_RANGE: from > to, ngày không có thật, hoặc khoảng dài quá 366 ngày',
});

/** Báo cáo tài chính của shop người gọi (RPT-02), nhận ra shop qua ví như các API ví seller */
@ApiTags('Kênh người bán: báo cáo tài chính')
@ApiBearerAuth()
@Controller('shops/me/reports')
export class SellerFinanceReportsController {
  constructor(private readonly reports: FinanceReportsService) {}

  /**
   * Giá trị đơn, khoản hoàn, phí sàn, tiền seller nhận, tiền chuyển sang khả dụng, đã rút trong khoảng;
   * số dư 3 ngăn hiện tại; theo ngày: tiền seller nhận và khoản hoàn. Chưa có ví → mọi số bằng 0
   */
  @Get('finance')
  @rangeErrors
  finance(
    @CurrentUser() user: AuthUser,
    @Query() q: ReportRangeQuery,
  ): Promise<SellerFinanceReport> {
    return this.reports.seller(user, q);
  }
}

/** Báo cáo tài chính của sàn (RPT-02): bộ quyền Tài chính */
@ApiTags('Admin: báo cáo tài chính')
@ApiBearerAuth()
@RequirePermissions('FINANCE')
@Controller('admin/reports')
export class AdminFinanceReportsController {
  constructor(private readonly reports: FinanceReportsService) {}

  /**
   * Giá trị đơn, tiền thực thu (VNPay + COD đã đối soát), khoản hoàn, trợ giá voucher sàn, phí sàn, phải
   * trả seller (số dư hiện tại), đã chi cho seller; theo ngày: thực thu, khoản hoàn, phí sàn
   */
  @Get('finance')
  @rangeErrors
  finance(@Query() q: ReportRangeQuery): Promise<AdminFinanceReport> {
    return this.reports.admin(q);
  }
}
