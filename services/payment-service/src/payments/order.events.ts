import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventBus, SettingsService } from '@san/nest-common';
import {
  ORDER_PLACED,
  RETURN_REQUESTED,
  RETURN_RESOLVED,
  SELLER_EARNINGS_RECORDED,
  SHOP_ORDER_CANCELLED,
  SHOP_ORDER_COMPLETED,
  SHOP_ORDER_DELIVERED,
  SHOP_ORDER_DELIVERY_FAILED,
  SHOP_ORDER_INCIDENT_CONFIRMED,
  type OrderPlacedPayload,
  type ReturnRequestedPayload,
  type ReturnResolvedPayload,
  type ShopOrderCancelledPayload,
  type ShopOrderCompletedPayload,
  type ShopOrderDeliveredPayload,
  type ShopOrderDeliveryFailedPayload,
  type ShopOrderIncidentConfirmedPayload,
} from '@san/shared';
import { RefundsService } from '../refunds/refunds.service';
import { PaymentSetting } from '../settings';
import { settleReturn } from '../wallet/return-money';
import { WalletService } from '../wallet/wallet.service';
import type { Prisma, SellerEarning } from '../../generated/prisma';
import { PaymentsService } from './payments.service';

type Tx = Prisma.TransactionClient;

/** Phí sàn (FIN-03): % × 100 trên tiền hàng sau voucher shop, làm tròn xuống tới đồng */
export function platformFee(subtotal: number, shopDiscount: number, rate: number): number {
  return Math.floor(((subtotal - shopDiscount) * rate) / 10_000);
}

/**
 * Nhận vòng đời đơn từ marketplace-service: đơn mới, hủy, đã giao, hoàn tất, giao thất bại, sự cố.
 * Sự kiện có thể tới trùng hoặc sai thứ tự: mỗi bước kiểm trạng thái hiện tại, tiền ví chống ghi trùng
 * theo (đơn con, loại), khoản hoàn mỗi đơn con tối đa một.
 */
@Injectable()
export class PaymentOrderEvents implements OnModuleInit {
  private readonly logger = new Logger(PaymentOrderEvents.name);

  constructor(
    private readonly events: EventBus,
    private readonly settings: SettingsService,
    private readonly payments: PaymentsService,
    private readonly refunds: RefundsService,
    private readonly wallet: WalletService,
  ) {}

  onModuleInit(): void {
    this.events.subscribe(ORDER_PLACED, (p, tx: Tx) => this.placed(p, tx));
    this.events.subscribe(SHOP_ORDER_CANCELLED, (p, tx: Tx) => this.cancelled(p, tx));
    this.events.subscribe(SHOP_ORDER_DELIVERED, (p, tx: Tx) => this.delivered(p, tx));
    this.events.subscribe(SHOP_ORDER_COMPLETED, (p, tx: Tx) => this.completed(p, tx));
    this.events.subscribe(SHOP_ORDER_DELIVERY_FAILED, (p, tx: Tx) => this.deliveryFailed(p, tx));
    this.events.subscribe(SHOP_ORDER_INCIDENT_CONFIRMED, (p, tx: Tx) => this.incident(p, tx));
    this.events.subscribe(RETURN_REQUESTED, (p, tx: Tx) => this.returnRequested(p, tx));
    this.events.subscribe(RETURN_RESOLVED, (p, tx: Tx) => this.returnResolved(p, tx));
  }

  /**
   * Mỗi đơn con một dòng seller_earnings: số buyer trả, phí sàn chụp theo phiên bản đang dùng (PAY-04).
   * Tạo ví cho shop mới gặp. Báo lại marketplace phí sàn của từng đơn con (đơn COD không có bước thanh toán).
   */
  async placed(p: OrderPlacedPayload, tx: Tx): Promise<void> {
    const rate = await this.settings.get(PaymentSetting.platformFeeRate);
    const cod = p.paymentMethod === 'COD';
    const rows = p.shopOrders.map((so) => {
      const fee = platformFee(so.subtotal, so.shopDiscount, rate);
      return {
        orderId: p.orderId,
        orderCode: p.code,
        shopOrderId: so.shopOrderId,
        shopOrderCode: so.code,
        shopId: so.shopId,
        buyerId: p.buyer.userId,
        subtotal: so.subtotal,
        shopDiscount: so.shopDiscount,
        platformDiscount: so.platformDiscount,
        shippingFee: so.shippingFee,
        buyerPaid: so.total,
        platformFeeRate: rate,
        platformFee: fee,
        sellerAmount: so.subtotal - so.shopDiscount - fee,
        paymentMethod: p.paymentMethod,
        codAmount: cod ? so.total : 0,
        payBefore: p.payBefore ? new Date(p.payBefore) : null,
      };
    });
    for (const so of p.shopOrders) await this.wallet.ensureWallet(tx, so.shopId, so.ownerId);
    // Nhận trùng sự kiện thì bỏ qua
    const { count } = await tx.sellerEarning.createMany({ data: rows, skipDuplicates: true });
    if (count === 0) return;
    await this.events.publish(tx, SELLER_EARNINGS_RECORDED, {
      orderId: p.orderId,
      shopOrders: rows.map((r) => ({
        shopOrderId: r.shopOrderId,
        platformFeeRate: r.platformFeeRate,
        platformFee: r.platformFee,
        sellerAmount: r.sellerAmount,
      })),
    });
  }

