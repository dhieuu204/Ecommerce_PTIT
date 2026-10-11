import { Injectable, Logger } from '@nestjs/common';
import {
  AppError,
  EventBus,
  SettingsService,
  skipTake,
  toPage,
  writeAudit,
  type AuthUser,
  type PageQuery,
} from '@san/nest-common';
import {
  ORDER_CHECK_DECIDED,
  type OrderPlacedPayload,
  type Page,
  type ShopOrderCancelledPayload,
} from '@san/shared';
import { PrismaService } from '../prisma.service';
import { ApprovalSetting } from '../settings';
import type { OrderCheck, OrderCheckStatus, Prisma } from '../../generated/prisma';

type Tx = Prisma.TransactionClient;

/** Một luật đã chạm, kèm ngưỡng lúc kiểm */
export interface RuleHit {
  rule: 'TOTAL' | 'COD';
  threshold: number;
}

export interface OrderCheckView {
  id: string;
  orderId: string;
  orderCode: string;
  buyer: { id: string; name: string; email: string };
  amount: number;
  paymentMethod: string;
  rulesHit: RuleHit[];
  status: OrderCheckStatus;
  deadline: Date | null;
  reason: string | null;
  decidedByName: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  /** Chỉ ở trang chi tiết: đơn nhận qua sự kiện */
  order?: Pick<OrderPlacedPayload, 'shopOrders' | 'shippingProvince' | 'payBefore' | 'placedAt'>;
  /** Chỉ ở trang chi tiết: lịch sử mua của buyer */
  buyerStats?: { orders: number; total: number; rejected: number };
}

/** Luật khởi điểm (FLOW-03 quyết định 2): đơn tổng ≥ ngưỡng, hoặc đơn COD ≥ ngưỡng COD */
export function evaluateRules(
  order: Pick<OrderPlacedPayload, 'total' | 'paymentMethod'>,
  t: { total: number; cod: number },
): RuleHit[] {
  const hits: RuleHit[] = [];
  if (order.total >= t.total) hits.push({ rule: 'TOTAL', threshold: t.total });
  if (order.paymentMethod === 'COD' && order.total >= t.cod) {
    hits.push({ rule: 'COD', threshold: t.cod });
  }
  return hits;
}

/**
 * Kiểm tra đơn theo luật (RSK-01, FLOW-03). approval-service chỉ lưu quyết định; marketplace nhận
 * order_check.decided rồi tự áp lên đơn. Không bao giờ tự duyệt: quá hạn thì TIMEOUT (đơn bị hủy).
 */
@Injectable()
export class OrderChecksService {
  private readonly logger = new Logger(OrderChecksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBus,
    private readonly settings: SettingsService,
  ) {}

  /** Nhận đơn mới: không chạm luật → qua ngay; chạm luật → chờ admin duyệt trong hạn */
  async onPlaced(p: OrderPlacedPayload, tx: Tx): Promise<void> {
    if (await tx.orderCheck.findUnique({ where: { orderId: p.orderId } })) return;
    const s = await this.settings.values();
    const hits = evaluateRules(p, {
      total: s[ApprovalSetting.totalThreshold]!,
      cod: s[ApprovalSetting.codThreshold]!,
    });
    const now = new Date();
    const pending = hits.length > 0;
    const check = await tx.orderCheck.create({
      data: {
        orderId: p.orderId,
        orderCode: p.code,
        buyerId: p.buyer.userId,
        buyerName: p.buyer.name,
        buyerEmail: p.buyer.email,
        ownerIds: [...new Set(p.shopOrders.map((so) => so.ownerId))],
        amount: p.total,
        paymentMethod: p.paymentMethod,
        data: JSON.parse(
          JSON.stringify({
            shopOrders: p.shopOrders,
            shippingProvince: p.shippingProvince,
            payBefore: p.payBefore,
            placedAt: p.placedAt,
          }),
        ) as Prisma.InputJsonValue,
        rulesHit: hits as unknown as Prisma.InputJsonValue,
        status: pending ? 'PENDING' : 'PASSED',
        deadline: pending
          ? new Date(now.getTime() + s[ApprovalSetting.timeoutHours]! * 3600_000)
          : null,
        decidedAt: pending ? null : now,
      },
    });
    if (!pending) await this.publish(tx, check, 'PASSED', null, null, now);
    else this.logger.log(`Đơn ${p.code} (${p.total}đ) cần admin duyệt.`);
  }

  /** Cả đơn tổng bị hủy trong lúc chờ duyệt: đóng hồ sơ, admin không phải duyệt nữa */
  async onCancelled(p: ShopOrderCancelledPayload, tx: Tx): Promise<void> {
    if (!p.orderCancelled) return;
    await tx.orderCheck.updateMany({
      where: { orderId: p.orderId, status: 'PENDING' },
      data: { status: 'CANCELLED', reason: 'Đơn đã bị hủy', decidedAt: new Date() },
    });
  }

