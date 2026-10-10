import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ParseIdPipe, RequirePermissions, type AuthUser } from '@san/nest-common';
import { ModerationDto } from './dto/shop-moderation.dto';
import { ShopModerationService, type ShopViolations } from './shop-moderation.service';

/** Đình chỉ / khôi phục shop và lịch sử xử lý (SHP-04). Chỉ admin có bộ quyền MODERATION. */
@ApiTags('Admin: đình chỉ shop')
@ApiBearerAuth()
@RequirePermissions('MODERATION')
@Controller('admin/shops')
export class ShopModerationController {
  constructor(private readonly moderation: ShopModerationService) {}

  /** Lịch sử đình chỉ/khôi phục của shop (mới nhất trước) và trạng thái hiện tại */
  @Get(':shopId/violations')
  @ApiResponse({ status: 404, description: 'NOT_FOUND: shop chưa từng được duyệt' })
  violations(@Param('shopId', ParseIdPipe) shopId: string): Promise<ShopViolations> {
    return this.moderation.violations(shopId);
  }

  /** Đình chỉ shop: hàng của shop bị ẩn khỏi sàn. Phát shop_suspension.decided, ghi nhật ký */
  @Post(':shopId/suspend')
  @HttpCode(200)
  @ApiResponse({ status: 403, description: 'SELF_MODERATION_FORBIDDEN: admin là chủ shop' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: shop chưa từng được duyệt' })
  @ApiResponse({ status: 409, description: 'ALREADY_SUSPENDED: shop đang bị đình chỉ' })
  suspend(
    @CurrentUser() admin: AuthUser,
    @Param('shopId', ParseIdPipe) shopId: string,
    @Body() dto: ModerationDto,
  ): Promise<ShopViolations> {
    return this.moderation.decide(admin, shopId, 'SUSPEND', dto.reason);
  }

  /** Khôi phục shop đang bị đình chỉ. Phát shop_suspension.decided, ghi nhật ký */
  @Post(':shopId/restore')
  @HttpCode(200)
  @ApiResponse({ status: 403, description: 'SELF_MODERATION_FORBIDDEN: admin là chủ shop' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: shop chưa từng được duyệt' })
  @ApiResponse({ status: 409, description: 'NOT_SUSPENDED: shop không bị đình chỉ' })
  restore(
    @CurrentUser() admin: AuthUser,
    @Param('shopId', ParseIdPipe) shopId: string,
    @Body() dto: ModerationDto,
  ): Promise<ShopViolations> {
    return this.moderation.decide(admin, shopId, 'RESTORE', dto.reason);
  }
}
