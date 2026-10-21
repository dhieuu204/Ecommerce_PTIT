import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventBus } from '@san/nest-common';
import { NOTIFICATION_CREATED, type NotificationCreatedPayload } from '@san/shared';
import { AppConfig } from '../config';
import { MailService, type MailMessage } from '../mail/mail.service';
import type { Prisma } from '../../generated/prisma';

type Tx = Prisma.TransactionClient;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Gửi email cho thông báo quan trọng (P6, MSG-02). marketplace-service tạo thông báo và phát
 * `notification.created`; user-service giữ địa chỉ email nên gửi mail khi `email = true` và tài khoản còn
 * hoạt động. Nhận trùng thì inbox bỏ qua nên không gửi lại. Gửi lỗi thì ném lỗi để sự kiện được thử lại.
 */
@Injectable()
export class NotificationMailEvents implements OnModuleInit {
  private readonly logger = new Logger(NotificationMailEvents.name);

  constructor(
    private readonly events: EventBus,
    private readonly mail: MailService,
    private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    this.events.subscribe(NOTIFICATION_CREATED, async (p, tx: Tx) => {
      await this.handle(p, tx);
    });
  }

  /** Trả true nếu đã gửi mail */
  async handle(p: NotificationCreatedPayload, tx: Tx): Promise<boolean> {
    if (!p.email) return false;
    const user = await tx.user.findUnique({
      where: { id: p.userId },
      select: { email: true, status: true },
    });
    if (!user) {
      this.logger.warn(`Không gửi mail thông báo ${p.type}: không có tài khoản ${p.userId}.`);
      return false;
    }
    if (user.status !== 'ACTIVE') return false;
    await this.mail.send({ to: user.email, ...this.compose(p) });
    return true;
  }

  /** Nội dung mail: tiêu đề, nội dung thông báo, nút mở đúng trang trên web */
  compose(p: NotificationCreatedPayload): Omit<MailMessage, 'to'> {
    const url = p.link ? `${this.config.webUrl.replace(/\/$/, '')}${p.link}` : null;
    const footer =
      'Bạn nhận được email này vì có cập nhật quan trọng trên tài khoản của bạn. Xem mọi thông báo trong mục Thông báo trên sàn.';
    const text = [p.content, url ? `Xem chi tiết: ${url}` : null, footer]
      .filter(Boolean)
      .join('\n\n');
    const button = url
      ? `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="background:#172554;color:#ffffff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">Xem chi tiết</a></p>`
      : '';
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1F2937;line-height:1.6;max-width:560px">
<h2 style="color:#172554;font-size:18px;margin:0 0 12px">${escapeHtml(p.title)}</h2>
<p style="margin:0">${escapeHtml(p.content)}</p>
${button}
<p style="color:#6b7280;font-size:12px;margin-top:24px">${escapeHtml(footer)}</p>
</div>`;
    return { subject: p.title, text, html };
  }
}
