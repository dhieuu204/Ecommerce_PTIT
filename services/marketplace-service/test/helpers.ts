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
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GhnClient } from '../src/locations/ghn.client';
import { LocationsService } from '../src/locations/locations.service';
import { PrismaService } from '../src/prisma.service';
import { StorageService } from '../src/uploads/storage.service';

export const API = '/api/market/v1';
export const describeDb = process.env.TEST_DB ? describe : describe.skip;

/** Khóa ký vé giả cho test (thay cho JWKS của user-service) */
const privateKey = loadPrivateKey(generateDevPrivateKey());

export function makeUser(name = 'Nguyễn Văn An', permissions: AuthUser['permissions'] = []) {
  const user: AuthUser = {
    id: randomUUID(),
    email: `${name.split(' ').pop()!.toLowerCase()}${Math.floor(Math.random() * 1e6)}@gmail.com`,
    name,
    permissions,
  };
  return { ...user, token: signAccessToken(user, privateKey) };
}

/** Kho ảnh giả: giữ file trong bộ nhớ */
export class FakeStorage {
  files = new Map<string, Buffer>();
  fail = false;
  async putPublic(key: string, body: Buffer): Promise<string> {
    if (this.fail) throw new Error('MinIO lỗi (giả)');
    this.files.set(key, body);
    return this.publicUrl(key);
  }
  publicUrl(key: string): string {
    return `http://localhost:9000/san-public/${key}`;
  }
}

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  storage: FakeStorage;
  ghn: { configured: boolean; provinces: jest.Mock; districts: jest.Mock; wards: jest.Mock };
  http: () => ReturnType<typeof request>;
}

export async function createTestApp(): Promise<TestApp> {
  const storage = new FakeStorage();
  const ghn = { configured: false, provinces: jest.fn(), districts: jest.fn(), wards: jest.fn() };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JwtVerifier)
    .useValue(new JwtVerifier({ privateKey }))
    .overrideProvider(StorageService)
    .useValue(storage)
    .overrideProvider(GhnClient)
    .useValue(ghn)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  setupApp(app, { apiPrefix: 'api/market/v1', title: 'test', description: 'test' });
  await app.init();
  return {
    app,
    prisma: app.get(PrismaService),
    storage,
    ghn,
    http: () => request(app.getHttpServer()),
  };
}

export async function resetDb(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE shop_applications, shops, audit_logs, outbox_events, inbox_events CASCADE',
  );
}

/** Nạp danh sách tỉnh/huyện/xã mẫu (Hà Nội 90001 › Ba Đình 90101 › Phường Điện Biên 9010101) */
export async function loadSampleLocations(t: TestApp): Promise<void> {
  t.ghn.configured = false;
  await t.app.get(LocationsService).sync();
}

export const PICKUP = {
  provinceId: 90001,
  districtId: 90101,
  wardCode: '9010101',
  street: '12 Kim Mã',
};
