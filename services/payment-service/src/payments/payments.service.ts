import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppError, EventBus, SettingsService, type AuthUser } from '@san/nest-common';
import { PAYMENT_EXPIRED, PAYMENT_SUCCEEDED } from '@san/shared';
import { PAYMENT_GATEWAY, type GatewayQuery, type PaymentGateway } from '../gateway/gateway';
import { PrismaService } from '../prisma.service';
import { PaymentSetting } from '../settings';
import type { Payment, Prisma, SellerEarning } from '../../generated/prisma';

type Tx = Prisma.TransactionClient;

/** Lần thanh toán trả cho marketplace/web */
export interface PaymentLink {
  paymentId: string;
  attempt: number;
  maxAttempts: number;
  payUrl: string;
  gateway: 'VNPAY' | 'MOCK';
}

/** Tình hình thanh toán của một đơn tổng (trang kết quả thanh toán) */
export interface OrderPaymentView {
  orderId: string;
  orderCode: string;
  status: 'UNPAID' | 'PAID' | 'EXPIRED' | 'CANCELLED';
  amount: number;
  payBefore: Date;
  attempts: number;
  maxAttempts: number;
  gateway: 'VNPAY' | 'MOCK';
  lastAttempt: { attempt: number; status: Payment['status']; payUrl: string | null } | null;
}

/** Kết quả một lần thanh toán do cổng báo (IPN, đường dẫn quay về, tra cứu, trang mô phỏng) */
export interface PaymentResult {
  success: boolean;
  amount: number | null;
  transactionNo: string | null;
  bankCode: string | null;
  paidAt: Date | null;
  raw: Record<string, unknown>;
}

export type ApplyOutcome = 'APPLIED' | 'FAILED' | 'ALREADY' | 'AMOUNT_MISMATCH' | 'REFUNDED';

/** Tình trạng đơn tổng tính từ các dòng seller_earnings */
export function orderState(rows: SellerEarning[]): OrderPaymentView['status'] {
  if (rows.some((r) => r.status === 'HELD')) return 'PAID';
  if (rows.some((r) => r.status === 'UNPAID')) return 'UNPAID';
  if (rows.some((r) => r.status === 'EXPIRED')) return 'EXPIRED';
  // Đã từng trả rồi mới hủy hết thì vẫn tính là đã trả (tiền đang được hoàn)
  if (rows.some((r) => r.paidAt)) return 'PAID';
  return 'CANCELLED';
}

