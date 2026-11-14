import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ParseIdPipe, RequirePermissions, type AuthUser } from '@san/nest-common';
import type { Page } from '@san/shared';
import { DecisionDto } from '../shop-approvals/dto/shop-approvals.dto';
import {
  AffiliateApprovalsService,
  type AffiliateApprovalDetail,
  type AffiliateApprovalRow,
} from './affiliate-approvals.service';
import { AffiliateSuspensionDto, ListAffiliateApprovalsQuery } from './dto/affiliate-approvals.dto';

/** Duyệt, khóa, mở cộng tác viên (P7, AFF-01). Chỉ admin có bộ quyền MODERATION */
@ApiTags('Admin: cộng tác viên')
@ApiBearerAuth()
@RequirePermissions('MODERATION')
@Controller('admin')
export class AffiliateApprovalsController {
  constructor(private readonly approvals: AffiliateApprovalsService) {}

  /** Hồ sơ CTV, mặc định đang chờ; nộp sớm nhất lên đầu */
  @Get('affiliate-approvals')
  list(@Query() q: ListAffiliateApprovalsQuery): Promise<Page<AffiliateApprovalRow>> {
    return this.approvals.list(q);
  }

  /** Hồ sơ đầy đủ và lịch sử duyệt, khóa, mở của CTV */
  @Get('affiliate-approvals/:approvalId')
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  detail(@Param('approvalId', ParseIdPipe) id: string): Promise<AffiliateApprovalDetail> {
    return this.approvals.detail(id);
  }

  /** Duyệt hoặc từ chối hồ sơ (từ chối bắt buộc lý do). Phát affiliate.decided, ghi nhật ký */
  @Post('affiliate-approvals/:approvalId/decision')
  @HttpCode(200)
  @ApiResponse({ status: 403, description: 'SELF_APPROVAL_FORBIDDEN: admin là chính CTV' })
  @ApiResponse({ status: 409, description: 'ALREADY_DECIDED, APPLICATION_REPLACED' })
  decide(
    @CurrentUser() admin: AuthUser,
    @Param('approvalId', ParseIdPipe) id: string,
    @Body() dto: DecisionDto,
  ): Promise<AffiliateApprovalDetail> {
    return this.approvals.decide(admin, id, dto);
  }

  /** Khóa hoặc mở CTV (lý do 10–500 ký tự). Phát affiliate.decided, ghi nhật ký */
  @Post('affiliates/:affiliateId/suspension')
  @HttpCode(200)
  @ApiResponse({ status: 403, description: 'SELF_APPROVAL_FORBIDDEN' })
  @ApiResponse({
    status: 409,
    description: 'AFFILIATE_NOT_APPROVED: chưa được duyệt; AFFILIATE_ALREADY_IN_STATE',
  })
  suspension(
    @CurrentUser() admin: AuthUser,
    @Param('affiliateId', ParseIdPipe) affiliateId: string,
    @Body() dto: AffiliateSuspensionDto,
  ): Promise<AffiliateApprovalDetail> {
    return this.approvals.suspension(admin, affiliateId, dto);
  }
}
