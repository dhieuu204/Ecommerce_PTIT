import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  AppError,
  EventBus,
  SettingsService,
  skipTake,
  toPage,
  type AuthUser,
} from '@san/nest-common';
import type { Page } from '@san/shared';
import {
  AFFILIATE_APPLICATION_SUBMITTED,
  AFFILIATE_DECIDED,
  type AffiliateDecidedPayload,
} from '@san/shared';
import { randomInt } from 'node:crypto';
import type { Affiliate, AffiliateStatus, Prisma } from '../../generated/prisma';
import { PaymentClient } from '../clients/payment.client';
import { Notifier } from '../notifications/notifier.service';
import { PrismaService } from '../prisma.service';
import { MarketSetting } from '../settings';
import { newAffiliateCode } from './commission';
import type {
  AdminAffiliatesQuery,
  AffiliateApplicationDto,
  AffiliateBankAccountDto,
  AffiliateClickDto,
} from './dto/affiliate.dto';

/** Hồ sơ CTV của chính người dùng (đủ số tài khoản: chỉ chủ hồ sơ và payment-service đọc) */
export interface AffiliateView {
  id: string;
  code: string | null;
  status: AffiliateStatus;
  version: number;
  displayName: string;
  channels: string[];
  phone: string;
  bankAccount: { bankName: string; accountNumber: string; accountName: string };
  rejectReason: string | null;
  suspendReason: string | null;
  approvedAt: Date | null;
  createdAt: Date;
}

export interface MyAffiliate {
  /** NONE: chưa đăng ký */
  status: AffiliateStatus | 'NONE';
  affiliate: AffiliateView | null;
}

export interface AffiliateClickResult {
  clickId: string;
  shopId: string;
  expiresAt: Date;
}

/** Một CTV trong danh sách của admin (không có số tài khoản) */
export interface AdminAffiliateRow {
  id: string;
  userId: string;
  code: string | null;
  status: AffiliateStatus;
  displayName: string;
  channels: string[];
  phone: string;
  suspendReason: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  orderCount: number;
  /** Tổng hoa hồng chụp lúc đặt của các đơn không bị hủy */
  commission: number;
}

const notActive = () =>
  new AppError(
    409,
    'AFFILIATE_NOT_ACTIVE',
    'Tài khoản cộng tác viên chưa hoạt động nên chưa dùng được chức năng này.',
  );

/** Trạng thái đơn con không còn tính hoa hồng */
export const NO_COMMISSION_STATUSES = [
  'CANCELLED',
  'FAILED',
  'RETURNED',
  'INCIDENT',
  'INCIDENT_RESOLVED',
] as const;

/**
 * Cộng tác viên (P7: AFF-01, AFF-03, AFF-05). Hồ sơ nộp lên approval-service duyệt; quyết định về qua
 * sự kiện `affiliate.decided`. Lượt bấm link ghi ở đây, gắn đơn ở CheckoutService.
 */
@Injectable()
export class AffiliatesService implements OnModuleInit {
  private readonly logger = new Logger(AffiliatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBus,
    private readonly settings: SettingsService,
    private readonly payment: PaymentClient,
    private readonly notifier: Notifier,
  ) {}

  onModuleInit(): void {
    this.events.subscribe(AFFILIATE_DECIDED, (p, tx: Prisma.TransactionClient) =>
      this.applyDecision(p, tx),
    );
  }

  async me(userId: string): Promise<MyAffiliate> {
    const a = await this.prisma.affiliate.findUnique({ where: { userId } });
    return a ? { status: a.status, affiliate: view(a) } : { status: 'NONE', affiliate: null };
  }

  /** CTV đang hoạt động của người dùng, không thì 409 AFFILIATE_NOT_ACTIVE */
  async requireActive(userId: string): Promise<Affiliate> {
    const a = await this.prisma.affiliate.findUnique({ where: { userId } });
    if (!a || a.status !== 'ACTIVE') throw notActive();
    return a;
  }

