import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AppError,
  EventBus,
  SettingsService,
  skipTake,
  toPage,
  writeAudit,
  type AuthUser,
  type PageQuery,
} from '@san/nest-common';
import { REFUND_UPDATED, type BankAccount, type Page, type RefundDisplayStatus } from '@san/shared';
import { randomUUID } from 'node:crypto';
import { PAYMENT_GATEWAY, type GatewayRefund, type PaymentGateway } from '../gateway/gateway';
import { PrismaService } from '../prisma.service';
import { PaymentSetting } from '../settings';
import { ReceiptStorage } from './receipt-storage.service';
import type { Prisma, Refund, RefundMethod, RefundStatus } from '../../generated/prisma';

type Tx = Prisma.TransactionClient;

/** Khoản hoàn trả cho trang admin */
export interface RefundView {
  id: string;
  orderId: string;
  orderCode: string | null;
  shopOrderId: string | null;
  shopOrderCode: string | null;
  /** Mã giao dịch được hoàn; null khi hoàn bằng chuyển khoản không gắn giao dịch */
  paymentRef: string | null;
  gateway: 'VNPAY' | 'MOCK' | null;
  amount: number;
  reason: Refund['reason'];
  /** GATEWAY: qua cổng; BANK_TRANSFER: admin chuyển khoản tay */
  method: RefundMethod;
  /** Tài khoản nhận của người mua (chỉ BANK_TRANSFER) */
  bankAccount: BankAccount | null;
  /** Yêu cầu trả hàng (P5) */
  returnId: string | null;
  /** Đề nghị điều chỉnh (P5, DIS-02) */
  adjustmentId: string | null;
  status: RefundStatus;
  tries: number;
  nextTryAt: Date | null;
  lastError: string | null;
  transferCode: string | null;
  hasReceipt: boolean;
  manualNote: string | null;
  completedAt: Date | null;
  createdAt: Date;
}

/** Trạng thái hoàn hiện cho buyer/seller (gộp lỗi chờ thử lại vào "đang hoàn") */
const DISPLAY: Record<RefundStatus, RefundDisplayStatus> = {
  PENDING: 'PROCESSING',
  FAILED: 'PROCESSING',
  UNKNOWN: 'PROCESSING',
  NEEDS_MANUAL: 'NEEDS_MANUAL',
  SUCCEEDED: 'SUCCEEDED',
  MANUAL_DONE: 'MANUAL_DONE',
};

/** Lần thử lại sau 5 phút, 15 phút, 30 phút... */
const retryDelayMs = (tries: number) => [5, 15, 30, 60][Math.min(tries - 1, 3)]! * 60_000;

type RefundRow = Refund & { payment: { ref: string; gateway: 'VNPAY' | 'MOCK' } | null };

