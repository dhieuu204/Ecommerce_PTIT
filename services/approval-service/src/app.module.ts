import { Module } from '@nestjs/common';
import { SanCommonModule } from '@san/nest-common';
import { HealthController } from './health/health.controller';
import { PrismaService } from './prisma.service';

// Mỗi nhóm nghiệp vụ là một module riêng trong src/<ten-module>/ (xem CLAUDE.md, mục Quy ước code).
@Module({
  imports: [
    // Nền tảng chung: kiểm đăng nhập/quyền, dạng lỗi, sự kiện, PrismaService (packages/nest-common)
    SanCommonModule.forRoot({
      service: 'approval-service',
      prisma: PrismaService,
      rabbitmqUrl: process.env.RABBITMQ_URL,
      jwksUrl: process.env.JWKS_URL,
    }),
  ],
  controllers: [HealthController],
})
export class AppModule {}
