import { Body, Controller, Get, Headers, HttpCode, Ip, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ParseIdPipe, RequirePermissions, type AuthUser } from '@san/nest-common';
import type { Page } from '@san/shared';
import type { PaymentLink } from '../clients/payment.client';
import {
  AdminOrdersQuery,
  BuyerOrdersQuery,
  IncidentDto,
  ReasonDto,
  ReturnReceivedDto,
  ShopOrdersQuery,
} from './dto/orders.dto';
import {
  OrdersService,
  type OrderView,
  type SellerOrderPage,
  type SellerOrderView,
} from './orders.service';

const notCancellable = ApiResponse({
  status: 409,
  description: 'ORDER_NOT_CANCELLABLE: trạng thái hiện tại không hủy được',
});

/** Đơn của người mua (ORD-02, ORD-05, PAY-01) */
@ApiTags('Đơn của tôi')
@ApiBearerAuth()
@Controller('orders')
export class BuyerOrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** Đơn của tôi, mới nhất trước; mỗi đơn tổng kèm các đơn con */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: BuyerOrdersQuery): Promise<Page<OrderView>> {
    return this.orders.buyerList(user.id, q);
  }

  /** Chi tiết đơn: tiền từng phần, trạng thái thanh toán/kiểm tra, lịch sử từng đơn con */
  @Get(':orderId')
  @ApiResponse({ status: 404, description: 'NOT_FOUND: không có hoặc đơn của người khác' })
  detail(
    @CurrentUser() user: AuthUser,
    @Param('orderId', ParseIdPipe) orderId: string,
  ): Promise<OrderView> {
    return this.orders.buyerDetail(user.id, orderId);
  }

  /** Tạo (hoặc mở lại) lần thanh toán VNPay. Header Idempotency-Key bắt buộc */
  @Post(':orderId/pay')
  @HttpCode(200)
  @ApiResponse({ status: 400, description: 'IDEMPOTENCY_KEY_REQUIRED' })
  @ApiResponse({
    status: 409,
    description:
      'ORDER_NOT_PAYABLE: đã trả/đã hủy/hết hạn; PAYMENT_ATTEMPTS_EXCEEDED; PAYMENT_UNKNOWN: lần trước chưa rõ; ' +
      'ORDER_NOT_READY: payment-service chưa nhận đơn, thử lại sau 1 giây',
  })
  @ApiResponse({ status: 503, description: 'PAYMENT_SERVICE_UNAVAILABLE' })
  pay(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Ip() ip: string,
    @Param('orderId', ParseIdPipe) orderId: string,
  ): Promise<PaymentLink & { payBefore: Date | null }> {
    return this.orders.pay(user, authorization, orderId, idempotencyKey, ip);
  }

  /** Hủy cả đơn tổng (chỉ khi chưa thanh toán): nhả tồn, trả lượt voucher */
  @Post(':orderId/cancel')
  @HttpCode(200)
  @ApiResponse({ status: 409, description: 'ORDER_ALREADY_PAID: đã trả, hủy từng đơn con' })
  @notCancellable
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('orderId', ParseIdPipe) orderId: string,
    @Body() dto: ReasonDto,
  ): Promise<OrderView> {
    return this.orders.buyerCancelOrder(user, orderId, dto.reason);
  }

  /** Hủy một đơn con đã trả: chưa xác nhận → hủy ngay, hoàn tiền; đã xác nhận → gửi yêu cầu cho shop */
  @Post(':orderId/shop-orders/:shopOrderId/cancel')
  @HttpCode(200)
  @ApiResponse({
    status: 409,
    description:
      'ORDER_NOT_PAID: chưa trả, hủy cả đơn; CANCEL_REQUEST_USED: đã xin hủy 1 lần; ORDER_NOT_CANCELLABLE',
  })
  cancelShopOrder(
    @CurrentUser() user: AuthUser,
    @Param('orderId', ParseIdPipe) orderId: string,
    @Param('shopOrderId', ParseIdPipe) shopOrderId: string,
    @Body() dto: ReasonDto,
  ): Promise<OrderView> {
    return this.orders.buyerCancelShopOrder(user, orderId, shopOrderId, dto.reason);
  }

  /** "Đã nhận, không trả hàng": đơn con đã giao → hoàn tất ngay */
  @Post(':orderId/shop-orders/:shopOrderId/received')
  @HttpCode(200)
  @ApiResponse({ status: 409, description: 'ORDER_NOT_DELIVERED: chưa giao xong hoặc đã hoàn tất' })
  received(
    @CurrentUser() user: AuthUser,
    @Param('orderId', ParseIdPipe) orderId: string,
    @Param('shopOrderId', ParseIdPipe) shopOrderId: string,
  ): Promise<OrderView> {
    return this.orders.buyerReceived(user, orderId, shopOrderId);
  }
}

