import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { JobService } from '@san/nest-common';
import { PrismaService } from '../prisma.service';
import { ShipmentsService } from '../shipping/shipments.service';
import { OrderLifecycle, SYSTEM } from './order-lifecycle.service';

/**
 * Job hẹn giờ của đơn (ORD-04, SHIP-02..04), chạy mỗi phút bằng pg-boss (nhiều pod vẫn chỉ một pod chạy).
 * Mỗi đơn xử lý trong giao dịch riêng có khóa theo đơn và kiểm lại trạng thái, nên chạy lại không hủy trùng
 * và không đè lên việc vừa xảy ra (tiền vừa về, shop vừa xác nhận, GHN vừa lấy hàng).
 */
@Injectable()
export class OrderJobs implements OnModuleInit {
  private readonly logger = new Logger(OrderJobs.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobService,
    private readonly lifecycle: OrderLifecycle,
    private readonly shipments: ShipmentsService,
  ) {}

  onModuleInit(): void {
    this.jobs.define('orders-expire-holds', { cron: '* * * * *' }, async () => {
      await this.expireHolds();
    });
    this.jobs.define('orders-confirm-timeout', { cron: '* * * * *' }, async () => {
      await this.confirmTimeout();
    });
    this.jobs.define('orders-handover-timeout', { cron: '* * * * *' }, async () => {
      await this.handoverTimeout();
    });
    this.jobs.define('orders-auto-complete', { cron: '* * * * *' }, async () => {
      await this.autoComplete();
    });
    this.jobs.define('orders-close-returns', { cron: '* * * * *' }, async () => {
      await this.closeReturns();
    });
    this.jobs.define('shipments-sync', { cron: '* * * * *' }, async () => {
      await this.shipments.syncUnknown();
      await this.shipments.syncCancelling();
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

  /**
   * Quá hạn bàn giao mà GHN chưa lấy hàng (STATE-01 T10): hủy vận đơn với GHN rồi hủy đơn con, hoàn tiền.
   * GHN báo đã lấy hàng thì để yên (hai việc chỉ một bên thắng).
   */
  async handoverTimeout(now = new Date()): Promise<number> {
    const due = await this.prisma.shopOrder.findMany({
      where: { status: { in: ['CONFIRMED', 'CANCEL_REQUESTED'] }, handoverBefore: { lt: now } },
      select: { id: true, orderId: true },
      take: 100,
    });
    let done = 0;
    for (const so of due) {
      let carrierDone: boolean;
      try {
        carrierDone = await this.shipments.cancelAtCarrier(so.id);
      } catch (e) {
        this.logger.warn(`Chưa hủy được vận đơn của đơn con ${so.id}: ${(e as Error).message}`);
        continue;
      }
      done += await this.prisma.$transaction((tx) =>
        this.lifecycle.cancel(
          tx,
          so.orderId,
          [so.id],
          SYSTEM,
          'Shop không bàn giao hàng cho đơn vị vận chuyển đúng hạn.',
          ['CONFIRMED', 'CANCEL_REQUESTED'],
          carrierDone ? new Set([so.id]) : new Set(),
        ),
      );
    }
    if (done) this.logger.log(`Hủy ${done} đơn con quá hạn bàn giao.`);
    return done;
  }

  /** Đã giao đủ số ngày cấu hình mà người mua chưa bấm "Đã nhận": tự hoàn tất */
  async autoComplete(now = new Date()): Promise<number> {
    const due = await this.prisma.shopOrder.findMany({
      where: { status: 'DELIVERED', completeBefore: { lt: now } },
      select: { id: true },
      take: 200,
    });
    let done = 0;
    for (const so of due) {
      if (await this.prisma.$transaction((tx) => this.lifecycle.complete(tx, so.id, SYSTEM)))
        done++;
    }
    if (done) this.logger.log(`Tự hoàn tất ${done} đơn con.`);
    return done;
  }

  /** Kiện hoàn đã về mà shop chưa xác nhận quá hạn: tự đóng, không cộng kho (STATE-01 số 9) */
  async closeReturns(now = new Date()): Promise<number> {
    const due = await this.prisma.shopOrder.findMany({
      where: { status: 'RETURNED', returnCloseBefore: { lt: now } },
      select: { id: true },
      take: 200,
    });
    let done = 0;
    for (const so of due) {
      const closed = await this.prisma.$transaction((tx) =>
        this.lifecycle.closeReturn(tx, so.id, SYSTEM, []),
      );
      if (closed) done++;
    }
    return done;
  }
}
