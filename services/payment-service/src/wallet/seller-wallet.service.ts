import { Injectable } from '@nestjs/common';
import {
  AppError,
  SettingsService,
  skipTake,
  toPage,
  type AuthUser,
  type PageQuery,
} from '@san/nest-common';
import type { Page } from '@san/shared';
import { PrismaService } from '../prisma.service';
import { PaymentSetting } from '../settings';
import type {
  EarningStatus,
  Prisma,
  SellerEarning,
  Wallet,
  WalletBucket,
  WalletOwnerType,
  WalletTransaction,
  WalletTxType,
  WithdrawalStatus,
} from '../../generated/prisma';
import { finalCommission, finalSellerAmount } from './wallet.service';

/** Yêu cầu rút đang xử lý (chờ duyệt hoặc chờ chuyển khoản) */
export interface OpenWithdrawalView {
  id: string;
  amount: number;
  status: WithdrawalStatus;
  createdAt: Date;
}

export interface WalletView {
  /** null: chưa có đơn nào (chưa có ví) */
  walletId: string | null;
  /** Ví shop: mã shop; ví CTV: null */
  shopId: string | null;
  /** Ví CTV (P7): mã CTV; ví shop: null */
  affiliateId: string | null;
  pending: number;
  available: number;
  locked: number;
  /** Ngăn đang giữ chia theo lý do chưa khả dụng */
  pendingWaitingCompletion: number;
  pendingWaitingCod: number;
  /** Đang giữ vì có yêu cầu trả hàng chưa có kết quả (P5) */
  pendingWaitingReturn: number;
  /** Số tiền rút tối thiểu đang áp dụng (P5) */
  withdrawMin: number;
  openWithdrawal: OpenWithdrawalView | null;
}

export interface WalletTransactionView {
  id: string;
  type: WalletTxType;
  amount: number;
  fromBucket: WalletBucket | null;
  toBucket: WalletBucket | null;
  shopOrderId: string | null;
  shopOrderCode: string | null;
  withdrawalId: string | null;
  adjustmentId: string | null;
  note: string | null;
  createdAt: Date;
}

export interface EarningView {
  shopOrderId: string;
  shopOrderCode: string;
  orderCode: string;
  paymentMethod: SellerEarning['paymentMethod'];
  subtotal: number;
  shopDiscount: number;
  platformFeeRate: number;
  platformFee: number;
  /** Hoa hồng CTV shop trả (P7), đã trừ trong sellerAmount */
  commission: number;
  /** Hoa hồng được trả lại cho shop do trả hàng (P7) */
  returnCommissionReversed: number;
  sellerAmount: number;
  /** Đã hoàn cho người mua do trả hàng (P5) */
  returnRefund: number;
  /** Seller bị trừ do trả hàng */
  returnDeduction: number;
  /** Phí sàn được giảm do trả hàng */
  returnFeeReversed: number;
  /** Seller nhận cuối cùng = sellerAmount - returnDeduction */
  sellerReceives: number;
  status: EarningStatus;
  /** Câu giải thích vì sao tiền chưa khả dụng (null khi không cần) */
  waitingFor: string | null;
  deliveredAt: Date | null;
  completedAt: Date | null;
  moneyReceivedAt: Date | null;
  releasedAt: Date | null;
  createdAt: Date;
}

/** Hoa hồng của một đơn con, CTV xem (P7, AFF-05). Không có thông tin người mua */
export interface CommissionView {
  shopOrderId: string;
  shopOrderCode: string;
  /** Hoa hồng chụp lúc đặt */
  commission: number;
  /** Bị trừ do trả hàng */
  returnCommissionReversed: number;
  /** CTV nhận cuối cùng (0 khi đơn hủy, giao thất bại, sự cố) */
  receives: number;
  status: EarningStatus;
  waitingFor: string | null;
  completedAt: Date | null;
  releasedAt: Date | null;
  createdAt: Date;
}

