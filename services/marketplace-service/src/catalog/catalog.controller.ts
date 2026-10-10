import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { ParseIdPipe, Public } from '@san/nest-common';
import type { Page } from '@san/shared';
import {
  CatalogService,
  type ProductCard,
  type ProductDetail,
  type PublicShop,
} from './catalog.service';
import { ProductSearchQuery } from './dto/catalog.dto';

/** Xem hàng công khai: tìm, lọc, trang sản phẩm (SRC-01, CAT-04). Không cần đăng nhập. */
@ApiTags('Xem hàng')
@Public()
@Controller('products')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  /** Tìm và lọc hàng đang bán (sản phẩm ACTIVE của shop ACTIVE) */
  @Get()
  search(@Query() q: ProductSearchQuery): Promise<Page<ProductCard>> {
    return this.catalog.search(q);
  }

  /** Chi tiết hàng đang bán: ảnh, danh mục, biến thể với giá và số còn bán được, thông tin shop */
  @Get(':productId')
  @ApiResponse({ status: 404, description: 'NOT_FOUND: không có hoặc không còn bán' })
  product(@Param('productId', ParseIdPipe) productId: string): Promise<ProductDetail> {
    return this.catalog.product(productId);
  }
}

/**
 * Trang shop công khai (CAT-04). Đăng ký sau ShopsModule (app.module.ts) để `GET /shops/me`
 * vẫn vào đúng ShopsController.
 */
@ApiTags('Xem hàng')
@Public()
@Controller('shops')
export class PublicShopsController {
  constructor(private readonly catalog: CatalogService) {}

  /** Tên, logo, mô tả, tỉnh lấy hàng, số sản phẩm đang bán, ngày tham gia, trạng thái */
  @Get(':shopId')
  @ApiResponse({ status: 404, description: 'NOT_FOUND: shop không có hoặc chưa được duyệt' })
  shop(@Param('shopId', ParseIdPipe) shopId: string): Promise<PublicShop> {
    return this.catalog.shop(shopId);
  }
}
