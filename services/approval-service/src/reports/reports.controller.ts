import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ParseIdPipe, RequirePermissions, type AuthUser } from '@san/nest-common';
import type { Page } from '@san/shared';
import { ModerationDto } from '../shop-moderation/dto/shop-moderation.dto';
import {
  AdminReportsQuery,
  CreateReportDto,
  MyReportsQuery,
  ResolveReportDto,
} from './dto/reports.dto';
import {
  ReportsService,
  type AdminReportDetail,
  type AdminReportRow,
  type ProductViolations,
  type ReportView,
} from './reports.service';

/** Người mua báo cáo sản phẩm hoặc shop vi phạm (MOD-01) */
@ApiTags('Báo cáo vi phạm')
@ApiBearerAuth()
@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** Gửi báo cáo. Header Idempotency-Key bắt buộc: gửi lại cùng key thì trả báo cáo đã tạo */
  @Post('reports')
  @HttpCode(201)
  @ApiResponse({
    status: 400,
    description: 'IDEMPOTENCY_KEY_REQUIRED, VALIDATION_ERROR, INVALID_IMAGE_KEY',
  })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: sản phẩm không đang bán / shop chưa duyệt' })
  @ApiResponse({
    status: 409,
    description: 'OWN_TARGET, ALREADY_REPORTED, IDEMPOTENCY_KEY_REUSED',
  })
  @ApiResponse({ status: 503, description: 'MARKETPLACE_SERVICE_UNAVAILABLE' })
  create(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateReportDto,
  ): Promise<ReportView> {
    return this.reports.create(user, dto, key);
  }

  /** Báo cáo của tôi và kết quả xử lý, mới nhất trước */
  @Get('me/reports')
  mine(@CurrentUser() user: AuthUser, @Query() q: MyReportsQuery): Promise<Page<ReportView>> {
    return this.reports.mine(user, q);
  }
}

/** Hàng chờ báo cáo vi phạm của admin kiểm duyệt (MOD-01) */
@ApiTags('Admin: báo cáo vi phạm')
@ApiBearerAuth()
@RequirePermissions('MODERATION')
@Controller('admin')
export class AdminReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** Lọc trạng thái (mặc định PENDING) và loại đối tượng */
  @Get('reports')
  list(@Query() q: AdminReportsQuery): Promise<Page<AdminReportRow>> {
    return this.reports.list(q);
  }

  /** Báo cáo, các báo cáo khác của cùng đối tượng, lịch sử xử lý, trạng thái hiện tại */
  @Get('reports/:reportId')
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  detail(@Param('reportId', ParseIdPipe) id: string): Promise<AdminReportDetail> {
    return this.reports.detail(id);
  }

  /** Gỡ sản phẩm, đình chỉ shop hoặc bác báo cáo; áp cho mọi báo cáo đang chờ của cùng đối tượng */
  @Post('reports/:reportId/resolve')
  @HttpCode(200)
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR: gỡ sản phẩm với báo cáo shop' })
  @ApiResponse({ status: 403, description: 'SELF_MODERATION_FORBIDDEN: admin là chủ shop' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'REPORT_ALREADY_HANDLED' })
  resolve(
    @CurrentUser() admin: AuthUser,
    @Param('reportId', ParseIdPipe) id: string,
    @Body() dto: ResolveReportDto,
  ): Promise<AdminReportDetail> {
    return this.reports.resolve(admin, id, dto);
  }

  /** Lịch sử gỡ/khôi phục của sản phẩm và trạng thái gỡ hiện tại */
  @Get('products/:productId/violations')
  productViolations(
    @Param('productId', ParseIdPipe) productId: string,
  ): Promise<ProductViolations> {
    return this.reports.productViolations(productId);
  }

  /** Khôi phục sản phẩm đã gỡ (marketplace đưa về ẩn). Phát product_moderation.decided, ghi nhật ký */
  @Post('products/:productId/restore')
  @HttpCode(200)
  @ApiResponse({ status: 403, description: 'SELF_MODERATION_FORBIDDEN: admin là chủ shop' })
  @ApiResponse({ status: 409, description: 'NOT_REMOVED: sản phẩm không bị gỡ' })
  restore(
    @CurrentUser() admin: AuthUser,
    @Param('productId', ParseIdPipe) productId: string,
    @Body() dto: ModerationDto,
  ): Promise<ProductViolations> {
    return this.reports.restoreProduct(admin, productId, dto.reason);
  }
}
