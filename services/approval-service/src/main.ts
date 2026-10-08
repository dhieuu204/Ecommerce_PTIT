import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

// Mọi API nằm dưới tiền tố này (Ingress chuyển theo tiền tố). Riêng /health để ngoài cho Kubernetes kiểm tra.
const API_PREFIX = 'api/approval/v1';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health'] });
  // Kiểm dữ liệu gửi lên theo DTO (class-validator); bỏ trường lạ, đổi kiểu theo DTO
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Tài liệu API tự sinh từ code: /api/approval/v1/docs (giao diện), /api/approval/v1/docs-json (file OpenAPI)
  const config = new DocumentBuilder()
    .setTitle('approval-service API')
    .setDescription(
      'Duyệt shop, kiểm tra đơn, xử lý tranh chấp, duyệt rút tiền. Quy ước chung: docs/api/README.md',
    )
    .setVersion('1.0')
    .addServer('/')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, () => SwaggerModule.createDocument(app, config));

  const port = Number(process.env.PORT ?? 3004);
  await app.listen(port);
  console.log(
    `approval-service đang chạy ở cổng ${port}, tài liệu API: http://localhost:${port}/${API_PREFIX}/docs`,
  );
}

void bootstrap();
