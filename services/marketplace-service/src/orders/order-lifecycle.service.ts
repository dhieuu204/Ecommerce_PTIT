import { Injectable, Logger } from '@nestjs/common';
import { EventBus, SettingsService } from '@san/nest-common';
import {
  SHOP_ORDER_CANCELLED,
  type OrderCheckDecidedPayload,
  type PaymentSucceededPayload,
  type RefundUpdatedPayload,
} from '@san/shared';
import { MarketSetting } from '../settings';
import type { CancelActor, Prisma, ShopOrderStatus } from '../../generated/prisma';

type Tx = Prisma.TransactionClient;

/** Ai làm một thao tác trên đơn (ghi vào order_history) */
export interface Actor {
  type: CancelActor;
  id?: string | null;
  name?: string | null;
}

export const SYSTEM: Actor = { type: 'SYSTEM', name: 'Hệ thống' };

/** Mã người làm cho việc hệ thống tự làm (stock_history.created_by bắt buộc có) */
export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

/** Đơn con chưa bàn giao (P3: mọi trạng thái trừ đã hủy) */
export const OPEN_STATUSES: ShopOrderStatus[] = [
  'PENDING',
  'TO_CONFIRM',
  'CONFIRMED',
  'CANCEL_REQUESTED',
];

/**
 * Các bước chuyển trạng thái đơn (STATE-01, phần P3). Mọi hàm chạy trong giao dịch `tx` của người gọi
 * và khóa theo đơn tổng trước khi đọc, nên hai việc cùng lúc trên một đơn (buyer hủy và tiền về, job hết
 * hạn và shop xác nhận...) chạy lần lượt; mỗi bước kiểm lại trạng thái nên chạy lại không có tác động mới.
 */
@Injectable()
export class OrderLifecycle {
  private readonly logger = new Logger(OrderLifecycle.name);

  constructor(
    private readonly events: EventBus,
    private readonly settings: SettingsService,
  ) {}

