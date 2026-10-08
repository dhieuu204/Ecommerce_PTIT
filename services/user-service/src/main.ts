import './env';
import { NestFactory } from '@nestjs/core';
import { setupApp } from '@san/nest-common';
import { AppModule } from './app.module';

export const API_PREFIX = 'api/user/v1';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Tiền tố API, mã lần vết, tài liệu API tự sinh ở /api/user/v1/docs (xem packages/nest-common)
  setupApp(app, {
    apiPrefix: API_PREFIX,
    title: 'user-service API',
    description:
      'Tài khoản, đăng nhập, hồ sơ, sổ địa chỉ, bộ quyền admin. Quy ước chung: docs/api/README.md',
  });

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(
    `user-service đang chạy ở cổng ${port}, tài liệu API: http://localhost:${port}/${API_PREFIX}/docs`,
  );
}

void bootstrap();
