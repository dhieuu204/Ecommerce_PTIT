import { Global, Module } from '@nestjs/common';
import { NotificationInbox } from './notification-inbox.service';
import { NotificationPush } from './notification-push';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { Notifier } from './notifier.service';
import { WithdrawalEvents } from './withdrawal.events';

/**
 * Thông báo (P6, MSG-02). Global: module nào cũng inject được NotificationsService (tạo thông báo trong
 * giao dịch của mình) và Notifier (nội dung soạn sẵn cho đơn, trả hàng, shop, rút tiền).
 */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    Notifier,
    NotificationInbox,
    NotificationPush,
    WithdrawalEvents,
  ],
  exports: [NotificationsService, Notifier, NotificationInbox],
})
export class NotificationsModule {}
