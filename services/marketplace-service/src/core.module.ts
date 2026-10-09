import { Global, Module } from '@nestjs/common';
import { AppConfig } from './config';

/** Dùng chung trong marketplace-service: cấu hình */
@Global()
@Module({
  providers: [AppConfig],
  exports: [AppConfig],
})
export class CoreModule {}
