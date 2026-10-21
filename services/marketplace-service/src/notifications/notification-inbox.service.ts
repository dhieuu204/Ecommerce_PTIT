import { Injectable } from '@nestjs/common';
import { AppError, skipTake, toPage } from '@san/nest-common';
import type { Page } from '@san/shared';
import { PrismaService } from '../prisma.service';
import type { Notification, Prisma } from '../../generated/prisma';
import type { NotificationsQuery, NotificationView } from './dto/notifications.dto';

type Db = PrismaService | Prisma.TransactionClient;

export function notificationView(n: Notification): NotificationView {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    content: n.content,
    link: n.link,
    read: n.readAt !== null,
    readAt: n.readAt,
    createdAt: n.createdAt,
  };
}

/** Hộp thông báo của người đang đăng nhập (MSG-02): xem, đếm chưa đọc, đánh dấu đã đọc */
@Injectable()
export class NotificationInbox {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, q: NotificationsQuery): Promise<Page<NotificationView>> {
    const where: Prisma.NotificationWhereInput = { userId, ...(q.unread ? { readAt: null } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.notification.count({ where }),
    ]);
    return toPage(rows.map(notificationView), total, q);
  }

  unreadCount(userId: string, db: Db = this.prisma): Promise<number> {
    return db.notification.count({ where: { userId, readAt: null } });
  }

  /** Đánh dấu một thông báo đã đọc (đọc rồi thì giữ nguyên); của người khác → 404. Trả số chưa đọc còn lại */
  async read(userId: string, notificationId: string): Promise<number> {
    const n = await this.prisma.notification.findFirst({ where: { id: notificationId, userId } });
    if (!n) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy thông báo.');
    if (!n.readAt) {
      await this.prisma.notification.updateMany({
        where: { id: n.id, readAt: null },
        data: { readAt: new Date() },
      });
    }
    return this.unreadCount(userId);
  }

  async readAll(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
