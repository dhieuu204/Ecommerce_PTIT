import { Injectable, Logger } from '@nestjs/common';
import type { Prisma, SellerEarning, WalletBucket, WalletTxType } from '../../generated/prisma';

type Tx = Prisma.TransactionClient;

const COLUMN: Record<WalletBucket, 'pending' | 'available' | 'locked'> = {
  PENDING: 'pending',
  AVAILABLE: 'available',
  LOCKED: 'locked',
};

/**
 * Ví seller (FIN-01, FIN-02, STATE-02): 3 ngăn đang giữ / khả dụng / đang khóa. Mọi biến động đi qua `move`:
 * ghi một dòng lịch sử (mỗi đơn con mỗi loại tối đa một dòng, nên nhận trùng sự kiện không ghi tiền hai lần)
 * rồi đổi số dư bằng câu lệnh có điều kiện "đủ tiền" (database còn có CHECK không âm).
 * Mọi hàm chạy trong giao dịch của người gọi (đã khóa theo đơn).
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  /** Tạo ví khi gặp shop lần đầu (từ order.placed) */
  async ensureWallet(tx: Tx, shopId: string, ownerId: string): Promise<void> {
    await tx.sellerWallet.upsert({
      where: { shopId },
      create: { shopId, ownerId },
      update: {},
    });
  }

  /** Tiền đơn con vào ngăn đang giữ: trả trước khi đã thu, COD khi đã giao */
  async hold(tx: Tx, e: SellerEarning, note: string): Promise<boolean> {
    return this.move(tx, e, 'HELD', e.sellerAmount, null, 'PENDING', note);
  }

  /**
   * Chuyển sang khả dụng nếu đủ điều kiện: đang giữ, đơn con đã hoàn tất và tiền đã về sàn
   * (trả trước: đã thu; COD: đã đối soát). P5 thêm điều kiện không có trả hàng/tranh chấp đang mở.
   */
  async tryRelease(tx: Tx, shopOrderId: string, now = new Date()): Promise<boolean> {
    const e = await tx.sellerEarning.findUniqueOrThrow({ where: { shopOrderId } });
    if (e.status !== 'HELD' || !e.completedAt || !e.moneyReceivedAt) return false;
    const moved = await this.move(
      tx,
      e,
      'RELEASED',
      e.sellerAmount,
      'PENDING',
      'AVAILABLE',
      'Đơn hoàn tất, tiền đã về sàn',
    );
    await tx.sellerEarning.update({
      where: { id: e.id },
      data: { status: 'AVAILABLE', releasedAt: now },
    });
    return moved;
  }

  /** Trừ lại ngăn đang giữ (đơn hủy, giao thất bại, sự cố) khi tiền đơn con đang ở đó */
  async reverse(tx: Tx, e: SellerEarning, note: string): Promise<boolean> {
    if (e.status !== 'HELD') return false;
    return this.move(tx, e, 'REVERSED', e.sellerAmount, 'PENDING', null, note);
  }

  /** Đền cho seller khi GHN làm mất/hỏng hàng: vào thẳng ngăn khả dụng */
  async compensate(tx: Tx, e: SellerEarning, note: string): Promise<boolean> {
    return this.move(tx, e, 'COMPENSATION', e.sellerAmount, null, 'AVAILABLE', note);
  }

  private async move(
    tx: Tx,
    e: SellerEarning,
    type: WalletTxType,
    amount: number,
    from: WalletBucket | null,
    to: WalletBucket | null,
    note: string,
  ): Promise<boolean> {
    if (amount <= 0) return false;
    const { count } = await tx.walletTransaction.createMany({
      data: [
        {
          shopId: e.shopId,
          shopOrderId: e.shopOrderId,
          type,
          amount,
          fromBucket: from,
          toBucket: to,
          note: `${note} (${e.shopOrderCode})`.slice(0, 300),
        },
      ],
      skipDuplicates: true,
    });
    if (count === 0) return false;
    const where: Prisma.SellerWalletWhereInput = { shopId: e.shopId };
    const data: Prisma.SellerWalletUpdateManyMutationInput = {};
    if (from) {
      where[COLUMN[from]] = { gte: amount };
      data[COLUMN[from]] = { decrement: amount };
    }
    if (to) data[COLUMN[to]] = { increment: amount };
    const updated = await tx.sellerWallet.updateMany({ where, data });
    if (updated.count === 0) {
      if (!(await tx.sellerWallet.findUnique({ where: { shopId: e.shopId } }))) {
        throw new Error(`Chưa có ví của shop ${e.shopId} (đơn nhận trước P4?)`);
      }
      // Không bao giờ để số dư âm: hủy cả giao dịch (sự kiện sẽ được xử lý lại), ghi log để kiểm tra
      this.logger.error(`Ví shop ${e.shopId} không đủ ${amount}đ ở ngăn ${from} cho ${type}.`);
      throw new Error(`Số dư ví shop ${e.shopId} không đủ cho ${type} ${e.shopOrderCode}`);
    }
    return true;
  }
}
