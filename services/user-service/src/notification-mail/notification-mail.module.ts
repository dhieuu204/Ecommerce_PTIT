import { Module } from '@nestjs/common';
import { NotificationMailEvents } from './notification-mail.events';

/** Email cho thông báo quan trọng do marketplace-service tạo (P6, MSG-02) */
@Module({ providers: [NotificationMailEvents] })
export class NotificationMailModule {}
