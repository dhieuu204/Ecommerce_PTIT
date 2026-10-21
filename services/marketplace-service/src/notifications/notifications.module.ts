import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

/**
 * Thông báo (P6, MSG-02). Global: module nào cũng inject được NotificationsService để tạo thông báo
 * trong giao dịch của mình.
 */
@Global()
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