  /** Đơn con bị hủy: đã thu tiền → trừ lại ngăn đang giữ và tạo khoản hoàn; chưa thu → chỉ đánh dấu hủy */
  async cancelled(p: ShopOrderCancelledPayload, tx: Tx): Promise<void> {
    const row = await this.row(tx, p.orderId, p.shopOrderId);
    if (row.status !== 'UNPAID' && row.status !== 'HELD') return;
    await this.wallet.reverse(tx, row, 'Đơn con bị hủy');
    await tx.sellerEarning.update({ where: { id: row.id }, data: { status: 'CANCELLED' } });
    if (row.status === 'HELD' && row.paymentMethod === 'VNPAY') {
      await this.refunds.createForShopOrder(tx, p.orderId, p.shopOrderId, row.buyerPaid);
      this.logger.log(`Đơn con ${p.code} hủy sau khi đã trả: tạo khoản hoàn ${row.buyerPaid}đ.`);
    }
  }

  /** GHN giao thành công: lưu mã vận đơn, phí GHN; đơn COD → tiền seller vào ngăn đang giữ */
  async delivered(p: ShopOrderDeliveredPayload, tx: Tx): Promise<void> {
    const row = await this.row(tx, p.orderId, p.shopOrderId);
    if (row.deliveredAt) return;
    const at = new Date(p.deliveredAt);
    await tx.sellerEarning.update({
      where: { id: row.id },
      data: {
        deliveredAt: at,
        ghnCode: p.ghnCode || null,
        carrierFee: p.carrierFee,
        codAmount: p.codAmount,
      },
    });
    if (row.paymentMethod === 'COD' && row.status === 'UNPAID') {
      await this.wallet.hold(tx, row, 'Đơn COD đã giao, chờ đối soát');
      await tx.sellerEarning.update({ where: { id: row.id }, data: { status: 'HELD' } });
    }
    // "Hoàn tất" có thể tới trước "đã giao"
    await this.wallet.tryRelease(tx, p.shopOrderId);
  }

  /**
   * Đơn con hoàn tất: xét chuyển tiền sang khả dụng. Đơn có yêu cầu trả hàng (P5) mà chưa nhận kết quả của
   * yêu cầu đó (sự kiện tới sai thứ tự) thì đánh dấu đang mở và chờ, không chuyển tiền theo số cũ (SEQ-04).
   */
  async completed(p: ShopOrderCompletedPayload, tx: Tx): Promise<void> {
    const row = await this.row(tx, p.orderId, p.shopOrderId);
    const data: Prisma.SellerEarningUpdateInput = {};
    if (!row.completedAt) data.completedAt = new Date(p.completedAt);
    if (p.returnId && row.returnState !== 'RESOLVED') {
      data.returnId = p.returnId;
      data.returnState = 'OPEN';
    }
    if (Object.keys(data).length) {
      await tx.sellerEarning.update({ where: { id: row.id }, data });
    }
    await this.wallet.tryRelease(tx, p.shopOrderId);
  }

  /** Người mua gửi yêu cầu trả hàng (P5, FIN-02): giữ tiền seller của đơn con tới khi có kết quả */
  async returnRequested(p: ReturnRequestedPayload, tx: Tx): Promise<void> {
    const row = await this.row(tx, p.orderId, p.shopOrderId);
    if (row.returnState === 'RESOLVED') return; // kết quả đã tới trước
    await tx.sellerEarning.update({
      where: { id: row.id },
      data: { returnId: p.returnId, returnState: 'OPEN' },
    });
  }

