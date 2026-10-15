import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventBus } from '@san/nest-common';
import {
  ADJUSTMENT_APPROVED,
  ADJUSTMENT_EXECUTED,
  type AdjustmentApprovedPayload,
} from '@san/shared';
import { PaymentsService } from '../payments/payments.service';
import { RefundsService } from '../refunds/refunds.service';
import { WalletService } from '../wallet/wallet.service';
import type { Prisma } from '../../generated/prisma';

type Tx = Prisma.TransactionClient;

/**
 * Thực thi đề nghị điều chỉnh sau giải ngân đã được admin tài chính thứ hai duyệt (DIS-02). approval-service
 * chỉ lưu quyết định; payment-service kiểm điều kiện hiện tại rồi làm **tất cả hoặc không**: đơn con phải
 * thuộc shop, trừ ví chỉ khi số dư khả dụng còn đủ (không âm), hoàn thêm không vượt số người mua đã trả trừ
 * các khoản đã hoàn. Không sửa dòng cũ: ghi dòng ví ADJUSTMENT, khoản hoàn ADJUSTMENT (chuyển khoản tay).
 * Kết quả báo lại approval-service.
 */
@Injectable()
export class AdjustmentsService implements OnModuleInit {
  private readonly logger = new Logger(AdjustmentsService.name);

  constructor(
    private readonly events: EventBus,
    private readonly payments: PaymentsService,
    private readonly wallet: WalletService,
    private readonly refunds: RefundsService,
  ) {}

  onModuleInit(): void {
    this.events.subscribe(ADJUSTMENT_APPROVED, (p, tx: Tx) => this.execute(p, tx));
  }

  async execute(p: AdjustmentApprovedPayload, tx: Tx): Promise<void> {
    const e = await tx.sellerEarning.findUnique({ where: { shopOrderId: p.shopOrderId } });
    let fail: string | null = null;
    if (!e || e.shopId !== p.shopId) {
      fail = 'Không tìm thấy đơn con của shop này ở payment-service.';
    } else {
      // Khóa theo đơn (cùng khóa với hoàn tiền trả hàng) và theo ví shop (cùng khóa với rút tiền)
      await this.payments.lock(tx, e.orderId);
      await this.wallet.lockShop(tx, e.shopId);
      const already =
        (await tx.walletTransaction.count({ where: { adjustmentId: p.adjustmentId } })) +
        (await tx.refund.count({ where: { adjustmentId: p.adjustmentId } }));
      if (already > 0) return; // đã thực thi (tin trùng)
      fail = await this.check(tx, p, e.buyerPaid);
      if (!fail) {
        if (p.sellerChange !== 0) {
          const credit = p.sellerChange > 0;
          await this.wallet.move(
            tx,
            { shopId: e.shopId, adjustmentId: p.adjustmentId, label: p.shopOrderCode },
            'ADJUSTMENT',
            Math.abs(p.sellerChange),
            credit ? null : 'AVAILABLE',
            credit ? 'AVAILABLE' : null,
            `Điều chỉnh: ${p.reason}`,
          );
        }
        if (p.buyerRefund > 0) {
          await this.refunds.createExtra(tx, {
            orderId: e.orderId,
            shopOrderId: e.shopOrderId,
            amount: p.buyerRefund,
            reason: 'ADJUSTMENT',
            adjustmentId: p.adjustmentId,
            bankAccount: p.bankAccount,
          });
        }
      }
    }
    if (fail) this.logger.warn(`Không thực thi điều chỉnh ${p.adjustmentId}: ${fail}`);
    else this.logger.log(`Đã thực thi điều chỉnh ${p.adjustmentId} cho đơn ${p.shopOrderCode}.`);
    await this.events.publish(tx, ADJUSTMENT_EXECUTED, {
      adjustmentId: p.adjustmentId,
      result: fail ? 'FAILED' : 'APPLIED',
      message: fail,
      executedAt: new Date().toISOString(),
    });
  }

  /** Lý do không thực thi được, hoặc null khi đủ điều kiện */
  private async check(
    tx: Tx,
    p: AdjustmentApprovedPayload,
    buyerPaid: number,
  ): Promise<string | null> {
    if (p.sellerChange < 0) {
      const w = await tx.sellerWallet.findUnique({ where: { shopId: p.shopId } });
      const available = w?.available ?? 0;
      if (available < -p.sellerChange) {
        return `Số dư khả dụng của shop (${money(available)}) không đủ để trừ ${money(-p.sellerChange)}.`;
      }
    }
    if (p.buyerRefund > 0) {
      if (!p.bankAccount) return 'Thiếu tài khoản nhận tiền của người mua.';
      const room = buyerPaid - (await this.refunds.refundedFor(tx, p.shopOrderId));
      if (p.buyerRefund > room) {
        return `Hoàn thêm vượt số người mua đã trả (đơn con còn hoàn được ${money(Math.max(0, room))}).`;
      }
    }
    return null;
  }
}

const money = (n: number) => `${n.toLocaleString('vi-VN')}đ`;
