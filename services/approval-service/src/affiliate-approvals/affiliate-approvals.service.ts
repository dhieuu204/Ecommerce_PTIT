import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AppError, EventBus, skipTake, toPage, writeAudit, type AuthUser } from '@san/nest-common';
import {
  AFFILIATE_APPLICATION_SUBMITTED,
  AFFILIATE_DECIDED,
  type AffiliateApplicationData,
  type AffiliateApplicationSubmittedPayload,
  type Page,
} from '@san/shared';
import type { AffiliateApproval, Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma.service';
import type { DecisionDto } from '../shop-approvals/dto/shop-approvals.dto';
import type {
  AffiliateSuspensionDto,
  ListAffiliateApprovalsQuery,
} from './dto/affiliate-approvals.dto';

type Tx = Prisma.TransactionClient;

export interface AffiliateApprovalRow {
  id: string;
  affiliateId: string;
  type: AffiliateApproval['type'];
  version: number;
  status: AffiliateApproval['status'];
  displayName: string;
  userName: string;
  userEmail: string;
  submittedAt: Date;
  decidedAt: Date | null;
}

export interface AffiliateApprovalDetail extends AffiliateApprovalRow {
  userId: string;
  /** Hồ sơ nhận trong sự kiện (tài khoản ngân hàng chỉ 4 số cuối) */
  data: AffiliateApplicationData;
  reason: string | null;
  decidedByName: string | null;
  /** Mọi hồ sơ và quyết định về CTV này, mới nhất trước */
  history: Array<{
    id: string;
    type: AffiliateApproval['type'];
    version: number;
    status: AffiliateApproval['status'];
    reason: string | null;
    decidedByName: string | null;
    submittedAt: Date;
    decidedAt: Date | null;
  }>;
}

/**
 * Duyệt, khóa, mở cộng tác viên (P7, AFF-01). Chỉ lưu quyết định rồi phát `affiliate.decided`;
 * marketplace-service tự áp dụng. Admin là chính CTV thì không được tự quyết.
 */
@Injectable()
export class AffiliateApprovalsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBus,
  ) {}

  onModuleInit(): void {
    this.events.subscribe(AFFILIATE_APPLICATION_SUBMITTED, (p, tx: Tx) => this.onSubmitted(p, tx));
  }

  /**
   * Lưu một phiên bản hồ sơ. Đã lưu rồi → bỏ qua; đã có phiên bản mới hơn → lưu là REPLACED; còn lại bản
   * đang chờ cũ hơn chuyển REPLACED, bản này PENDING (như hồ sơ shop).
   */
  async onSubmitted(p: AffiliateApplicationSubmittedPayload, tx: Tx): Promise<void> {
    const existing = await tx.affiliateApproval.findFirst({
      where: { affiliateId: p.affiliateId, type: 'REGISTER', version: p.version },
      select: { id: true },
    });
    if (existing) return;
    const newer = await tx.affiliateApproval.findFirst({
      where: { affiliateId: p.affiliateId, type: 'REGISTER', version: { gt: p.version } },
      select: { id: true },
    });
    if (!newer) {
      await tx.affiliateApproval.updateMany({
        where: { affiliateId: p.affiliateId, status: 'PENDING', version: { lt: p.version } },
        data: { status: 'REPLACED' },
      });
    }
    await tx.affiliateApproval.create({
      data: {
        affiliateId: p.affiliateId,
        type: 'REGISTER',
        version: p.version,
        status: newer ? 'REPLACED' : 'PENDING',
        userId: p.user.userId,
        userName: p.user.name,
        userEmail: p.user.email,
        data: p.data as unknown as Prisma.InputJsonValue,
        submittedAt: new Date(p.submittedAt),
      },
    });
  }

  /** Danh sách, nộp sớm nhất lên đầu */
  async list(q: ListAffiliateApprovalsQuery): Promise<Page<AffiliateApprovalRow>> {
    const where: Prisma.AffiliateApprovalWhereInput = {
      status: q.status ?? 'PENDING',
      type: q.type,
    };
    if (q.q) {
      const like = `%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const found = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM affiliate_approvals
        WHERE data->>'displayName' ILIKE ${like} OR user_name ILIKE ${like} OR user_email ILIKE ${like}`;
      where.id = { in: found.map((r) => r.id) };
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.affiliateApproval.findMany({
        where,
        orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
        ...skipTake(q),
      }),
      this.prisma.affiliateApproval.count({ where }),
    ]);
    return toPage(items.map(row), total, q);
  }

  async detail(id: string): Promise<AffiliateApprovalDetail> {
    const a = await this.find(id);
    const history = await this.prisma.affiliateApproval.findMany({
      where: { affiliateId: a.affiliateId },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        type: true,
        version: true,
        status: true,
        reason: true,
        decidedByName: true,
        submittedAt: true,
        decidedAt: true,
      },
    });
    return {
      ...row(a),
      userId: a.userId,
      data: a.data as unknown as AffiliateApplicationData,
      reason: a.reason,
      decidedByName: a.decidedByName,
      history,
    };
  }

  /** Duyệt hoặc từ chối hồ sơ đăng ký đang chờ. Hai admin bấm cùng lúc thì chỉ một người quyết được */
  async decide(admin: AuthUser, id: string, dto: DecisionDto): Promise<AffiliateApprovalDetail> {
    const a = await this.find(id);
    if (a.userId === admin.id) {
      throw new AppError(
        403,
        'SELF_APPROVAL_FORBIDDEN',
        'Bạn không thể tự duyệt hồ sơ cộng tác viên của chính mình.',
      );
    }
    if (a.type !== 'REGISTER') throw alreadyDecided();
    assertPending(a.status);
    const status = dto.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const reason = dto.reason ?? null;
    const decidedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.affiliateApproval.updateMany({
        where: { id, status: 'PENDING' },
        data: { status, reason, decidedBy: admin.id, decidedByName: admin.name, decidedAt },
      });
      if (count === 0) {
        const current = await tx.affiliateApproval.findUniqueOrThrow({ where: { id } });
        assertPending(current.status);
        throw alreadyDecided();
      }
      await this.events.publish(tx, AFFILIATE_DECIDED, {
        affiliateId: a.affiliateId,
        action: status === 'APPROVED' ? 'APPROVE' : 'REJECT',
        version: a.version,
        reason,
        decidedBy: { userId: admin.id, name: admin.name },
        decidedAt: decidedAt.toISOString(),
      });
      await writeAudit(tx, {
        actor: admin,
        action: status === 'APPROVED' ? 'APPROVE_AFFILIATE' : 'REJECT_AFFILIATE',
        targetType: 'AFFILIATE',
        targetId: a.affiliateId,
        reason,
        before: { status: 'PENDING' },
        after: { status, version: a.version },
      });
    });
    return this.detail(id);
  }

  /**
   * Khóa hoặc mở một CTV đã được duyệt. approval-service biết trạng thái theo quyết định gần nhất của chính
   * nó: chưa duyệt → 409 AFFILIATE_NOT_APPROVED; đã ở trạng thái đó → 409 AFFILIATE_ALREADY_IN_STATE.
   */
  async suspension(
    admin: AuthUser,
    affiliateId: string,
    dto: AffiliateSuspensionDto,
  ): Promise<AffiliateApprovalDetail> {
    const id = await this.prisma.$transaction(async (tx) => {
      // Khóa theo CTV: hai admin bấm cùng lúc chạy lần lượt
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`affiliate:${affiliateId}`}))`;
      const approved = await tx.affiliateApproval.findFirst({
        where: { affiliateId, type: 'REGISTER', status: 'APPROVED' },
        orderBy: { version: 'desc' },
      });
      if (!approved) {
        throw new AppError(
          409,
          'AFFILIATE_NOT_APPROVED',
          'Cộng tác viên này chưa được duyệt nên chưa khóa/mở được.',
        );
      }
      if (approved.userId === admin.id) {
        throw new AppError(
          403,
          'SELF_APPROVAL_FORBIDDEN',
          'Bạn không thể tự khóa/mở tài khoản cộng tác viên của chính mình.',
        );
      }
      const last = await tx.affiliateApproval.findFirst({
        where: { affiliateId, type: { in: ['SUSPEND', 'RESTORE'] } },
        orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }],
      });
      const suspended = last?.type === 'SUSPEND';
      if ((dto.action === 'SUSPEND') === suspended) {
        throw new AppError(
          409,
          'AFFILIATE_ALREADY_IN_STATE',
          suspended ? 'Cộng tác viên này đang bị khóa.' : 'Cộng tác viên này đang hoạt động.',
        );
      }
      const now = new Date();
      const created = await tx.affiliateApproval.create({
        data: {
          affiliateId,
          type: dto.action,
          status: 'APPROVED',
          userId: approved.userId,
          userName: approved.userName,
          userEmail: approved.userEmail,
          data: approved.data as Prisma.InputJsonValue,
          reason: dto.reason,
          decidedBy: admin.id,
          decidedByName: admin.name,
          decidedAt: now,
          submittedAt: now,
        },
      });
      await this.events.publish(tx, AFFILIATE_DECIDED, {
        affiliateId,
        action: dto.action,
        version: null,
        reason: dto.reason,
        decidedBy: { userId: admin.id, name: admin.name },
        decidedAt: now.toISOString(),
      });
      await writeAudit(tx, {
        actor: admin,
        action: dto.action === 'SUSPEND' ? 'SUSPEND_AFFILIATE' : 'RESTORE_AFFILIATE',
        targetType: 'AFFILIATE',
        targetId: affiliateId,
        reason: dto.reason,
        before: { suspended },
        after: { suspended: dto.action === 'SUSPEND' },
      });
      return created.id;
    });
    return this.detail(id);
  }

  private async find(id: string): Promise<AffiliateApproval> {
    const a = await this.prisma.affiliateApproval.findUnique({ where: { id } });
    if (!a) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy hồ sơ.');
    return a;
  }
}

function row(a: AffiliateApproval): AffiliateApprovalRow {
  return {
    id: a.id,
    affiliateId: a.affiliateId,
    type: a.type,
    version: a.version,
    status: a.status,
    displayName: (a.data as unknown as AffiliateApplicationData).displayName,
    userName: a.userName,
    userEmail: a.userEmail,
    submittedAt: a.submittedAt,
    decidedAt: a.decidedAt,
  };
}

const alreadyDecided = () => new AppError(409, 'ALREADY_DECIDED', 'Hồ sơ này đã được quyết định.');

function assertPending(status: AffiliateApproval['status']): void {
  if (status === 'REPLACED') {
    throw new AppError(
      409,
      'APPLICATION_REPLACED',
      'Người dùng đã nộp hồ sơ mới hơn. Vui lòng xét hồ sơ mới nhất.',
    );
  }
  if (status !== 'PENDING') throw alreadyDecided();
}
