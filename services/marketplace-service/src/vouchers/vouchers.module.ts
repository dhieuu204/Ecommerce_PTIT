import { Module } from '@nestjs/common';
import {
  AdminVouchersController,
  SellerVouchersController,
  ShopVouchersController,
} from './vouchers.controller';
import { VouchersService } from './vouchers.service';

/** Voucher shop, voucher sàn và danh sách voucher công khai của shop (VCH-01) */
@Module({
  // Seller (shops/me/vouchers) đăng ký trước shops/:shopId/vouchers để "me" không bị coi là mã shop
  controllers: [SellerVouchersController, AdminVouchersController, ShopVouchersController],
  providers: [VouchersService],
})
export class VouchersModule {}