/** Đơn của shop trong Kênh người bán (ORD-02, ORD-03, ORD-05) */
@ApiTags('Kênh người bán: đơn hàng')
@ApiBearerAuth()
@Controller('shops/me/orders')
export class SellerOrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** Đơn con của shop, kèm số đơn theo từng trạng thái */
  @Get()
  @ApiResponse({ status: 409, description: 'SHOP_NOT_ACTIVE: shop chưa được duyệt' })
  list(@CurrentUser() user: AuthUser, @Query() q: ShopOrdersQuery): Promise<SellerOrderPage> {
    return this.orders.sellerList(user.id, q);
  }

  @Get(':shopOrderId')
  @ApiResponse({ status: 404, description: 'NOT_FOUND: không có hoặc đơn của shop khác' })
  detail(
    @CurrentUser() user: AuthUser,
    @Param('shopOrderId', ParseIdPipe) id: string,
  ): Promise<SellerOrderView> {
    return this.orders.sellerDetail(user.id, id);
  }

  /**
   * "Xác nhận và giao cho GHN": "Chờ xác nhận" → "Chờ giao hàng" và tạo vận đơn (MÔ PHỎNG khi chưa có
   * GHN_TOKEN). GHN lỗi thì đơn vẫn xác nhận, vận đơn chờ tạo lại
   */
  @Post(':shopOrderId/confirm')
  @HttpCode(200)
  @ApiResponse({ status: 409, description: 'ORDER_NOT_CONFIRMABLE' })
  confirm(
    @CurrentUser() user: AuthUser,
    @Param('shopOrderId', ParseIdPipe) id: string,
  ): Promise<SellerOrderView> {
    return this.orders.sellerConfirm(user, id);
  }

  /** Tạo lại vận đơn khi GHN đã từ chối lần trước */
  @Post(':shopOrderId/shipment/retry')
  @HttpCode(200)
  @ApiResponse({ status: 409, description: 'SHIPMENT_NOT_RETRYABLE' })
  retryShipment(
    @CurrentUser() user: AuthUser,
    @Param('shopOrderId', ParseIdPipe) id: string,
  ): Promise<SellerOrderView> {
    return this.orders.sellerRetryShipment(user, id);
  }

  /** Đã nhận kiện hoàn: chọn dòng hàng nhập lại kho; đơn đóng là giao thất bại */
  @Post(':shopOrderId/return-received')
  @HttpCode(200)
  @ApiResponse({
    status: 409,
    description: 'ORDER_NOT_RETURNED: chưa ở trạng thái chờ nhận kiện hoàn',
  })
  returnReceived(
    @CurrentUser() user: AuthUser,
    @Param('shopOrderId', ParseIdPipe) id: string,
    @Body() dto: ReturnReceivedDto,
  ): Promise<SellerOrderView> {
    return this.orders.sellerReturnReceived(user, id, dto.restockItemIds);
  }

  /** Shop hủy có lý do (trước bàn giao); buyer được hoàn tiền */
  @Post(':shopOrderId/cancel')
  @HttpCode(200)
  @notCancellable
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('shopOrderId', ParseIdPipe) id: string,
    @Body() dto: ReasonDto,
  ): Promise<SellerOrderView> {
    return this.orders.sellerCancel(user, id, dto.reason);
  }

  /** Đồng ý yêu cầu hủy của buyer */
  @Post(':shopOrderId/cancel-request/accept')
  @HttpCode(200)
  @ApiResponse({ status: 409, description: 'NO_CANCEL_REQUEST' })
  accept(
    @CurrentUser() user: AuthUser,
    @Param('shopOrderId', ParseIdPipe) id: string,
  ): Promise<SellerOrderView> {
    return this.orders.acceptCancelRequest(user, id);
  }

  /** Từ chối yêu cầu hủy (có lý do); đơn quay lại "Chờ giao hàng" */
  @Post(':shopOrderId/cancel-request/decline')
  @HttpCode(200)
  @ApiResponse({ status: 409, description: 'NO_CANCEL_REQUEST' })
  decline(
    @CurrentUser() user: AuthUser,
    @Param('shopOrderId', ParseIdPipe) id: string,
    @Body() dto: ReasonDto,
  ): Promise<SellerOrderView> {
    return this.orders.declineCancelRequest(user, id, dto.reason);
  }
}

/** Tra cứu và hủy đơn cho admin hỗ trợ (ORD-02, ORD-05) */
@ApiTags('Admin: đơn hàng')
@ApiBearerAuth()
@RequirePermissions('SUPPORT')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query() q: AdminOrdersQuery): Promise<Page<OrderView>> {
    return this.orders.adminList(q);
  }

  @Get(':orderId')
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  detail(@Param('orderId', ParseIdPipe) orderId: string): Promise<OrderView> {
    return this.orders.adminDetail(orderId);
  }

  /** Hủy có lý do: chưa trả → cả đơn tổng; đã trả → đơn con. Ghi nhật ký */
  @Post(':orderId/shop-orders/:shopOrderId/cancel')
  @HttpCode(200)
  @notCancellable
  cancel(
    @CurrentUser() admin: AuthUser,
    @Param('orderId', ParseIdPipe) orderId: string,
    @Param('shopOrderId', ParseIdPipe) shopOrderId: string,
    @Body() dto: ReasonDto,
  ): Promise<OrderView> {
    return this.orders.adminCancel(admin, orderId, shopOrderId, dto.reason);
  }

  /** Xác nhận GHN làm mất/hỏng hàng: người mua trả trước được hoàn đủ, seller được đền. Ghi nhật ký */
  @Post(':orderId/shop-orders/:shopOrderId/incident')
  @HttpCode(200)
  @ApiResponse({ status: 409, description: 'NO_INCIDENT: đơn không có sự cố chờ xác nhận' })
  incident(
    @CurrentUser() admin: AuthUser,
    @Param('orderId', ParseIdPipe) orderId: string,
    @Param('shopOrderId', ParseIdPipe) shopOrderId: string,
    @Body() dto: IncidentDto,
  ): Promise<OrderView> {
    return this.orders.adminResolveIncident(admin, orderId, shopOrderId, dto.note);
  }
}
