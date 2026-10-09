import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { setupApp } from '@san/nest-common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { LocationsClient } from '../src/addresses/locations.client';
import { GoogleClient } from '../src/auth/google.client';
import { MailService, type MailMessage } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma.service';

/** Test có database chỉ chạy khi global-setup chuẩn bị được database test */
export const describeDb = process.env.TEST_DB ? describe : describe.skip;

/** Hộp thư giả: giữ mail đã gửi để test đọc mã */
export class FakeMail {
  sent: MailMessage[] = [];
  fail = false;
  async send(message: MailMessage): Promise<void> {
    if (this.fail) throw new Error('SMTP lỗi (giả)');
    this.sent.push(message);
  }
  /** Mã 6 số trong mail mới nhất gửi tới email này */
  lastCode(to: string): string {
    const mail = [...this.sent].reverse().find((m) => m.to === to);
    const code = mail?.text.match(/\b(\d{6})\b/)?.[1];
    if (!code) throw new Error(`Không có mail chứa mã gửi tới ${to}`);
    return code;
  }
}

/** Danh sách tỉnh/huyện/xã giả thay cho marketplace-service */
export const fakeLocations = {
  async resolve(provinceId: number, districtId: number, wardCode: string) {
    if (provinceId !== 201 || districtId !== 1442 || wardCode !== '20109') {
      const { AppError } = await import('@san/nest-common');
      throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu chưa hợp lệ.', {
        fields: { wardCode: 'Phường/xã không thuộc quận/huyện đã chọn.' },
      });
    }
    return { provinceName: 'Hà Nội', districtName: 'Quận Ba Đình', wardName: 'Phường Điện Biên' };
  },
};

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  mail: FakeMail;
  google: { configured: boolean; authorizeUrl: jest.Mock; exchangeCode: jest.Mock };
  http: () => ReturnType<typeof request>;
}

export async function createTestApp(): Promise<TestApp> {
  const mail = new FakeMail();
  const google = {
    configured: true,
    authorizeUrl: jest.fn((state: string) => `https://accounts.google.com/fake?state=${state}`),
    exchangeCode: jest.fn(),
  };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mail)
    .overrideProvider(LocationsClient)
    .useValue(fakeLocations)
    .overrideProvider(GoogleClient)
    .useValue(google)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  setupApp(app, { apiPrefix: 'api/user/v1', title: 'test', description: 'test' });
  await app.init();
  return {
    app,
    prisma: app.get(PrismaService),
    mail,
    google,
    http: () => request(app.getHttpServer()),
  };
}

/** Xóa sạch dữ liệu giữa các test */
export async function resetDb(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE users, verification_codes, sessions, addresses, audit_logs, outbox_events, inbox_events CASCADE',
  );
}

/** Lấy giá trị cookie refresh từ response */
export function refreshCookie(res: { headers: Record<string, unknown> }): string | undefined {
  const cookies = (res.headers['set-cookie'] as string[] | undefined) ?? [];
  const found = cookies.find((c) => c.startsWith('san_refresh='));
  const value = found?.split(';')[0]?.slice('san_refresh='.length);
  return value ? value : undefined;
}

/** Đăng ký + xác minh, trả access token và cookie refresh */
export async function signUp(
  t: TestApp,
  email = 'an@gmail.com',
  password = 'matkhau123',
  fullName = 'Nguyễn Văn An',
): Promise<{ accessToken: string; cookie: string; userId: string }> {
  await t.http().post('/api/user/v1/auth/register').send({ email, password, fullName }).expect(201);
  const res = await t
    .http()
    .post('/api/user/v1/auth/verify-email')
    .send({ email, code: t.mail.lastCode(email) })
    .expect(200);
  return {
    accessToken: res.body.accessToken,
    cookie: refreshCookie(res)!,
    userId: res.body.user.id,
  };
}
