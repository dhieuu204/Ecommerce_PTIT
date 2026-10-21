import { Injectable, type OnModuleInit } from '@nestjs/common';
import { EventBus } from '@san/nest-common';
import { NOTIFICATION_CREATED, type NotificationCreatedPayload } from '@san/shared';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type { Prisma } from '../../generated/prisma';
import type { NotificationView } from './dto/notifications.dto';
import { NotificationInbox } from './notification-inbox.service';

/**
 * Nhận lại `notification.created` của chính marketplace (thông báo đã lưu xong) rồi đẩy `notification:new`
 * kèm số chưa đọc tới phòng Socket.IO của người nhận (MSG-02).
 */
@Injectable()
export class NotificationPush implements OnModuleInit {
  constructor(
    private readonly events: EventBus,
    private readonly realtime: RealtimeGateway,
    private readonly inbox: NotificationInbox,
  ) {}

  onModuleInit(): void {
    this.events.subscribe(NOTIFICATION_CREATED, (p, tx: Prisma.TransactionClient) =>
      this.push(p, tx),
    );
  }

  async push(p: NotificationCreatedPayload, tx: Prisma.TransactionClient): Promise<void> {
    const notification: NotificationView = {
      id: p.notificationId,
      type: p.type,
      title: p.title,
      content: p.content,
      link: p.link,
      read: false,
      readAt: null,
      createdAt: new Date(p.createdAt),
    };
    const unreadCount = await this.inbox.unreadCount(p.userId, tx);
    this.realtime.emitToUser(p.userId, 'notification:new', { notification, unreadCount });
  }
}
