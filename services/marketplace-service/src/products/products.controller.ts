import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ParseIdPipe, type AuthUser } from '@san/nest-common';
import type { Page } from '@san/shared';
import {
  ProductInputDto,
  ProductStatusDto,
  SellerProductQuery,
  StockAdjustDto,
  StockHistoryQuery,
} from './dto/product.dto';
import {
  ProductsService,
  type SellerProduct,
  type SellerProductRow,
  type StockAdjustResult,
  type StockHistoryRow,
} from './products.service';

const shopNotActive = ApiResponse({
  status: 409,
  description: 'SHOP_NOT_ACTIVE: shop chưa được duyệt',
});
const productRules = ApiResponse({
  status: 400,
  description:
    'VALIDATION_ERROR (details.fields); INVALID_CATEGORY: danh mục không phải cấp 2 hoặc đang ẩn; INVALID_IMAGE_URL: ảnh không nằm trong thư mục của bạn',
});

/**
 * Sản phẩm của shop mình (CAT-02, CAT-03) và tồn kho (INV-01). Chỉ chủ shop đã được duyệt
 * (kể cả đang bị đình chỉ); sản phẩm của shop khác trả 404.
 */
@ApiTags('Kênh người bán › Sản phẩm')
@ApiBearerAuth()
@Controller('shops/me/products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  /** Lọc theo trạng thái, danh mục, tên; mới sửa lên đầu */
  @Get()
  @shopNotActive
  list(
    @CurrentUser() user: AuthUser,
    @Query() q: SellerProductQuery,
  ): Promise<Page<SellerProductRow>> {
    return this.products.list(user, q);
  }

  /** Tạo sản phẩm: bán ngay (ACTIVE) */
  @Post()
  @HttpCode(201)
  @productRules
  @ApiResponse({
    status: 409,
    description: 'SHOP_NOT_ACTIVE; DUPLICATE_VARIANT: hai biến thể cùng tổ hợp lựa chọn',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: ProductInputDto): Promise<SellerProduct> {
    return this.products.create(user, dto);
  }

  /** Đầy đủ, kể cả tồn và lượng đang giữ của từng biến thể đang bán */
  @Get(':productId')
  @shopNotActive
  get(
    @CurrentUser() user: AuthUser,
    @Param('productId', ParseIdPipe) productId: string,
  ): Promise<SellerProduct> {
    return this.products.get(user, productId);
  }

  /**
   * Gửi lại toàn bộ như khi tạo; biến thể cũ gửi kèm `id` (tồn không đổi ở đây). Biến thể không gửi
   * lại thì ngừng bán; thêm lại đúng tổ hợp cũ thì bật lại dòng cũ
   */
  @Put(':productId')
  @productRules
  @ApiResponse({
    status: 409,
    description:
      'SHOP_NOT_ACTIVE; DUPLICATE_VARIANT; VARIANT_RESERVED: biến thể bị bỏ đang được giữ cho đơn',
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('productId', ParseIdPipe) productId: string,
    @Body() dto: ProductInputDto,
  ): Promise<SellerProduct> {
    return this.products.update(user, productId, dto);
  }

  /** Ẩn (HIDDEN) hoặc bán lại (ACTIVE) */
  @Patch(':productId/status')
  @shopNotActive
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('productId', ParseIdPipe) productId: string,
    @Body() dto: ProductStatusDto,
  ): Promise<SellerProduct> {
    return this.products.setStatus(user, productId, dto);
  }

  /** Điều chỉnh tồn: `change` dương là nhập thêm, âm là bớt; ghi một dòng lịch sử */
  @Post(':productId/variants/:variantId/stock')
  @HttpCode(200)
  @ApiResponse({ status: 400, description: 'STOCK_TOO_LARGE: tồn mới vượt mức tối đa' })
  @ApiResponse({
    status: 409,
    description: 'SHOP_NOT_ACTIVE; STOCK_BELOW_RESERVED: tồn mới nhỏ hơn lượng đang giữ (hoặc âm)',
  })
  adjustStock(
    @CurrentUser() user: AuthUser,
    @Param('productId', ParseIdPipe) productId: string,
    @Param('variantId', ParseIdPipe) variantId: string,
    @Body() dto: StockAdjustDto,
  ): Promise<StockAdjustResult> {
    return this.products.adjustStock(user, productId, variantId, dto);
  }

  /** Lịch sử tồn, mới nhất lên đầu; lọc theo biến thể */
  @Get(':productId/stock-history')
  @shopNotActive
  stockHistory(
    @CurrentUser() user: AuthUser,
    @Param('productId', ParseIdPipe) productId: string,
    @Query() q: StockHistoryQuery,
  ): Promise<Page<StockHistoryRow>> {
    return this.products.stockHistory(user, productId, q);
  }
}
