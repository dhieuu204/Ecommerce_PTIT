import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { AppError, JobService, writeAudit, type AuthUser } from '@san/nest-common';
import { PAYMENT_GATEWAY, type PaymentGateway } from '../gateway/gateway';
import { PrismaService } from '../prisma.service';
import type { Payment, Refund } from '../../generated/prisma';

/** Loại khoản cần admin tài chính xem */
export type VnpayExceptionKind = 'MISMATCH' | 'UNKNOWN' | 'LATE_OR_DUPLICATE';

export interface VnpayPaymentException {
  paymentId: string;
  kind: VnpayExceptionKind;
  ref: string;
  orderId: string;
  orderCode: string | null;
  gateway: Payment['gateway'];
  amount: number;
  status: Payment['status'];
  applied: boolean;
  paidAt: Date | null;
  transactionNo: string | null;
  reconcileStatus: Payment['reconcileStatus'];
  reconcileNote: string | null;
  reconciledAt: Date | null;
}

export interface VnpayRefundException {
  refundId: string;
  orderCode: string | null;
  amount: number;
  reason: Refund['reason'];
  status: Refund['status'];
  lastError: string | null;
  createdAt: Date;
}

export interface VnpayReconciliationView {
  /** Lần chạy đối soát gần nhất (null: chưa chạy lần nào) */
  lastRunAt: Date | null;
  payments: VnpayPaymentException[];
  refunds: VnpayRefundException[];
  /** Các khoản đã xử lý gần đây (để xem lại ghi chú) */
  resolved: VnpayPaymentException[];
}

/** Số ngày giao dịch thành công được tra cứu lại mỗi đêm */
const LOOKBACK_DAYS = 2;

/**
 * Đối soát VNPay (PAY-05): mỗi đêm tra cứu lại các giao dịch thành công gần đây, đánh dấu khớp hoặc lệch;
 * trang ngoại lệ gom các khoản lệch, chưa rõ, tiền về muộn/trùng và khoản hoàn cần xem để admin xử lý có
 * ghi chú. Giao dịch "chưa rõ" vẫn được job mỗi phút tra cứu như P3.
 */
@Injectable()
export class VnpayReconciliationService implements OnModuleInit {
  private readonly logger = new Logger(VnpayReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  onModuleInit(): void {
    // 19:00 UTC = 02:00 giờ Việt Nam
    this.jobs.define('vnpay-reconcile', { cron: '0 19 * * *' }, async () => {
      await this.run();
    });
  }

  /** Tra cứu lại các giao dịch thành công trong 2 ngày gần nhất chưa được admin xử lý */
  async run(now = new Date()): Promise<{ checked: number; mismatched: number }> {
    const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);
    const rows = await this.prisma.payment.findMany({
      where: {
        status: 'SUCCEEDED',
        paidAt: { gte: since },
        OR: [{ reconcileStatus: null }, { reconcileStatus: { not: 'RESOLVED' } }],
      },
      take: 2000,
    });
    let mismatched = 0;
    let checked = 0;
    for (const p of rows) {
      let ok: boolean;
      try {
        const q = await this.gateway.query(p);
        ok = q.status === 'SUCCEEDED' && (q.amount === null || q.amount === p.amount);
      } catch (e) {
        this.logger.warn(`Đối soát ${p.ref}: tra cứu lỗi ${(e as Error).message}, để lần sau.`);
        continue;
      }
      checked++;
      if (!ok) mismatched++;
      await this.prisma.payment.updateMany({
        where: {
          id: p.id,
          OR: [{ reconcileStatus: null }, { reconcileStatus: { not: 'RESOLVED' } }],
        },
        data: { reconcileStatus: ok ? 'MATCHED' : 'MISMATCH', reconciledAt: now },
      });
    }
    this.logger.log(
      `${this.gateway.kind === 'MOCK' ? 'MÔ PHỎNG: ' : ''}đối soát VNPay ${checked} giao dịch, ${mismatched} lệch.`,
    );
    return { checked, mismatched };
  }

