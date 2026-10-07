import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3004);
  await app.listen(port);
  console.log(`approval-service đang chạy ở cổng ${port}`);
}

void bootstrap();