  async list(q: PageQuery & { status?: OrderCheckStatus }): Promise<Page<OrderCheckView>> {
    const status = q.status ?? 'PENDING';
    const where: Prisma.OrderCheckWhereInput = { status };
    const [rows, total] = await Promise.all([
      this.prisma.orderCheck.findMany({
        where,
        // Đơn chờ lâu nhất lên đầu; đã quyết thì mới nhất trước
        orderBy: status === 'PENDING' ? [{ createdAt: 'asc' }] : [{ decidedAt: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.orderCheck.count({ where }),
    ]);
    return toPage(rows.map(view), total, q);
  }

  async detail(checkId: string): Promise<OrderCheckView> {
    const c = await this.prisma.orderCheck.findUnique({ where: { id: checkId } });
    if (!c) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy hồ sơ kiểm tra đơn.');
    const others = await this.prisma.orderCheck.findMany({
      where: { buyerId: c.buyerId, id: { not: c.id } },
      select: { amount: true, status: true },
    });
    return {
      ...view(c),
      order: c.data as unknown as OrderCheckView['order'],
      buyerStats: {
        orders: others.length,
        total: others.reduce((a, o) => a + o.amount, 0),
        rejected: others.filter((o) => o.status === 'REJECTED' || o.status === 'TIMEOUT').length,
      },
    };
  }

  /** Admin FINANCE duyệt/từ chối. Admin là người mua hoặc chủ shop trong đơn → 403 */
  async decide(
    admin: AuthUser,
    checkId: string,
    decision: 'APPROVE' | 'REJECT',
    reason: string | undefined,
  ): Promise<OrderCheckView> {
    if (decision === 'REJECT' && !reason?.trim()) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu chưa hợp lệ.', {
        fields: { reason: 'Vui lòng nhập lý do từ chối.' },
      });
    }
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.orderCheck.findUnique({ where: { id: checkId } });
      if (!c) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy hồ sơ kiểm tra đơn.');
      if (c.buyerId === admin.id || c.ownerIds.includes(admin.id)) {
        throw new AppError(
          403,
          'SELF_APPROVAL_FORBIDDEN',
          'Bạn là người mua hoặc chủ shop trong đơn này nên không được tự duyệt.',
        );
      }
      const now = new Date();
      const status: OrderCheckStatus = decision === 'APPROVE' ? 'PASSED' : 'REJECTED';
      // Cập nhật có điều kiện: hai admin bấm cùng lúc, hoặc đua với job quá hạn, chỉ một bên được
      const { count } = await tx.orderCheck.updateMany({
        where: { id: checkId, status: 'PENDING' },
        data: {
          status,
          reason: reason?.trim() || null,
          decidedBy: admin.id,
          decidedByName: admin.name,
          decidedAt: now,
        },
      });
      if (count === 0) {
        throw new AppError(409, 'ALREADY_DECIDED', 'Hồ sơ này đã được xử lý.');
      }
      await writeAudit(tx, {
        actor: admin,
        action: decision === 'APPROVE' ? 'APPROVE_ORDER' : 'REJECT_ORDER',
        targetType: 'ORDER',
        targetId: c.orderId,
        reason: reason ?? null,
        before: { status: c.status },
        after: { status },
      });
      await this.publish(
        tx,
        c,
        status === 'PASSED' ? 'PASSED' : 'REJECTED',
        reason ?? null,
        admin,
        now,
      );
    });
    return this.detail(checkId);
  }

  /** Job: hồ sơ quá hạn chưa duyệt → TIMEOUT, đơn bị hủy (không bao giờ tự duyệt) */
  async timeout(now = new Date()): Promise<number> {
    const due = await this.prisma.orderCheck.findMany({
      where: { status: 'PENDING', deadline: { lt: now } },
      take: 200,
    });
    let done = 0;
    for (const c of due) {
      done += await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.orderCheck.updateMany({
          where: { id: c.id, status: 'PENDING' },
          data: { status: 'TIMEOUT', reason: 'Quá hạn chưa duyệt', decidedAt: now },
        });
        if (count === 0) return 0;
        await this.publish(tx, c, 'TIMEOUT', 'Quá hạn chưa được duyệt', null, now);
        return 1;
      });
    }
    if (done) this.logger.log(`${done} đơn quá hạn duyệt, tự hủy.`);
    return done;
  }

  private async publish(
    tx: Tx,
    c: OrderCheck,
    result: 'PASSED' | 'REJECTED' | 'TIMEOUT',
    reason: string | null,
    admin: AuthUser | null,
    at: Date,
  ): Promise<void> {
    await this.events.publish(tx, ORDER_CHECK_DECIDED, {
      orderId: c.orderId,
      checkId: c.id,
      result,
      reason,
      decidedBy: admin ? { userId: admin.id, name: admin.name } : null,
      decidedAt: at.toISOString(),
    });
  }
}

function view(c: OrderCheck): OrderCheckView {
  return {
    id: c.id,
    orderId: c.orderId,
    orderCode: c.orderCode,
    buyer: { id: c.buyerId, name: c.buyerName, email: c.buyerEmail },
    amount: c.amount,
    paymentMethod: c.paymentMethod,
    rulesHit: c.rulesHit as unknown as RuleHit[],
    status: c.status,
    deadline: c.deadline,
    reason: c.reason,
    decidedByName: c.decidedByName,
    decidedAt: c.decidedAt,
    createdAt: c.createdAt,
  };
}
