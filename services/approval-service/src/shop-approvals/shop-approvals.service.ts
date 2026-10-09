import { Injectable } from '@nestjs/common';
import { AppError, EventBus, skipTake, toPage, writeAudit, type AuthUser } from '@san/nest-common';
import {
  SHOP_APPLICATION_DECIDED,
  type Page,
  type ShopApplicationData,
  type ShopApplicationSubmittedPayload,
} from '@san/shared';
import type { Prisma, ShopApproval } from '../../generated/prisma';
import { PrismaService } from '../prisma.service';
import type { DecisionDto, ListShopApprovalsQuery } from './dto/shop-approvals.dto';

/** Một dòng trong danh sách hồ sơ chờ duyệt */
export interface ShopApprovalRow {
  id: string;
  shopId: string;
  version: number;
  type: ShopApproval['type'];
  status: ShopApproval['status'];
  /** Tên shop trong hồ sơ */
  shopName: string;
  ownerName: string;
  ownerEmail: string;
  submittedAt: Date;
  decidedAt: Date | null;
}

/** Một phiên bản hồ sơ trong lịch sử của shop */
export interface ShopApprovalVersion {
  id: string;
  version: number;
  type: ShopApproval['type'];
  status: ShopApproval['status'];
  submittedAt: Date;
  decidedAt: Date | null;
  reason: string | null;
}

/** Chi tiết hồ sơ cho admin */
export interface ShopApprovalDetail extends ShopApprovalRow {
  ownerId: string;
  /** Hồ sơ đầy đủ nhận trong sự kiện (với CHANGE: thông tin hiện tại đã gộp phần muốn đổi) */
  data: ShopApplicationData;
  /** Chỉ với CHANGE: các mục muốn đổi và giá trị cũ */
  change: ShopApplicationSubmittedPayload['change'] | null;
  reason: string | null;
  /** Admin đã quyết */
  decidedBy: string | null;
  decidedByName: string | null;
  /** Mọi phiên bản hồ sơ của shop này, mới nhất trước */
  history: ShopApprovalVersion[];
}

function row(a: ShopApproval): ShopApprovalRow {
  return {
    id: a.id,
    shopId: a.shopId,
    version: a.version,
    type: a.type,
    status: a.status,
    shopName: (a.data as unknown as ShopApplicationData).name,
    ownerName: a.ownerName,
    ownerEmail: a.ownerEmail,
    submittedAt: a.submittedAt,
    decidedAt: a.decidedAt,
  };
}

/** Admin duyệt hồ sơ shop (SHP-02). Chỉ lưu quyết định; marketplace-service tự áp dụng khi nhận sự kiện. */
@Injectable()
export class ShopApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBus,
  ) {}

  /** Danh sách, hồ sơ nộp sớm nhất lên đầu */
  async list(q: ListShopApprovalsQuery): Promise<Page<ShopApprovalRow>> {
    const where: Prisma.ShopApprovalWhereInput = { status: q.status, type: q.type };
    if (q.q) {
      // Tên shop nằm trong cột data (JSON) nên tìm bằng SQL; % và _ người dùng gõ được coi là chữ thường
      const like = `%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const found = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM shop_approvals
        WHERE data->>'name' ILIKE ${like} OR owner_name ILIKE ${like} OR owner_email ILIKE ${like}`;
      where.id = { in: found.map((r) => r.id) };
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.shopApproval.findMany({
        where,
        orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
        ...skipTake(q),
      }),
      this.prisma.shopApproval.count({ where }),
    ]);
    return toPage(items.map(row), total, q);
  }

  async detail(approvalId: string): Promise<ShopApprovalDetail> {
    const a = await this.find(approvalId);
    const history = await this.prisma.shopApproval.findMany({
      where: { shopId: a.shopId },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        type: true,
        status: true,
        submittedAt: true,
        decidedAt: true,
        reason: true,
      },
    });
    return {
      ...row(a),
      ownerId: a.ownerId,
      data: a.data as unknown as ShopApplicationData,
      change: (a.change as ShopApplicationSubmittedPayload['change'] | null) ?? null,
      reason: a.reason,
      decidedBy: a.decidedBy,
      decidedByName: a.decidedByName,
      history,
    };
  }

  /**
   * Duyệt hoặc từ chối một hồ sơ đang chờ. Admin là chủ shop thì không được tự quyết.
   * Đổi trạng thái bằng một lệnh "chỉ khi còn PENDING", nên hai admin bấm cùng lúc thì chỉ một người quyết được.
   * Cùng giao dịch: phát shop_application.decided cho marketplace-service và ghi nhật ký admin.
   */
  async decide(admin: AuthUser, approvalId: string, dto: DecisionDto): Promise<ShopApprovalDetail> {
    const a = await this.find(approvalId);
    if (a.ownerId === admin.id) {
      throw new AppError(
        403,
        'SELF_APPROVAL_FORBIDDEN',
        'Bạn không thể tự duyệt hồ sơ shop của chính mình.',
      );
    }
    assertPending(a.status);

    const status = dto.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const reason = dto.reason ?? null;
    const decidedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.shopApproval.updateMany({
        where: { id: approvalId, status: 'PENDING' },
        data: { status, reason, decidedBy: admin.id, decidedByName: admin.name, decidedAt },
      });
      if (count === 0) {
        // Người khác vừa quyết, hoặc shop vừa nộp bản mới: báo đúng lý do
        const current = await tx.shopApproval.findUniqueOrThrow({ where: { id: approvalId } });
        assertPending(current.status);
        throw new AppError(409, 'ALREADY_DECIDED', 'Hồ sơ này đã được quyết định.');
      }
      await this.events.publish(tx, SHOP_APPLICATION_DECIDED, {
        shopId: a.shopId,
        version: a.version,
        type: a.type,
        decision: status,
        reason,
        decidedBy: { userId: admin.id, name: admin.name },
        decidedAt: decidedAt.toISOString(),
      });
      await writeAudit(tx, {
        actor: admin,
        action: status === 'APPROVED' ? 'APPROVE_SHOP' : 'REJECT_SHOP',
        targetType: 'SHOP',
        targetId: a.shopId,
        reason,
        before: { status: 'PENDING' },
        after: { status, version: a.version },
      });
    });
    return this.detail(approvalId);
  }

  private async find(approvalId: string): Promise<ShopApproval> {
    const a = await this.prisma.shopApproval.findUnique({ where: { id: approvalId } });
    if (!a) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy hồ sơ.');
    return a;
  }
}

/** Chỉ hồ sơ PENDING mới quyết được; còn lại báo 409 với mã tương ứng */
function assertPending(status: ShopApproval['status']): void {
  if (status === 'REPLACED') {
    throw new AppError(
      409,
      'APPLICATION_REPLACED',
      'Shop đã nộp hồ sơ mới hơn. Vui lòng xét hồ sơ mới nhất.',
    );
  }
  if (status !== 'PENDING') {
    throw new AppError(409, 'ALREADY_DECIDED', 'Hồ sơ này đã được quyết định.');
  }
}
