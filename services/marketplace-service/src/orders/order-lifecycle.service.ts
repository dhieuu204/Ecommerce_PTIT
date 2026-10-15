import { Injectable, Logger } from '@nestjs/common';
import { EventBus, SettingsService } from '@san/nest-common';
import {
  SHOP_ORDER_CANCELLED,
  SHOP_ORDER_COMPLETED,
  SHOP_ORDER_DELIVERED,
  SHOP_ORDER_DELIVERY_FAILED,
  SHOP_ORDER_INCIDENT_CONFIRMED,
  type OrderCheckDecidedPayload,
  type PaymentSucceededPayload,
  type RefundUpdatedPayload,
} from '@san/shared';
import { applyReturnRefund, OPEN_RETURN_STATUSES } from '../returns/return-state';
import { MarketSetting } from '../settings';
import type { CancelActor, Prisma, ShopOrder, ShopOrderStatus } from '../../generated/prisma';

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

/** Đơn con chưa bàn giao cho GHN: còn hủy được */
export const OPEN_STATUSES: ShopOrderStatus[] = [
  'PENDING',
  'TO_CONFIRM',
  'CONFIRMED',
  'CANCEL_REQUESTED',
];

/** Trạng thái đã kết thúc của đơn con */
export const FINAL_STATUSES: ShopOrderStatus[] = [
  'CANCELLED',
  'COMPLETED',
  'FAILED',
  'INCIDENT_RESOLVED',
];

/** Vận đơn chưa được GHN lấy hàng: hủy đơn thì hủy luôn vận đơn */
const UNPICKED_SHIPMENT = ['CREATING', 'UNKNOWN', 'CREATE_FAILED', 'READY_TO_PICK'] as const;

const day = 86_400_000;

