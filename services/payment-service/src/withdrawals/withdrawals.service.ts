import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  AppError,
  EventBus,
  SettingsService,
  skipTake,
  toPage,
  writeAudit,
  type AuthUser,
} from '@san/nest-common';
import {
  WITHDRAWAL_APPROVAL_DECIDED,
  WITHDRAWAL_CANCELLED,
  WITHDRAWAL_REQUESTED,
  type Page,
  type WithdrawalApprovalDecidedPayload,
} from '@san/shared';
import { MarketplaceClient } from '../clients/marketplace.client';
import { ReceiptStorage } from '../refunds/receipt-storage.service';
import { PrismaService } from '../prisma.service';
import { PaymentSetting } from '../settings';
import { SellerWalletService, type AdminWalletView } from '../wallet/seller-wallet.service';
import { InsufficientBalanceError, WalletService } from '../wallet/wallet.service';
import { Prisma, type Withdrawal, type WithdrawalStatus } from '../../generated/prisma';
import type { PayoutDto, WithdrawalsQuery } from './dto/withdrawals.dto';

type Tx = Prisma.TransactionClient;

export interface WithdrawalView {
  id: string;
  shopId: string;
  shopName: string;
  ownerId: string;
  ownerName: string;
  amount: number;
  status: WithdrawalStatus;
  /** Tài khoản nhận; seller chỉ thấy 4 số cuối, admin tài chính thấy đủ để chuyển khoản */
  bankAccount: { bankName: string; accountNumber: string; accountName: string };
  /** Lý do từ chối / chuyển khoản lỗi */
  reason: string | null;
  decidedByName: string | null;
  decidedAt: Date | null;
  transferCode: string | null;
  hasReceipt: boolean;
  paidByName: string | null;
  paidAt: Date | null;
  note: string | null;
  createdAt: Date;
  /** Seller hủy được (chưa duyệt) */
  canCancel: boolean;
}

export interface AdminWithdrawalPage extends Page<WithdrawalView> {
  /** Tổng tiền các yêu cầu theo bộ lọc (đối soát chi trả) */
  totalAmount: number;
}

export interface WithdrawalDetailView extends WithdrawalView {
  /** Ví hiện tại và các biến động gần nhất của shop (nguồn tiền) */
  wallet: AdminWalletView;
}

/**
 * Rút tiền và chi trả (FIN-04..06, STATE-02 khu D). Gửi yêu cầu = khóa tiền (khả dụng → đang khóa) bằng
 * câu lệnh có điều kiện, khóa theo shop nên hai yêu cầu cùng lúc không khóa vượt số dư; mỗi shop chỉ một yêu
 * cầu đang xử lý. Admin tài chính duyệt ở approval-service; payment-service kiểm yêu cầu còn chờ rồi mới áp.
 * Chỉ ghi "đã chi" khi có mã giao dịch và biên lai. Từ chối, seller hủy, chuyển lỗi → mở khóa đúng một lần.
 */
@Injectable()
export class WithdrawalsService implements OnModuleInit {
  private readonly logger = new Logger(WithdrawalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBus,
    private readonly settings: SettingsService,
    private readonly wallet: WalletService,
    private readonly wallets: SellerWalletService,
    private readonly marketplace: MarketplaceClient,
    private readonly receipts: ReceiptStorage,
  ) {}

  onModuleInit(): void {
    this.events.subscribe(WITHDRAWAL_APPROVAL_DECIDED, (p, tx: Tx) => this.applyDecision(p, tx));
  }

  // ===== Seller =====

