import { Injectable } from '@nestjs/common';
import { skipTake, toPage, type AuthUser, type PageQuery } from '@san/nest-common';
import type { Page } from '@san/shared';
import { PrismaService } from '../prisma.service';
import type {
  EarningStatus,
  Prisma,
  SellerEarning,
  WalletBucket,
  WalletTxType,
} from '../../generated/prisma';

export interface WalletView {
  /** null: shop chưa có đơn nào (chưa có ví) */
  shopId: string | null;
  pending: number;
  available: number;
  locked: number;
  /** Ngăn đang giữ chia theo lý do chưa khả dụng */
  pendingWaitingCompletion: number;
  pendingWaitingCod: number;
}

export interface WalletTransactionView {
  id: string;
  type: WalletTxType;
  amount: number;
  fromBucket: WalletBucket | null;
  toBucket: WalletBucket | null;
  shopOrderId: string | null;
  shopOrderCode: string | null;
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
  sellerAmount: number;
  status: EarningStatus;
  /** Câu giải thích vì sao tiền chưa khả dụng (null khi không cần) */
  waitingFor: string | null;
  deliveredAt: Date | null;
  completedAt: Date | null;
  moneyReceivedAt: Date | null;
  releasedAt: Date | null;
  createdAt: Date;
}

/** Lý do tiền đơn con chưa khả dụng, hiện cho seller */
export function waitingFor(e: SellerEarning): string | null {
  if (e.status === 'UNPAID') {
    return e.paymentMethod === 'COD' ? 'Chờ giao hàng (COD)' : 'Chờ người mua thanh toán';
  }
  if (e.status !== 'HELD') return null;
  if (!e.completedAt) return 'Chờ đơn hoàn tất';
  if (!e.moneyReceivedAt) return 'Chờ đối soát tiền COD với GHN';
  return null;
}

/** Ví và tiền của shop cho chủ shop xem (FIN-01, FIN-02) */
@Injectable()
export class SellerWalletService {
  constructor(private readonly prisma: PrismaService) {}

  async wallet(user: AuthUser): Promise<WalletView> {
    const w = await this.prisma.sellerWallet.findUnique({ where: { ownerId: user.id } });
    if (!w) {
      return {
        shopId: null,
        pending: 0,
        available: 0,
        locked: 0,
        pendingWaitingCompletion: 0,
        pendingWaitingCod: 0,
      };
    }
    const held = await this.prisma.sellerEarning.findMany({
      where: { shopId: w.shopId, status: 'HELD' },
      select: { sellerAmount: true, completedAt: true, moneyReceivedAt: true },
    });
    const sum = (list: typeof held) => list.reduce((a, e) => a + e.sellerAmount, 0);
    return {
      shopId: w.shopId,
      pending: w.pending,
      available: w.available,
      locked: w.locked,
      pendingWaitingCompletion: sum(held.filter((e) => !e.completedAt)),
      pendingWaitingCod: sum(held.filter((e) => e.completedAt && !e.moneyReceivedAt)),
    };
  }

  async transactions(user: AuthUser, q: PageQuery): Promise<Page<WalletTransactionView>> {
    const w = await this.prisma.sellerWallet.findUnique({ where: { ownerId: user.id } });
    if (!w) return toPage([], 0, q);
    const where = { shopId: w.shopId };
    const [rows, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.walletTransaction.count({ where }),
    ]);
    const ids = rows.flatMap((r) => (r.shopOrderId ? [r.shopOrderId] : []));
    const codes = new Map(
      (
        await this.prisma.sellerEarning.findMany({
          where: { shopOrderId: { in: ids } },
          select: { shopOrderId: true, shopOrderCode: true },
        })
      ).map((e) => [e.shopOrderId, e.shopOrderCode]),
    );
    return toPage(
      rows.map((r) => ({
        id: r.id,
        type: r.type,
        amount: r.amount,
        fromBucket: r.fromBucket,
        toBucket: r.toBucket,
        shopOrderId: r.shopOrderId,
        shopOrderCode: r.shopOrderId ? (codes.get(r.shopOrderId) ?? null) : null,
        note: r.note,
        createdAt: r.createdAt,
      })),
      total,
      q,
    );
  }

  async earnings(
    user: AuthUser,
    q: PageQuery & { status?: EarningStatus },
  ): Promise<Page<EarningView>> {
    const w = await this.prisma.sellerWallet.findUnique({ where: { ownerId: user.id } });
    if (!w) return toPage([], 0, q);
    const where: Prisma.SellerEarningWhereInput = { shopId: w.shopId };
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
        sellerAmount: e.sellerAmount,
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
}
