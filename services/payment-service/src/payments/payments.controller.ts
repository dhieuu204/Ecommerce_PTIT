import { Body, Controller, Get, Headers, HttpCode, Ip, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  AppError,
  CurrentUser,
  ParseIdPipe,
  Public,
  RequirePermissions,
  type AuthUser,
} from '@san/nest-common';
import { PrismaService } from '../prisma.service';
import type { Payment, Refund, SellerEarning } from '../../generated/prisma';
import { CallbacksService, type IpnReply } from './callbacks.service';
import { CreatePaymentDto, MockCompleteDto, PaymentReturnDto } from './dto/payments.dto';
import { PaymentsService, type OrderPaymentView, type PaymentLink } from './payments.service';

/** Thanh toán đơn của người mua (PAY-01, PAY-02) */
@ApiTags('Thanh toán')
@ApiBearerAuth()
@Controller()
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly callbacks: CallbacksService,
  ) {}

  /**
   * Tạo lần thanh toán (hoặc trả lại lần đang chờ). marketplace gọi khi buyer bấm "Thanh toán", chuyển
   * kèm vé của buyer. Số tiền lấy từ đơn đã nhận qua sự kiện, không lấy từ request
   */
  @Post('payments')
  @HttpCode(201)
  @ApiResponse({ status: 400, description: 'IDEMPOTENCY_KEY_REQUIRED' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: không phải đơn của người gọi' })
  @ApiResponse({
    status: 409,
    description:
      'ORDER_NOT_READY, ORDER_NOT_PAYABLE, PAYMENT_UNKNOWN, PAYMENT_ATTEMPTS_EXCEEDED, IDEMPOTENCY_KEY_REUSED',
  })
  create(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') key: string | undefined,
    @Ip() ip: string,
    @Body() dto: CreatePaymentDto,
  ): Promise<PaymentLink> {
    return this.payments.create(user, dto.orderId, key, dto.clientIp ?? ip);
  }

  /** Tình hình thanh toán của đơn (trang kết quả thanh toán) */
  @Get('orders/:orderId/payment')
  @ApiResponse({ status: 409, description: 'ORDER_NOT_READY' })
  status(
    @CurrentUser() user: AuthUser,
    @Param('orderId', ParseIdPipe) orderId: string,
  ): Promise<OrderPaymentView> {
    return this.payments.orderPayment(user, orderId);
  }

  /** Buyer quay về từ VNPay: kiểm chữ ký, tra cứu VNPay trước khi ghi đã trả */
  @Post('payments/return')
  @HttpCode(200)
  @ApiResponse({ status: 400, description: 'INVALID_SIGNATURE' })
  returned(
    @CurrentUser() user: AuthUser,
    @Body() dto: PaymentReturnDto,
  ): Promise<OrderPaymentView> {
    return this.callbacks.returned(user, dto.params);
  }

  /** IPN: VNPay gọi thẳng vào sàn (qua tunnel khi chạy trên máy). Trả RspCode theo tài liệu VNPay */
  @Public()
  @Get('webhooks/vnpay/ipn')
  ipn(@Query() params: Record<string, string>): Promise<IpnReply> {
    return this.callbacks.ipn(params);
  }

  /** Cổng MÔ PHỎNG: thông tin lần thanh toán để trang giả hiện (chỉ khi chưa có khóa VNPay) */
  @Public()
  @Get('mock-gateway/payments/:ref')
  @ApiResponse({ status: 404, description: 'NOT_FOUND: không có hoặc đang dùng VNPay thật' })
  mockInfo(@Param('ref') ref: string) {
    return this.callbacks.mockInfo(ref);
  }

  /** Cổng MÔ PHỎNG: buyer chọn kết quả. Trả đường dẫn trang kết quả để web chuyển buyer về */
  @Public()
  @Post('mock-gateway/payments/:ref')
  @HttpCode(200)
  @ApiResponse({ status: 409, description: 'PAYMENT_DONE: lần này đã có kết quả' })
  mockComplete(
    @Param('ref') ref: string,
    @Body() dto: MockCompleteDto,
  ): Promise<{ returnUrl: string }> {
    return this.callbacks.mockComplete(ref, dto.result);
  }
}

/** Thanh toán của một đơn nhìn từ admin (PAY-04, REF-01) */
@ApiTags('Admin: thanh toán')
@ApiBearerAuth()
@RequirePermissions('SUPPORT', 'FINANCE')
@Controller('admin/orders')
export class AdminPaymentsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Các lần thanh toán, phân bổ tiền từng đơn con (buyer trả, phí sàn, seller nhận), các khoản hoàn */
  @Get(':orderId/payments')
  async detail(@Param('orderId', ParseIdPipe) orderId: string): Promise<{
    earnings: SellerEarning[];
    payments: Array<Omit<Payment, 'gatewayResponse' | 'requestKey'>>;
    refunds: Array<Omit<Refund, 'gatewayResponse'>>;
  }> {
    const earnings = await this.prisma.sellerEarning.findMany({
      where: { orderId },
      orderBy: { shopOrderCode: 'asc' },
    });
    if (earnings.length === 0) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy đơn.');
    const payments = await this.prisma.payment.findMany({
      where: { orderId },
      orderBy: { attempt: 'asc' },
      omit: { gatewayResponse: true, requestKey: true },
    });
    const refunds = await this.prisma.refund.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
      omit: { gatewayResponse: true },
    });
    return { earnings, payments, refunds };
  }
}
