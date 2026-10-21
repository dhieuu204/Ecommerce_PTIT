import { Injectable } from '@nestjs/common';
import { AppError, EventBus, skipTake, toPage, writeAudit, type AuthUser } from '@san/nest-common';
import { PRODUCT_MODERATION_DECIDED, type Page } from '@san/shared';
import { Prisma, type Violation } from '../../generated/prisma';
import { MarketplaceClient } from '../clients/marketplace.client';
import { PrismaService } from '../prisma.service';
import { ShopModerationService } from '../shop-moderation/shop-moderation.service';
import type {
  AdminReportsQuery,
  CreateReportDto,
  MyReportsQuery,
  ReportReason,
  ResolveReportDto,
  ReportStatus,
  ReportTarget,
} from './dto/reports.dto';

type Tx = Prisma.TransactionClient;

/** Báo cáo của người mua (P6, MOD-01): dòng violations có reporter_id */
export interface ReportView {
  id: string;
  targetType: ReportTarget;
  targetId: string;
  /** Tên sản phẩm/shop lúc báo cáo */
  targetName: string;
  /** Ảnh sản phẩm (hoặc logo shop) lúc báo cáo */
  targetImage: string | null;
  /** Shop của đối tượng (= targetId khi báo cáo shop) */
  shopId: string;
  reason: ReportReason;
  note: string;
  /** Khóa ảnh bằng chứng: xem qua GET /api/market/v1/report-images/{ownerId}/{file} */
  images: string[];
  status: ReportStatus;
  /** Ghi chú của admin khi đã xử lý */
  adminNote: string | null;
  handledAt: Date | null;
  createdAt: Date;
}

/** Một dòng ở hàng chờ của admin */
export interface AdminReportRow extends ReportView {
  reporter: { id: string; name: string };
  /** Chủ shop của đối tượng (admin trùng người này không được xử lý) */
  ownerId: string;
  handledByName: string | null;
  /** Số báo cáo đang chờ của cùng đối tượng (kể cả báo cáo này nếu đang chờ) */
  pendingCount: number;
}

/** Một quyết định của admin với sản phẩm (gỡ/khôi phục) hoặc shop (đình chỉ/khôi phục) */
export interface DecisionRow {
  id: string;
  targetType: ReportTarget;
  targetId: string;
  targetName: string;
  action: 'REMOVE' | 'RESTORE' | 'SUSPEND';
  reason: string;
  decidedBy: string;
  decidedByName: string;
  createdAt: Date;
}

export interface AdminReportDetail extends AdminReportRow {
  /** Các báo cáo khác của cùng đối tượng, mới nhất trước */
  others: AdminReportRow[];
  /** Lịch sử xử lý của đối tượng (với sản phẩm: cả đình chỉ/khôi phục shop của nó), mới nhất trước */
  history: DecisionRow[];
  /** Sản phẩm đang bị gỡ (null khi báo cáo shop) */
  removed: boolean | null;
  /** Shop của đối tượng đang bị đình chỉ */
  suspended: boolean;
}

/** Lịch sử gỡ/khôi phục của một sản phẩm */
export interface ProductViolations {
  removed: boolean;
  items: DecisionRow[];
}

/** Chỉ dòng báo cáo của người mua (không lấy dòng quyết định) */
const REPORT_ROW: Prisma.ViolationWhereInput = { reporterId: { not: null } };

/** Chỉ dòng quyết định gỡ/khôi phục sản phẩm */
const productDecision = (productId: string): Prisma.ViolationWhereInput => ({
  targetType: 'PRODUCT',
  targetId: productId,
  action: { in: ['REMOVE', 'RESTORE'] },
});

/** Chỉ dòng quyết định đình chỉ/khôi phục shop (như P2) */
const shopDecision = (shopId: string): Prisma.ViolationWhereInput => ({
  targetType: 'SHOP',
  targetId: shopId,
  action: { in: ['SUSPEND', 'RESTORE'] },
});

const NEWEST: Prisma.ViolationOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'desc' }];

/** Số báo cáo khác của cùng đối tượng trả kèm chi tiết */
const OTHERS_LIMIT = 50;

/** Số ảnh tối đa của một báo cáo (cấu hình, mặc định 5) */
const maxImages = () => {
  const n = Number(process.env.REPORT_MAX_IMAGES);
  return Number.isInteger(n) && n >= 0 ? n : 5;
};

