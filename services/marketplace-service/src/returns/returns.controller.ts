import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  AppError,
  CurrentUser,
  ParseIdPipe,
  RequirePermissions,
  type AuthUser,
} from '@san/nest-common';
import type { Page } from '@san/shared';
import { StorageService } from '../uploads/storage.service';
import {
  AcceptReturnDto,
  CreateReturnDto,
  DisputeReturnDto,
  InspectReturnDto,
  LostReturnDto,
  RejectReturnDto,
  ResolveFailedShipmentDto,
  ReturnsQuery,
} from './dto/returns.dto';
import { ReturnsService, type ReturnView, type SellerReturnPage } from './returns.service';

const notFound = ApiResponse({
  status: 404,
  description: 'NOT_FOUND: không có hoặc không phải của bạn',
});

/** Trả hàng của người mua (RET-01, DIS-01) */
@ApiTags('Trả hàng của tôi')
@ApiBearerAuth()
@Controller()
export class BuyerReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  /**
   * Gửi yêu cầu trả hàng cho một đơn con đã giao, còn hạn. Header Idempotency-Key bắt buộc; gửi lại cùng
   * mã thì trả lại yêu cầu đã tạo
   */
  @Post('orders/:orderId/shop-orders/:shopOrderId/returns')
  @HttpCode(201)
  @ApiResponse({
    status: 400,
    description: 'IDEMPOTENCY_KEY_REQUIRED, VALIDATION_ERROR, INVALID_IMAGE_KEY',
  })
  @ApiResponse({
    status: 409,
    description:
      'ORDER_NOT_DELIVERED; RETURN_WINDOW_CLOSED: hết hạn; RETURN_EXISTS: đơn đã có yêu cầu; IDEMPOTENCY_KEY_REUSED',
  })
  @notFound
  create(
    @CurrentUser() user: AuthUser,
    @Param('orderId', ParseIdPipe) orderId: string,
    @Param('shopOrderId', ParseIdPipe) shopOrderId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateReturnDto,
  ): Promise<ReturnView> {
    return this.returns.create(user, orderId, shopOrderId, dto, key);
  }

  /** Yêu cầu trả hàng của tôi, mới nhất trước */
  @Get('returns')
  list(@CurrentUser() user: AuthUser, @Query() q: ReturnsQuery): Promise<Page<ReturnView>> {
    return this.returns.buyerList(user, q);
  }

  /** Chi tiết: món trả, tiền hoàn, lời shop, vận đơn trả, các bước đã qua */
  @Get('returns/:returnId')
  @notFound
  detail(
    @CurrentUser() user: AuthUser,
    @Param('returnId', ParseIdPipe) id: string,
  ): Promise<ReturnView> {
    return this.returns.buyerDetail(user.id, id);
  }

  /** Hủy yêu cầu: khi shop chưa trả lời, hoặc khi GHN chưa lấy hàng trả */
  @Post('returns/:returnId/cancel')
  @HttpCode(200)
  @ApiResponse({
    status: 409,
    description: 'RETURN_NOT_CANCELLABLE; ALREADY_PICKED_UP: GHN đã lấy hàng trả',
  })
  @notFound
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('returnId', ParseIdPipe) id: string,
  ): Promise<ReturnView> {
    return this.returns.buyerCancel(user, id);
  }

  /** Khiếu nại khi shop từ chối (còn hạn): admin hỗ trợ phân xử */
  @Post('returns/:returnId/dispute')
  @HttpCode(200)
  @ApiResponse({ status: 409, description: 'RETURN_NOT_DISPUTABLE: không ở trạng thái/hết hạn' })
  @notFound
  dispute(
    @CurrentUser() user: AuthUser,
    @Param('returnId', ParseIdPipe) id: string,
    @Body() dto: DisputeReturnDto,
  ): Promise<ReturnView> {
    return this.returns.buyerDispute(user, id, dto);
  }

  /** Tạo lại vận đơn trả khi GHN đã từ chối lần trước */
  @Post('returns/:returnId/shipment/retry')
  @HttpCode(200)
  @ApiResponse({ status: 409, description: 'SHIPMENT_NOT_RETRYABLE' })
  @notFound
  retryShipment(
    @CurrentUser() user: AuthUser,
    @Param('returnId', ParseIdPipe) id: string,
  ): Promise<ReturnView> {
    return this.returns.buyerRetryShipment(user, id);
  }
}

