import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { JobService } from '@san/nest-common';
import { PrismaService } from '../prisma.service';
import { RefundsService } from '../refunds/refunds.service';
import { PaymentsService } from './payments.service';

/**
 * Job mỗi phút (pg-boss, nhiều pod vẫn chỉ một pod chạy):
 * - tra cứu lần thanh toán "không rõ" và lần còn chờ của đơn đã quá hạn, rồi cho đơn hết hạn (PAY-03, ORD-04);
 * - gửi/thử lại/tra cứu lệnh hoàn (REF-01).
 */
@Injectable()
export class PaymentJobs implements OnModuleInit {
  private readonly logger = new Logger(PaymentJobs.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobService,
    private readonly payments: PaymentsService,
    private readonly refunds: RefundsService,
  ) {}

  onModuleInit(): void {
    this.jobs.define('payments-watch', { cron: '* * * * *' }, async () => {
      await this.watch();
    });
    this.jobs.define('refunds-process', { cron: '* * * * *' }, async () => {
      await this.refunds.processDue();
    });
  }

  /** Trả số đơn vừa hết hạn */
  async watch(now = new Date()): Promise<number> {
    // 1. Lần "không rõ" (mọi lúc) và lần còn chờ của đơn đã quá hạn (link VNPay đã hết hạn): tra cứu
    const overdue = await this.prisma.sellerEarning.findMany({
      where: { status: 'UNPAID', payBefore: { lt: now } },
      select: { orderId: true },
      distinct: ['orderId'],
      take: 200,
    });
    const overdueIds = overdue.map((o) => o.orderId);
    const toCheck = await this.prisma.payment.findMany({
      where: {
        OR: [{ status: 'UNKNOWN' }, { status: 'PENDING', orderId: { in: overdueIds } }],
      },
      take: 100,
    });
    for (const p of toCheck) await this.payments.check(p);

    // 2. Đơn quá hạn mà mọi lần thanh toán đã có kết quả, không có tiền → hết hạn
    let expired = 0;
    for (const orderId of overdueIds) {
      const done = await this.prisma.$transaction((tx) =>
        this.payments.expire(tx, orderId, 'TIMEOUT'),
      );
      if (done) expired++;
    }
    if (expired) this.logger.log(`${expired} đơn hết hạn thanh toán.`);
    return expired;
  }
}
