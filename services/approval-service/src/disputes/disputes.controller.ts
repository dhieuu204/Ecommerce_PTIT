import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ParseIdPipe, RequirePermissions, type AuthUser } from '@san/nest-common';
import type { Page } from '@san/shared';
import { AdjustmentsService, type AdjustmentView } from './adjustments.service';
import { DisputesService, type DisputeView } from './disputes.service';
import {
  AdjustmentsQuery,
  ApprovalDecisionDto,
  CreateAdjustmentDto,
  DisputeDecisionDto,
  DisputesQuery,
} from './dto/disputes.dto';

/** Tranh chấp trả hàng (DIS-01). Chỉ admin có bộ quyền SUPPORT (hỗ trợ) */
@ApiTags('Admin: tranh chấp')
@ApiBearerAuth()
@RequirePermissions('SUPPORT')
@Controller('admin/disputes')
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  /** Đang chờ: quá hạn phân xử lên đầu; đã quyết: mới nhất trước */
  @Get()
  list(@Query() q: DisputesQuery): Promise<Page<DisputeView>> {
    return this.disputes.list(q);
  }

  /** Hồ sơ trả hàng, lời và ảnh của hai bên, số hoàn tối đa */
  @Get(':disputeId')
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  detail(@Param('disputeId', ParseIdPipe) id: string): Promise<DisputeView> {
    return this.disputes.detail(id);
  }

  /** Phân xử. Phát dispute.decided, ghi nhật ký */
  @Post(':disputeId/decision')
  @HttpCode(200)
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR: quyết định/số tiền không hợp lệ' })
  @ApiResponse({ status: 403, description: 'SELF_APPROVAL_FORBIDDEN: admin là người mua/chủ shop' })
  @ApiResponse({ status: 409, description: 'ALREADY_DECIDED' })
  decide(
    @CurrentUser() admin: AuthUser,
    @Param('disputeId', ParseIdPipe) id: string,
    @Body() dto: DisputeDecisionDto,
  ): Promise<DisputeView> {
    return this.disputes.decide(admin, id, dto);
  }
}

/** Điều chỉnh tiền sau giải ngân (DIS-02): lập và duyệt bởi hai admin FINANCE khác nhau */
@ApiTags('Admin: điều chỉnh tiền')
@ApiBearerAuth()
@RequirePermissions('FINANCE')
@Controller('admin/adjustments')
export class AdjustmentsController {
  constructor(private readonly adjustments: AdjustmentsService) {}

  @Get()
  list(@Query() q: AdjustmentsQuery): Promise<Page<AdjustmentView>> {
    return this.adjustments.list(q);
  }

  @Get(':adjustmentId')
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  detail(@Param('adjustmentId', ParseIdPipe) id: string): Promise<AdjustmentView> {
    return this.adjustments.detail(id);
  }

  /** Lập đề nghị cho một đơn con. Header Idempotency-Key bắt buộc. Ghi nhật ký */
  @Post()
  @HttpCode(201)
  @ApiResponse({ status: 400, description: 'IDEMPOTENCY_KEY_REQUIRED, VALIDATION_ERROR' })
  @ApiResponse({ status: 403, description: 'SELF_APPROVAL_FORBIDDEN: admin là người mua/chủ shop' })
  @ApiResponse({ status: 404, description: 'SHOP_ORDER_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'IDEMPOTENCY_KEY_REUSED' })
  create(
    @CurrentUser() admin: AuthUser,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateAdjustmentDto,
  ): Promise<AdjustmentView> {
    return this.adjustments.create(admin, dto, key);
  }

  /** Admin thứ hai duyệt/từ chối; duyệt thì payment-service thực thi. Ghi nhật ký */
  @Post(':adjustmentId/decision')
  @HttpCode(200)
  @ApiResponse({
    status: 403,
    description: 'SAME_ADMIN_FORBIDDEN: người lập tự duyệt; SELF_APPROVAL_FORBIDDEN',
  })
  @ApiResponse({ status: 409, description: 'ALREADY_DECIDED' })
  decide(
    @CurrentUser() admin: AuthUser,
    @Param('adjustmentId', ParseIdPipe) id: string,
    @Body() dto: ApprovalDecisionDto,
  ): Promise<AdjustmentView> {
    return this.adjustments.decide(admin, id, dto);
  }
}
