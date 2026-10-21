import { Controller, Delete, Get, Param, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, PageQuery, ParseIdPipe, type AuthUser } from '@san/nest-common';
import type { Page } from '@san/shared';
import {
  FollowsService,
  type FollowState,
  type FollowedShop,
  type LikeState,
  type LikedProduct,
} from './follows.service';

/** Theo dõi shop, thả tim sản phẩm (ENG-03). Cần đăng nhập */
@ApiTags('Theo dõi, yêu thích')
@ApiBearerAuth()
@Controller()
export class FollowsController {
  constructor(private readonly follows: FollowsService) {}

  /** Theo dõi shop; làm lại không lỗi */
  @Put('shops/:shopId/follow')
  @ApiResponse({ status: 404, description: 'NOT_FOUND: shop không có hoặc chưa được duyệt' })
  @ApiResponse({ status: 409, description: 'OWN_SHOP: shop của chính mình' })
  follow(
    @CurrentUser() user: AuthUser,
    @Param('shopId', ParseIdPipe) shopId: string,
  ): Promise<FollowState> {
    return this.follows.follow(user, shopId);
  }

  /** Bỏ theo dõi shop; làm lại không lỗi */
  @Delete('shops/:shopId/follow')
  @ApiResponse({ status: 404, description: 'NOT_FOUND: shop không có' })
  unfollow(
    @CurrentUser() user: AuthUser,
    @Param('shopId', ParseIdPipe) shopId: string,
  ): Promise<FollowState> {
    return this.follows.unfollow(user, shopId);
  }

  /** Shop đang theo dõi, mới theo dõi trước */
  @Get('me/followed-shops')
  followedShops(@CurrentUser() user: AuthUser, @Query() q: PageQuery): Promise<Page<FollowedShop>> {
    return this.follows.followedShops(user, q);
  }

  /** Thả tim hàng đang bán; làm lại không lỗi */
  @Put('products/:productId/like')
  @ApiResponse({ status: 404, description: 'NOT_FOUND: sản phẩm không đang bán' })
  like(
    @CurrentUser() user: AuthUser,
    @Param('productId', ParseIdPipe) productId: string,
  ): Promise<LikeState> {
    return this.follows.like(user, productId);
  }

  /** Bỏ tim; luôn được */
  @Delete('products/:productId/like')
  unlike(
    @CurrentUser() user: AuthUser,
    @Param('productId', ParseIdPipe) productId: string,
  ): Promise<LikeState> {
    return this.follows.unlike(user, productId);
  }

  /** Sản phẩm đã thả tim (thẻ như GET /products, kèm available), mới thả tim trước */
  @Get('me/liked-products')
  likedProducts(@CurrentUser() user: AuthUser, @Query() q: PageQuery): Promise<Page<LikedProduct>> {
    return this.follows.likedProducts(user, q);
  }
}
