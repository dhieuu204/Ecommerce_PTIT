import { Injectable, Module, type OnModuleInit } from '@nestjs/common';
import { EventBus, JobService } from '@san/nest-common';
import { ORDER_PLACED, SHOP_ORDER_CANCELLED } from '@san/shared';
import type { Prisma } from '../../generated/prisma';
import { OrderChecksController } from './order-checks.controller';
import { OrderChecksService } from './order-checks.service';

/** Nhận đơn mới / đơn bị hủy từ marketplace; job mỗi phút xử lý đơn quá hạn duyệt */
@Injectable()
export class OrderCheckEvents implements OnModuleInit {
  constructor(
    private readonly events: EventBus,
    private readonly jobs: JobService,
    private readonly checks: OrderChecksService,
  ) {}

  onModuleInit(): void {
    this.events.subscribe(ORDER_PLACED, (p, tx: Prisma.TransactionClient) =>
      this.checks.onPlaced(p, tx),
    );
    this.events.subscribe(SHOP_ORDER_CANCELLED, (p, tx: Prisma.TransactionClient) =>
      this.checks.onCancelled(p, tx),
    );
    this.jobs.define('order-checks-timeout', { cron: '* * * * *' }, async () => {
      await this.checks.timeout();
    });
  }
}

/** Kiểm tra đơn theo luật (RSK-01) */
@Module({
  controllers: [OrderChecksController],
  providers: [OrderChecksService, OrderCheckEvents],
})
export class OrderChecksModule {}
