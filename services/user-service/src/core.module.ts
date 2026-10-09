import { Global, Module } from '@nestjs/common';
import { AppConfig } from './config';
import { MailService } from './mail/mail.service';
import { SessionService } from './sessions/session.service';

/** Dùng chung trong user-service: cấu hình, gửi mail, phiên đăng nhập. */
@Global()
@Module({
  providers: [AppConfig, MailService, SessionService],
  exports: [AppConfig, MailService, SessionService],
})
export class CoreModule {}