  /** Gửi yêu cầu rút (FIN-04). Header Idempotency-Key: gửi lại cùng mã thì trả lại yêu cầu đã tạo */
  async request(
    user: AuthUser,
    authorization: string,
    amount: number,
    requestKey: string | undefined,
  ): Promise<WithdrawalView> {
    if (!requestKey) {
      throw new AppError(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Thiếu mã chống gửi lặp (Idempotency-Key).',
      );
    }
    if (requestKey.length > 64) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu chưa hợp lệ.', {
        fields: { 'Idempotency-Key': 'Mã chống gửi lặp dài tối đa 64 ký tự.' },
      });
    }
    const replay = await this.findReplay(user.id, requestKey);
    if (replay) return view(replay, 'SELLER');
    const min = await this.settings.get(PaymentSetting.withdrawMinAmount);
    if (amount < min) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu chưa hợp lệ.', {
        fields: { amount: `Số tiền rút tối thiểu ${min.toLocaleString('vi-VN')}đ.` },
      });
    }
    const w = await this.prisma.sellerWallet.findUnique({ where: { ownerId: user.id } });
    if (!w || w.available < amount) throw insufficient(w?.available ?? 0);
    if (await this.openOf(this.prisma, w.shopId)) throw inProgress();

    // Tài khoản nhận lấy từ hồ sơ shop đang dùng (gọi trước giao dịch, không giữ khóa khi chờ mạng)
    const my = await this.marketplace.myShop(authorization);
    if (my.status !== 'ACTIVE' || !my.shop || my.shop.id !== w.shopId) {
      throw new AppError(
        409,
        'SHOP_NOT_ACTIVE',
        'Shop đang không hoạt động nên chưa rút tiền được.',
      );
    }
    const bank = my.shop.bankAccount;
    if (!bank) {
      throw new AppError(
        409,
        'BANK_ACCOUNT_MISSING',
        'Shop chưa có tài khoản ngân hàng nhận tiền.',
      );
    }

    let created: Withdrawal;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        await this.wallet.lockShop(tx, w.shopId);
        if (await this.openOf(tx, w.shopId)) throw inProgress();
        const row = await tx.withdrawal.create({
          data: {
            shopId: w.shopId,
            ownerId: user.id,
            ownerName: user.name,
            shopName: my.shop!.name ?? '',
            amount,
            bankName: bank.bankName,
            bankAccountNumber: bank.accountNumber,
            bankAccountName: bank.accountName,
            requestKey,
          },
        });
        try {
          await this.wallet.move(
            tx,
            { shopId: w.shopId, withdrawalId: row.id, label: 'rút tiền' },
            'LOCKED',
            amount,
            'AVAILABLE',
            'LOCKED',
            'Khóa tiền cho yêu cầu rút',
          );
        } catch (e) {
          if (e instanceof InsufficientBalanceError) {
            const now = await tx.sellerWallet.findUniqueOrThrow({ where: { shopId: w.shopId } });
            throw insufficient(now.available);
          }
          throw e;
        }
        const after = await tx.sellerWallet.findUniqueOrThrow({ where: { shopId: w.shopId } });
        await this.events.publish(tx, WITHDRAWAL_REQUESTED, {
          withdrawalId: row.id,
          shopId: row.shopId,
          shopName: row.shopName,
          owner: { userId: user.id, name: user.name },
          amount,
          bankAccount: {
            bankName: bank.bankName,
            accountNumberMasked: mask(bank.accountNumber),
            accountName: bank.accountName,
          },
          wallet: { pending: after.pending, available: after.available, locked: after.locked },
          requestedAt: row.createdAt.toISOString(),
        });
        return row;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // Bấm hai lần cùng lúc (trùng mã) hoặc đã có yêu cầu đang xử lý (ràng buộc mỗi shop một yêu cầu)
        const again = await this.findReplay(user.id, requestKey);
        if (again) return view(again, 'SELLER');
        throw inProgress();
      }
      throw e;
    }
    this.logger.log(`Shop ${created.shopName} yêu cầu rút ${amount}đ (${created.id}).`);
    return view(created, 'SELLER');
  }

  async sellerList(user: AuthUser, q: WithdrawalsQuery): Promise<Page<WithdrawalView>> {
    const w = await this.prisma.sellerWallet.findUnique({ where: { ownerId: user.id } });
    if (!w) return toPage([], 0, q);
    const where: Prisma.WithdrawalWhereInput = { shopId: w.shopId, ...filter(q) };
    const [rows, total] = await Promise.all([
      this.prisma.withdrawal.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.withdrawal.count({ where }),
    ]);
    return toPage(
      rows.map((r) => view(r, 'SELLER')),
      total,
      q,
    );
  }

  /** Seller hủy khi chưa duyệt: mở khóa đúng một lần, báo approval-service */
  async cancel(user: AuthUser, withdrawalId: string): Promise<WithdrawalView> {
    const found = await this.prisma.withdrawal.findFirst({
      where: { id: withdrawalId, ownerId: user.id },
    });
    if (!found) throw notFound();
    const row = await this.prisma.$transaction(async (tx) => {
      await this.wallet.lockShop(tx, found.shopId);
      const now = new Date();
      const { count } = await tx.withdrawal.updateMany({
        where: { id: withdrawalId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      if (count === 0) {
        throw new AppError(
          409,
          'WITHDRAWAL_NOT_CANCELLABLE',
          'Yêu cầu đã được duyệt hoặc đã kết thúc, không hủy được.',
        );
      }
      await this.unlock(tx, found, 'Hủy yêu cầu rút');
      await this.events.publish(tx, WITHDRAWAL_CANCELLED, {
        withdrawalId,
        cancelledAt: now.toISOString(),
      });
      return tx.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
    });
    return view(row, 'SELLER');
  }

  // ===== Quyết định duyệt từ approval-service =====

  /**
   * Admin tài chính duyệt/từ chối (withdrawal_approval.decided). Chỉ áp khi yêu cầu còn chờ duyệt: seller
   * đã hủy, hoặc tin trùng thì bỏ qua. Từ chối → mở khóa đúng một lần.
   */
  async applyDecision(p: WithdrawalApprovalDecidedPayload, tx: Tx): Promise<void> {
    const w = await tx.withdrawal.findUnique({ where: { id: p.withdrawalId } });
    if (!w) throw new Error(`Chưa có yêu cầu rút ${p.withdrawalId}`);
    await this.wallet.lockShop(tx, w.shopId);
    const fresh = await tx.withdrawal.findUniqueOrThrow({ where: { id: w.id } });
    if (fresh.status !== 'PENDING') {
      this.logger.warn(`Bỏ qua quyết định cho yêu cầu rút ${w.id} đang ${fresh.status}.`);
      return;
    }
    const approved = p.decision === 'APPROVED';
    await tx.withdrawal.update({
      where: { id: w.id },
      data: {
        status: approved ? 'APPROVED' : 'REJECTED',
        reason: approved ? null : p.reason,
        decidedByName: p.decidedBy.name,
        decidedAt: new Date(p.decidedAt),
      },
    });
    if (!approved) await this.unlock(tx, fresh, 'Yêu cầu rút bị từ chối');
  }

  // ===== Admin tài chính: chi trả =====

  async adminList(q: WithdrawalsQuery): Promise<AdminWithdrawalPage> {
    const where = filter(q);
    const [rows, total, sum] = await Promise.all([
      this.prisma.withdrawal.findMany({
        where,
        orderBy:
          q.status === 'APPROVED' || q.status === 'PENDING'
            ? [{ createdAt: 'asc' }, { id: 'asc' }]
            : [{ createdAt: 'desc' }, { id: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.withdrawal.count({ where }),
      this.prisma.withdrawal.aggregate({ where, _sum: { amount: true } }),
    ]);
    return {
      ...toPage(
        rows.map((r) => view(r, 'ADMIN')),
        total,
        q,
      ),
      totalAmount: sum._sum.amount ?? 0,
    };
  }

  async adminDetail(withdrawalId: string): Promise<WithdrawalDetailView> {
    const w = await this.prisma.withdrawal.findUnique({
      where: { id: withdrawalId },
      include: { wallet: true },
    });
    if (!w) throw notFound();
    return { ...view(w, 'ADMIN'), wallet: await this.wallets.adminWalletView(w.wallet) };
  }

  /** Đã chuyển khoản cho seller: có mã giao dịch và biên lai mới ghi "đã chi", trừ ngăn đang khóa */
  async paid(admin: AuthUser, withdrawalId: string, dto: PayoutDto): Promise<WithdrawalDetailView> {
    const used = await this.prisma.withdrawal.count({
      where: { receiptKey: dto.receiptKey, id: { not: withdrawalId } },
    });
    await this.receipts.assertUsable(dto.receiptKey, `payout-receipts/${admin.id}/`, used > 0);
    await this.adminAction(admin, withdrawalId, async (tx, w) => {
      const now = new Date();
      await tx.withdrawal.update({
        where: { id: w.id },
        data: {
          status: 'PAID',
          transferCode: dto.transferCode,
          receiptKey: dto.receiptKey,
          note: dto.note ?? null,
          paidBy: admin.id,
          paidByName: admin.name,
          paidAt: now,
        },
      });
      await this.wallet.move(
        tx,
        { shopId: w.shopId, withdrawalId: w.id, label: `mã GD ${dto.transferCode}` },
        'WITHDRAWN',
        w.amount,
        'LOCKED',
        null,
        'Đã chuyển khoản cho seller',
      );
      await writeAudit(tx, {
        actor: admin,
        action: 'PAY_WITHDRAWAL',
        targetType: 'WITHDRAWAL',
        targetId: w.id,
        reason: dto.note ?? null,
        before: { status: 'APPROVED' },
        after: { status: 'PAID', amount: w.amount, transferCode: dto.transferCode },
      });
    });
    return this.adminDetail(withdrawalId);
  }

  /** Chuyển khoản không thành công: mở khóa đúng một lần, seller gửi yêu cầu mới */
  async failed(
    admin: AuthUser,
    withdrawalId: string,
    reason: string,
  ): Promise<WithdrawalDetailView> {
    await this.adminAction(admin, withdrawalId, async (tx, w) => {
      await tx.withdrawal.update({ where: { id: w.id }, data: { status: 'FAILED', reason } });
      await this.unlock(tx, w, 'Chuyển khoản không thành công');
      await writeAudit(tx, {
        actor: admin,
        action: 'FAIL_WITHDRAWAL',
        targetType: 'WITHDRAWAL',
        targetId: w.id,
        reason,
        before: { status: 'APPROVED' },
        after: { status: 'FAILED', amount: w.amount },
      });
    });
    return this.adminDetail(withdrawalId);
  }

  async receiptKey(withdrawalId: string): Promise<string> {
    const w = await this.prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
    if (!w?.receiptKey) throw new AppError(404, 'NOT_FOUND', 'Yêu cầu này chưa có biên lai.');
    return w.receiptKey;
  }

  // ----- phần dùng chung -----

  /** Thao tác chi trả: chủ shop không tự chi; chỉ yêu cầu đã duyệt (cập nhật có điều kiện, chỉ một bên được) */
  private async adminAction(
    admin: AuthUser,
    withdrawalId: string,
    fn: (tx: Tx, w: Withdrawal) => Promise<void>,
  ): Promise<void> {
    const w = await this.prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
    if (!w) throw notFound();
    if (w.ownerId === admin.id) {
      throw new AppError(
        403,
        'SELF_PAYOUT_FORBIDDEN',
        'Bạn là chủ shop này nên không được tự chi trả cho shop mình.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await this.wallet.lockShop(tx, w.shopId);
      const fresh = await tx.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
      if (fresh.status !== 'APPROVED') {
        throw new AppError(
          409,
          'WITHDRAWAL_NOT_APPROVED',
          'Yêu cầu chưa được duyệt hoặc đã xử lý xong.',
        );
      }
      await fn(tx, fresh);
    });
  }

  private async unlock(tx: Tx, w: Withdrawal, note: string): Promise<void> {
    await this.wallet.move(
      tx,
      { shopId: w.shopId, withdrawalId: w.id, label: 'rút tiền' },
      'UNLOCKED',
      w.amount,
      'LOCKED',
      'AVAILABLE',
      note,
    );
  }

  private openOf(db: Tx | PrismaService, shopId: string) {
    return db.withdrawal.findFirst({ where: { shopId, status: { in: ['PENDING', 'APPROVED'] } } });
  }

  private async findReplay(userId: string, requestKey: string): Promise<Withdrawal | null> {
    const w = await this.prisma.withdrawal.findUnique({ where: { requestKey } });
    if (!w) return null;
    if (w.ownerId !== userId) {
      throw new AppError(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'Mã yêu cầu đã được dùng, bạn tải lại trang rồi thử lại.',
      );
    }
    return w;
  }
}

// ----- hàm phụ -----

function filter(q: WithdrawalsQuery): Prisma.WithdrawalWhereInput {
  const where: Prisma.WithdrawalWhereInput = {};
  if (q.status) where.status = q.status;
  if (q.from || q.to)
    where.createdAt = { ...(q.from && { gte: q.from }), ...(q.to && { lte: q.to }) };
  return where;
}

function mask(n: string): string {
  return `•••• ${n.slice(-4)}`;
}

function view(w: Withdrawal, viewer: 'SELLER' | 'ADMIN'): WithdrawalView {
  return {
    id: w.id,
    shopId: w.shopId,
    shopName: w.shopName,
    ownerId: w.ownerId,
    ownerName: w.ownerName,
    amount: w.amount,
    status: w.status,
    bankAccount: {
      bankName: w.bankName,
      accountNumber: viewer === 'ADMIN' ? w.bankAccountNumber : mask(w.bankAccountNumber),
      accountName: w.bankAccountName,
    },
    reason: w.reason,
    decidedByName: w.decidedByName,
    decidedAt: w.decidedAt,
    transferCode: w.transferCode,
    hasReceipt: Boolean(w.receiptKey),
    paidByName: w.paidByName,
    paidAt: w.paidAt,
    note: w.note,
    createdAt: w.createdAt,
    canCancel: viewer === 'SELLER' && w.status === 'PENDING',
  };
}

function notFound(): AppError {
  return new AppError(404, 'NOT_FOUND', 'Không tìm thấy yêu cầu rút tiền.');
}

function inProgress(): AppError {
  return new AppError(
    409,
    'WITHDRAWAL_IN_PROGRESS',
    'Shop đang có một yêu cầu rút chưa xong, chờ yêu cầu đó kết thúc rồi gửi tiếp.',
  );
}

function insufficient(available: number): AppError {
  return new AppError(409, 'INSUFFICIENT_BALANCE', 'Số dư khả dụng không đủ để rút số tiền này.', {
    available,
  });
}