  /**
   * Yêu cầu trả hàng có kết quả (REF-02, FIN-03). Hoàn tiền: tạo khoản hoàn (qua cổng, hoặc chuyển khoản
   * với đơn COD), không cho tổng tiền hoàn của đơn con vượt số người mua đã trả; trừ phần tiền seller của
   * hàng trả khỏi ngăn đang giữ, phí sàn tính lại trên phần còn lại. Rồi bỏ giữ tiền, xét chuyển khả dụng.
   * Mỗi yêu cầu chỉ áp một lần.
   */
  async returnResolved(p: ReturnResolvedPayload, tx: Tx): Promise<void> {
    const row = await this.row(tx, p.orderId, p.shopOrderId);
    if (row.returnState === 'RESOLVED') return;
    const data: Prisma.SellerEarningUpdateInput = {
      returnId: p.returnId,
      returnState: 'RESOLVED',
    };
    if (p.outcome === 'REFUND' && p.refundAmount > 0) {
      // Không hoàn quá tiền hàng của phần trả (phí ship chiều đi không hoàn) và quá số đơn con còn lại
      const room = row.buyerPaid - (await this.refunds.refundedFor(tx, p.shopOrderId));
      const amount = Math.min(p.refundAmount, p.maxRefundAmount, Math.max(0, room));
      if (amount < p.refundAmount) {
        this.logger.error(
          `Yêu cầu trả hàng ${p.code} xin hoàn ${p.refundAmount}đ nhưng đơn con chỉ còn ${room}đ: hoàn ${amount}đ.`,
        );
      }
      await this.refunds.createExtra(tx, {
        orderId: p.orderId,
        shopOrderId: p.shopOrderId,
        amount,
        reason: 'RETURN',
        returnId: p.returnId,
        bankAccount: row.paymentMethod === 'COD' ? p.bankAccount : null,
      });
      const s = settleReturn(row, { ...p, refundAmount: amount });
      // HELD: trừ ngay ở ngăn đang giữ. UNPAID (COD chưa giao tới sổ): lúc vào ngăn đang giữ sẽ giữ số
      // đã trừ. Trạng thái khác (đã khả dụng, đã hủy...) thì ví không bị trừ: không ghi khoản trừ để sổ
      // tiền đơn con khớp ví; phần chênh xử lý bằng điều chỉnh ví (DIS-02).
      const applied = row.status === 'HELD' || row.status === 'UNPAID';
      if (s.deduction > 0 && row.status === 'HELD') {
        await this.wallet.deductReturn(tx, row, s.deduction, `Trả hàng ${p.code}`);
      } else if (s.deduction > 0 && !applied) {
        this.logger.error(
          `Tiền đơn con ${row.shopOrderCode} đang ${row.status}, không trừ được trả hàng ${p.code} (${s.deduction}đ): cần điều chỉnh ví.`,
        );
      }
      Object.assign(data, {
        returnRefund: amount,
        returnDeduction: applied ? s.deduction : 0,
        returnFeeReversed: applied ? s.feeReversed : 0,
        ...(s.newSellerAmount === 0 && applied ? { status: 'REFUNDED' as const } : {}),
      });
      this.logger.log(
        `Trả hàng ${p.code}: hoàn người mua ${amount}đ, trừ seller ${s.deduction}đ, giảm phí sàn ${s.feeReversed}đ.`,
      );
    }
    await tx.sellerEarning.update({ where: { id: row.id }, data });
    await this.wallet.tryRelease(tx, p.shopOrderId);
  }

  /** Giao thất bại lần cuối: trừ lại ngăn đang giữ; đơn trả trước hoàn tiền hàng sau voucher */
  async deliveryFailed(p: ShopOrderDeliveryFailedPayload, tx: Tx): Promise<void> {
    const row = await this.row(tx, p.orderId, p.shopOrderId);
    if (row.status === 'UNPAID' || row.status === 'HELD') {
      await this.wallet.reverse(tx, row, 'Giao thất bại, hàng hoàn về shop');
      await tx.sellerEarning.update({ where: { id: row.id }, data: { status: 'FAILED' } });
    }
    // Không phụ thuộc trạng thái: tin "sự cố" có thể tới trước; mỗi đơn con tối đa một khoản hoàn
    await this.refunds.createForShopOrder(
      tx,
      p.orderId,
      p.shopOrderId,
      p.refundAmount,
      'DELIVERY_FAILED',
    );
  }

  /** Sự cố GHN đã xác nhận: trừ lại ngăn đang giữ, đền seller vào ngăn khả dụng, hoàn người mua trả trước */
  async incident(p: ShopOrderIncidentConfirmedPayload, tx: Tx): Promise<void> {
    const row = await this.row(tx, p.orderId, p.shopOrderId);
    if (row.status !== 'COMPENSATED') {
      await this.wallet.reverse(tx, row, 'Sự cố vận chuyển');
      await this.wallet.compensate(tx, row, 'Đền hàng thất lạc/hư hỏng');
      await tx.sellerEarning.update({ where: { id: row.id }, data: { status: 'COMPENSATED' } });
    }
    await this.refunds.createForShopOrder(tx, p.orderId, p.shopOrderId, p.refundAmount, 'INCIDENT');
  }

  /** Dòng tiền của đơn con, đã khóa theo đơn. order.placed chưa tới (sai thứ tự): ném lỗi để xử lý lại sau */
  private async row(tx: Tx, orderId: string, shopOrderId: string): Promise<SellerEarning> {
    await this.payments.lock(tx, orderId);
    const row = await tx.sellerEarning.findUnique({ where: { shopOrderId } });
    if (!row) throw new Error(`Chưa có đơn con ${shopOrderId}`);
    return row;
  }
}
