import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  PageQuery,
  ParseIdPipe,
  RequirePermissions,
  type AuthUser,
} from '@san/nest-common';
import type { Page } from '@san/shared';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrderChecksService, type OrderCheckView } from './order-checks.service';

const STATUSES = ['PENDING', 'PASSED', 'REJECTED', 'TIMEOUT', 'CANCELLED'] as const;

export class OrderChecksQuery extends PageQuery {
  /** Mặc định PENDING (đơn đang chờ duyệt) */
  @ApiPropertyOptional({ enum: STATUSES, default: 'PENDING' })
  @IsOptional()
  @IsIn(STATUSES, { message: 'Trạng thái không hợp lệ.' })
  status?: (typeof STATUSES)[number];
}

export class OrderCheckDecisionDto {
  @IsIn(['APPROVE', 'REJECT'], { message: 'Quyết định phải là APPROVE hoặc REJECT.' })
  decision!: 'APPROVE' | 'REJECT';

  /** Bắt buộc khi từ chối (buyer sẽ đọc), tối đa 500 ký tự */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Lý do phải là chữ.' })
  @MaxLength(500, { message: 'Lý do tối đa 500 ký tự.' })
  reason?: string;
}

/** Kiểm tra đơn lớn (RSK-01). Chỉ admin có bộ quyền FINANCE (tài chính/rủi ro) */
@ApiTags('Admin: kiểm tra đơn')
@ApiBearerAuth()
@RequirePermissions('FINANCE')
@Controller('admin/order-checks')
export class OrderChecksController {
  constructor(private readonly checks: OrderChecksService) {}

  /** Đơn theo trạng thái; đang chờ thì chờ lâu nhất lên đầu, kèm hạn tự hủy */
  @Get()
  list(@Query() q: OrderChecksQuery): Promise<Page<OrderCheckView>> {
    return this.checks.list(q);
  }

  /** Đơn (shop, dòng hàng), luật đã chạm kèm ngưỡng, lịch sử mua của buyer */
  @Get(':checkId')
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  detail(@Param('checkId', ParseIdPipe) id: string): Promise<OrderCheckView> {
    return this.checks.detail(id);
  }

  /** Duyệt hoặc từ chối. Phát order_check.decided, ghi nhật ký */
  @Post(':checkId/decision')
  @HttpCode(200)
  @ApiResponse({ status: 403, description: 'SELF_APPROVAL_FORBIDDEN: admin là người mua/chủ shop' })
  @ApiResponse({ status: 409, description: 'ALREADY_DECIDED' })
  decide(
    @CurrentUser() admin: AuthUser,
    @Param('checkId', ParseIdPipe) id: string,
    @Body() dto: OrderCheckDecisionDto,
  ): Promise<OrderCheckView> {
    return this.checks.decide(admin, id, dto.decision, dto.reason);
  }
}
