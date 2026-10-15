import { Injectable, Logger } from '@nestjs/common';
import {
  AppError,
  EventBus,
  skipTake,
  toPage,
  writeAudit,
  type AuthUser,
  type PageQuery,
} from '@san/nest-common';
import {
  WITHDRAWAL_APPROVAL_DECIDED,
  type Page,
  type WithdrawalCancelledPayload,
  type WithdrawalRequestedPayload,
} from '@san/shared';
import { PrismaService } from '../prisma.service';
import type { Prisma, WithdrawalApproval, WithdrawalApprovalStatus } from '../../generated/prisma';

type Tx = Prisma.TransactionClient;

export interface WithdrawalApprovalView {
  id: string;
  withdrawalId: string;
  shop: { id: string; name: string };
  owner: { id: string; name: string };
  amount: number;
  /** Chỉ 4 số cuối */
  bankAccount: WithdrawalRequestedPayload['bankAccount'];
  /** Số dư ví lúc yêu cầu (sau khi khóa) */
  wallet: WithdrawalRequestedPayload['wallet'];
  status: WithdrawalApprovalStatus;
  reason: string | null;
  decidedByName: string | null;
  decidedAt: Date | null;
  requestedAt: Date;
}

/**
 * Duyệt rút tiền (FIN-05, STATE-02 D2/D4). Mọi yêu cầu rút đều cần admin tài chính duyệt; approval-service
 * chỉ lưu quyết định, payment-service kiểm yêu cầu còn chờ rồi mới áp (khóa/mở khóa tiền ở payment).
 * Admin là chủ shop thì không được tự duyệt.
 */
@Injectable()
export class WithdrawalApprovalsService {
  private readonly logger = new Logger(WithdrawalApprovalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBus,
  ) {}

  /** Nhận yêu cầu rút (withdrawal.requested). Nhận trùng thì bỏ qua */
  async onRequested(p: WithdrawalRequestedPayload, tx: Tx): Promise<void> {
    await tx.withdrawalApproval.createMany({
      data: [
        {
          withdrawalId: p.withdrawalId,
          shopId: p.shopId,
          shopName: p.shopName,
          ownerId: p.owner.userId,
          ownerName: p.owner.name,
          amount: p.amount,
          bankAccount: p.bankAccount as unknown as Prisma.InputJsonValue,
          wallet: p.wallet as unknown as Prisma.InputJsonValue,
          requestedAt: new Date(p.requestedAt),
        },
      ],
      skipDuplicates: true,
    });
  }

  /** Seller hủy trước khi duyệt: admin không phải duyệt nữa. Đã quyết thì để nguyên */
  async onCancelled(p: WithdrawalCancelledPayload, tx: Tx): Promise<void> {
    const found = await tx.withdrawalApproval.findUnique({
      where: { withdrawalId: p.withdrawalId },
    });
    // Hủy tới trước yêu cầu (sai thứ tự): thử lại sau
    if (!found) throw new Error(`Chưa có hồ sơ duyệt cho yêu cầu rút ${p.withdrawalId}`);
    await tx.withdrawalApproval.updateMany({
      where: { withdrawalId: p.withdrawalId, status: 'PENDING' },
      data: {
        status: 'CANCELLED',
        reason: 'Seller hủy yêu cầu',
        decidedAt: new Date(p.cancelledAt),
      },
    });
  }

  async list(
    q: PageQuery & { status?: WithdrawalApprovalStatus },
  ): Promise<Page<WithdrawalApprovalView>> {
    const status = q.status ?? 'PENDING';
    const where: Prisma.WithdrawalApprovalWhereInput = { status };
    const [rows, total] = await Promise.all([
      this.prisma.withdrawalApproval.findMany({
        where,
        orderBy:
          status === 'PENDING'
            ? [{ requestedAt: 'asc' }, { id: 'asc' }]
            : [{ decidedAt: 'desc' }, { id: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.withdrawalApproval.count({ where }),
    ]);
    return toPage(rows.map(view), total, q);
  }

  async detail(id: string): Promise<WithdrawalApprovalView> {
    const a = await this.prisma.withdrawalApproval.findUnique({ where: { id } });
    if (!a) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy hồ sơ duyệt rút tiền.');
    return view(a);
  }

  /** Duyệt/từ chối (lý do bắt buộc khi từ chối). Phát withdrawal_approval.decided, ghi nhật ký */
  async decide(
    admin: AuthUser,
    id: string,
    decision: 'APPROVE' | 'REJECT',
    reason: string | undefined,
  ): Promise<WithdrawalApprovalView> {
    if (decision === 'REJECT' && !reason?.trim()) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu chưa hợp lệ.', {
        fields: { reason: 'Vui lòng nhập lý do từ chối.' },
      });
    }
    await this.prisma.$transaction(async (tx) => {
      const a = await tx.withdrawalApproval.findUnique({ where: { id } });
      if (!a) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy hồ sơ duyệt rút tiền.');
      if (a.ownerId === admin.id) {
        throw new AppError(
          403,
          'SELF_APPROVAL_FORBIDDEN',
          'Bạn là chủ shop này nên không được tự duyệt yêu cầu rút tiền.',
        );
      }
      const approve = decision === 'APPROVE';
      const now = new Date();
      const { count } = await tx.withdrawalApproval.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: approve ? 'APPROVED' : 'REJECTED',
          reason: reason?.trim() || null,
          decidedBy: admin.id,
          decidedByName: admin.name,
          decidedAt: now,
        },
      });
      if (count === 0) {
        throw new AppError(409, 'ALREADY_DECIDED', 'Yêu cầu này đã được xử lý hoặc seller đã hủy.');
      }
      await writeAudit(tx, {
        actor: admin,
        action: approve ? 'APPROVE_WITHDRAWAL' : 'REJECT_WITHDRAWAL',
        targetType: 'WITHDRAWAL',
        targetId: a.withdrawalId,
        reason: reason ?? null,
        before: { status: 'PENDING' },
        after: { status: approve ? 'APPROVED' : 'REJECTED', amount: a.amount },
      });
      await this.events.publish(tx, WITHDRAWAL_APPROVAL_DECIDED, {
        withdrawalId: a.withdrawalId,
        approvalId: a.id,
        decision: approve ? 'APPROVED' : 'REJECTED',
        reason: reason?.trim() || null,
        decidedBy: { userId: admin.id, name: admin.name },
        decidedAt: now.toISOString(),
      });
    });
    this.logger.log(`Yêu cầu rút ${id}: ${decision} bởi ${admin.name}.`);
    return this.detail(id);
  }
}

function view(a: WithdrawalApproval): WithdrawalApprovalView {
  return {
    id: a.id,
    withdrawalId: a.withdrawalId,
    shop: { id: a.shopId, name: a.shopName },
    owner: { id: a.ownerId, name: a.ownerName },
    amount: a.amount,
    bankAccount: a.bankAccount as unknown as WithdrawalApprovalView['bankAccount'],
    wallet: a.wallet as unknown as WithdrawalApprovalView['wallet'],
    status: a.status,
    reason: a.reason,
    decidedByName: a.decidedByName,
    decidedAt: a.decidedAt,
    requestedAt: a.requestedAt,
  };
}
