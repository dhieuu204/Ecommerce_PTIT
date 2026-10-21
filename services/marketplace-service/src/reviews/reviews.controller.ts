import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ParseIdPipe, Public, type AuthUser } from '@san/nest-common';
import type { Page } from '@san/shared';
import {
  CreateReviewDto,
  MyReviewsQuery,
  PublicReviewsQuery,
  ReplyDto,
  ReviewContentDto,
  SellerReviewsQuery,
} from './dto/reviews.dto';
import {
  ReviewsService,
  type MyReview,
  type PendingReviewItem,
  type PublicReviewPage,
  type SellerReview,
  type SellerReviewPage,
} from './reviews.service';

/** Đánh giá của tôi (ENG-01): dòng hàng chờ đánh giá, viết và sửa đánh giá */
@ApiTags('Đánh giá')
@ApiBearerAuth()
@Controller('me/reviews')
export class MyReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /** state=PENDING: dòng hàng còn đánh giá được (kèm hạn); state=DONE: đánh giá đã viết (kèm canEdit) */
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() q: MyReviewsQuery,
  ): Promise<Page<PendingReviewItem> | Page<MyReview>> {
    return this.reviews.mine(user, q);
  }

  /** Viết đánh giá cho một dòng hàng của đơn con đã hoàn tất; cộng sao vào sản phẩm và shop, báo chủ shop */
  @Post()
  @HttpCode(201)
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR hoặc INVALID_IMAGE_URL' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: dòng hàng không có hoặc của người khác' })
  @ApiResponse({
    status: 409,
    description: 'REVIEW_NOT_ALLOWED, REVIEW_WINDOW_CLOSED hoặc ALREADY_REVIEWED',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReviewDto): Promise<MyReview> {
    return this.reviews.create(user, dto);
  }

  /** Sửa đánh giá (một lần, trong hạn): gửi lại sao, nội dung, ảnh */
  @Put(':reviewId')
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR hoặc INVALID_IMAGE_URL' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'REVIEW_EDIT_USED hoặc REVIEW_WINDOW_CLOSED' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('reviewId', ParseIdPipe) reviewId: string,
    @Body() dto: ReviewContentDto,
  ): Promise<MyReview> {
    return this.reviews.update(user, reviewId, dto);
  }
}

/**
 * Đánh giá của shop tôi (ENG-02). Khai trước PublicShopReviewsController (cùng module) để
 * GET /shops/me/reviews không bị hiểu là /shops/{shopId}/reviews.
 */
@ApiTags('Đánh giá')
@ApiBearerAuth()
@Controller('shops/me/reviews')
export class SellerReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /** Lọc theo sao, đã/chưa trả lời; mới nhất trước; kèm tóm tắt sao và số chưa trả lời */
  @Get()
  @ApiResponse({ status: 409, description: 'SHOP_NOT_ACTIVE' })
  list(@CurrentUser() user: AuthUser, @Query() q: SellerReviewsQuery): Promise<SellerReviewPage> {
    return this.reviews.forSeller(user, q);
  }

  /** Trả lời đánh giá (lần đầu) hoặc sửa câu trả lời của shop */
  @Put(':reviewId/reply')
  @ApiResponse({ status: 404, description: 'NOT_FOUND: đánh giá không có hoặc của shop khác' })
  @ApiResponse({ status: 409, description: 'SHOP_NOT_ACTIVE' })
  reply(
    @CurrentUser() user: AuthUser,
    @Param('reviewId', ParseIdPipe) reviewId: string,
    @Body() dto: ReplyDto,
  ): Promise<SellerReview> {
    return this.reviews.reply(user, reviewId, dto.content);
  }
}

/** Đánh giá công khai của sản phẩm (ENG-01). Tên người mua đã che bớt */
@ApiTags('Đánh giá')
@Public()
@Controller('products/:productId/reviews')
export class ProductReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /** Lọc rating, withImages; kèm tóm tắt: sao trung bình, số đánh giá từng mức sao, số có ảnh */
  @Get()
  @ApiResponse({ status: 404, description: 'NOT_FOUND: sản phẩm không đang bán' })
  list(
    @Param('productId', ParseIdPipe) productId: string,
    @Query() q: PublicReviewsQuery,
  ): Promise<PublicReviewPage> {
    return this.reviews.forProduct(productId, q);
  }
}

/** Đánh giá công khai của mọi sản phẩm trong shop (ENG-01) */
@ApiTags('Đánh giá')
@Public()
@Controller('shops/:shopId/reviews')
export class PublicShopReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @ApiResponse({ status: 404, description: 'NOT_FOUND: shop không có hoặc chưa được duyệt' })
  list(
    @Param('shopId', ParseIdPipe) shopId: string,
    @Query() q: PublicReviewsQuery,
  ): Promise<PublicReviewPage> {
    return this.reviews.forShop(shopId, q);
  }
}
