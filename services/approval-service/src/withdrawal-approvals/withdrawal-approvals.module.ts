import {
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Module,
  Param,
  Post,
  Query,
  type OnModuleInit,
} from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  EventBus,
  PageQuery,
  ParseIdPipe,
  RequirePermissions,
  type AuthUser,
} from '@san/nest-common';
import { WITHDRAWAL_CANCELLED, WITHDRAWAL_REQUESTED, type Page } from '@san/shared';
import { IsIn, IsOptional } from 'class-validator';
import type { Prisma } from '../../generated/prisma';
import { ApprovalDecisionDto } from '../disputes/dto/disputes.dto';
import {
  WithdrawalApprovalsService,
  type WithdrawalApprovalView,
} from './withdrawal-approvals.service';

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;

export class WithdrawalApprovalsQuery extends PageQuery {
  /** Mặc định PENDING (chờ duyệt) */
  @ApiPropertyOptional({ enum: STATUSES, default: 'PENDING' })
  @IsOptional()
  @IsIn(STATUSES, { message: 'Trạng thái không hợp lệ.' })
  status?: (typeof STATUSES)[number];
}

/** Duyệt rút tiền (FIN-05). Chỉ admin có bộ quyền FINANCE */
@ApiTags('Admin: duyệt rút tiền')
@ApiBearerAuth()
@RequirePermissions('FINANCE')
@Controller('admin/withdrawal-approvals')
export class WithdrawalApprovalsController {
  constructor(private readonly approvals: WithdrawalApprovalsService) {}

  /** Đang chờ: chờ lâu nhất lên đầu */
  @Get()
  list(@Query() q: WithdrawalApprovalsQuery): Promise<Page<WithdrawalApprovalView>> {
    return this.approvals.list(q);
  }

  /** Yêu cầu, chủ shop, tài khoản nhận (4 số cuối), ví lúc yêu cầu */
  @Get(':approvalId')
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  detail(@Param('approvalId', ParseIdPipe) id: string): Promise<WithdrawalApprovalView> {
    return this.approvals.detail(id);
  }

  /** Duyệt hoặc từ chối. Phát withdrawal_approval.decided, ghi nhật ký */
  @Post(':approvalId/decision')
  @HttpCode(200)
  @ApiResponse({ status: 403, description: 'SELF_APPROVAL_FORBIDDEN: admin là chủ shop' })
  @ApiResponse({ status: 409, description: 'ALREADY_DECIDED: đã quyết hoặc seller đã hủy' })
  decide(
    @CurrentUser() admin: AuthUser,
    @Param('approvalId', ParseIdPipe) id: string,
    @Body() dto: ApprovalDecisionDto,
  ): Promise<WithdrawalApprovalView> {
    return this.approvals.decide(admin, id, dto.decision, dto.reason);
  }
}

/** Nhận yêu cầu rút và lệnh hủy từ payment-service */
@Injectable()
export class WithdrawalApprovalEvents implements OnModuleInit {
  constructor(
    private readonly events: EventBus,
    private readonly approvals: WithdrawalApprovalsService,
  ) {}

  onModuleInit(): void {
    this.events.subscribe(WITHDRAWAL_REQUESTED, (p, tx: Prisma.TransactionClient) =>
      this.approvals.onRequested(p, tx),
    );
    this.events.subscribe(WITHDRAWAL_CANCELLED, (p, tx: Prisma.TransactionClient) =>
      this.approvals.onCancelled(p, tx),
    );
  }
}

/** Duyệt rút tiền (FIN-05) */
@Module({
  controllers: [WithdrawalApprovalsController],
  providers: [WithdrawalApprovalsService, WithdrawalApprovalEvents],
})
export class WithdrawalApprovalsModule {}
