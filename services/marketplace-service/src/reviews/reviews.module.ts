import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import {
  MyReviewsController,
  ProductReviewsController,
  PublicShopReviewsController,
  SellerReviewsController,
} from './reviews.controller';
import { ReviewsService } from './reviews.service';

/** Đánh giá sản phẩm/shop (ENG-01) và shop trả lời (ENG-02) */
@Module({
  imports: [UploadsModule],
  // SellerReviewsController (shops/me/reviews) phải đứng trước PublicShopReviewsController (shops/:shopId/reviews)
  controllers: [
    MyReviewsController,
    SellerReviewsController,
    ProductReviewsController,
    PublicShopReviewsController,
  ],
  providers: [ReviewsService],
})
export class ReviewsModule {}
