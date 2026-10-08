import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { setupApp } from '@san/nest-common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// Chạy cả app như thật (không cần database, RabbitMQ) để kiểm nền tảng chung đã gắn đúng.
describe('payment-service (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    setupApp(app, { apiPrefix: 'api/payment/v1', title: 'test', description: 'test' });
    await app.init();
  });

  afterAll(() => app.close());

  it('/health không cần đăng nhập', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200, { status: 'ok', service: 'payment-service' });
  });

  it('có tài liệu API', async () => {
    await request(app.getHttpServer()).get('/api/payment/v1/docs-json').expect(200);
  });

  it('lỗi trả về dạng chung', async () => {
    const res = await request(app.getHttpServer()).get('/api/payment/v1/khong-co').expect(404);
    expect(res.body).toEqual({ code: 'NOT_FOUND', message: 'Không tìm thấy.' });
  });
});
