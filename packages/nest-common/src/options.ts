import type { Type } from '@nestjs/common';
import type { ServiceName } from '@san/shared';

export interface SanCommonOptions {
  /** Tên service, dùng làm tên người gửi sự kiện và tên hàng đợi */
  service: ServiceName;
  /** Lớp PrismaService của service (kế thừa PrismaClient sinh ra cho service đó) */
  prisma: Type<unknown>;
  /** Địa chỉ RabbitMQ; để trống thì không gửi/nhận sự kiện (ví dụ khi chạy test) */
  rabbitmqUrl?: string;
  /** user-service: khóa riêng để ký và kiểm vé (PEM) */
  jwtPrivateKey?: string;
  /** 3 service còn lại: địa chỉ JWKS của user-service để tải khóa công khai */
  jwksUrl?: string;
  /** Database của service, để chạy job hẹn giờ bằng pg-boss (JobService). Để trống: không chạy job */
  databaseUrl?: string;
}

export const SAN_OPTIONS = Symbol('SAN_OPTIONS');
export const SAN_PRISMA = Symbol('SAN_PRISMA');
/** user-service: khóa riêng (KeyObject) để ký access token, inject bằng @Inject(JWT_SIGNING_KEY) */
export const JWT_SIGNING_KEY = Symbol('JWT_SIGNING_KEY');
