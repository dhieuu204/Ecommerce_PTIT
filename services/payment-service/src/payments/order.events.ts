import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventBus, SettingsService } from '@san/nest-common';
import {
  ORDER_PLACED,
  SHOP_ORDER_CANCELLED,
  type OrderPlacedPayload,
  type ShopOrderCancelledPayload,
} from '@san/shared';
import { RefundsService } from '../refunds/refunds.service';
import { PaymentSetting } from '../settings';
import type { Prisma } from '../../generated/prisma';
import { PaymentsService } from './payments.service';

type Tx = Prisma.TransactionClient;

/** Phí sàn (FIN-03): % × 100 trên tiền hàng sau voucher shop, làm tròn xuống tới đồng */
export function platformFee(subtotal: number, shopDiscount: number, rate: number): number {
  return Math.floor(((subtotal - shopDiscount) * rate) / 10_000);
}

/** Nhận đơn mới và đơn con bị hủy từ marketplace-service */
@Injectable()
export class PaymentOrderEvents implements OnModuleInit {
  private readonly logger = new Logger(PaymentOrderEvents.name);

  constructor(
    private readonly events: EventBus,
    private readonly settings: SettingsService,
    private readonly payments: PaymentsService,
    private readonly refunds: RefundsService,
  ) {}

  onModuleInit(): void {
    this.events.subscribe(ORDER_PLACED, (p, tx: Tx) => this.placed(p, tx));
    this.events.subscribe(SHOP_ORDER_CANCELLED, (p, tx: Tx) => this.cancelled(p, tx));
  }

  /** Mỗi đơn con một dòng seller_earnings: số buyer trả, phí sàn chụp theo phiên bản đang dùng (PAY-04) */
  async placed(p: OrderPlacedPayload, tx: Tx): Promise<void> {
    const rate = await this.settings.get(PaymentSetting.platformFeeRate);
    await tx.sellerEarning.createMany({
      data: p.shopOrders.map((so) => {
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
          payBefore: new Date(p.payBefore),
        };
      }),
      // Nhận trùng sự kiện thì bỏ qua
      skipDuplicates: true,
    });
  }

  /** Đơn con bị hủy: đã thu tiền → tạo khoản hoàn; chưa thu → chỉ đánh dấu hủy (REF-01) */
  async cancelled(p: ShopOrderCancelledPayload, tx: Tx): Promise<void> {
    await this.payments.lock(tx, p.orderId);
    const row = await tx.sellerEarning.findUnique({ where: { shopOrderId: p.shopOrderId } });
    // order.placed chưa tới (sự kiện tới sai thứ tự): ném lỗi để được gửi lại sau
    if (!row) throw new Error(`Chưa có đơn con ${p.shopOrderId}`);
    if (row.status === 'CANCELLED' || row.status === 'EXPIRED') return;
    await tx.sellerEarning.update({ where: { id: row.id }, data: { status: 'CANCELLED' } });
    if (row.status === 'HELD') {
      await this.refunds.createForShopOrder(tx, p.orderId, p.shopOrderId, row.buyerPaid);
      this.logger.log(`Đơn con ${p.code} hủy sau khi đã trả: tạo khoản hoàn ${row.buyerPaid}đ.`);
    }
  }
}
