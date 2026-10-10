import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventBus } from '@san/nest-common';
import { SHOP_SUSPENSION_DECIDED, type ShopSuspensionDecidedPayload } from '@san/shared';
import type { Prisma } from '../../generated/prisma';
import { OPEN_STATUSES, OrderLifecycle, SYSTEM } from '../orders/order-lifecycle.service';

/**
 * Nhận quyết định đình chỉ/khôi phục shop từ approval-service (SHP-04).
 * Sự kiện có thể tới sai thứ tự: chỉ áp quyết định mới hơn quyết định đã áp (cột moderated_at).
 */
@Injectable()
export class ShopSuspensionEvents implements OnModuleInit {
  private readonly logger = new Logger(ShopSuspensionEvents.name);

  constructor(
    private readonly events: EventBus,
    private readonly lifecycle: OrderLifecycle,
  ) {}

  onModuleInit(): void {
    this.events.subscribe(SHOP_SUSPENSION_DECIDED, (payload, tx: Prisma.TransactionClient) =>
      this.apply(payload, tx),
    );
  }

  async apply(p: ShopSuspensionDecidedPayload, tx: Prisma.TransactionClient): Promise<void> {
    const shop = await tx.shop.findUnique({
      where: { id: p.shopId },
      select: { status: true, moderatedAt: true },
    });
    if (!shop || (shop.status !== 'ACTIVE' && shop.status !== 'SUSPENDED')) {
      // Chưa áp quyết định duyệt mở shop (sự kiện đó chưa tới): ném lỗi để sự kiện được gửi lại sau
      throw new Error(`Shop ${p.shopId} chưa hoạt động, chưa áp được quyết định đình chỉ.`);
    }
    const decidedAt = new Date(p.decidedAt);
    // Cập nhật có điều kiện: hai sự kiện xử lý cùng lúc thì chỉ quyết định mới hơn được giữ
    const { count } = await tx.shop.updateMany({
      where: {
        id: p.shopId,
        status: { in: ['ACTIVE', 'SUSPENDED'] },
        OR: [{ moderatedAt: null }, { moderatedAt: { lt: decidedAt } }],
      },
      data:
        p.action === 'SUSPEND'
          ? { status: 'SUSPENDED', suspendReason: p.reason, moderatedAt: decidedAt }
          : { status: 'ACTIVE', suspendReason: null, moderatedAt: decidedAt },
    });
    if (count === 0) {
      this.logger.log(`Bỏ qua quyết định ${p.action} shop ${p.shopId}: đã áp quyết định mới hơn.`);
      return;
    }
    if (p.action === 'SUSPEND') await this.cancelOpenOrders(tx, p.shopId);
  }

  /**
   * Shop bị đình chỉ (quyết định P3 số 8): hủy mọi đơn con chưa bàn giao của shop, hoàn tiền nếu đã trả.
   * Đơn tổng chưa trả thì hủy cả đơn tổng (chưa trả chỉ hủy được cả đơn).
   */
  private async cancelOpenOrders(tx: Prisma.TransactionClient, shopId: string): Promise<void> {
    const open = await tx.shopOrder.findMany({
      where: { shopId, status: { in: OPEN_STATUSES } },
      select: { id: true, orderId: true, order: { select: { paymentStatus: true } } },
    });
    for (const so of open) {
      await this.lifecycle.cancel(
        tx,
        so.orderId,
        so.order.paymentStatus === 'PAID' ? [so.id] : 'ALL',
        SYSTEM,
        'Shop tạm ngừng bán.',
      );
    }
    if (open.length) this.logger.log(`Shop ${shopId} bị đình chỉ: hủy ${open.length} đơn con.`);
  }
}
