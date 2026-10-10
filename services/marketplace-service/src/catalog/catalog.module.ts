import { Module } from '@nestjs/common';
import { CatalogController, PublicShopsController } from './catalog.controller';
import { CatalogService } from './catalog.service';

/** Xem hàng công khai: tìm kiếm, trang sản phẩm, trang shop (SRC-01, CAT-04) */
@Module({
  controllers: [CatalogController, PublicShopsController],
  providers: [CatalogService],
})
export class CatalogModule {}