/**
 * Thu tiền đơn tổng qua cổng (PAY-01..04). Mọi thay đổi của một đơn chạy trong giao dịch có khóa theo
 * đơn; chỉ ghi "đã trả" khi cổng xác nhận (IPN hợp lệ hoặc tra cứu). Tiền về sau khi đơn hết hạn/hủy,
 * hoặc trả trùng, thì tự tạo khoản hoàn.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBus,
    private readonly settings: SettingsService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  async lock(tx: Tx, orderId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payment-order:${orderId}`}))`;
  }

  // ----- tạo lần thanh toán -----

  /**
   * Tạo lần thanh toán mới, hoặc trả lại lần đang chờ (buyer đóng tab VNPay rồi bấm lại).
   * Cùng Idempotency-Key → trả đúng lần đã tạo.
   */
  async create(
    buyer: AuthUser,
    orderId: string,
    requestKey: string | undefined,
    clientIp: string,
  ): Promise<PaymentLink> {
    if (!requestKey) {
      throw new AppError(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Thiếu mã chống gửi lặp (Idempotency-Key).',
      );
    }
    const maxAttempts = await this.settings.get(PaymentSetting.maxPaymentAttempts);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, orderId);
      const same = await tx.payment.findUnique({ where: { requestKey } });
      if (same) {
        if (same.orderId !== orderId) {
          throw new AppError(
            409,
            'IDEMPOTENCY_KEY_REUSED',
            'Mã chống gửi lặp đã dùng cho đơn khác.',
          );
        }
        return this.link(same, maxAttempts);
      }
      const rows = await tx.sellerEarning.findMany({ where: { orderId } });
      if (rows.length === 0) {
        throw new AppError(
          409,
          'ORDER_NOT_READY',
          'Hệ thống đang ghi nhận đơn, bạn thử lại sau giây lát.',
        );
      }
      if (rows[0]!.buyerId !== buyer.id)
        throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy đơn.');
      const state = orderState(rows);
      if (state !== 'UNPAID' || rows[0]!.payBefore <= new Date()) {
        throw new AppError(
          409,
          'ORDER_NOT_PAYABLE',
          state === 'PAID' ? 'Đơn đã được thanh toán.' : 'Đơn đã hủy hoặc đã hết hạn thanh toán.',
        );
      }

      const attempts = await tx.payment.findMany({
        where: { orderId },
        orderBy: { attempt: 'asc' },
      });
      if (attempts.some((p) => p.status === 'UNKNOWN')) {
        throw new AppError(
          409,
          'PAYMENT_UNKNOWN',
          'Lần thanh toán trước chưa có kết quả, hệ thống đang tra cứu. Bạn chờ ít phút rồi xem lại đơn.',
        );
      }
      const pending = attempts.find((p) => p.status === 'PENDING');
      if (pending) return this.link(pending, maxAttempts);
      if (attempts.length >= maxAttempts) {
        throw new AppError(
          409,
          'PAYMENT_ATTEMPTS_EXCEEDED',
          `Đơn đã thanh toán không thành công ${attempts.length} lần.`,
        );
      }

      const attempt = attempts.length + 1;
      const amount = rows.reduce((a, r) => a + r.buyerPaid, 0);
      const created = await tx.payment.create({
        data: {
          orderId,
          attempt,
          ref: `${rows[0]!.orderCode}T${attempt}`,
          requestKey,
          gateway: this.gateway.kind,
          amount,
          payUrl: '',
          clientIp: normalizeIp(clientIp),
        },
      });
      const payUrl = this.gateway.payUrl(created, rows[0]!.orderCode, rows[0]!.payBefore);
      const saved = await tx.payment.update({ where: { id: created.id }, data: { payUrl } });
      this.logger.log(
        `${this.gateway.kind === 'MOCK' ? 'MÔ PHỎNG: ' : ''}tạo lần thanh toán ${saved.ref} (${amount}đ)`,
      );
      return this.link(saved, maxAttempts);
    });
  }

  async orderPayment(buyer: AuthUser, orderId: string): Promise<OrderPaymentView> {
    const rows = await this.prisma.sellerEarning.findMany({ where: { orderId } });
    if (rows.length === 0) {
      throw new AppError(
        409,
        'ORDER_NOT_READY',
        'Hệ thống đang ghi nhận đơn, bạn thử lại sau giây lát.',
      );
    }
    if (rows[0]!.buyerId !== buyer.id) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy đơn.');
    const attempts = await this.prisma.payment.findMany({
      where: { orderId },
      orderBy: { attempt: 'desc' },
    });
    const last = attempts[0];
    return {
      orderId,
      orderCode: rows[0]!.orderCode,
      status: orderState(rows),
      amount: rows.reduce((a, r) => a + r.buyerPaid, 0),
      payBefore: rows[0]!.payBefore,
      attempts: attempts.length,
      maxAttempts: await this.settings.get(PaymentSetting.maxPaymentAttempts),
      gateway: this.gateway.kind,
      lastAttempt: last
        ? {
            attempt: last.attempt,
            status: last.status,
            payUrl: last.status === 'PENDING' ? last.payUrl : null,
          }
        : null,
    };
  }

  // ----- áp kết quả -----

  /**
   * Áp kết quả một lần thanh toán. Thành công + đơn còn chưa trả → áp vào đơn, phát payment.succeeded.
   * Thành công nhưng đơn đã trả bằng lần khác / đã hết hạn / đã hủy → giữ tiền và tạo khoản hoàn.
   * Gọi lại với cùng lần đã có kết quả → ALREADY, không ghi lại.
   */
  async apply(tx: Tx, paymentId: string, r: PaymentResult): Promise<ApplyOutcome> {
    const p0 = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    await this.lock(tx, p0.orderId);
    const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (p.status === 'SUCCEEDED' || p.status === 'FAILED') return 'ALREADY';
    const raw = merge(p.gatewayResponse, r.raw);

    if (!r.success) {
      await tx.payment.update({
        where: { id: p.id },
        data: { status: 'FAILED', gatewayResponse: raw },
      });
      await this.expireIfExhausted(tx, p.orderId);
      return 'FAILED';
    }
    if (r.amount !== null && r.amount !== p.amount) {
      this.logger.error(`Lần ${p.ref}: cổng báo ${r.amount}đ, cần ${p.amount}đ. Không ghi.`);
      return 'AMOUNT_MISMATCH';
    }

    const rows = await tx.sellerEarning.findMany({ where: { orderId: p.orderId } });
    const canApply = rows.length > 0 && rows.every((x) => x.status === 'UNPAID');
    const paidAt = r.paidAt ?? new Date();
    await tx.payment.update({
      where: { id: p.id },
      data: {
        status: 'SUCCEEDED',
        applied: canApply,
        paidAt,
        transactionNo: r.transactionNo,
        bankCode: r.bankCode,
        gatewayResponse: raw,
      },
    });
    if (!canApply) {
      const paidBefore = rows.some((x) => x.paidAt);
      await tx.refund.create({
        data: {
          paymentId: p.id,
          orderId: p.orderId,
          amount: p.amount,
          reason: paidBefore ? 'DUPLICATE_PAYMENT' : 'LATE_PAYMENT',
          nextTryAt: new Date(),
        },
      });
      this.logger.warn(
        `Lần ${p.ref} trả thành công nhưng đơn ${paidBefore ? 'đã được trả' : 'đã hết hạn/hủy'}: tạo khoản hoàn.`,
      );
      return 'REFUNDED';
    }

    await tx.sellerEarning.updateMany({
      where: { orderId: p.orderId, status: 'UNPAID' },
      data: { status: 'HELD', paidAt },
    });
    await this.events.publish(tx, PAYMENT_SUCCEEDED, {
      orderId: p.orderId,
      paymentId: p.id,
      amount: p.amount,
      paidAt: paidAt.toISOString(),
      shopOrders: rows.map((x) => ({
        shopOrderId: x.shopOrderId,
        platformFeeRate: x.platformFeeRate,
        platformFee: x.platformFee,
        sellerAmount: x.sellerAmount,
      })),
    });
    this.logger.log(`Đơn ${rows[0]!.orderCode} đã thanh toán (${p.ref}).`);
    return 'APPLIED';
  }

  /** Áp kết quả tra cứu: PENDING/lỗi tra cứu → "không rõ" (không tạo lần mới, tra lại sau) */
  async applyQuery(paymentId: string, q: GatewayQuery | Error): Promise<ApplyOutcome | 'UNKNOWN'> {
    return this.prisma.$transaction(async (tx) => {
      if (q instanceof Error || q.status === 'PENDING') {
        await tx.payment.updateMany({
          where: { id: paymentId, status: { in: ['PENDING', 'UNKNOWN'] } },
          data: { status: 'UNKNOWN', checkedAt: new Date() },
        });
        return 'UNKNOWN';
      }
      await tx.payment.update({ where: { id: paymentId }, data: { checkedAt: new Date() } });
      return this.apply(tx, paymentId, {
        success: q.status === 'SUCCEEDED',
        amount: q.amount,
        transactionNo: q.transactionNo,
        bankCode: q.bankCode,
        paidAt: q.paidAt,
        raw: q.raw,
      });
    });
  }

  /** Tra cứu một lần thanh toán qua cổng rồi áp kết quả */
  async check(payment: Payment): Promise<ApplyOutcome | 'UNKNOWN'> {
    let q: GatewayQuery | Error;
    try {
      q = await this.gateway.query(payment);
    } catch (e) {
      this.logger.warn(`Tra cứu ${payment.ref} lỗi: ${(e as Error).message}`);
      q = e as Error;
    }
    return this.applyQuery(payment.id, q);
  }

  /**
   * Hết hạn (ORD-04): đơn chưa trả quá hạn mà các lần thanh toán đều đã có kết quả (không còn chờ/không rõ)
   * → các dòng thành EXPIRED, phát payment.expired. Còn lần chưa rõ thì chờ tra cứu xong.
   */
  async expire(
    tx: Tx,
    orderId: string,
    reason: 'TIMEOUT' | 'ATTEMPTS_EXHAUSTED',
  ): Promise<boolean> {
    await this.lock(tx, orderId);
    const open = await tx.payment.count({
      where: { orderId, status: { in: ['PENDING', 'UNKNOWN'] } },
    });
    if (open > 0) return false;
    const { count } = await tx.sellerEarning.updateMany({
      where: { orderId, status: 'UNPAID' },
      data: { status: 'EXPIRED' },
    });
    const anyOther = await tx.sellerEarning.count({
      where: { orderId, status: { not: 'EXPIRED' } },
    });
    if (count === 0 || anyOther > 0) return count > 0;
    await this.events.publish(tx, PAYMENT_EXPIRED, {
      orderId,
      reason,
      expiredAt: new Date().toISOString(),
    });
    return true;
  }

  private async expireIfExhausted(tx: Tx, orderId: string): Promise<void> {
    const max = await this.settings.get(PaymentSetting.maxPaymentAttempts);
    const failed = await tx.payment.count({ where: { orderId, status: 'FAILED' } });
    if (failed >= max) await this.expire(tx, orderId, 'ATTEMPTS_EXHAUSTED');
  }

  private link(p: Payment, maxAttempts: number): PaymentLink {
    return {
      paymentId: p.id,
      attempt: p.attempt,
      maxAttempts,
      payUrl: p.payUrl,
      gateway: p.gateway,
    };
  }
}

function merge(old: unknown, add: Record<string, unknown>): Prisma.InputJsonValue {
  const base = old && typeof old === 'object' ? (old as Record<string, unknown>) : {};
  return JSON.parse(JSON.stringify({ ...base, ...add })) as Prisma.InputJsonValue;
}

/** IP cho VNPay: bỏ tiền tố IPv6 của IPv4, mặc định 127.0.0.1 */
function normalizeIp(ip: string | undefined): string {
  const v = (ip ?? '').replace(/^::ffff:/, '').trim();
  return v && v !== '::1' ? v.slice(0, 45) : '127.0.0.1';
}
