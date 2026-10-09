import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  generateDevPrivateKey,
  JwtVerifier,
  loadPrivateKey,
  setupApp,
  signAccessToken,
  type AuthUser,
} from '@san/nest-common';
import type { ShopApplicationSubmittedPayload } from '@san/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { ShopApprovalEvents } from '../src/shop-approvals/shop-approval.events';

/** Test có database chỉ chạy khi global-setup chuẩn bị được database test */
export const describeDb = process.env.TEST_DB ? describe : describe.skip;

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
  /** Tạo access token giả (thay cho user-service) */
  token: (user: AuthUser) => string;
  /** Giả lập nhận sự kiện shop_application.submitted (gọi thẳng handler trong một giao dịch) */
  submit: (payload: ShopApplicationSubmittedPayload) => Promise<void>;
}

/**
 * Chạy cả app với database thật. Không gọi user-service: kiểm vé bằng khóa tạm sinh trong test
 * (thay JwtVerifier tải khóa từ JWKS).
 */
export async function createTestApp(): Promise<TestApp> {
  const privateKey = loadPrivateKey(generateDevPrivateKey());
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JwtVerifier)
    .useValue(new JwtVerifier({ privateKey }))
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  setupApp(app, { apiPrefix: 'api/approval/v1', title: 'test', description: 'test' });
  await app.init();
  const prisma = app.get(PrismaService);
  const events = app.get(ShopApprovalEvents);
  return {
    app,
    prisma,
    http: () => request(app.getHttpServer()),
    token: (user) => signAccessToken(user, privateKey),
    submit: (payload) => prisma.$transaction((tx) => events.handleSubmitted(payload, tx)),
  };
}

/** Xóa sạch dữ liệu giữa các test */
export async function resetDb(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE shop_approvals, audit_logs, outbox_events, inbox_events CASCADE',
  );
}

/** Người dùng giả */
export function makeUser(name: string, permissions: AuthUser['permissions'] = []): AuthUser {
  return { id: randomUUID(), email: `${randomUUID().slice(0, 8)}@san.vn`, name, permissions };
}

/** Sự kiện shop_application.submitted mẫu (hồ sơ mở shop) */
export function submitted(
  overrides: Partial<Omit<ShopApplicationSubmittedPayload, 'owner'>> & {
    shopId: string;
    owner: AuthUser;
  },
): ShopApplicationSubmittedPayload {
  const { owner, ...rest } = overrides;
  return {
    version: 1,
    type: 'REGISTER',
    data: {
      name: 'Shop Hoa Mai',
      description: 'Đồ gia dụng',
      logoUrl: null,
      phone: '0912345678',
      pickupAddress: {
        provinceId: 201,
        districtId: 1442,
        wardCode: '20109',
        provinceName: 'Hà Nội',
        districtName: 'Quận Ba Đình',
        wardName: 'Phường Điện Biên',
        street: '1 Điện Biên Phủ',
      },
      bankAccount: {
        bankName: 'Vietcombank',
        accountNumber: '0123456789',
        accountName: 'NGUYEN VAN AN',
      },
    },
    submittedAt: '2026-10-08T10:00:00.000Z',
    ...rest,
    owner: { userId: owner.id, email: owner.email, fullName: owner.name },
  };
}
