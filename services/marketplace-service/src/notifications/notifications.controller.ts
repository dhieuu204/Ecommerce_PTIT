import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ParseIdPipe, type AuthUser } from '@san/nest-common';
import type { Page } from '@san/shared';
import { NotificationsQuery, NotificationView, UnreadCountView } from './dto/notifications.dto';
import { NotificationInbox } from './notification-inbox.service';

/** Thông báo trong app của người đang đăng nhập (MSG-02) */
@ApiTags('Thông báo')
@ApiBearerAuth()
@Controller('me/notifications')
export class NotificationsController {
  constructor(private readonly inbox: NotificationInbox) {}

  /** Thông báo của tôi, mới nhất trước; `unread=true` chỉ lấy thông báo chưa đọc */
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() q: NotificationsQuery,
  ): Promise<Page<NotificationView>> {
    return this.inbox.list(user.id, q);
  }

  /** Số thông báo chưa đọc (chuông trên header) */
  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthUser): Promise<UnreadCountView> {
    return { count: await this.inbox.unreadCount(user.id) };
  }

  /** Đánh dấu đọc hết, trả `{ count: 0 }` */
  @Post('read-all')
  @HttpCode(200)
  async readAll(@CurrentUser() user: AuthUser): Promise<UnreadCountView> {
    await this.inbox.readAll(user.id);
    return { count: 0 };
  }

  /** Đánh dấu một thông báo đã đọc; trả số chưa đọc còn lại */
  @Post(':notificationId/read')
  @HttpCode(200)
  @ApiResponse({ status: 404, description: 'NOT_FOUND: không có hoặc của người khác' })
  async read(
    @CurrentUser() user: AuthUser,
    @Param('notificationId', ParseIdPipe) id: string,
  ): Promise<UnreadCountView> {
    return { count: await this.inbox.read(user.id, id) };
  }
}
