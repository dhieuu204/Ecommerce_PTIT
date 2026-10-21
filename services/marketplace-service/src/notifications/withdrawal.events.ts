import { Injectable, type OnModuleInit } from '@nestjs/common';
import { EventBus } from '@san/nest-common';
import { WITHDRAWAL_UPDATED } from '@san/shared';
import type { Prisma } from '../../generated/prisma';
import { Notifier } from './notifier.service';

/**
 * Yêu cầu rút tiền đổi trạng thái ở payment-service (withdrawal.updated): báo chủ shop (MSG-02). Không đổi dữ
 * liệu nào khác của marketplace. Nhận trùng thì inbox bỏ qua nên không có thông báo trùng.
 */
@Injectable()
export class WithdrawalEvents implements OnModuleInit {
  constructor(
    private readonly events: EventBus,
    private readonly notifier: Notifier,
  ) {}

  onModuleInit(): void {
    this.events.subscribe(WITHDRAWAL_UPDATED, (p, tx: Prisma.TransactionClient) =>
      this.notifier.withdrawal(tx, p),
    );
  }
}
