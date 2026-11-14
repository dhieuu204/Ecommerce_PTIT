import { Injectable, Logger } from '@nestjs/common';
import type { Prisma, SellerEarning, WalletBucket, WalletTxType } from '../../generated/prisma';

type Tx = Prisma.TransactionClient;

const COLUMN: Record<WalletBucket, 'pending' | 'available' | 'locked'> = {
  PENDING: 'pending',
  AVAILABLE: 'available',
  LOCKED: 'locked',
};

/**
 * Một biến động ví gắn với nguồn của nó: đơn con, yêu cầu rút, hoặc đề nghị điều chỉnh. Mỗi ví, mỗi nguồn,
 * mỗi loại tối đa một dòng lịch sử (ràng buộc không trùng trong database).
 */
export interface WalletEntry {
  walletId: string;
  shopOrderId?: string | null;
  withdrawalId?: string | null;
  adjustmentId?: string | null;
  /** Mã hiện trong ghi chú, ví dụ mã đơn con */
  label: string;
}

/** Tiền seller của đơn con sau khi đã trừ phần trả hàng (P5); đã trừ hoa hồng CTV (P7) */
export const finalSellerAmount = (e: SellerEarning) => e.sellerAmount - e.returnDeduction;

/** Hoa hồng CTV của đơn con sau khi đã trừ phần trả hàng (P7) */
export const finalCommission = (e: SellerEarning) => e.commission - e.returnCommissionReversed;