/** Khóa ảnh bằng chứng: report-images/<userId người báo cáo>/<uuid>.<đuôi> */
const imageKeyPattern = (userId: string) =>
  new RegExp(`^report-images/${userId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`);

const notFound = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy báo cáo.');

/**
 * Báo cáo vi phạm và kiểm duyệt (MOD-01). Người mua báo cáo sản phẩm hoặc shop; admin MODERATION gỡ sản
 * phẩm, đình chỉ shop hoặc bác báo cáo. approval-service chỉ lưu báo cáo và quyết định (bảng violations);
 * marketplace nhận product_moderation.decided / shop_suspension.decided rồi tự áp dụng.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBus,
    private readonly marketplace: MarketplaceClient,
    private readonly shops: ShopModerationService,
  ) {}

  // ===== Người mua =====

  /**
   * Gửi báo cáo. Header Idempotency-Key: gửi lại cùng key thì trả báo cáo đã tạo. Sản phẩm lấy tên, ảnh,
   * shop từ API công khai của marketplace; chủ shop luôn lấy từ hồ sơ shop đã duyệt (không tin web gửi).
   */
  async create(
    user: AuthUser,
    dto: CreateReportDto,
    requestKey: string | undefined,
  ): Promise<ReportView> {
    if (!requestKey) {
      throw new AppError(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Thiếu mã chống gửi lặp (Idempotency-Key).',
      );
    }
    if (requestKey.length > 64) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu chưa hợp lệ.', {
        fields: { 'Idempotency-Key': 'Mã chống gửi lặp dài tối đa 64 ký tự.' },
      });
    }
    const replay = await this.findReplay(user, requestKey);
    if (replay) return replay;

    const images = [...new Set(dto.images ?? [])];
    const max = maxImages();
    if (images.length > max) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu chưa hợp lệ.', {
        fields: { images: `Tối đa ${max} ảnh.` },
      });
    }
    const pattern = imageKeyPattern(user.id);
    const bad = images.findIndex((key) => !pattern.test(key));
    if (bad >= 0) {
      throw new AppError(
        400,
        'INVALID_IMAGE_KEY',
        'Ảnh bằng chứng phải được tải lên từ tài khoản của bạn.',
        { index: bad },
      );
    }

    const target = await this.resolveTarget(dto.targetType, dto.targetId);
    if (target.ownerId === user.id) {
      throw new AppError(
        409,
        'OWN_TARGET',
        dto.targetType === 'SHOP'
          ? 'Bạn không thể báo cáo shop của chính mình.'
          : 'Bạn không thể báo cáo sản phẩm của shop mình.',
      );
    }

    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const pending = await tx.violation.findFirst({
          where: { ...REPORT_ROW, reporterId: user.id, targetId: dto.targetId, status: 'PENDING' },
          select: { id: true },
        });
        if (pending) throw alreadyReported();
        const row = await tx.violation.create({
          data: {
            targetType: dto.targetType,
            targetId: dto.targetId,
            targetName: target.name.slice(0, 150),
            targetImage: target.image && target.image.length <= 255 ? target.image : null,
            shopId: target.shopId,
            ownerId: target.ownerId,
            status: 'PENDING',
            reporterId: user.id,
            reporterName: user.name.slice(0, 100),
            reportReason: dto.reason,
            reportNote: dto.note,
            images,
            requestKey,
          },
        });
        return row.id;
      });
    } catch (e) {
      // Bấm hai lần cùng lúc: đụng mã Idempotency-Key (trả kết quả cũ) hoặc đụng chỉ mục
      // "mỗi người một báo cáo đang chờ cho cùng đối tượng" (409)
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await this.findReplay(user, requestKey);
        if (again) return again;
        throw alreadyReported();
      }
      throw e;
    }
    return view(await this.prisma.violation.findUniqueOrThrow({ where: { id } }));
  }

  /** Báo cáo của chính người gọi, mới nhất trước */
  async mine(user: AuthUser, q: MyReportsQuery): Promise<Page<ReportView>> {
    const where: Prisma.ViolationWhereInput = { reporterId: user.id };
    const [rows, total] = await Promise.all([
      this.prisma.violation.findMany({ where, orderBy: NEWEST, ...skipTake(q) }),
      this.prisma.violation.count({ where }),
    ]);
    return toPage(rows.map(view), total, q);
  }

  // ===== Admin kiểm duyệt =====

  /** Đang chờ: chờ lâu nhất lên đầu; đã xử lý: mới xử lý lên đầu */
  async list(q: AdminReportsQuery): Promise<Page<AdminReportRow>> {
    const status = q.status ?? 'PENDING';
    const where: Prisma.ViolationWhereInput = {
      ...REPORT_ROW,
      status,
      ...(q.targetType ? { targetType: q.targetType } : {}),
    };
    const orderBy: Prisma.ViolationOrderByWithRelationInput[] =
      status === 'PENDING'
        ? [{ createdAt: 'asc' }, { id: 'asc' }]
        : [{ decidedAt: 'desc' }, { id: 'desc' }];
    const [rows, total] = await Promise.all([
      this.prisma.violation.findMany({ where, orderBy, ...skipTake(q) }),
      this.prisma.violation.count({ where }),
    ]);
    return toPage(await this.adminRows(this.prisma, rows), total, q);
  }

  async detail(reportId: string): Promise<AdminReportDetail> {
    const r = await this.prisma.violation.findFirst({ where: { ...REPORT_ROW, id: reportId } });
    if (!r) throw notFound();
    const shopId = r.shopId ?? r.targetId;
    const [others, history, suspended, removed] = await Promise.all([
      this.prisma.violation.findMany({
        where: { ...REPORT_ROW, targetId: r.targetId, id: { not: r.id } },
        orderBy: NEWEST,
        take: OTHERS_LIMIT,
      }),
      this.prisma.violation.findMany({
        where: {
          OR:
            r.targetType === 'PRODUCT'
              ? [productDecision(r.targetId), shopDecision(shopId)]
              : [shopDecision(shopId)],
        },
        orderBy: NEWEST,
      }),
      this.shops.isSuspended(this.prisma, shopId),
      r.targetType === 'PRODUCT' ? this.isRemoved(this.prisma, r.targetId) : null,
    ]);
    const [row, ...otherRows] = await this.adminRows(this.prisma, [r, ...others]);
    return {
      ...row!,
      others: otherRows,
      history: history.map(decisionRow),
      removed,
      suspended,
    };
  }

  /**
   * Xử lý một báo cáo. Khóa theo đối tượng (pg_advisory_xact_lock): hai admin bấm cùng lúc thì người sau
   * thấy báo cáo đã xử lý (409). Mọi báo cáo đang chờ của cùng đối tượng chuyển trạng thái cùng lúc.
   * Đối tượng đã bị gỡ/đình chỉ rồi thì chỉ đánh dấu báo cáo, không thêm quyết định.
   */
  async resolve(
    admin: AuthUser,
    reportId: string,
    dto: ResolveReportDto,
  ): Promise<AdminReportDetail> {
    const found = await this.prisma.violation.findFirst({
      where: { ...REPORT_ROW, id: reportId },
      select: { targetType: true, targetId: true },
    });
    if (!found) throw notFound();
    if (dto.decision === 'REMOVE_PRODUCT' && found.targetType !== 'PRODUCT') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu chưa hợp lệ.', {
        fields: { decision: 'Chỉ gỡ được sản phẩm khi báo cáo là báo cáo sản phẩm.' },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${found.targetId}))`;
      const r = await tx.violation.findUniqueOrThrow({ where: { id: reportId } });
      if (r.ownerId === admin.id) {
        throw new AppError(
          403,
          'SELF_MODERATION_FORBIDDEN',
          'Bạn không thể tự xử lý báo cáo về shop của chính mình.',
        );
      }
      if (r.status !== 'PENDING') {
        throw new AppError(409, 'REPORT_ALREADY_HANDLED', 'Báo cáo này đã được xử lý.');
      }
      const shopId = r.shopId ?? r.targetId;

      let applied = false;
      if (dto.decision === 'REMOVE_PRODUCT') {
        applied = await this.removeProduct(tx, admin, r, dto.reason);
      } else if (dto.decision === 'SUSPEND_SHOP') {
        // Khóa theo shop trước khi xem trạng thái (decideTx khóa lại cùng khóa, không bị chặn)
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${shopId}))`;
        if (!(await this.shops.isSuspended(tx, shopId))) {
          await this.shops.decideTx(tx, admin, shopId, 'SUSPEND', dto.reason);
          applied = true;
        }
      }

      const status: ReportStatus = dto.decision === 'DISMISS' ? 'DISMISSED' : 'RESOLVED';
      const { count } = await tx.violation.updateMany({
        where: { ...REPORT_ROW, targetId: r.targetId, status: 'PENDING' },
        data: {
          status,
          reason: dto.reason,
          decidedBy: admin.id,
          decidedByName: admin.name,
          decidedAt: new Date(),
        },
      });
      await writeAudit(tx, {
        actor: admin,
        action: status === 'DISMISSED' ? 'DISMISS_REPORT' : 'RESOLVE_REPORT',
        targetType: 'REPORT',
        targetId: r.id,
        reason: dto.reason,
        before: { status: 'PENDING' },
        after: {
          status,
          decision: dto.decision,
          // false: đối tượng đã bị gỡ/đình chỉ từ trước, chỉ đánh dấu báo cáo
          applied,
          target: { type: r.targetType, id: r.targetId },
          reports: count,
        },
      });
    });
    return this.detail(reportId);
  }

  /** Lịch sử gỡ/khôi phục của sản phẩm, mới nhất trước */
  async productViolations(productId: string): Promise<ProductViolations> {
    const rows = await this.prisma.violation.findMany({
      where: productDecision(productId),
      orderBy: NEWEST,
    });
    return { removed: rows[0]?.action === 'REMOVE', items: rows.map(decisionRow) };
  }

  /** Khôi phục sản phẩm đã gỡ: marketplace đưa về ẩn, seller tự bật bán lại */
  async restoreProduct(
    admin: AuthUser,
    productId: string,
    reason: string,
  ): Promise<ProductViolations> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${productId}))`;
      const last = await tx.violation.findFirst({
        where: productDecision(productId),
        orderBy: NEWEST,
      });
      if (last?.ownerId === admin.id) {
        throw new AppError(
          403,
          'SELF_MODERATION_FORBIDDEN',
          'Bạn không thể tự xử lý sản phẩm của shop mình.',
        );
      }
      if (!last || last.action !== 'REMOVE') {
        throw new AppError(409, 'NOT_REMOVED', 'Sản phẩm không bị gỡ.');
      }
      await this.decideProduct(tx, admin, last, 'RESTORE', reason, last.createdAt);
    });
    return this.productViolations(productId);
  }

  // ----- phần dùng chung -----

  /** Đối tượng bị báo cáo: tên, ảnh, shop và chủ shop (theo hồ sơ shop đã duyệt) */
  private async resolveTarget(
    type: ReportTarget,
    targetId: string,
  ): Promise<{ name: string; image: string | null; shopId: string; ownerId: string }> {
    if (type === 'SHOP') {
      const shop = await this.shops.findShop(this.prisma, targetId);
      return { name: shop.name, image: shop.logoUrl, shopId: targetId, ownerId: shop.ownerId };
    }
    const product = await this.marketplace.product(targetId);
    const shop = await this.shops.findShop(this.prisma, product.shopId).catch((e: unknown) => {
      if (e instanceof AppError && e.status === 404) {
        throw new AppError(
          404,
          'NOT_FOUND',
          'Không tìm thấy sản phẩm hoặc sản phẩm không còn bán.',
        );
      }
      throw e;
    });
    return {
      name: product.name,
      image: product.image,
      shopId: product.shopId,
      ownerId: shop.ownerId,
    };
  }

  /** Gỡ sản phẩm của báo cáo nếu chưa bị gỡ. Trả false khi sản phẩm đã bị gỡ từ trước */
  private async removeProduct(
    tx: Tx,
    admin: AuthUser,
    report: Violation,
    reason: string,
  ): Promise<boolean> {
    const last = await tx.violation.findFirst({
      where: productDecision(report.targetId),
      orderBy: NEWEST,
    });
    if (last?.action === 'REMOVE') return false;
    await this.decideProduct(tx, admin, report, 'REMOVE', reason, last?.createdAt ?? null);
    return true;
  }

  /**
   * Thêm dòng quyết định gỡ/khôi phục sản phẩm, ghi nhật ký, phát product_moderation.decided. Thời điểm
   * quyết định luôn tăng dần theo từng sản phẩm: marketplace dựa vào đây để bỏ sự kiện cũ tới sau.
   */
  private async decideProduct(
    tx: Tx,
    admin: AuthUser,
    source: Pick<Violation, 'targetId' | 'targetName' | 'targetImage' | 'shopId' | 'ownerId'>,
    action: 'REMOVE' | 'RESTORE',
    reason: string,
    /** Thời điểm của quyết định trước đó với sản phẩm (nếu có) */
    lastAt: Date | null,
  ): Promise<void> {
    const now = Date.now();
    const createdAt = new Date(lastAt ? Math.max(now, lastAt.getTime() + 1) : now);
    const shopId = source.shopId ?? '';
    const v = await tx.violation.create({
      data: {
        createdAt,
        targetType: 'PRODUCT',
        targetId: source.targetId,
        targetName: source.targetName,
        targetImage: source.targetImage,
        shopId,
        ownerId: source.ownerId,
        action,
        reason,
        decidedBy: admin.id,
        decidedByName: admin.name,
      },
    });
    await writeAudit(tx, {
      actor: admin,
      action: action === 'REMOVE' ? 'REMOVE_PRODUCT' : 'RESTORE_PRODUCT',
      targetType: 'PRODUCT',
      targetId: source.targetId,
      reason,
      before: { removed: action === 'RESTORE' },
      after: { removed: action === 'REMOVE' },
    });
    await this.events.publish(tx, PRODUCT_MODERATION_DECIDED, {
      productId: source.targetId,
      shopId,
      action,
      reason,
      decidedBy: { userId: admin.id, name: admin.name },
      decidedAt: v.createdAt.toISOString(),
    });
  }

  private async isRemoved(db: Tx, productId: string): Promise<boolean> {
    const last = await db.violation.findFirst({
      where: productDecision(productId),
      orderBy: NEWEST,
      select: { action: true },
    });
    return last?.action === 'REMOVE';
  }

  /** Báo cáo đã tạo bằng cùng mã chống gửi lặp (chỉ của chính người này) */
  private async findReplay(user: AuthUser, requestKey: string): Promise<ReportView | null> {
    const replay = await this.prisma.violation.findUnique({ where: { requestKey } });
    if (!replay) return null;
    if (replay.reporterId !== user.id) {
      throw new AppError(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'Mã yêu cầu đã được dùng, bạn tải lại trang rồi thử lại.',
      );
    }
    return view(replay);
  }

  /** Thêm người báo cáo, người xử lý và số báo cáo đang chờ của cùng đối tượng */
  private async adminRows(db: Tx, rows: Violation[]): Promise<AdminReportRow[]> {
    const targetIds = [...new Set(rows.map((r) => r.targetId))];
    const counts = targetIds.length
      ? await db.violation.groupBy({
          by: ['targetId'],
          where: { ...REPORT_ROW, status: 'PENDING', targetId: { in: targetIds } },
          _count: { _all: true },
        })
      : [];
    const pending = new Map(counts.map((c) => [c.targetId, c._count._all]));
    return rows.map((r) => ({
      ...view(r),
      reporter: { id: r.reporterId ?? '', name: r.reporterName ?? '' },
      ownerId: r.ownerId,
      handledByName: r.status === 'PENDING' ? null : r.decidedByName,
      pendingCount: pending.get(r.targetId) ?? 0,
    }));
  }
}

function alreadyReported(): AppError {
  return new AppError(
    409,
    'ALREADY_REPORTED',
    'Bạn đã báo cáo đối tượng này, báo cáo đang chờ xử lý.',
  );
}

function view(r: Violation): ReportView {
  const handled = r.status !== 'PENDING';
  return {
    id: r.id,
    targetType: r.targetType,
    targetId: r.targetId,
    targetName: r.targetName,
    targetImage: r.targetImage,
    shopId: r.shopId ?? r.targetId,
    reason: (r.reportReason ?? 'OTHER') as ReportReason,
    note: r.reportNote ?? '',
    images: r.images,
    status: r.status,
    adminNote: handled ? r.reason : null,
    handledAt: handled ? r.decidedAt : null,
    createdAt: r.createdAt,
  };
}

function decisionRow(v: Violation): DecisionRow {
  return {
    id: v.id,
    targetType: v.targetType,
    targetId: v.targetId,
    targetName: v.targetName,
    action: v.action as DecisionRow['action'],
    reason: v.reason ?? '',
    decidedBy: v.decidedBy ?? '',
    decidedByName: v.decidedByName ?? '',
    createdAt: v.createdAt,
  };
}
