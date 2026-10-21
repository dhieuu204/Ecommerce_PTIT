import { Injectable } from '@nestjs/common';
import { EventBus } from '@san/nest-common';
import { NOTIFICATION_CREATED } from '@san/shared';
import type { Prisma } from '../../generated/prisma';
import { NOTIFICATION_TYPES, type NotificationType } from './notification-types';

type Tx = Prisma.TransactionClient;

export interface NewNotification {
  /** Người nhận (userId) */
  userId: string;
  type: NotificationType;
  title: string;
  content: string;
  /** Đường dẫn trên web khi bấm vào, ví dụ /tai-khoan/don-mua/<orderId> */
  link?: string | null;
}

/** Cắt chuỗi cho vừa cột */
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/**
 * Tạo thông báo (MSG-02). Gọi trong cùng giao dịch với thay đổi nghiệp vụ: giao dịch lỗi thì không có
 * thông báo. Ghi một dòng `notifications` và phát `notification.created` (outbox): marketplace nhận lại để
 * đẩy qua Socket.IO sau khi dữ liệu đã lưu; user-service gửi email cho loại quan trọng.
 * Sự kiện nhận trùng không tạo thông báo trùng vì handler gọi hàm này chạy đúng một lần (inbox).
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly events: EventBus) {}

  async notify(tx: Tx, input: NewNotification): Promise<void> {
    const row = await tx.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: clip(input.title, 150),
        content: clip(input.content, 500),
        link: input.link ?? null,
      },
    });
    await this.events.publish(tx, NOTIFICATION_CREATED, {
      notificationId: row.id,
      userId: row.userId,
      type: row.type,
      title: row.title,
      content: row.content,
      link: row.link,
      email: NOTIFICATION_TYPES[input.type].email,
      createdAt: row.createdAt.toISOString(),
    });
  }

  /** Gửi cùng một thông báo cho nhiều người (bỏ trùng) */
  async notifyMany(tx: Tx, userIds: string[], input: Omit<NewNotification, 'userId'>) {
    for (const userId of new Set(userIds)) await this.notify(tx, { ...input, userId });
  }
}
