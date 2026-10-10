import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { JobService } from '@san/nest-common';
import { PrismaService } from '../prisma.service';
import { OrderLifecycle, SYSTEM } from './order-lifecycle.service';

/**
 * Job hẹn giờ của đơn (ORD-04), chạy mỗi phút bằng pg-boss (nhiều pod vẫn chỉ một pod chạy).
 * Mỗi đơn xử lý trong giao dịch riêng có khóa theo đơn và kiểm lại trạng thái, nên chạy lại không hủy trùng
 * và không đè lên việc vừa xảy ra (tiền vừa về, shop vừa xác nhận).
 */
@Injectable()
export class OrderJobs implements OnModuleInit {
  private readonly logger = new Logger(OrderJobs.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobService,
    private readonly lifecycle: OrderLifecycle,
  ) {}

  onModuleInit(): void {
    this.jobs.define('orders-expire-holds', { cron: '* * * * *' }, async () => {
      await this.expireHolds();
    });
    this.jobs.define('orders-confirm-timeout', { cron: '* * * * *' }, async () => {
      await this.confirmTimeout();
    });
  }

  /** Đơn chưa trả quá hạn giữ tồn: hủy cả đơn tổng, nhả tồn, trả lượt voucher */
  async expireHolds(now = new Date()): Promise<number> {
    const due = await this.prisma.order.findMany({
      where: {
        paymentStatus: 'UNPAID',
        holdUntil: { lt: now },
        shopOrders: { some: { status: { not: 'CANCELLED' } } },
      },
      select: { id: true },
      take: 200,
    });
    let done = 0;
    for (const { id } of due) {
      done += await this.prisma.$transaction((tx) =>
        this.lifecycle.expire(tx, id, 'Hết hạn thanh toán.'),
      );
    }
    if (done) this.logger.log(`Hủy ${done} đơn con quá hạn thanh toán.`);
    return done;
  }

  /** Đơn con quá hạn shop xác nhận: hủy, cộng lại tồn, hoàn tiền */
  async confirmTimeout(now = new Date()): Promise<number> {
    const due = await this.prisma.shopOrder.findMany({
      where: { status: 'TO_CONFIRM', confirmBefore: { lt: now } },
      select: { id: true, orderId: true },
      take: 200,
    });
    let done = 0;
    for (const so of due) {
      done += await this.prisma.$transaction(async (tx) => {
        // Kiểm lại hạn sau khi đã khóa đơn (shop có thể vừa xác nhận)
        await this.lifecycle.lock(tx, so.orderId);
        const fresh = await tx.shopOrder.findUnique({ where: { id: so.id } });
        if (fresh?.status !== 'TO_CONFIRM' || !fresh.confirmBefore || fresh.confirmBefore >= now) {
          return 0;
        }
        return this.lifecycle.cancel(
          tx,
          so.orderId,
          [so.id],
          SYSTEM,
          'Shop không xác nhận đơn đúng hạn.',
          ['TO_CONFIRM'],
        );
      });
    }
    if (done) this.logger.log(`Hủy ${done} đơn con quá hạn xác nhận.`);
    return done;
  }
}
