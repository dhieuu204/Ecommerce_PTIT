import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions, type AuthUser } from '@san/nest-common';
import { ReportRangeQuery } from './dto/report-range.query';
import {
  ReportsService,
  type AdminOperationsReport,
  type ShopOperationsReport,
} from './reports.service';

const rangeErrors = ApiResponse({
  status: 400,
  description: 'INVALID_RANGE: from > to, ngày không có thật, hoặc khoảng dài quá 366 ngày',
});

/** Báo cáo vận hành của shop mình (RPT-01) */
@ApiTags('Kênh người bán: báo cáo')
@ApiBearerAuth()
@Controller('shops/me/reports')
export class SellerReportsController {
  constructor(private readonly reports: ReportsService) {}

  /**
   * Số đơn, giá trị đặt hàng, đơn hoàn tất và doanh số, tỉ lệ hủy, tỉ lệ trả hàng (phần nghìn), số theo
   * ngày, 10 sản phẩm bán chạy, hiệu quả voucher shop. Khoảng ngày theo giờ Việt Nam, mặc định 30 ngày
   */
  @Get('operations')
  @rangeErrors
  @ApiResponse({ status: 409, description: 'SHOP_NOT_ACTIVE: chưa có shop được duyệt' })
  operations(
    @CurrentUser() user: AuthUser,
    @Query() q: ReportRangeQuery,
  ): Promise<ShopOperationsReport> {
    return this.reports.shopOperations(user.id, q);
  }
}

/** Báo cáo vận hành của cả sàn (RPT-01): bộ quyền Hệ thống hoặc Tài chính */
@ApiTags('Admin: báo cáo')
@ApiBearerAuth()
@RequirePermissions('SYSTEM', 'FINANCE')
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** Như báo cáo của shop cho cả sàn, thêm số shop có đơn, 10 shop hàng đầu, voucher sàn */
  @Get('operations')
  @rangeErrors
  operations(@Query() q: ReportRangeQuery): Promise<AdminOperationsReport> {
    return this.reports.adminOperations(q);
  }
}