/**
 * Ví 3 ngăn đang giữ / khả dụng / đang khóa của shop hoặc cộng tác viên (FIN-01, FIN-02, STATE-02, P7).
 * Mọi biến động đi qua `move`: ghi một dòng lịch sử (mỗi ví, mỗi nguồn, mỗi loại tối đa một dòng, nên nhận
 * trùng sự kiện không ghi tiền hai lần) rồi đổi số dư bằng câu lệnh có điều kiện "đủ tiền" (database còn
 * có CHECK không âm). Tiền CTV của đơn con đi cùng nhịp và cùng giao dịch với tiền seller (quyết định P7
 * số 14). Mọi hàm chạy trong giao dịch của người gọi (đã khóa theo đơn hoặc theo ví).
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  /** Tạo ví shop khi gặp shop lần đầu (từ order.placed) */
  async ensureShopWallet(tx: Tx, shopId: string, ownerId: string): Promise<void> {
    await tx.wallet.upsert({
      where: { shopId },
      create: { ownerType: 'SHOP', shopId, ownerId },
      update: {},
    });
  }

  /** Tạo ví CTV khi CTV có đơn đầu tiên (từ order.placed, P7) */
  async ensureAffiliateWallet(tx: Tx, affiliateId: string, userId: string): Promise<void> {
    await tx.wallet.upsert({
      where: { affiliateId },
      create: { ownerType: 'AFFILIATE', affiliateId, ownerId: userId },
      update: {},
    });
  }

  /** Mã ví của shop; chưa có ví (đơn nhận trước P4) thì báo lỗi */
  async shopWalletId(tx: Tx, shopId: string): Promise<string> {
    const w = await tx.wallet.findUnique({ where: { shopId }, select: { id: true } });
    if (!w) throw new Error(`Chưa có ví của shop ${shopId} (đơn nhận trước P4?)`);
    return w.id;
  }

  /** Khóa một ví tới hết giao dịch (rút tiền, điều chỉnh cùng lúc chạy lần lượt) */
  async lockWallet(tx: Tx, walletId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wallet:${walletId}`}))`;
  }

  /** Tiền đơn con vào ngăn đang giữ: trả trước khi đã thu, COD khi đã giao (đã trừ phần trả hàng nếu có) */
  async hold(tx: Tx, e: SellerEarning, note: string): Promise<boolean> {
    const moved = await this.move(
      tx,
      await this.sellerEntry(tx, e),
      'HELD',
      finalSellerAmount(e),
      null,
      'PENDING',
      note,
    );
    const ctv = await this.affiliateEntry(tx, e);
    if (ctv) await this.move(tx, ctv, 'HELD', finalCommission(e), null, 'PENDING', note);
    return moved;
  }

  /**
   * Chuyển sang khả dụng nếu đủ điều kiện (FIN-02): đang giữ, đơn con đã hoàn tất, tiền đã về sàn (trả
   * trước: đã thu; COD: đã đối soát) và không còn yêu cầu trả hàng đang mở (P5). Hoa hồng CTV chuyển cùng lúc.
   */
  async tryRelease(tx: Tx, shopOrderId: string, now = new Date()): Promise<boolean> {
    const e = await tx.sellerEarning.findUniqueOrThrow({ where: { shopOrderId } });
    if (e.status !== 'HELD' || !e.completedAt || !e.moneyReceivedAt) return false;
    if (e.returnState === 'OPEN') return false;
    const note = 'Đơn hoàn tất, tiền đã về sàn';
    const moved = await this.move(
      tx,
      await this.sellerEntry(tx, e),
      'RELEASED',
      finalSellerAmount(e),
      'PENDING',
      'AVAILABLE',
      note,
    );
    const ctv = await this.affiliateEntry(tx, e);
    if (ctv) await this.move(tx, ctv, 'RELEASED', finalCommission(e), 'PENDING', 'AVAILABLE', note);
    await tx.sellerEarning.update({
      where: { id: e.id },
      data: { status: 'AVAILABLE', releasedAt: now },
    });
    return moved;
  }

  /** Trừ lại ngăn đang giữ (đơn hủy, giao thất bại, sự cố) khi tiền đơn con đang ở đó; CTV mất hoa hồng */
  async reverse(tx: Tx, e: SellerEarning, note: string): Promise<boolean> {
    if (e.status !== 'HELD') return false;
    const moved = await this.move(
      tx,
      await this.sellerEntry(tx, e),
      'REVERSED',
      finalSellerAmount(e),
      'PENDING',
      null,
      note,
    );
    const ctv = await this.affiliateEntry(tx, e);
    if (ctv) await this.move(tx, ctv, 'REVERSED', finalCommission(e), 'PENDING', null, note);
    return moved;
  }

  /**
   * Đền cho seller khi GHN làm mất/hỏng hàng: vào thẳng ngăn khả dụng. Hàng không tới tay người mua nên
   * không có hoa hồng CTV (P7): seller được đền cả phần hoa hồng đã trừ lúc đặt.
   */
  async compensate(tx: Tx, e: SellerEarning, note: string): Promise<boolean> {
    return this.move(
      tx,
      await this.sellerEntry(tx, e),
      'COMPENSATION',
      e.sellerAmount + e.commission,
      null,
      'AVAILABLE',
      note,
    );
  }

  /** Trả hàng (P5): trừ phần tiền của hàng trả khỏi ngăn đang giữ; P7: trừ hoa hồng CTV của phần đó */
  async deductReturn(
    tx: Tx,
    e: SellerEarning,
    amount: number,
    commission: number,
    note: string,
  ): Promise<boolean> {
    const moved = await this.move(
      tx,
      await this.sellerEntry(tx, e),
      'RETURN_DEDUCTED',
      amount,
      'PENDING',
      null,
      note,
    );
    const ctv = await this.affiliateEntry(tx, e);
    if (ctv) await this.move(tx, ctv, 'RETURN_DEDUCTED', commission, 'PENDING', null, note);
    return moved;
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
          walletId: entry.walletId,
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
    const where: Prisma.WalletWhereInput = { id: entry.walletId };
    const data: Prisma.WalletUpdateManyMutationInput = {};
    if (from) {
      where[COLUMN[from]] = { gte: amount };
      data[COLUMN[from]] = { decrement: amount };
    }
    if (to) data[COLUMN[to]] = { increment: amount };
    const updated = await tx.wallet.updateMany({ where, data });
    if (updated.count === 0) {
      if (!(await tx.wallet.findUnique({ where: { id: entry.walletId } }))) {
        throw new Error(`Không có ví ${entry.walletId}`);
      }
      // Không bao giờ để số dư âm: hủy cả giao dịch, ghi log để kiểm tra
      this.logger.error(`Ví ${entry.walletId} không đủ ${amount}đ ở ngăn ${from} cho ${type}.`);
      throw new InsufficientBalanceError(
        `Số dư ví ${entry.walletId} không đủ cho ${type} ${entry.label}`,
      );
    }
    return true;
  }

  private async sellerEntry(tx: Tx, e: SellerEarning): Promise<WalletEntry> {
    return {
      walletId: await this.shopWalletId(tx, e.shopId),
      shopOrderId: e.shopOrderId,
      label: e.shopOrderCode,
    };
  }

  /** Ví CTV của đơn con; null khi đơn không có CTV */
  private async affiliateEntry(tx: Tx, e: SellerEarning): Promise<WalletEntry | null> {
    if (!e.affiliateId || e.commission <= 0) return null;
    const w = await tx.wallet.findUnique({
      where: { affiliateId: e.affiliateId },
      select: { id: true },
    });
    if (!w) throw new Error(`Chưa có ví của CTV ${e.affiliateId}`);
    return { walletId: w.id, shopOrderId: e.shopOrderId, label: e.shopOrderCode };
  }
}

/** Ngăn nguồn không đủ tiền cho một biến động (người gọi có thể bắt để trả lỗi nghiệp vụ) */
export class InsufficientBalanceError extends Error {}