  /**
   * Nộp hồ sơ lần đầu hoặc nộp lại sau khi bị từ chối (AFF-01). Đang chờ duyệt, đang hoạt động hoặc bị
   * khóa thì không nộp được. Gửi lại cùng Idempotency-Key thì trả hồ sơ hiện tại.
   */
  async submit(
    user: AuthUser,
    dto: AffiliateApplicationDto,
    requestKey: string,
  ): Promise<MyAffiliate> {
    const replay = await this.prisma.affiliate.findUnique({ where: { requestKey } });
    if (replay) {
      if (replay.userId !== user.id) {
        throw new AppError(
          409,
          'IDEMPOTENCY_KEY_REUSED',
          'Mã yêu cầu đã được dùng, bạn tải lại trang rồi thử lại.',
        );
      }
      return this.me(user.id);
    }
    const fields = {
      displayName: dto.displayName,
      channels: dto.channels,
      phone: dto.phone,
      bankName: dto.bankAccount.bankName,
      bankAccountNumber: dto.bankAccount.accountNumber,
      bankAccountName: dto.bankAccount.accountName,
      requestKey,
      status: 'PENDING' as const,
      rejectReason: null,
    };
    await this.prisma.$transaction(async (tx) => {
      // Khóa theo người dùng: hai lần nộp cùng lúc không tạo hai hồ sơ hay trùng phiên bản
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`affiliate:${user.id}`}))`;
      const existing = await tx.affiliate.findUnique({ where: { userId: user.id } });
      if (existing && existing.status !== 'REJECTED') {
        throw new AppError(
          409,
          'AFFILIATE_APPLICATION_NOT_ALLOWED',
          existing.status === 'PENDING'
            ? 'Hồ sơ cộng tác viên của bạn đang chờ duyệt.'
            : 'Bạn đã là cộng tác viên.',
        );
      }
      const a = existing
        ? await tx.affiliate.update({
            where: { id: existing.id },
            data: { ...fields, version: existing.version + 1 },
          })
        : await tx.affiliate.create({ data: { userId: user.id, ...fields } });
      await this.events.publish(tx, AFFILIATE_APPLICATION_SUBMITTED, {
        affiliateId: a.id,
        version: a.version,
        user: { userId: user.id, name: user.name, email: user.email },
        data: {
          displayName: a.displayName,
          channels: a.channels,
          phone: a.phone,
          bankAccount: {
            bankName: a.bankName,
            accountNumberMasked: mask(a.bankAccountNumber),
            accountName: a.bankAccountName,
          },
        },
        submittedAt: a.updatedAt.toISOString(),
      });
    });
    return this.me(user.id);
  }

  /**
   * Đổi tài khoản nhận tiền (quyết định P7 số 4): không cần duyệt lại vì mọi lần rút đều qua admin duyệt.
   * Không đổi được khi đang có yêu cầu rút chưa xong (hỏi payment-service).
   */
  async updateBankAccount(
    user: AuthUser,
    authorization: string,
    dto: AffiliateBankAccountDto,
  ): Promise<MyAffiliate> {
    const a = await this.prisma.affiliate.findUnique({ where: { userId: user.id } });
    if (!a || (a.status !== 'ACTIVE' && a.status !== 'SUSPENDED')) throw notActive();
    const wallet = await this.payment.affiliateWallet(authorization);
    if (wallet.openWithdrawal) {
      throw new AppError(
        409,
        'WITHDRAWAL_IN_PROGRESS',
        'Bạn đang có yêu cầu rút tiền chưa xong, đổi tài khoản sau khi yêu cầu kết thúc.',
      );
    }
    await this.prisma.affiliate.update({
      where: { id: a.id },
      data: {
        bankName: dto.bankAccount.bankName,
        bankAccountNumber: dto.bankAccount.accountNumber,
        bankAccountName: dto.bankAccount.accountName,
      },
    });
    return this.me(user.id);
  }

  /**
   * Nhận quyết định từ approval-service. Duyệt/từ chối chỉ áp cho đúng phiên bản đang chờ; khóa/mở chỉ áp
   * quyết định mới hơn quyết định đã áp (sự kiện có thể tới sai thứ tự).
   */
  async applyDecision(p: AffiliateDecidedPayload, tx: Prisma.TransactionClient): Promise<void> {
    const a = await tx.affiliate.findUnique({ where: { id: p.affiliateId } });
    if (!a) {
      this.logger.warn(`Bỏ qua quyết định ${p.action}: không có CTV ${p.affiliateId}.`);
      return;
    }
    const decidedAt = new Date(p.decidedAt);
    if (p.action === 'APPROVE' || p.action === 'REJECT') {
      if (a.status !== 'PENDING' || a.version !== p.version) {
        this.logger.log(`Bỏ qua quyết định CTV ${a.id} v${p.version}: không còn chờ duyệt.`);
        return;
      }
      if (p.action === 'APPROVE') {
        const code = a.code ?? (await this.freeCode(tx));
        await tx.affiliate.update({
          where: { id: a.id },
          data: {
            status: 'ACTIVE',
            code,
            rejectReason: null,
            approvedAt: a.approvedAt ?? decidedAt,
          },
        });
      } else {
        await tx.affiliate.update({
          where: { id: a.id },
          data: { status: 'REJECTED', rejectReason: p.reason },
        });
      }
      await this.notifier.affiliateDecision(tx, a.userId, p.action, p.reason);
      return;
    }
    if (a.status !== 'ACTIVE' && a.status !== 'SUSPENDED') {
      // Chưa áp quyết định duyệt (sự kiện đó chưa tới): ném lỗi để sự kiện được gửi lại sau
      throw new Error(`CTV ${a.id} chưa hoạt động, chưa áp được quyết định ${p.action}.`);
    }
    const { count } = await tx.affiliate.updateMany({
      where: {
        id: a.id,
        status: { in: ['ACTIVE', 'SUSPENDED'] },
        OR: [{ moderatedAt: null }, { moderatedAt: { lt: decidedAt } }],
      },
      data:
        p.action === 'SUSPEND'
          ? { status: 'SUSPENDED', suspendReason: p.reason, moderatedAt: decidedAt }
          : { status: 'ACTIVE', suspendReason: null, moderatedAt: decidedAt },
    });
    if (count === 0) {
      this.logger.log(`Bỏ qua quyết định ${p.action} CTV ${a.id}: đã áp quyết định mới hơn.`);
      return;
    }
    await this.notifier.affiliateDecision(tx, a.userId, p.action, p.reason);
  }

  /**
   * Ghi lượt bấm link tiếp thị (AFF-03, công khai). Mã CTV sai, CTV không hoạt động, sản phẩm/shop không
   * còn bán, hoặc CTV là chủ shop đó → 404 AFFILIATE_LINK_INVALID (web bỏ qua, trang vẫn mở bình thường).
   */
  async recordClick(
    dto: AffiliateClickDto,
    user: AuthUser | undefined,
  ): Promise<AffiliateClickResult> {
    const invalid = () =>
      new AppError(404, 'AFFILIATE_LINK_INVALID', 'Link cộng tác viên không còn hiệu lực.');
    const a = await this.prisma.affiliate.findUnique({ where: { code: dto.code } });
    if (!a || a.status !== 'ACTIVE') throw invalid();
    let shopId: string;
    let productId: string | null = null;
    if (dto.productId) {
      const p = await this.prisma.product.findUnique({
        where: { id: dto.productId },
        select: {
          id: true,
          status: true,
          shop: { select: { id: true, status: true, ownerId: true } },
        },
      });
      if (!p || p.status !== 'ACTIVE' || p.shop.status !== 'ACTIVE') throw invalid();
      if (p.shop.ownerId === a.userId) throw invalid();
      shopId = p.shop.id;
      productId = p.id;
    } else {
      const s = await this.prisma.shop.findUnique({
        where: { id: dto.shopId! },
        select: { id: true, status: true, ownerId: true },
      });
      if (!s || s.status !== 'ACTIVE' || s.ownerId === a.userId) throw invalid();
      shopId = s.id;
    }
    const days = await this.settings.get(MarketSetting.affiliateClickDays);
    const now = new Date();
    const click = await this.prisma.affiliateClick.create({
      data: {
        affiliateId: a.id,
        shopId,
        productId,
        // CTV tự bấm link của mình vẫn ghi (không tính đơn), nhưng không gắn tài khoản để khỏi rối
        userId: user && user.id !== a.userId ? user.id : null,
        expiresAt: new Date(now.getTime() + days * 86_400_000),
      },
    });
    return { clickId: click.id, shopId, expiresAt: click.expiresAt };
  }

  /** Danh sách CTV của admin Kiểm duyệt (AFF-01), kèm số đơn và tổng hoa hồng */
  async adminList(q: AdminAffiliatesQuery): Promise<Page<AdminAffiliateRow>> {
    const where: Prisma.AffiliateWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.q) {
      where.OR = [
        { displayName: { contains: q.q, mode: 'insensitive' } },
        { code: { equals: q.q.toUpperCase() } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.affiliate.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.affiliate.count({ where }),
    ]);
    const sums = await this.prisma.shopOrder.groupBy({
      by: ['affiliateId'],
      where: {
        affiliateId: { in: rows.map((r) => r.id) },
        status: { notIn: [...NO_COMMISSION_STATUSES] },
      },
      _count: { _all: true },
      _sum: { commission: true },
    });
    const byId = new Map(sums.map((s) => [s.affiliateId, s]));
    return toPage(
      rows.map((a) => ({
        id: a.id,
        userId: a.userId,
        code: a.code,
        status: a.status,
        displayName: a.displayName,
        channels: a.channels,
        phone: a.phone,
        suspendReason: a.suspendReason,
        approvedAt: a.approvedAt,
        createdAt: a.createdAt,
        orderCount: byId.get(a.id)?._count._all ?? 0,
        commission: byId.get(a.id)?._sum.commission ?? 0,
      })),
      total,
      q,
    );
  }

  /** Mã CTV chưa ai dùng */
  private async freeCode(tx: Prisma.TransactionClient): Promise<string> {
    for (;;) {
      const code = newAffiliateCode(randomInt);
      if (!(await tx.affiliate.findUnique({ where: { code }, select: { id: true } }))) return code;
    }
  }
}

function view(a: Affiliate): AffiliateView {
  return {
    id: a.id,
    code: a.code,
    status: a.status,
    version: a.version,
    displayName: a.displayName,
    channels: a.channels,
    phone: a.phone,
    bankAccount: {
      bankName: a.bankName,
      accountNumber: a.bankAccountNumber,
      accountName: a.bankAccountName,
    },
    rejectReason: a.rejectReason,
    suspendReason: a.suspendReason,
    approvedAt: a.approvedAt,
    createdAt: a.createdAt,
  };
}

/** Chỉ giữ 4 số cuối: ****1234 */
export function mask(accountNumber: string): string {
  return `****${accountNumber.slice(-4)}`;
}
