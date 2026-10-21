import { Global, Module } from '@nestjs/common';
import { SanCommonModule, SettingsModule } from '@san/nest-common';
import { AppConfig } from './config';
import { HealthController } from './health/health.controller';
import { PaymentsModule } from './payments/payments.module';
import { PrismaService } from './prisma.service';
import { ReportsModule } from './reports/reports.module';
import { PAYMENT_SETTINGS } from './settings';

/** Dùng chung trong payment-service: cấu hình đọc từ .env */
@Global()
@Module({ providers: [AppConfig], exports: [AppConfig] })
export class CoreModule {}

// Mỗi nhóm nghiệp vụ là một module riêng trong src/<ten-module>/ (xem CLAUDE.md, mục Quy ước code).
@Module({
  imports: [
    // Nền tảng chung: kiểm đăng nhập/quyền, dạng lỗi, sự kiện, PrismaService (packages/nest-common)
    SanCommonModule.forRoot({
      service: 'payment-service',
      prisma: PrismaService,
      rabbitmqUrl: process.env.RABBITMQ_URL,
      jwksUrl: process.env.JWKS_URL,
      databaseUrl: process.env.DATABASE_URL,
    }),
    // Cấu hình có phiên bản (bảng settings) + API /admin/settings (ADM-01)
    SettingsModule.forRoot(PAYMENT_SETTINGS),
    CoreModule,
    PaymentsModule,
    ReportsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
