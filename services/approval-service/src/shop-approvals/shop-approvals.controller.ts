import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ParseIdPipe, RequirePermissions, type AuthUser } from '@san/nest-common';
import type { Page } from '@san/shared';
import { DecisionDto, ListShopApprovalsQuery } from './dto/shop-approvals.dto';
import {
  ShopApprovalsService,
  type ShopApprovalDetail,
  type ShopApprovalRow,
} from './shop-approvals.service';

/** Duyệt hồ sơ mở shop và yêu cầu đổi thông tin shop (SHP-02). Chỉ admin có bộ quyền MODERATION. */
@ApiTags('Admin: duyệt shop')
@ApiBearerAuth()
@RequirePermissions('MODERATION')
@Controller('admin/shop-approvals')
export class ShopApprovalsController {
  constructor(private readonly approvals: ShopApprovalsService) {}

  /** Danh sách hồ sơ, nộp sớm nhất lên đầu; lọc theo trạng thái, loại hồ sơ */
  @Get()
  list(@Query() q: ListShopApprovalsQuery): Promise<Page<ShopApprovalRow>> {
    return this.approvals.list(q);
  }

  /** Hồ sơ đầy đủ, phần muốn đổi (với CHANGE) và lịch sử các phiên bản của shop */
  @Get(':approvalId')
  detail(@Param('approvalId', ParseIdPipe) approvalId: string): Promise<ShopApprovalDetail> {
    return this.approvals.detail(approvalId);
  }

  /** Duyệt hoặc từ chối (từ chối bắt buộc lý do). Phát shop_application.decided, ghi nhật ký */
  @Post(':approvalId/decision')
  @HttpCode(200)
  @ApiResponse({
    status: 403,
    description: 'SELF_APPROVAL_FORBIDDEN: admin là chủ shop của hồ sơ này',
  })
  @ApiResponse({
    status: 409,
    description:
      'ALREADY_DECIDED: hồ sơ đã được quyết; APPLICATION_REPLACED: shop đã nộp bản mới hơn',
  })
  decide(
    @CurrentUser() admin: AuthUser,
    @Param('approvalId', ParseIdPipe) approvalId: string,
    @Body() dto: DecisionDto,
  ): Promise<ShopApprovalDetail> {
    return this.approvals.decide(admin, approvalId, dto);
  }
}