/** Ví cho admin tài chính: số dư, yêu cầu rút đang xử lý, biến động gần nhất (nguồn tiền) */
export interface AdminWalletView {
  walletId: string;
  ownerType: WalletOwnerType;
  shopId: string | null;
  affiliateId: string | null;
  ownerId: string;
  pending: number;
  available: number;
  locked: number;
  openWithdrawal: OpenWithdrawalView | null;
  recentTransactions: WalletTransactionView[];
}

/** Tiền của một đơn con cho admin tài chính lập đề nghị điều chỉnh (DIS-02) */
export interface ShopOrderMoneyView {
  shopOrderId: string;
  shopOrderCode: string;
  orderId: string;
  orderCode: string;
  shopId: string;
  buyerId: string;
  paymentMethod: SellerEarning['paymentMethod'];
  /** Người mua đã trả cho đơn con */
  buyerPaid: number;
  /** Tổng các khoản hoàn đã tạo cho đơn con */
  refunded: number;
  /** Hoa hồng CTV của đơn con (P7) */
  commission: number;
  sellerAmount: number;
  returnDeduction: number;
  sellerReceives: number;
  status: EarningStatus;
  wallet: { pending: number; available: number; locked: number };
}

/** Lý do tiền đơn con chưa khả dụng, hiện cho seller và CTV */
export function waitingFor(e: SellerEarning): string | null {
  if (e.status === 'UNPAID') {
    return e.paymentMethod === 'COD' ? 'Chờ giao hàng (COD)' : 'Chờ người mua thanh toán';
  }
  if (e.status !== 'HELD') return null;
  if (e.returnState === 'OPEN') return 'Chờ xử lý yêu cầu trả hàng';
  if (!e.completedAt) return 'Chờ đơn hoàn tất';
  if (!e.moneyReceivedAt) return 'Chờ đối soát tiền COD với GHN';
  return null;
}

/**
 * Ví và tiền của shop hoặc cộng tác viên cho chủ ví và admin tài chính xem (FIN-01, FIN-02, FIN-05, P7).
 * Nhận ra ví qua chủ ví (userId) và loại ví, nên ai cũng chỉ xem được ví của chính mình.
 */
