import { DynamicModule, Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard';
import { AuditLogController } from './db/audit-log.controller';
import { JwtVerifier, loadPrivateKey } from './auth/jwt';
import { AllExceptionsFilter } from './errors/all-exceptions.filter';
import { createValidationPipe } from './errors/validation';
import { EventBus } from './events/event-bus';
import { JWT_SIGNING_KEY, SAN_OPTIONS, SAN_PRISMA, type SanCommonOptions } from './options';

/** JWKS mặc định khi chạy trên máy (user-service ở cổng 3001) */
export const DEFAULT_JWKS_URL = 'http://localhost:3001/api/user/v1/.well-known/jwks.json';

/**
 * Gắn nền tảng chung vào một service. Import một lần trong AppModule:
 *
 *   SanCommonModule.forRoot({ service: 'marketplace-service', prisma: PrismaService, ... })
 *
 * Sau đó mọi API tự có: kiểm đăng nhập + bộ quyền, dạng lỗi chung, kiểm dữ liệu gửi lên.
 * PrismaService, EventBus, JwtVerifier inject được ở mọi module mà không cần import lại.
 */
@Global()
@Module({})
export class SanCommonModule {
  static forRoot(options: SanCommonOptions): DynamicModule {
    const signingKey = options.jwtPrivateKey ? loadPrivateKey(options.jwtPrivateKey) : undefined;
    return {
      module: SanCommonModule,
      // GET /admin/audit-logs có sẵn ở mọi service
      controllers: [AuditLogController],
      providers: [
        { provide: SAN_OPTIONS, useValue: options },
        options.prisma,
        { provide: SAN_PRISMA, useExisting: options.prisma },
        // Có khóa riêng (user-service): tự kiểm vé bằng khóa đó. Không có: tải khóa công khai từ JWKS.
        { provide: JWT_SIGNING_KEY, useValue: signingKey },
        {
          provide: JwtVerifier,
          useValue: signingKey
            ? new JwtVerifier({ privateKey: signingKey })
            : new JwtVerifier({ jwksUrl: options.jwksUrl || DEFAULT_JWKS_URL }),
        },
        EventBus,
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_PIPE, useFactory: createValidationPipe },
      ],
      exports: [SAN_OPTIONS, options.prisma, SAN_PRISMA, JWT_SIGNING_KEY, JwtVerifier, EventBus],
    };
  }
}
