import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

/** Sản phẩm của seller và tồn kho (CAT-02, CAT-03, INV-01) */
@Module({
  imports: [UploadsModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