@Injectable()
export class SellerWalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async wallet(user: AuthUser, ownerType: WalletOwnerType = 'SHOP'): Promise<WalletView> {
    const withdrawMin = await this.settings.get(PaymentSetting.withdrawMinAmount);
    const w = await this.myWallet(user.id, ownerType);
    if (!w) {
      return {
        walletId: null,
        shopId: null,
        affiliateId: null,
        pending: 0,
        available: 0,
        locked: 0,
        pendingWaitingCompletion: 0,
        pendingWaitingCod: 0,
        pendingWaitingReturn: 0,
        withdrawMin,
        openWithdrawal: null,
      };
    }
    const held = await this.prisma.sellerEarning.findMany({
      where: { ...earningsOf(w), status: 'HELD' },
    });
    const amount = w.ownerType === 'SHOP' ? finalSellerAmount : finalCommission;
    const sum = (list: SellerEarning[]) => list.reduce((a, e) => a + amount(e), 0);
    const notReturning = held.filter((e) => e.returnState !== 'OPEN');
    return {
      walletId: w.id,
      shopId: w.shopId,
      affiliateId: w.affiliateId,
      pending: w.pending,
      available: w.available,
      locked: w.locked,
      pendingWaitingCompletion: sum(notReturning.filter((e) => !e.completedAt)),
      pendingWaitingCod: sum(notReturning.filter((e) => e.completedAt && !e.moneyReceivedAt)),
      pendingWaitingReturn: sum(held.filter((e) => e.returnState === 'OPEN')),
      withdrawMin,
      openWithdrawal: await this.openWithdrawal(w.id),
    };
  }

  async transactions(
    user: AuthUser,
    q: PageQuery,
    ownerType: WalletOwnerType = 'SHOP',
  ): Promise<Page<WalletTransactionView>> {
    const w = await this.myWallet(user.id, ownerType);
    if (!w) return toPage([], 0, q);
    const where = { walletId: w.id };
    const [rows, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.walletTransaction.count({ where }),
    ]);
    return toPage(await this.txViews(rows), total, q);
  }

  async earnings(
    user: AuthUser,
    q: PageQuery & { status?: EarningStatus },
  ): Promise<Page<EarningView>> {
    const w = await this.myWallet(user.id, 'SHOP');
    if (!w) return toPage([], 0, q);
    const where: Prisma.SellerEarningWhereInput = { shopId: w.shopId! };
    if (q.status) where.status = q.status;
    const [rows, total] = await Promise.all([
      this.prisma.sellerEarning.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.sellerEarning.count({ where }),
    ]);
    return toPage(
      rows.map((e) => ({
        shopOrderId: e.shopOrderId,
        shopOrderCode: e.shopOrderCode,
        orderCode: e.orderCode,
        paymentMethod: e.paymentMethod,
        subtotal: e.subtotal,
        shopDiscount: e.shopDiscount,
        platformFeeRate: e.platformFeeRate,
        platformFee: e.platformFee,
        commission: e.commission,
        returnCommissionReversed: e.returnCommissionReversed,
        sellerAmount: e.sellerAmount,
        returnRefund: e.returnRefund,
        returnDeduction: e.returnDeduction,
        returnFeeReversed: e.returnFeeReversed,
        sellerReceives: finalSellerAmount(e),
        status: e.status,
        waitingFor: waitingFor(e),
        deliveredAt: e.deliveredAt,
        completedAt: e.completedAt,
        moneyReceivedAt: e.moneyReceivedAt,
        releasedAt: e.releasedAt,
        createdAt: e.createdAt,
      })),
      total,
      q,
    );
  }

  /** Hoa hồng từng đơn con của CTV (P7, AFF-05), mới nhất trước */
  async commissions(
    user: AuthUser,
    q: PageQuery & { status?: EarningStatus },
  ): Promise<Page<CommissionView>> {
    const w = await this.myWallet(user.id, 'AFFILIATE');
    if (!w) return toPage([], 0, q);
    const where: Prisma.SellerEarningWhereInput = { affiliateId: w.affiliateId! };
    if (q.status) where.status = q.status;
    const [rows, total] = await Promise.all([
      this.prisma.sellerEarning.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.sellerEarning.count({ where }),
    ]);
    return toPage(
      rows.map((e) => ({
        shopOrderId: e.shopOrderId,
        shopOrderCode: e.shopOrderCode,
        commission: e.commission,
        returnCommissionReversed: e.returnCommissionReversed,
        receives: LOST.includes(e.status) ? 0 : finalCommission(e),
        status: e.status,
        waitingFor: waitingFor(e),
        completedAt: e.completedAt,
        releasedAt: e.releasedAt,
        createdAt: e.createdAt,
      })),
      total,
      q,
    );
  }

  // ----- admin tài chính -----

  /** Ví một shop và 20 biến động gần nhất (trang duyệt rút xem nguồn tiền) */
  async adminWallet(shopId: string): Promise<AdminWalletView> {
    const w = await this.prisma.wallet.findUnique({ where: { shopId } });
    if (!w) throw new AppError(404, 'NOT_FOUND', 'Shop chưa có ví (chưa có đơn nào).');
    return this.adminWalletView(w);
  }

  /** Ví một CTV và 20 biến động gần nhất (P7) */
  async adminAffiliateWallet(affiliateId: string): Promise<AdminWalletView> {
    const w = await this.prisma.wallet.findUnique({ where: { affiliateId } });
    if (!w) throw new AppError(404, 'NOT_FOUND', 'Cộng tác viên chưa có ví (chưa có đơn nào).');
    return this.adminWalletView(w);
  }

  async adminWalletView(w: Wallet): Promise<AdminWalletView> {
    const rows = await this.prisma.walletTransaction.findMany({
      where: { walletId: w.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
    });
    return {
      walletId: w.id,
      ownerType: w.ownerType,
      shopId: w.shopId,
      affiliateId: w.affiliateId,
      ownerId: w.ownerId,
      pending: w.pending,
      available: w.available,
      locked: w.locked,
      openWithdrawal: await this.openWithdrawal(w.id),
      recentTransactions: await this.txViews(rows),
    };
  }

  /** Tiền của một đơn con theo mã (DIS-02) */
  async adminShopOrderMoney(shopOrderCode: string): Promise<ShopOrderMoneyView> {
    const e = await this.prisma.sellerEarning.findFirst({
      where: { shopOrderCode: shopOrderCode.trim().toUpperCase() },
    });
    if (!e) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy đơn con.');
    const [refunded, w] = await Promise.all([
      this.prisma.refund.aggregate({
        where: { shopOrderId: e.shopOrderId },
        _sum: { amount: true },
      }),
      this.prisma.wallet.findUniqueOrThrow({ where: { shopId: e.shopId } }),
    ]);
    return {
      shopOrderId: e.shopOrderId,
      shopOrderCode: e.shopOrderCode,
      orderId: e.orderId,
      orderCode: e.orderCode,
      shopId: e.shopId,
      buyerId: e.buyerId,
      paymentMethod: e.paymentMethod,
      buyerPaid: e.buyerPaid,
      refunded: refunded._sum.amount ?? 0,
      commission: e.commission,
      sellerAmount: e.sellerAmount,
      returnDeduction: e.returnDeduction,
      sellerReceives: finalSellerAmount(e),
      status: e.status,
      wallet: { pending: w.pending, available: w.available, locked: w.locked },
    };
  }

  private myWallet(userId: string, ownerType: WalletOwnerType): Promise<Wallet | null> {
    return this.prisma.wallet.findUnique({
      where: { ownerType_ownerId: { ownerType, ownerId: userId } },
    });
  }

  private async openWithdrawal(walletId: string): Promise<OpenWithdrawalView | null> {
    return this.prisma.withdrawal.findFirst({
      where: { walletId, status: { in: ['PENDING', 'APPROVED'] } },
      select: { id: true, amount: true, status: true, createdAt: true },
    });
  }

  private async txViews(rows: WalletTransaction[]): Promise<WalletTransactionView[]> {
    const ids = rows.flatMap((r) => (r.shopOrderId ? [r.shopOrderId] : []));
    const codes = new Map(
      (
        await this.prisma.sellerEarning.findMany({
          where: { shopOrderId: { in: ids } },
          select: { shopOrderId: true, shopOrderCode: true },
        })
      ).map((e) => [e.shopOrderId, e.shopOrderCode]),
    );
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      amount: r.amount,
      fromBucket: r.fromBucket,
      toBucket: r.toBucket,
      shopOrderId: r.shopOrderId,
      shopOrderCode: r.shopOrderId ? (codes.get(r.shopOrderId) ?? null) : null,
      withdrawalId: r.withdrawalId,
      adjustmentId: r.adjustmentId,
      note: r.note,
      createdAt: r.createdAt,
    }));
  }
}

/** Trạng thái tiền đơn con mà CTV không còn hoa hồng */
const LOST: EarningStatus[] = ['EXPIRED', 'CANCELLED', 'FAILED', 'COMPENSATED'];

/** Các đơn con có tiền vào ví này: ví shop theo shop, ví CTV theo CTV */
function earningsOf(w: Wallet): Prisma.SellerEarningWhereInput {
  return w.ownerType === 'SHOP' ? { shopId: w.shopId! } : { affiliateId: w.affiliateId! };
}