/** Trả hàng trong Kênh người bán (RET-02, RET-03) */
@ApiTags('Kênh người bán: trả hàng')
@ApiBearerAuth()
@Controller('shops/me/returns')
export class SellerReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  /** Yêu cầu trả hàng của shop, kèm số yêu cầu theo từng trạng thái */
  @Get()
  @ApiResponse({ status: 409, description: 'SHOP_NOT_ACTIVE: shop chưa được duyệt' })
  list(@CurrentUser() user: AuthUser, @Query() q: ReturnsQuery): Promise<SellerReturnPage> {
    return this.returns.sellerList(user, q);
  }

  @Get(':returnId')
  @notFound
  detail(
    @CurrentUser() user: AuthUser,
    @Param('returnId', ParseIdPipe) id: string,
  ): Promise<ReturnView> {
    return this.returns.sellerDetail(user, id);
  }

  /** Chấp nhận: người mua gửi hàng về qua GHN (MÔ PHỎNG khi chưa có token), hoặc hoàn tiền ngay */
  @Post(':returnId/accept')
  @HttpCode(200)
  @ApiResponse({ status: 409, description: 'RETURN_NOT_PENDING: không còn chờ shop trả lời' })
  @notFound
  accept(
    @CurrentUser() user: AuthUser,
    @Param('returnId', ParseIdPipe) id: string,
    @Body() dto: AcceptReturnDto,
  ): Promise<ReturnView> {
    return this.returns.sellerAccept(user, id, dto);
  }

  /** Từ chối có lý do: người mua khiếu nại được trong hạn */
  @Post(':returnId/reject')
  @HttpCode(200)
  @ApiResponse({ status: 409, description: 'RETURN_NOT_PENDING' })
  @notFound
  reject(
    @CurrentUser() user: AuthUser,
    @Param('returnId', ParseIdPipe) id: string,
    @Body() dto: RejectReturnDto,
  ): Promise<ReturnView> {
    return this.returns.sellerReject(user, id, dto);
  }

  /** Kiểm hàng trả: chọn dòng nhập lại kho; hàng đúng → hoàn tiền, không đúng → khiếu nại */
  @Post(':returnId/inspect')
  @HttpCode(200)
  @ApiResponse({ status: 409, description: 'RETURN_NOT_RECEIVED: hàng chưa về hoặc đã kiểm' })
  @notFound
  inspect(
    @CurrentUser() user: AuthUser,
    @Param('returnId', ParseIdPipe) id: string,
    @Body() dto: InspectReturnDto,
  ): Promise<ReturnView> {
    return this.returns.sellerInspect(user, id, dto);
  }
}

/** Tra cứu yêu cầu trả hàng cho admin hỗ trợ (RET-01..04) */
@ApiTags('Admin: trả hàng')
@ApiBearerAuth()
@RequirePermissions('SUPPORT')
@Controller('admin/returns')
export class AdminReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  list(@Query() q: ReturnsQuery): Promise<Page<ReturnView>> {
    return this.returns.adminList(q);
  }

  @Get(':returnId')
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  detail(@Param('returnId', ParseIdPipe) id: string): Promise<ReturnView> {
    return this.returns.adminDetail(id);
  }

  /** Xác nhận kiện trả bị GHN làm thất lạc: người mua được hoàn đủ, seller không bị trừ. Ghi nhật ký */
  @Post(':returnId/lost')
  @HttpCode(200)
  @ApiResponse({ status: 409, description: 'RETURN_SHIPMENT_NOT_LOST' })
  lost(
    @CurrentUser() admin: AuthUser,
    @Param('returnId', ParseIdPipe) id: string,
    @Body() dto: LostReturnDto,
  ): Promise<ReturnView> {
    return this.returns.adminConfirmLost(admin, id, dto.note);
  }

  /**
   * Vận đơn trả bị GHN từ chối, người mua không tạo lại và đã quá hạn giao hàng trả: hủy yêu cầu
   * (CANCEL) hoặc hoàn tiền không cần gửi trả (REFUND). Ghi nhật ký
   */
  @Post(':returnId/failed-shipment')
  @HttpCode(200)
  @ApiResponse({ status: 409, description: 'RETURN_SHIPMENT_NOT_STUCK' })
  resolveFailedShipment(
    @CurrentUser() admin: AuthUser,
    @Param('returnId', ParseIdPipe) id: string,
    @Body() dto: ResolveFailedShipmentDto,
  ): Promise<ReturnView> {
    return this.returns.adminResolveFailedShipment(admin, id, dto);
  }
}

/** Xem ảnh bằng chứng trả hàng (bucket riêng tư): người mua, chủ shop của yêu cầu, admin hỗ trợ */
@ApiTags('Trả hàng của tôi')
@ApiBearerAuth()
@Controller('return-images')
export class ReturnImagesController {
  private readonly logger = new Logger(ReturnImagesController.name);

  constructor(
    private readonly returns: ReturnsService,
    private readonly storage: StorageService,
  ) {}

  @Get(':ownerId/:file')
  @ApiResponse({ status: 404, description: 'NOT_FOUND: không có hoặc không được xem' })
  async image(
    @CurrentUser() user: AuthUser,
    @Param('ownerId') ownerId: string,
    @Param('file') file: string,
  ): Promise<StreamableFile> {
    const key = await this.returns.imageKey(user, ownerId, file);
    const ext = key.split('.').pop();
    const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    try {
      return new StreamableFile(await this.storage.getPrivate(key), { type });
    } catch (e) {
      this.logger.warn(`Không đọc được ảnh ${key}: ${(e as Error).message}`);
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy ảnh.');
    }
  }
}
