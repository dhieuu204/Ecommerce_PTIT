import { Module } from '@nestjs/common';
import { SanCommonModule, SettingsModule } from '@san/nest-common';
import { HealthController } from './health/health.controller';
import { OrderChecksModule } from './order-checks/order-checks.module';
import { PrismaService } from './prisma.service';
import { APPROVAL_SETTINGS } from './settings';
import { ShopApprovalsModule } from './shop-approvals/shop-approvals.module';
import { ShopModerationModule } from './shop-moderation/shop-moderation.module';
import { DisputesModule } from './disputes/disputes.module';
import { WithdrawalApprovalsModule } from './withdrawal-approvals/withdrawal-approvals.module';

// Mỗi nhóm nghiệp vụ là một module riêng trong src/<ten-module>/ (xem CLAUDE.md, mục Quy ước code).
@Module({
  imports: [
    // Nền tảng chung: kiểm đăng nhập/quyền, dạng lỗi, sự kiện, PrismaService (packages/nest-common)
    SanCommonModule.forRoot({
      service: 'approval-service',
      prisma: PrismaService,
      rabbitmqUrl: process.env.RABBITMQ_URL,
      jwksUrl: process.env.JWKS_URL,
      databaseUrl: process.env.DATABASE_URL,
    }),
    // Cấu hình có phiên bản (bảng settings) + API /admin/settings (ADM-01)
    SettingsModule.forRoot(APPROVAL_SETTINGS),
    ShopApprovalsModule,
    ShopModerationModule,
    OrderChecksModule,
    DisputesModule,
    WithdrawalApprovalsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