/**
 * Hoàn tiền cho buyer (REF-01, REF-02, STATE-02 khu B). Tự gửi lệnh hoàn qua cổng, lỗi thì thử lại theo lịch
 * tối đa `refund_max_tries` lần, vẫn lỗi thì chờ admin tài chính hoàn tay có chứng từ. Khoản hoàn bằng
 * chuyển khoản (đơn COD, điều chỉnh) chờ hoàn tay ngay. Không bao giờ ghi "đã hoàn" khi mới gửi lệnh; gửi
 * lệnh mà không có phản hồi thì tra cứu, không gửi lại mù quáng.
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBus,
    private readonly settings: SettingsService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly receipts: ReceiptStorage,
  ) {}

  /**
   * Tạo khoản hoàn cho một đơn con đã thu tiền: bị hủy (số buyer đã trả), giao thất bại (tiền hàng sau
   * voucher), sự cố GHN (hoàn đủ). Mỗi đơn con tối đa một khoản loại này: gọi lại không tạo thêm.
   */
  async createForShopOrder(
    tx: Tx,
    orderId: string,
    shopOrderId: string,
    amount: number,
    reason: 'CANCELLED' | 'DELIVERY_FAILED' | 'INCIDENT' = 'CANCELLED',
  ): Promise<void> {
    if (amount <= 0) return;
    const payment = await this.appliedPayment(tx, orderId);
    await tx.refund.createMany({
      data: [
        {
          paymentId: payment.id,
          orderId,
          shopOrderId,
          amount,
          reason,
          nextTryAt: new Date(),
        },
      ],
      skipDuplicates: true,
    });
  }

  /**
   * Khoản hoàn của yêu cầu trả hàng (REF-02) hoặc đề nghị điều chỉnh (DIS-02), mỗi yêu cầu/đề nghị tối đa
   * một. Qua cổng: hoàn một phần giao dịch đã thu, chạy như khoản hoàn thường. Chuyển khoản: chờ admin tài
   * chính hoàn tay ngay, báo marketplace. Trả false nếu đã tạo trước đó.
   */
  async createExtra(
    tx: Tx,
    input: {
      orderId: string;
      shopOrderId: string;
      amount: number;
      reason: 'RETURN' | 'ADJUSTMENT';
      returnId?: string;
      adjustmentId?: string;
      /** Có tài khoản → chuyển khoản tay; không có → hoàn qua cổng */
      bankAccount: BankAccount | null;
    },
  ): Promise<boolean> {
    if (input.amount <= 0) return false;
    const bank = input.bankAccount;
    const payment = bank ? null : await this.appliedPayment(tx, input.orderId);
    const now = new Date();
    const { count } = await tx.refund.createMany({
      data: [
        {
          paymentId: payment?.id ?? null,
          orderId: input.orderId,
          shopOrderId: input.shopOrderId,
          amount: input.amount,
          reason: input.reason,
          method: bank ? 'BANK_TRANSFER' : 'GATEWAY',
          returnId: input.returnId ?? null,
          adjustmentId: input.adjustmentId ?? null,
          bankName: bank?.bankName ?? null,
          bankAccountNumber: bank?.accountNumber ?? null,
          bankAccountName: bank?.accountName ?? null,
          status: bank ? 'NEEDS_MANUAL' : 'PENDING',
          nextTryAt: bank ? null : now,
        },
      ],
      skipDuplicates: true,
    });
    if (count === 0) return false;
    if (bank) {
      const r = await tx.refund.findFirstOrThrow({
        where: input.returnId ? { returnId: input.returnId } : { adjustmentId: input.adjustmentId },
      });
      await this.publish(tx, r, now);
    }
    return true;
  }

  /** Tổng các khoản hoàn đã tạo cho một đơn con (để không hoàn quá số người mua đã trả) */
  async refundedFor(tx: Tx, shopOrderId: string): Promise<number> {
    const sum = await tx.refund.aggregate({ where: { shopOrderId }, _sum: { amount: true } });
    return sum._sum.amount ?? 0;
  }

  /** Job: gửi các lệnh hoàn đến hạn, tra cứu các lệnh chưa rõ */
  async processDue(now = new Date()): Promise<number> {
    const due = await this.prisma.refund.findMany({
      where: {
        method: 'GATEWAY',
        OR: [
          { status: { in: ['PENDING', 'FAILED'] }, nextTryAt: { lte: now } },
          { status: 'UNKNOWN' },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    for (const r of due) {
      if (r.status === 'UNKNOWN') await this.checkUnknown(r);
      else await this.send(r);
    }
    return due.length;
  }

  /** Gửi lệnh hoàn. Trước khi gửi ghi "không rõ" + mã lệnh: lỡ dừng giữa chừng thì lần sau tra cứu */
  async send(r: Refund): Promise<RefundStatus> {
    if (!r.paymentId) return r.status;
    const requestId = randomUUID().replace(/-/g, '');
    const claimed = await this.prisma.refund.updateMany({
      where: { id: r.id, status: { in: ['PENDING', 'FAILED'] } },
      data: { status: 'UNKNOWN', requestId, tries: { increment: 1 } },
    });
    if (claimed.count === 0) return r.status;
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: r.paymentId } });
    const result: GatewayRefund = await this.gateway.refund(payment, r.amount, requestId);
    return this.record(r.id, result);
  }

  /** Lệnh hoàn chưa rõ: tra cứu cổng. Đã hoàn → xong; chắc chắn chưa hoàn → tính là lỗi, được gửi lại */
  async checkUnknown(r: Refund): Promise<RefundStatus> {
    if (!r.paymentId) return r.status;
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: r.paymentId } });
    const found = await this.gateway.queryRefund(payment);
    if (found === 'UNKNOWN') return 'UNKNOWN';
    if (found === 'SUCCEEDED') {
      // Tra cứu chỉ biết "giao dịch đã có hoàn", không biết là khoản nào. Cùng giao dịch đã có khoản hoàn
      // khác thành công thì không đủ căn cứ ghi "đã hoàn" cho khoản này: chuyển admin kiểm tay.
      const others = await this.prisma.refund.count({
        where: { paymentId: r.paymentId, id: { not: r.id }, status: 'SUCCEEDED' },
      });
      if (others > 0) {
        return this.record(
          r.id,
          {
            status: 'FAILED',
            message:
              'Tra cứu không phân biệt được khoản hoàn này với khoản hoàn khác của cùng giao dịch: ' +
              'kiểm trên trang merchant VNPay rồi hoàn tay nếu chưa hoàn.',
            raw: { query: found, otherRefunds: others },
          },
          true,
        );
      }
    }
    return this.record(r.id, {
      status: found === 'SUCCEEDED' ? 'SUCCEEDED' : 'FAILED',
      message: found === 'SUCCEEDED' ? null : 'Tra cứu: cổng chưa nhận lệnh hoàn.',
      raw: { query: found },
    });
  }

  /** Ghi kết quả một lần gửi/tra cứu; đủ số lần lỗi thì chuyển hoàn tay. Báo marketplace khi đổi trạng thái hiển thị */
  private async record(id: string, result: GatewayRefund, toManual = false): Promise<RefundStatus> {
    const maxTries = await this.settings.get(PaymentSetting.refundMaxTries);
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.refund.findUniqueOrThrow({ where: { id } });
      if (r.status !== 'UNKNOWN') return r.status;
      const now = new Date();
      let status: RefundStatus = result.status;
      if (status === 'FAILED' && (toManual || r.tries >= maxTries)) status = 'NEEDS_MANUAL';
      await tx.refund.update({
        where: { id },
        data: {
          status,
          lastError: result.message?.slice(0, 500) ?? null,
          gatewayResponse: JSON.parse(JSON.stringify(result.raw)) as Prisma.InputJsonValue,
          nextTryAt: status === 'FAILED' ? new Date(now.getTime() + retryDelayMs(r.tries)) : null,
          completedAt: status === 'SUCCEEDED' ? now : null,
        },
      });
      if (status === 'SUCCEEDED' || status === 'NEEDS_MANUAL') {
        await this.publish(tx, { ...r, status }, now);
        this.logger.log(`Khoản hoàn ${r.id} (${r.amount}đ): ${status}`);
      }
      return status;
    });
  }

  // ----- admin tài chính -----

  async list(q: PageQuery & { status?: RefundStatus }): Promise<Page<RefundView>> {
    const where: Prisma.RefundWhereInput = q.status ? { status: q.status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.refund.findMany({
        where,
        include: { payment: { select: { ref: true, gateway: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.refund.count({ where }),
    ]);
    const codes = await this.codes(rows);
    return toPage(
      rows.map((r) => this.view(r, codes)),
      total,
      q,
    );
  }

  /** Admin đã chuyển khoản tay cho buyer: lưu mã giao dịch + biên lai, đóng khoản hoàn (R9) */
  async manual(
    admin: AuthUser,
    refundId: string,
    dto: { transferCode: string; receiptKey: string; note?: string },
  ): Promise<RefundView> {
    const used = await this.prisma.refund.count({
      where: { receiptKey: dto.receiptKey, id: { not: refundId } },
    });
    await this.receipts.assertUsable(dto.receiptKey, `refund-receipts/${admin.id}/`, used > 0);
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.refund.findUnique({ where: { id: refundId } });
      if (!r) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy khoản hoàn.');
      const now = new Date();
      const { count } = await tx.refund.updateMany({
        where: { id: refundId, status: 'NEEDS_MANUAL' },
        data: {
          status: 'MANUAL_DONE',
          transferCode: dto.transferCode,
          receiptKey: dto.receiptKey,
          manualNote: dto.note ?? null,
          manualBy: admin.id,
          completedAt: now,
        },
      });
      if (count === 0) {
        throw new AppError(
          409,
          'REFUND_NOT_MANUAL',
          'Khoản hoàn này không ở trạng thái chờ hoàn tay.',
        );
      }
      await writeAudit(tx, {
        actor: admin,
        action: 'MANUAL_REFUND',
        targetType: 'REFUND',
        targetId: refundId,
        reason: dto.note ?? null,
        before: { status: r.status },
        after: { status: 'MANUAL_DONE', transferCode: dto.transferCode, amount: r.amount },
      });
      await this.publish(tx, { ...r, status: 'MANUAL_DONE' }, now);
    });
    const r = await this.prisma.refund.findUniqueOrThrow({
      where: { id: refundId },
      include: { payment: { select: { ref: true, gateway: true } } },
    });
    return this.view(r, await this.codes([r]));
  }

  async receiptKey(refundId: string): Promise<string> {
    const r = await this.prisma.refund.findUnique({ where: { id: refundId } });
    if (!r?.receiptKey) throw new AppError(404, 'NOT_FOUND', 'Khoản hoàn này chưa có biên lai.');
    return r.receiptKey;
  }

  private async appliedPayment(tx: Tx, orderId: string) {
    const payment = await tx.payment.findFirst({
      where: { orderId, status: 'SUCCEEDED', applied: true },
    });
    if (!payment) throw new Error(`Đơn ${orderId} đã giữ tiền nhưng không thấy lần thanh toán`);
    return payment;
  }

  private async publish(tx: Tx, r: Refund, at: Date): Promise<void> {
    await this.events.publish(tx, REFUND_UPDATED, {
      refundId: r.id,
      orderId: r.orderId,
      shopOrderId: r.shopOrderId,
      returnId: r.returnId,
      amount: r.amount,
      status: DISPLAY[r.status],
      updatedAt: at.toISOString(),
    });
  }

  /** Mã đơn tổng/đơn con của các khoản hoàn (lấy từ seller_earnings) */
  private async codes(rows: Refund[]) {
    const earnings = await this.prisma.sellerEarning.findMany({
      where: { orderId: { in: rows.map((r) => r.orderId) } },
      select: { orderId: true, orderCode: true, shopOrderId: true, shopOrderCode: true },
    });
    return {
      order: new Map(earnings.map((e) => [e.orderId, e.orderCode])),
      shopOrder: new Map(earnings.map((e) => [e.shopOrderId, e.shopOrderCode])),
    };
  }

  private view(r: RefundRow, codes: Awaited<ReturnType<RefundsService['codes']>>): RefundView {
    return {
      id: r.id,
      orderId: r.orderId,
      orderCode: codes.order.get(r.orderId) ?? null,
      shopOrderId: r.shopOrderId,
      shopOrderCode: r.shopOrderId ? (codes.shopOrder.get(r.shopOrderId) ?? null) : null,
      paymentRef: r.payment?.ref ?? null,
      gateway: r.payment?.gateway ?? null,
      amount: r.amount,
      reason: r.reason,
      method: r.method,
      bankAccount:
        r.bankName && r.bankAccountNumber && r.bankAccountName
          ? {
              bankName: r.bankName,
              accountNumber: r.bankAccountNumber,
              accountName: r.bankAccountName,
            }
          : null,
      returnId: r.returnId,
      adjustmentId: r.adjustmentId,
      status: r.status,
      tries: r.tries,
      nextTryAt: r.nextTryAt,
      lastError: r.lastError,
      transferCode: r.transferCode,
      hasReceipt: Boolean(r.receiptKey),
      manualNote: r.manualNote,
      completedAt: r.completedAt,
      createdAt: r.createdAt,
    };
  }
}
