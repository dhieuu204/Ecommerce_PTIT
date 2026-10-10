import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ParseIdPipe, RequirePermissions } from '@san/nest-common';
import type { Page } from '@san/shared';
import { ListAdminShopsQuery } from './dto/shop-admin.dto';
import { ShopAdminService, type AdminShopDetail, type AdminShopRow } from './shop-admin.service';

/** Admin xem shop đã duyệt (SHP-04). Đình chỉ/khôi phục và lịch sử nằm ở approval-service. */
@ApiTags('Admin: shop')
@ApiBearerAuth()
@RequirePermissions('MODERATION')
@Controller('admin/shops')
export class ShopAdminController {
  constructor(private readonly shops: ShopAdminService) {}

  /** Danh sách shop đang hoạt động / bị đình chỉ, mới nhất trước; lọc trạng thái, tìm theo tên */
  @Get()
  list(@Query() q: ListAdminShopsQuery): Promise<Page<AdminShopRow>> {
    return this.shops.list(q);
  }

  /** Thông tin shop đang dùng và số sản phẩm theo trạng thái */
  @Get(':shopId')
  @ApiResponse({ status: 404, description: 'NOT_FOUND: không có shop hoặc shop chưa được duyệt' })
  detail(@Param('shopId', ParseIdPipe) shopId: string): Promise<AdminShopDetail> {
    return this.shops.detail(shopId);
  }
}
