import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';

// Mỗi nhóm nghiệp vụ là một module riêng trong src/<ten-module>/ (xem CLAUDE.md, mục Quy ước code).
@Module({
  controllers: [HealthController],
})
export class AppModule {}
