import { Logger, Module } from '@nestjs/common';
import { generateDevPrivateKey, SanCommonModule } from '@san/nest-common';
import { AdminUsersModule } from './admin-users/admin-users.module';
import { AuthModule } from './auth/auth.module';
import { CoreModule } from './core.module';
import { HealthController } from './health/health.controller';
import { MeModule } from './me/me.module';
import { NotificationMailModule } from './notification-mail/notification-mail.module';
import { PrismaService } from './prisma.service';

/** Khóa ký access token. Máy dev chưa đặt thì dùng khóa tạm (scripts/gen-jwt-key.mjs tạo khóa cố định). */
function jwtPrivateKey(): string {
  if (process.env.JWT_PRIVATE_KEY) return process.env.JWT_PRIVATE_KEY;
  if (process.env.NODE_ENV === 'production')
    throw new Error('Thiếu biến môi trường JWT_PRIVATE_KEY');
  new Logger('JWT').warn(
    'Chưa đặt JWT_PRIVATE_KEY: dùng khóa tạm, vé đăng nhập mất khi khởi động lại.',
  );
  return generateDevPrivateKey();
}

// Mỗi nhóm nghiệp vụ là một module riêng trong src/<ten-module>/ (xem CLAUDE.md, mục Quy ước code).
@Module({
  imports: [
    // Nền tảng chung: kiểm đăng nhập/quyền, dạng lỗi, sự kiện, PrismaService (packages/nest-common)
    SanCommonModule.forRoot({
      service: 'user-service',
      prisma: PrismaService,
      rabbitmqUrl: process.env.RABBITMQ_URL,
      jwtPrivateKey: jwtPrivateKey(),
    }),
    CoreModule,
    AuthModule,
    MeModule,
    AdminUsersModule,
    NotificationMailModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
