import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { correlationMiddleware } from './context/request-context';

export interface SetupAppOptions {
  /** Tiền tố API của service, ví dụ 'api/user/v1' (Ingress chuyển theo tiền tố) */
  apiPrefix: string;
  /** Tên trên trang tài liệu, ví dụ 'user-service API' */
  title: string;
  description: string;
}

/**
 * Cấu hình chung cho main.ts của mọi service:
 * - Mọi API nằm dưới `apiPrefix`, riêng /health để ngoài cho Kubernetes kiểm tra.
 * - Mỗi request có mã lần vết X-Correlation-Id (nhận từ header hoặc sinh mới, trả lại trong response).
 * - Tài liệu API tự sinh: /<apiPrefix>/docs (giao diện), /<apiPrefix>/docs-json (file OpenAPI).
 * Test e2e cũng gọi hàm này để app giống hệt khi chạy thật.
 */
export function setupApp(app: INestApplication, options: SetupAppOptions): void {
  app.setGlobalPrefix(options.apiPrefix, { exclude: ['health'] });
  app.use(correlationMiddleware);
  const config = new DocumentBuilder()
    .setTitle(options.title)
    .setDescription(options.description)
    .setVersion('1.0')
    .addServer('/')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(`${options.apiPrefix}/docs`, app, () =>
    SwaggerModule.createDocument(app, config),
  );
}
