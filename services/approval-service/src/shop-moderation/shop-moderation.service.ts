import { Injectable } from '@nestjs/common';
import { AppError, EventBus, writeAudit, type AuthUser } from '@san/nest-common';
import { SHOP_SUSPENSION_DECIDED, type ShopApplicationData } from '@san/shared';
import type { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma.service';

/** Biện pháp với shop (dòng quyết định; dòng báo cáo của người mua có action trống) */
type Action = 'SUSPEND' | 'RESTORE';

/** Chỉ dòng quyết định đình chỉ/khôi phục shop, không lấy dòng báo cáo (P6) */
const SHOP_DECISION: Prisma.ViolationWhereInput = {
  targetType: 'SHOP',
  action: { in: ['SUSPEND', 'RESTORE'] },
};

/** Một lần đình chỉ/khôi phục */
export interface ViolationRow {
  id: string;
  action: Action;
  reason: string;
  decidedBy: string;
  decidedByName: string;
  createdAt: Date;
  /** Tên shop lúc quyết định */
  targetName: string;
}

/** Lịch sử xử lý của một shop */
export interface ShopViolations {
  /** Shop đang bị đình chỉ hay không (theo quyết định mới nhất) */
  suspended: boolean;
  /** Mới nhất trước */
  items: ViolationRow[];
}

/** Shop theo hồ sơ đã duyệt (approval-service không gọi sang marketplace) */
export interface KnownShop {
  name: string;
  ownerId: string;
  logoUrl: string | null;
}

/**
 * Đình chỉ / khôi phục shop (SHP-04). approval-service chỉ lưu quyết định (bảng violations);
 * marketplace-service nhận shop_suspension.decided rồi tự đổi trạng thái shop.
 */
@Injectable()
export class ShopModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBus,
  ) {}

  async violations(shopId: string): Promise<ShopViolations> {
    await this.findShop(this.prisma, shopId);
    const rows = await this.prisma.violation.findMany({
      where: { ...SHOP_DECISION, targetId: shopId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return {
      suspended: rows[0]?.action === 'SUSPEND',
      items: rows.map((v) => ({
        id: v.id,
        action: v.action as Action,
        reason: v.reason ?? '',
        decidedBy: v.decidedBy ?? '',
        decidedByName: v.decidedByName ?? '',
        createdAt: v.createdAt,
        targetName: v.targetName,
      })),
    };
  }

  /**
   * Đình chỉ hoặc khôi phục. Cả việc kiểm trạng thái, lưu quyết định, ghi nhật ký và phát sự kiện nằm
   * trong một giao dịch có khóa theo shop (pg_advisory_xact_lock), nên hai admin bấm cùng lúc thì
   * người sau thấy trạng thái mới và nhận 409.
   */
  async decide(
    admin: AuthUser,
    shopId: string,
    action: Action,
    reason: string,
  ): Promise<ShopViolations> {
    await this.prisma.$transaction((tx) => this.decideTx(tx, admin, shopId, action, reason));
    return this.violations(shopId);
  }

  /**
   * Phần trong giao dịch của `decide`, dùng lại khi admin đình chỉ shop từ báo cáo vi phạm (MOD-01).
   * Khóa theo shop được giữ tới hết giao dịch của người gọi.
   */
  async decideTx(
    tx: Prisma.TransactionClient,
    admin: AuthUser,
    shopId: string,
    action: Action,
    reason: string,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${shopId}))`;
    const shop = await this.findShop(tx, shopId);
    if (shop.ownerId === admin.id) {
      throw new AppError(
        403,
        'SELF_MODERATION_FORBIDDEN',
        'Bạn không thể tự xử lý shop của chính mình.',
      );
    }
    const last = await this.lastDecision(tx, shopId);
    const suspended = last?.action === 'SUSPEND';
    if (action === 'SUSPEND' && suspended) {
      throw new AppError(409, 'ALREADY_SUSPENDED', 'Shop đang bị đình chỉ.');
    }
    if (action === 'RESTORE' && !suspended) {
      throw new AppError(409, 'NOT_SUSPENDED', 'Shop không bị đình chỉ.');
    }

    // Thời điểm quyết định luôn tăng dần theo từng shop: marketplace dựa vào đây để bỏ sự kiện cũ tới sau
    const now = Date.now();
    const createdAt = new Date(last ? Math.max(now, last.createdAt.getTime() + 1) : now);
    const v = await tx.violation.create({
      data: {
        createdAt,
        targetType: 'SHOP',
        targetId: shopId,
        targetName: shop.name,
        shopId,
        ownerId: shop.ownerId,
        action,
        reason,
        decidedBy: admin.id,
        decidedByName: admin.name,
      },
    });
    await writeAudit(tx, {
      actor: admin,
      action: action === 'SUSPEND' ? 'SUSPEND_SHOP' : 'RESTORE_SHOP',
      targetType: 'SHOP',
      targetId: shopId,
      reason,
      before: { suspended },
      after: { suspended: action === 'SUSPEND' },
    });
    await this.events.publish(tx, SHOP_SUSPENSION_DECIDED, {
      shopId,
      action,
      reason,
      decidedBy: { userId: admin.id, name: admin.name },
      decidedAt: v.createdAt.toISOString(),
    });
  }

  /** Shop đang bị đình chỉ hay không (theo quyết định mới nhất) */
  async isSuspended(db: Prisma.TransactionClient, shopId: string): Promise<boolean> {
    return (await this.lastDecision(db, shopId))?.action === 'SUSPEND';
  }

  private lastDecision(db: Prisma.TransactionClient, shopId: string) {
    return db.violation.findFirst({
      where: { ...SHOP_DECISION, targetId: shopId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { action: true, createdAt: true },
    });
  }

  /**
   * Shop có thật khi đã có hồ sơ mở shop được duyệt. Tên và chủ shop lấy từ hồ sơ được duyệt mới nhất
   * (mở shop hoặc đổi thông tin).
   */
  async findShop(db: Prisma.TransactionClient, shopId: string): Promise<KnownShop> {
    const latest = await db.shopApproval.findFirst({
      where: { shopId, status: 'APPROVED' },
      orderBy: { version: 'desc' },
    });
    const registered =
      latest &&
      (latest.type === 'REGISTER' ||
        (await db.shopApproval.count({
          where: { shopId, status: 'APPROVED', type: 'REGISTER' },
        })) > 0);
    if (!latest || !registered) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy shop.');
    const data = latest.data as unknown as ShopApplicationData;
    return { name: data.name, ownerId: latest.ownerId, logoUrl: data.logoUrl ?? null };
  }
}