  async view(): Promise<VnpayReconciliationView> {
    const [open, resolved, refunds, last] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          OR: [
            { reconcileStatus: 'MISMATCH' },
            { status: 'UNKNOWN' },
            {
              status: 'SUCCEEDED',
              applied: false,
              OR: [{ reconcileStatus: null }, { reconcileStatus: { not: 'RESOLVED' } }],
            },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.payment.findMany({
        where: { reconcileStatus: 'RESOLVED' },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }),
      this.prisma.refund.findMany({
        where: { status: { in: ['UNKNOWN', 'NEEDS_MANUAL'] } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.payment.aggregate({ _max: { reconciledAt: true } }),
    ]);
    const codes = await this.orderCodes([...open, ...resolved, ...refunds].map((r) => r.orderId));
    return {
      lastRunAt: last._max.reconciledAt,
      payments: open.map((p) => this.paymentView(p, codes)),
      refunds: refunds.map((r) => ({
        refundId: r.id,
        orderCode: codes.get(r.orderId) ?? null,
        amount: r.amount,
        reason: r.reason,
        status: r.status,
        lastError: r.lastError,
        createdAt: r.createdAt,
      })),
      resolved: resolved.map((p) => this.paymentView(p, codes)),
    };
  }

  /** Ghi chú xử lý khoản lệch / tiền về muộn, trùng: đánh dấu đã xử lý. Ghi nhật ký */
  async note(admin: AuthUser, paymentId: string, note: string): Promise<VnpayPaymentException> {
    await this.prisma.$transaction(async (tx) => {
      const p = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!p) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy giao dịch.');
      const kind = exceptionKind(p);
      if (!kind || kind === 'UNKNOWN') {
        throw new AppError(
          409,
          'NOT_RECONCILE_EXCEPTION',
          kind === 'UNKNOWN'
            ? 'Giao dịch đang chờ tra cứu kết quả, chưa ghi chú xử lý được.'
            : 'Giao dịch này không cần xử lý.',
        );
      }
      await tx.payment.update({
        where: { id: p.id },
        data: { reconcileStatus: 'RESOLVED', reconcileNote: note },
      });
      await writeAudit(tx, {
        actor: admin,
        action: 'RESOLVE_VNPAY_RECONCILE',
        targetType: 'PAYMENT',
        targetId: p.id,
        reason: note,
        before: { reconcileStatus: p.reconcileStatus, kind },
        after: { reconcileStatus: 'RESOLVED' },
      });
    });
    const p = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    return this.paymentView(p, await this.orderCodes([p.orderId]));
  }

  private paymentView(p: Payment, codes: Map<string, string>): VnpayPaymentException {
    return {
      paymentId: p.id,
      kind: exceptionKind(p) ?? 'MISMATCH',
      ref: p.ref,
      orderId: p.orderId,
      orderCode: codes.get(p.orderId) ?? null,
      gateway: p.gateway,
      amount: p.amount,
      status: p.status,
      applied: p.applied,
      paidAt: p.paidAt,
      transactionNo: p.transactionNo,
      reconcileStatus: p.reconcileStatus,
      reconcileNote: p.reconcileNote,
      reconciledAt: p.reconciledAt,
    };
  }

  private async orderCodes(orderIds: string[]): Promise<Map<string, string>> {
    const rows = await this.prisma.sellerEarning.findMany({
      where: { orderId: { in: [...new Set(orderIds)] } },
      select: { orderId: true, orderCode: true },
      distinct: ['orderId'],
    });
    return new Map(rows.map((r) => [r.orderId, r.orderCode]));
  }
}

/** Vì sao giao dịch cần xem (null = bình thường). Khoản đã xử lý vẫn giữ loại gốc để hiển thị */
export function exceptionKind(p: Payment): VnpayExceptionKind | null {
  if (p.status === 'UNKNOWN') return 'UNKNOWN';
  if (p.reconcileStatus === 'MISMATCH') return 'MISMATCH';
  if (p.status === 'SUCCEEDED' && !p.applied) return 'LATE_OR_DUPLICATE';
  if (p.reconcileStatus === 'RESOLVED') return 'MISMATCH';
  return null;
}
