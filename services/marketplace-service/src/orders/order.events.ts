import { Injectable, type OnModuleInit } from '@nestjs/common';
import { EventBus } from '@san/nest-common';
import {
  ORDER_CHECK_DECIDED,
  PAYMENT_EXPIRED,
  PAYMENT_SUCCEEDED,
  REFUND_UPDATED,
} from '@san/shared';
import type { Prisma } from '../../generated/prisma';
import { OrderLifecycle } from './order-lifecycle.service';

type Tx = Prisma.TransactionClient;

/** Nhận kết quả thanh toán, kiểm tra đơn, hoàn tiền từ payment-service và approval-service */
@Injectable()
export class OrderEvents implements OnModuleInit {
  constructor(
    private readonly events: EventBus,
    private readonly lifecycle: OrderLifecycle,
  ) {}

  onModuleInit(): void {
    this.events.subscribe(PAYMENT_SUCCEEDED, (p, tx: Tx) => this.lifecycle.markPaid(tx, p));
    this.events.subscribe(PAYMENT_EXPIRED, async (p, tx: Tx) => {
      await this.lifecycle.expire(
        tx,
        p.orderId,
        p.reason === 'ATTEMPTS_EXHAUSTED'
          ? 'Thanh toán không thành công sau số lần cho phép.'
          : 'Hết hạn thanh toán.',
      );
    });
    this.events.subscribe(ORDER_CHECK_DECIDED, (p, tx: Tx) => this.lifecycle.applyCheck(tx, p));
    this.events.subscribe(REFUND_UPDATED, (p, tx: Tx) => this.lifecycle.applyRefund(tx, p));
  }
}