  /** Khóa đơn tổng tới hết giao dịch */
  async lock(tx: Tx, orderId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`order:${orderId}`}))`;
  }

  /**
   * Hủy các đơn con (ORD-05). Đơn chưa trả: nhả lượng đang giữ. Đã trả: cộng lại tồn (ghi stock_history),
   * giảm "đã bán", báo payment-service hoàn tiền qua shop_order.cancelled. Trả lượt voucher shop của đơn con;
   * hủy hết đơn tổng thì trả thêm voucher sàn (voucher đã hết hạn thì không trả).
   * Chỉ hủy đơn con thuộc `from`; trả số đơn con đã hủy.
   */
  async cancel(
    tx: Tx,
    orderId: string,
    shopOrderIds: string[] | 'ALL',
    actor: Actor,
    reason: string,
    from: ShopOrderStatus[] = OPEN_STATUSES,
  ): Promise<number> {
    await this.lock(tx, orderId);
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { shopOrders: { include: { items: true } } },
    });
    const targets = order.shopOrders.filter(
      (so) => (shopOrderIds === 'ALL' || shopOrderIds.includes(so.id)) && from.includes(so.status),
    );
    if (targets.length === 0) return 0;

    const now = new Date();
    const paid = order.paymentStatus === 'PAID';
    const stillOpen = order.shopOrders.filter(
      (so) => so.status !== 'CANCELLED' && !targets.some((t) => t.id === so.id),
    );
    const orderCancelled = stillOpen.length === 0;

    for (const so of targets) {
      await tx.shopOrder.update({
        where: { id: so.id },
        data: {
          status: 'CANCELLED',
          cancelledBy: actor.type,
          cancelReason: reason,
          cancelledAt: now,
          refundStatus: paid && so.total > 0 ? 'PROCESSING' : 'NONE',
          refundUpdatedAt: paid ? now : null,
        },
      });
      await this.history(tx, so.id, so.status, 'CANCELLED', actor, reason);

      for (const item of so.items) {
        if (paid) {
          const [row] = await tx.$queryRaw<Array<{ stock: number }>>`
            UPDATE product_variants SET stock = stock + ${item.quantity}
            WHERE id = ${item.variantId}::uuid RETURNING stock`;
          await tx.stockHistory.create({
            data: {
              variantId: item.variantId,
              change: item.quantity,
              stockAfter: row!.stock,
              reason: `Hủy đơn ${so.code}`,
              createdBy: actor.id ?? SYSTEM_USER_ID,
              orderId,
            },
          });
          await tx.$executeRaw`
            UPDATE products SET sold_count = GREATEST(sold_count - ${item.quantity}, 0)
            WHERE id = ${item.productId}::uuid`;
        } else {
          await tx.$executeRaw`
            UPDATE product_variants SET reserved = GREATEST(reserved - ${item.quantity}, 0)
            WHERE id = ${item.variantId}::uuid`;
        }
      }
      await this.returnVouchers(tx, { orderId, shopOrderId: so.id }, now);
    }
    if (orderCancelled) await this.returnVouchers(tx, { orderId, shopOrderId: null }, now);

    for (const so of targets) {
      await this.events.publish(tx, SHOP_ORDER_CANCELLED, {
        orderId,
        shopOrderId: so.id,
        code: so.code,
        shopId: so.shopId,
        cancelledBy: actor.type,
        reason,
        orderCancelled,
        cancelledAt: now.toISOString(),
      });
    }
    return targets.length;
  }

  /**
   * Tiền đã về (payment.succeeded): ghi đã trả, chốt tồn (INV-02), lưu phí sàn. Đơn đã bị hủy trước khi
   * tin tới thì bỏ qua (payment-service tự hoàn khi nhận shop_order.cancelled).
   */
  async markPaid(tx: Tx, p: PaymentSucceededPayload): Promise<void> {
    await this.lock(tx, p.orderId);
    const order = await tx.order.findUnique({
      where: { id: p.orderId },
      include: { shopOrders: { include: { items: true } } },
    });
    if (!order) throw new Error(`Chưa có đơn ${p.orderId}`);
    if (order.paymentStatus === 'PAID') return;
    if (order.shopOrders.every((so) => so.status === 'CANCELLED')) {
      this.logger.log(`Đơn ${order.code} đã hủy trước khi tiền về; payment-service sẽ hoàn.`);
      return;
    }
    const paidAt = new Date(p.paidAt);
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID', paidAt } });
    for (const so of order.shopOrders) {
      const fee = p.shopOrders.find((x) => x.shopOrderId === so.id);
      if (fee) {
        await tx.shopOrder.update({
          where: { id: so.id },
          data: {
            platformFeeRate: fee.platformFeeRate,
            platformFee: fee.platformFee,
            sellerAmount: fee.sellerAmount,
          },
        });
      }
      if (so.status === 'CANCELLED') continue;
      for (const item of so.items) {
        // Chốt tồn: lượng đang giữ thành đã bán
        const [row] = await tx.$queryRaw<Array<{ stock: number }>>`
          UPDATE product_variants
          SET stock = stock - ${item.quantity}, reserved = GREATEST(reserved - ${item.quantity}, 0)
          WHERE id = ${item.variantId}::uuid RETURNING stock`;
        await tx.stockHistory.create({
          data: {
            variantId: item.variantId,
            change: -item.quantity,
            stockAfter: row!.stock,
            reason: `Bán đơn ${so.code}`,
            createdBy: order.buyerId,
            orderId: order.id,
          },
        });
        await tx.$executeRaw`
          UPDATE products SET sold_count = sold_count + ${item.quantity}
          WHERE id = ${item.productId}::uuid`;
      }
    }
    if (order.checkStatus === 'PASSED') await this.toConfirm(tx, order.id);
  }

  /** Kết quả kiểm tra đơn (order_check.decided) */
  async applyCheck(tx: Tx, p: OrderCheckDecidedPayload): Promise<void> {
    await this.lock(tx, p.orderId);
    const order = await tx.order.findUnique({ where: { id: p.orderId } });
    if (!order) throw new Error(`Chưa có đơn ${p.orderId}`);
    if (order.checkStatus !== 'PENDING') return;
    const passed = p.result === 'PASSED';
    await tx.order.update({
      where: { id: order.id },
      data: { checkStatus: passed ? 'PASSED' : 'REJECTED' },
    });
    if (passed) {
      if (order.paymentStatus === 'PAID') await this.toConfirm(tx, order.id);
      return;
    }
    const reason =
      p.result === 'TIMEOUT'
        ? 'Đơn chưa được duyệt trong thời hạn nên tự hủy.'
        : `Đơn không được duyệt: ${p.reason ?? 'không đạt kiểm tra'}`;
    await this.cancel(tx, order.id, 'ALL', SYSTEM, reason);
  }

  /** Hết hạn thanh toán (payment.expired hoặc job hết giữ tồn): hủy cả đơn tổng nếu còn chưa trả */
  async expire(tx: Tx, orderId: string, reason: string): Promise<number> {
    await this.lock(tx, orderId);
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.paymentStatus === 'PAID') return 0;
    return this.cancel(tx, orderId, 'ALL', SYSTEM, reason);
  }

  /** Cập nhật trạng thái hoàn tiền (refund.updated); chỉ áp tin mới hơn */
  async applyRefund(tx: Tx, p: RefundUpdatedPayload): Promise<void> {
    if (!p.shopOrderId) return;
    const updatedAt = new Date(p.updatedAt);
    await tx.shopOrder.updateMany({
      where: {
        id: p.shopOrderId,
        OR: [{ refundUpdatedAt: null }, { refundUpdatedAt: { lte: updatedAt } }],
      },
      data: { refundStatus: p.status, refundUpdatedAt: updatedAt },
    });
  }

  /** Đơn đã trả và đã qua kiểm tra: các đơn con PENDING sang "Chờ shop xác nhận", bắt đầu đếm hạn */
  private async toConfirm(tx: Tx, orderId: string): Promise<void> {
    const hours = await this.settings.get(MarketSetting.confirmHours);
    const confirmBefore = new Date(Date.now() + hours * 3600_000);
    const pending = await tx.shopOrder.findMany({ where: { orderId, status: 'PENDING' } });
    for (const so of pending) {
      await tx.shopOrder.update({
        where: { id: so.id },
        data: { status: 'TO_CONFIRM', confirmBefore },
      });
      await this.history(
        tx,
        so.id,
        'PENDING',
        'TO_CONFIRM',
        SYSTEM,
        'Đã thanh toán và qua kiểm tra',
      );
    }
  }

  async history(
    tx: Tx,
    shopOrderId: string,
    from: ShopOrderStatus | null,
    to: ShopOrderStatus,
    actor: Actor,
    note: string | null,
  ): Promise<void> {
    await tx.orderHistory.create({
      data: {
        shopOrderId,
        fromStatus: from,
        toStatus: to,
        actorType: actor.type,
        actorId: actor.id ?? null,
        actorName: actor.name ?? null,
        note,
      },
    });
  }

  /** Trả lượt voucher (VCH-03): voucher shop của một đơn con, hoặc voucher sàn (shopOrderId = null) */
  private async returnVouchers(
    tx: Tx,
    where: { orderId: string; shopOrderId: string | null },
    now: Date,
  ): Promise<void> {
    const usages = await tx.voucherUsage.findMany({
      where: { ...where, returnedAt: null },
      include: { voucher: { select: { endAt: true } } },
    });
    for (const u of usages) {
      if (u.voucher.endAt <= now) continue; // voucher đã hết hạn thì không trả
      await tx.voucherUsage.update({ where: { id: u.id }, data: { returnedAt: now } });
      await tx.$executeRaw`
        UPDATE vouchers SET used_count = GREATEST(used_count - 1, 0), updated_at = now()
        WHERE id = ${u.voucherId}::uuid`;
    }
  }
}