/**
 * Các bước chuyển trạng thái đơn (STATE-01). Mọi hàm chạy trong giao dịch `tx` của người gọi và khóa theo
 * đơn tổng trước khi đọc, nên hai việc cùng lúc trên một đơn (buyer hủy và tiền về, GHN báo lấy hàng và
 * shop hủy...) chạy lần lượt; mỗi bước kiểm lại trạng thái nên chạy lại không có tác động mới.
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
   * Hủy các đơn con (ORD-05). Đơn trả trước chưa trả: nhả lượng đang giữ. Đã trả hoặc COD (tồn đã trừ):
   * cộng lại tồn, giảm "đã bán". Đã trả thì báo payment-service hoàn tiền qua shop_order.cancelled.
   * Trả lượt voucher shop của đơn con; hủy hết đơn tổng thì trả thêm voucher sàn (hết hạn thì không trả).
   * Vận đơn chưa lấy hàng: `carrierCancelled` chứa đơn con đã hủy được với GHN → CANCELLED; còn lại
   * → CANCELLING (job báo hủy với GHN sau). Chỉ hủy đơn con thuộc `from`; trả số đơn con đã hủy.
   */
  async cancel(
    tx: Tx,
    orderId: string,
    shopOrderIds: string[] | 'ALL',
    actor: Actor,
    reason: string,
    from: ShopOrderStatus[] = OPEN_STATUSES,
    carrierCancelled: Set<string> = new Set(),
  ): Promise<number> {
    await this.lock(tx, orderId);
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { shopOrders: { include: { items: true, shipments: true } } },
    });
    const targets = order.shopOrders.filter(
      (so) => (shopOrderIds === 'ALL' || shopOrderIds.includes(so.id)) && from.includes(so.status),
    );
    if (targets.length === 0) return 0;

    const now = new Date();
    const paid = order.paymentStatus === 'PAID';
    // Tồn đã trừ hẳn: trả trước đã thanh toán, hoặc COD (trừ lúc đặt)
    const stockCommitted = paid || order.paymentStatus === 'COD';
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

      for (const sh of so.shipments) {
        if (!(UNPICKED_SHIPMENT as readonly string[]).includes(sh.status)) continue;
        const done = carrierCancelled.has(so.id) || (!sh.ghnCode && sh.status === 'CREATE_FAILED');
        await tx.shipment.update({
          where: { id: sh.id },
          data: { status: done ? 'CANCELLED' : 'CANCELLING' },
        });
      }

      for (const item of so.items) {
        if (stockCommitted) {
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
    if (order.paymentStatus !== 'UNPAID') return;
    if (order.shopOrders.every((so) => so.status === 'CANCELLED')) {
      this.logger.log(`Đơn ${order.code} đã hủy trước khi tiền về; payment-service sẽ hoàn.`);
      return;
    }
    const paidAt = new Date(p.paidAt);
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID', paidAt } });
    for (const so of order.shopOrders) {
      const fee = p.shopOrders.find((x) => x.shopOrderId === so.id);
      if (fee) await this.saveFee(tx, so.id, fee);
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

  /** Lưu phí sàn, tiền seller dự kiến (payment-service tính) vào đơn con */
  async saveFee(
    tx: Tx,
    shopOrderId: string,
    fee: { platformFeeRate: number; platformFee: number; sellerAmount: number },
  ): Promise<void> {
    await tx.shopOrder.update({
      where: { id: shopOrderId },
      data: {
        platformFeeRate: fee.platformFeeRate,
        platformFee: fee.platformFee,
        sellerAmount: fee.sellerAmount,
      },
    });
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
      // Trả trước phải đã thanh toán; COD không cần chờ tiền
      if (order.paymentStatus !== 'UNPAID') await this.toConfirm(tx, order.id);
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
    if (!order || order.paymentStatus !== 'UNPAID') return 0;
    return this.cancel(tx, orderId, 'ALL', SYSTEM, reason);
  }

  /** Cập nhật trạng thái hoàn tiền (refund.updated); chỉ áp tin mới hơn. Khoản hoàn trả hàng (P5) áp vào yêu cầu */
  async applyRefund(tx: Tx, p: RefundUpdatedPayload): Promise<void> {
    if (p.returnId) return applyReturnRefund(tx, p);
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

  // ----- P4: giao hàng -----

  /** GHN đã lấy hàng: "Chờ giao hàng" (hoặc đang xin hủy: yêu cầu hủy hết hiệu lực) → "Đang giao" */
  async onPicked(tx: Tx, so: ShopOrder, at: Date): Promise<void> {
    if (so.status !== 'CONFIRMED' && so.status !== 'CANCEL_REQUESTED') return;
    await tx.shopOrder.update({ where: { id: so.id }, data: { status: 'SHIPPING', pickedAt: at } });
    await this.history(
      tx,
      so.id,
      so.status,
      'SHIPPING',
      { type: 'SYSTEM', name: 'GHN' },
      so.status === 'CANCEL_REQUESTED'
        ? 'GHN đã lấy hàng nên yêu cầu hủy hết hiệu lực'
        : 'GHN đã lấy hàng',
    );
  }

  /** GHN giao thành công: bắt đầu đếm ngày tới hoàn tất, báo payment-service (COD vào ngăn đang giữ) */
  async onDelivered(
    tx: Tx,
    so: ShopOrder,
    shipment: { ghnCode: string | null; fee: number | null },
    at: Date,
  ): Promise<void> {
    if (!['SHIPPING', 'CONFIRMED', 'CANCEL_REQUESTED'].includes(so.status)) return;
    const days = await this.settings.get(MarketSetting.completeDays);
    await tx.shopOrder.update({
      where: { id: so.id },
      data: {
        status: 'DELIVERED',
        deliveredAt: at,
        completeBefore: new Date(at.getTime() + days * day),
      },
    });
    await this.history(
      tx,
      so.id,
      so.status,
      'DELIVERED',
      { type: 'SYSTEM', name: 'GHN' },
      'Đã giao hàng',
    );
    const order = await tx.order.findUniqueOrThrow({ where: { id: so.orderId } });
    await this.events.publish(tx, SHOP_ORDER_DELIVERED, {
      orderId: so.orderId,
      shopOrderId: so.id,
      paymentMethod: order.paymentMethod,
      ghnCode: shipment.ghnCode ?? '',
      codAmount: so.codAmount,
      carrierFee: shipment.fee,
      deliveredAt: at.toISOString(),
    });
  }

  /**
   * Giao thất bại lần cuối (GHN bắt đầu hoàn kiện): đơn trả trước hoàn tiền hàng sau voucher, không hoàn
   * phí ship chiều đi (STATE-01 số 5). Tồn kho chưa cộng cho tới khi shop xác nhận nhận kiện.
   */
  async onReturning(tx: Tx, so: ShopOrder, at: Date): Promise<void> {
    if (so.status !== 'SHIPPING') return;
    const order = await tx.order.findUniqueOrThrow({ where: { id: so.orderId } });
    const paid = order.paymentStatus === 'PAID';
    const refundAmount = paid ? so.total - so.shippingFee : 0;
    await tx.shopOrder.update({
      where: { id: so.id },
      data: {
        status: 'RETURNING',
        refundStatus: refundAmount > 0 ? 'PROCESSING' : 'NONE',
        refundUpdatedAt: refundAmount > 0 ? at : null,
      },
    });
    await this.history(
      tx,
      so.id,
      'SHIPPING',
      'RETURNING',
      { type: 'SYSTEM', name: 'GHN' },
      'Giao không thành công, GHN đang hoàn hàng về shop',
    );
    await this.events.publish(tx, SHOP_ORDER_DELIVERY_FAILED, {
      orderId: so.orderId,
      shopOrderId: so.id,
      paymentMethod: order.paymentMethod,
      refundAmount,
      failedAt: at.toISOString(),
    });
  }

  /** GHN báo đã hoàn kiện về shop: chờ shop xác nhận, quá hạn thì tự đóng */
  async onReturned(tx: Tx, so: ShopOrder, at: Date): Promise<void> {
    if (so.status !== 'RETURNING') return;
    const days = await this.settings.get(MarketSetting.returnCloseDays);
    await tx.shopOrder.update({
      where: { id: so.id },
      data: {
        status: 'RETURNED',
        returnedAt: at,
        returnCloseBefore: new Date(at.getTime() + days * day),
      },
    });
    await this.history(
      tx,
      so.id,
      'RETURNING',
      'RETURNED',
      { type: 'SYSTEM', name: 'GHN' },
      'GHN đã hoàn kiện về shop',
    );
  }

  /** GHN báo thất lạc/hư hỏng: chờ admin hỗ trợ xác nhận */
  async onIncident(tx: Tx, so: ShopOrder, note: string): Promise<void> {
    if (so.status !== 'SHIPPING' && so.status !== 'RETURNING') return;
    await tx.shopOrder.update({ where: { id: so.id }, data: { status: 'INCIDENT' } });
    await this.history(tx, so.id, so.status, 'INCIDENT', { type: 'SYSTEM', name: 'GHN' }, note);
  }

  /**
   * Đơn hoàn tất (người mua bấm "Đã nhận", hết hạn, hoặc yêu cầu trả hàng đã kết thúc): báo payment-service
   * xét chuyển tiền khả dụng. Còn yêu cầu trả hàng đang mở thì chưa hoàn tất (P5). Sự kiện mang mã yêu cầu
   * trả hàng (nếu có) để payment-service chờ kết quả của yêu cầu đó rồi mới chuyển tiền.
   */
  async complete(tx: Tx, shopOrderId: string, actor: Actor, note?: string): Promise<boolean> {
    const so = await tx.shopOrder.findUniqueOrThrow({ where: { id: shopOrderId } });
    await this.lock(tx, so.orderId);
    const fresh = await tx.shopOrder.findUniqueOrThrow({
      where: { id: shopOrderId },
      include: { returnRequest: { select: { id: true, status: true } } },
    });
    if (fresh.status !== 'DELIVERED') return false;
    const ret = fresh.returnRequest;
    if (ret && OPEN_RETURN_STATUSES.includes(ret.status)) return false;
    const now = new Date();
    await tx.shopOrder.update({
      where: { id: so.id },
      data: { status: 'COMPLETED', completedAt: now },
    });
    await this.history(
      tx,
      so.id,
      'DELIVERED',
      'COMPLETED',
      actor,
      note ??
        (actor.type === 'BUYER' ? 'Người mua xác nhận đã nhận hàng' : 'Hết hạn, đơn tự hoàn tất'),
    );
    await this.events.publish(tx, SHOP_ORDER_COMPLETED, {
      orderId: so.orderId,
      shopOrderId: so.id,
      completedBy: actor.type === 'BUYER' ? 'BUYER' : 'SYSTEM',
      returnId: ret?.id ?? null,
      completedAt: now.toISOString(),
    });
    return true;
  }

  /**
   * Đóng đơn giao thất bại (SHIP-04): shop xác nhận đã nhận kiện hoàn và chọn dòng nhập lại kho, hoặc quá
   * hạn thì tự đóng không cộng kho. Hàng không bán được nên giảm lại "đã bán".
   */
  async closeReturn(
    tx: Tx,
    shopOrderId: string,
    actor: Actor,
    restockItemIds: string[],
  ): Promise<boolean> {
    const so0 = await tx.shopOrder.findUniqueOrThrow({ where: { id: shopOrderId } });
    await this.lock(tx, so0.orderId);
    const so = await tx.shopOrder.findUniqueOrThrow({
      where: { id: shopOrderId },
      include: { items: true },
    });
    if (so.status !== 'RETURNED') return false;
    for (const item of so.items) {
      await tx.$executeRaw`
        UPDATE products SET sold_count = GREATEST(sold_count - ${item.quantity}, 0)
        WHERE id = ${item.productId}::uuid`;
      if (!restockItemIds.includes(item.id)) continue;
      const [row] = await tx.$queryRaw<Array<{ stock: number }>>`
        UPDATE product_variants SET stock = stock + ${item.quantity}
        WHERE id = ${item.variantId}::uuid RETURNING stock`;
      await tx.stockHistory.create({
        data: {
          variantId: item.variantId,
          change: item.quantity,
          stockAfter: row!.stock,
          reason: `Nhận kiện hoàn đơn ${so.code}`,
          createdBy: actor.id ?? SYSTEM_USER_ID,
          orderId: so.orderId,
        },
      });
    }
    await tx.shopOrder.update({ where: { id: so.id }, data: { status: 'FAILED' } });
    const restocked = so.items.filter((i) => restockItemIds.includes(i.id)).length;
    await this.history(
      tx,
      so.id,
      'RETURNED',
      'FAILED',
      actor,
      actor.type === 'SYSTEM'
        ? 'Shop chưa xác nhận nhận kiện hoàn đúng hạn, tự đóng (không cộng kho)'
        : `Shop đã nhận kiện hoàn, nhập lại kho ${restocked}/${so.items.length} dòng hàng`,
    );
    return true;
  }

  /** Admin xác nhận sự cố GHN: người mua trả trước được hoàn đủ, seller được đền (payment-service) */
  async resolveIncident(tx: Tx, shopOrderId: string, actor: Actor, note: string): Promise<boolean> {
    const so0 = await tx.shopOrder.findUniqueOrThrow({ where: { id: shopOrderId } });
    await this.lock(tx, so0.orderId);
    const so = await tx.shopOrder.findUniqueOrThrow({
      where: { id: shopOrderId },
      include: { order: true },
    });
    if (so.status !== 'INCIDENT') return false;
    const now = new Date();
    // Thất lạc lúc đang hoàn về: người mua đã được hoàn khi giao thất bại, không hoàn lần nữa
    const paid = so.order.paymentStatus === 'PAID' && so.refundStatus === 'NONE';
    const refundAmount = paid ? so.total : 0;
    await tx.shopOrder.update({
      where: { id: so.id },
      data: {
        status: 'INCIDENT_RESOLVED',
        incidentNote: note,
        refundStatus: refundAmount > 0 ? 'PROCESSING' : so.refundStatus,
        refundUpdatedAt: refundAmount > 0 ? now : so.refundUpdatedAt,
      },
    });
    await this.history(tx, so.id, 'INCIDENT', 'INCIDENT_RESOLVED', actor, note);
    await this.events.publish(tx, SHOP_ORDER_INCIDENT_CONFIRMED, {
      orderId: so.orderId,
      shopOrderId: so.id,
      paymentMethod: so.order.paymentMethod,
      refundAmount,
      note,
      confirmedAt: now.toISOString(),
    });
    return true;
  }

  /**
   * Đơn đủ điều kiện (đã trả hoặc COD, đã qua kiểm tra): các đơn con PENDING sang "Chờ shop xác nhận",
   * bắt đầu đếm hạn xác nhận và hạn bàn giao.
   */
  private async toConfirm(tx: Tx, orderId: string): Promise<void> {
    const s = await this.settings.values([MarketSetting.confirmHours, MarketSetting.handoverHours]);
    const now = Date.now();
    const confirmBefore = new Date(now + s[MarketSetting.confirmHours]! * 3600_000);
    const handoverBefore = new Date(now + s[MarketSetting.handoverHours]! * 3600_000);
    const pending = await tx.shopOrder.findMany({ where: { orderId, status: 'PENDING' } });
    for (const so of pending) {
      await tx.shopOrder.update({
        where: { id: so.id },
        data: { status: 'TO_CONFIRM', confirmBefore, handoverBefore },
      });
      await this.history(
        tx,
        so.id,
        'PENDING',
        'TO_CONFIRM',
        SYSTEM,
        'Đơn đủ điều kiện để shop xử lý',
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
