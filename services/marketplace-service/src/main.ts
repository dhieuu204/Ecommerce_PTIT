import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

// Mọi API nằm dưới tiền tố này (Ingress chuyển theo tiền tố). Riêng /health để ngoài cho Kubernetes kiểm tra.
const API_PREFIX = 'api/market/v1';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health'] });
  // Kiểm dữ liệu gửi lên theo DTO (class-validator); bỏ trường lạ, đổi kiểu theo DTO
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Tài liệu API tự sinh từ code: /api/market/v1/docs (giao diện), /api/market/v1/docs-json (file OpenAPI)
  const config = new DocumentBuilder()
    .setTitle('marketplace-service API')
    .setDescription(
      'Shop, sản phẩm, giỏ hàng, đơn hàng, vận chuyển, đánh giá, chat. Quy ước chung: docs/api/README.md',
    )
    .setVersion('1.0')
    .addServer('/')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, () => SwaggerModule.createDocument(app, config));

  const port = Number(process.env.PORT ?? 3002);
  await app.listen(port);
  console.log(
    `marketplace-service đang chạy ở cổng ${port}, tài liệu API: http://localhost:${port}/${API_PREFIX}/docs`,
  );
}

void bootstrap();
