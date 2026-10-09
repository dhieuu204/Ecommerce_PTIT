import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { AppConfig } from '../config';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Gửi email (mã xác minh, mã đặt lại mật khẩu).
 * Khi dev gửi vào Mailpit (hộp thư giả, xem ở http://localhost:8025); khi demo dùng Gmail SMTP.
 * Không ghi nội dung mail (có mã) ra log.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter?: Transporter;

  constructor(private readonly config: AppConfig) {}

  async send(message: MailMessage): Promise<void> {
    this.transporter ??= createTransport(this.config.smtpUrl);
    await this.transporter.sendMail({ from: this.config.mailFrom, ...message });
    const fake = this.config.smtpUrl.includes('localhost:1025') ? ' (hộp thư giả Mailpit)' : '';
    this.logger.log(`Đã gửi mail "${message.subject}"${fake}`);
  }
}
