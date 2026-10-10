import { Body, Controller, Headers, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '@san/nest-common';
import type { Response } from 'express';
import { CheckoutService, type CheckoutPreview, type PlacedOrder } from './checkout.service';
import { PlaceOrderDto, PreviewCheckoutDto } from './dto/checkout.dto';

/** Checkout nhiều shop và đặt hàng (ORD-01, VCH-02, SHIP-01, INV-02) */
@ApiTags('Đặt hàng')
@ApiBearerAuth()
@Controller()
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  /**
   * Bản xem trước: tiền tách theo shop, voucher dùng được, phí ship, tổng. Trả mã phiên `checkoutId`
   * để đặt hàng (gửi lại cùng mã không tạo đơn mới).
   */
  @Post('checkout/preview')
  @ApiResponse({ status: 400, description: 'EMPTY_CHECKOUT: không có dòng giỏ nào' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: địa chỉ không có trong sổ địa chỉ' })
  @ApiResponse({ status: 409, description: 'ADDRESS_REQUIRED: chưa có địa chỉ nhận hàng' })
  @ApiResponse({ status: 503, description: 'USER_SERVICE_UNAVAILABLE: không lấy được sổ địa chỉ' })
  preview(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string,
    @Body() dto: PreviewCheckoutDto,
  ): Promise<CheckoutPreview> {
    return this.checkout.preview(user, authorization, dto);
  }

  /**
   * Đặt hàng từ bản xem trước. Lỗi ở bất kỳ shop nào thì không tạo đơn nào. 201 = đơn mới,
   * 200 = phiên này đã đặt rồi (trả đơn cũ).
   */
  @Post('orders')
  @ApiResponse({ status: 200, description: 'Phiên này đã đặt hàng rồi: trả lại đơn đã tạo' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: không có phiên hoặc phiên của người khác' })
  @ApiResponse({
    status: 409,
    description:
      'CHECKOUT_CHANGED (details.problems: giá/tồn/voucher khác lúc xem), CHECKOUT_EXPIRED: phiên quá hạn',
  })
  async place(
    @CurrentUser() user: AuthUser,
    @Body() dto: PlaceOrderDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PlacedOrder> {
    const { created, ...order } = await this.checkout.place(user, dto.checkoutId);
    res.status(created ? 201 : 200);
    return order;
  }
}
