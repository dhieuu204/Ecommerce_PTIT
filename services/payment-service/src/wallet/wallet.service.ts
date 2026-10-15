import { Injectable, Logger } from '@nestjs/common';
import type { Prisma, SellerEarning, WalletBucket, WalletTxType } from '../../generated/prisma';

type Tx = Prisma.TransactionClient;

const COLUMN: Record<WalletBucket, 'pending' | 'available' | 'locked'> = {
  PENDING: 'pending',
  AVAILABLE: 'available',
  LOCKED: 'locked',
};

/**
 * Một biến động ví gắn với nguồn của nó: đơn con, yêu cầu rút, hoặc đề nghị điều chỉnh. Mỗi nguồn mỗi loại
 * tối đa một dòng lịch sử (ràng buộc không trùng trong database).
 */
export interface WalletEntry {
  shopId: string;
  shopOrderId?: string | null;
  withdrawalId?: string | null;
  adjustmentId?: string | null;
  /** Mã hiện trong ghi chú, ví dụ mã đơn con */
  label: string;
}

/** Tiền seller của đơn con sau khi đã trừ phần trả hàng (P5) */
export const finalSellerAmount = (e: SellerEarning) => e.sellerAmount - e.returnDeduction;

/**
 * Ví seller (FIN-01, FIN-02, STATE-02): 3 ngăn đang giữ / khả dụng / đang khóa. Mọi biến động đi qua `move`:
 * ghi một dòng lịch sử (mỗi nguồn mỗi loại tối đa một dòng, nên nhận trùng sự kiện không ghi tiền hai lần)
 * rồi đổi số dư bằng câu lệnh có điều kiện "đủ tiền" (database còn có CHECK không âm).
 * Mọi hàm chạy trong giao dịch của người gọi (đã khóa theo đơn hoặc theo shop).
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

  /** Khóa ví một shop tới hết giao dịch (rút tiền, điều chỉnh cùng lúc chạy lần lượt) */
  async lockShop(tx: Tx, shopId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wallet:${shopId}`}))`;
  }

  /** Tiền đơn con vào ngăn đang giữ: trả trước khi đã thu, COD khi đã giao (đã trừ phần trả hàng nếu có) */
  async hold(tx: Tx, e: SellerEarning, note: string): Promise<boolean> {
    return this.move(tx, earningEntry(e), 'HELD', finalSellerAmount(e), null, 'PENDING', note);
  }

  /**
   * Chuyển sang khả dụng nếu đủ điều kiện (FIN-02): đang giữ, đơn con đã hoàn tất, tiền đã về sàn (trả
   * trước: đã thu; COD: đã đối soát) và không còn yêu cầu trả hàng đang mở (P5).
   */
  async tryRelease(tx: Tx, shopOrderId: string, now = new Date()): Promise<boolean> {
    const e = await tx.sellerEarning.findUniqueOrThrow({ where: { shopOrderId } });
    if (e.status !== 'HELD' || !e.completedAt || !e.moneyReceivedAt) return false;
    if (e.returnState === 'OPEN') return false;
    const moved = await this.move(
      tx,
      earningEntry(e),
      'RELEASED',
      finalSellerAmount(e),
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
    return this.move(tx, earningEntry(e), 'REVERSED', finalSellerAmount(e), 'PENDING', null, note);
  }

  /** Đền cho seller khi GHN làm mất/hỏng hàng: vào thẳng ngăn khả dụng */
  async compensate(tx: Tx, e: SellerEarning, note: string): Promise<boolean> {
    return this.move(tx, earningEntry(e), 'COMPENSATION', e.sellerAmount, null, 'AVAILABLE', note);
  }

  /** Trả hàng (P5): trừ phần tiền của hàng trả khỏi ngăn đang giữ */
  async deductReturn(tx: Tx, e: SellerEarning, amount: number, note: string): Promise<boolean> {
    return this.move(tx, earningEntry(e), 'RETURN_DEDUCTED', amount, 'PENDING', null, note);
  }

  /**
   * Biến động chung (rút tiền, điều chỉnh). Trả false nếu nguồn này đã ghi loại này rồi (nhận trùng).
   * Không đủ tiền ở ngăn nguồn thì ném InsufficientBalanceError (hủy cả giao dịch của người gọi).
   */
  async move(
    tx: Tx,
    entry: WalletEntry,
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
          shopId: entry.shopId,
          shopOrderId: entry.shopOrderId ?? null,
          withdrawalId: entry.withdrawalId ?? null,
          adjustmentId: entry.adjustmentId ?? null,
          type,
          amount,
          fromBucket: from,
          toBucket: to,
          note: `${note} (${entry.label})`.slice(0, 300),
        },
      ],
      skipDuplicates: true,
    });
    if (count === 0) return false;
    const where: Prisma.SellerWalletWhereInput = { shopId: entry.shopId };
    const data: Prisma.SellerWalletUpdateManyMutationInput = {};
    if (from) {
      where[COLUMN[from]] = { gte: amount };
      data[COLUMN[from]] = { decrement: amount };
    }
    if (to) data[COLUMN[to]] = { increment: amount };
    const updated = await tx.sellerWallet.updateMany({ where, data });
    if (updated.count === 0) {
      if (!(await tx.sellerWallet.findUnique({ where: { shopId: entry.shopId } }))) {
        throw new Error(`Chưa có ví của shop ${entry.shopId} (đơn nhận trước P4?)`);
      }
      // Không bao giờ để số dư âm: hủy cả giao dịch, ghi log để kiểm tra
      this.logger.error(`Ví shop ${entry.shopId} không đủ ${amount}đ ở ngăn ${from} cho ${type}.`);
      throw new InsufficientBalanceError(
        `Số dư ví shop ${entry.shopId} không đủ cho ${type} ${entry.label}`,
      );
    }
    return true;
  }
}

/** Ngăn nguồn không đủ tiền cho một biến động (người gọi có thể bắt để trả lỗi nghiệp vụ) */
export class InsufficientBalanceError extends Error {}

function earningEntry(e: SellerEarning): WalletEntry {
  return { shopId: e.shopId, shopOrderId: e.shopOrderId, label: e.shopOrderCode };
}
