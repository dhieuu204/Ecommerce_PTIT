import './env';
import { NestFactory } from '@nestjs/core';
import { setupApp } from '@san/nest-common';
import { AppModule } from './app.module';

export const API_PREFIX = 'api/payment/v1';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Tiền tố API, mã lần vết, tài liệu API tự sinh ở /api/payment/v1/docs (xem packages/nest-common)
  setupApp(app, {
    apiPrefix: API_PREFIX,
    title: 'payment-service API',
    description:
      'Thanh toán, hoàn tiền, sổ tiền người bán, rút tiền. Quy ước chung: docs/api/README.md',
  });

  const port = Number(process.env.PORT ?? 3003);
  await app.listen(port);
  console.log(
    `payment-service đang chạy ở cổng ${port}, tài liệu API: http://localhost:${port}/${API_PREFIX}/docs`,
  );
}

void bootstrap();
