import { Injectable, Module, type OnModuleInit } from '@nestjs/common';
import { EventBus } from '@san/nest-common';
import { ADJUSTMENT_EXECUTED, DISPUTE_OPENED } from '@san/shared';
import type { Prisma } from '../../generated/prisma';
import { AdjustmentsService } from './adjustments.service';
import { AdjustmentsController, DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';

/** Nhận hồ sơ tranh chấp từ marketplace và kết quả thực thi điều chỉnh từ payment */
@Injectable()
export class DisputeEvents implements OnModuleInit {
  constructor(
    private readonly events: EventBus,
    private readonly disputes: DisputesService,
    private readonly adjustments: AdjustmentsService,
  ) {}

  onModuleInit(): void {
    this.events.subscribe(DISPUTE_OPENED, (p, tx: Prisma.TransactionClient) =>
      this.disputes.onOpened(p, tx),
    );
    this.events.subscribe(ADJUSTMENT_EXECUTED, (p, tx: Prisma.TransactionClient) =>
      this.adjustments.onExecuted(p, tx),
    );
  }
}

/** Tranh chấp trả hàng (DIS-01) và điều chỉnh tiền sau giải ngân (DIS-02) */
@Module({
  controllers: [DisputesController, AdjustmentsController],
  providers: [DisputesService, AdjustmentsService, DisputeEvents],
})
export class DisputesModule {}
