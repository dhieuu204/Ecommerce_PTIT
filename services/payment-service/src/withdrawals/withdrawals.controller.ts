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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  AppError,
  CurrentUser,
  ParseIdPipe,
  RequirePermissions,
  type AuthUser,
} from '@san/nest-common';
import type { Page } from '@san/shared';
import { randomUUID } from 'node:crypto';
import { AppConfig } from '../config';
import { detectImageType } from '../refunds/image-type';
import { ReceiptStorage } from '../refunds/receipt-storage.service';
import {
  CreateWithdrawalDto,
  PayoutDto,
  PayoutFailedDto,
  WithdrawalsQuery,
} from './dto/withdrawals.dto';
import {
  WithdrawalsService,
  type AdminWithdrawalPage,
  type WithdrawalDetailView,
  type WithdrawalView,
} from './withdrawals.service';

const HARD_LIMIT_BYTES = 10 * 1024 * 1024;

/** Rút tiền của seller (FIN-04) */
@ApiTags('Ví seller')
@ApiBearerAuth()
@Controller('shops/me/withdrawals')
export class SellerWithdrawalsController {
  constructor(private readonly withdrawals: WithdrawalsService) {}

  /** Lịch sử yêu cầu rút, mới nhất trước */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: WithdrawalsQuery): Promise<Page<WithdrawalView>> {
    return this.withdrawals.sellerList(user, q);
  }

  /**
   * Gửi yêu cầu rút: khóa số tiền (khả dụng → đang khóa), chờ admin tài chính duyệt. Header
   * Idempotency-Key bắt buộc. Tài khoản nhận lấy từ hồ sơ shop
   */
  @Post()
  @HttpCode(201)
  @ApiResponse({
    status: 400,
    description: 'IDEMPOTENCY_KEY_REQUIRED, VALIDATION_ERROR (dưới mức tối thiểu)',
  })
  @ApiResponse({
    status: 409,
    description:
      'WITHDRAWAL_IN_PROGRESS: đang có yêu cầu chưa xong; INSUFFICIENT_BALANCE (details.available); ' +
      'SHOP_NOT_ACTIVE; BANK_ACCOUNT_MISSING; IDEMPOTENCY_KEY_REUSED',
  })
  @ApiResponse({ status: 503, description: 'MARKETPLACE_SERVICE_UNAVAILABLE' })
  create(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateWithdrawalDto,
  ): Promise<WithdrawalView> {
    return this.withdrawals.request(user, authorization, dto.amount, key);
  }

  /** Hủy khi chưa duyệt: mở khóa tiền */
  @Post(':withdrawalId/cancel')
  @HttpCode(200)
  @ApiResponse({ status: 409, description: 'WITHDRAWAL_NOT_CANCELLABLE' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('withdrawalId', ParseIdPipe) id: string,
  ): Promise<WithdrawalView> {
    return this.withdrawals.cancel(user, id);
  }
}

/** Chi trả rút tiền cho admin tài chính (FIN-06): chuyển khoản ngoài hệ thống, nhập chứng từ */
@ApiTags('Admin: rút tiền')
@ApiBearerAuth()
@RequirePermissions('FINANCE')
@Controller('admin')
export class AdminWithdrawalsController {
  private readonly logger = new Logger(AdminWithdrawalsController.name);

  constructor(
    private readonly withdrawals: WithdrawalsService,
    private readonly storage: ReceiptStorage,
    private readonly config: AppConfig,
  ) {}

  /** Yêu cầu rút theo trạng thái và thời gian, kèm tổng tiền (đối soát chi trả) */
  @Get('withdrawals')
  list(@Query() q: WithdrawalsQuery): Promise<AdminWithdrawalPage> {
    return this.withdrawals.adminList(q);
  }

  /** Yêu cầu (tài khoản nhận đầy đủ), ví hiện tại và biến động gần nhất của shop */
  @Get('withdrawals/:withdrawalId')
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  detail(@Param('withdrawalId', ParseIdPipe) id: string): Promise<WithdrawalDetailView> {
    return this.withdrawals.adminDetail(id);
  }

  /** Tải ảnh biên lai chuyển khoản cho seller (JPG/PNG/WebP), lưu bucket riêng tư, trả mã ảnh */
  @Post('uploads/payout-receipt')
  @HttpCode(201)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiResponse({ status: 400, description: 'FILE_REQUIRED, INVALID_IMAGE hoặc FILE_TOO_LARGE' })
  @ApiResponse({ status: 503, description: 'STORAGE_UNAVAILABLE' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: HARD_LIMIT_BYTES, files: 1 } }))
  async upload(
    @CurrentUser() admin: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ key: string }> {
    if (!file) throw new AppError(400, 'FILE_REQUIRED', 'Vui lòng chọn ảnh biên lai.');
    if (file.size > this.config.receiptMaxMb * 1024 * 1024) {
      throw new AppError(400, 'FILE_TOO_LARGE', `Ảnh tối đa ${this.config.receiptMaxMb} MB.`);
    }
    const type = detectImageType(file.buffer);
    if (!type) throw new AppError(400, 'INVALID_IMAGE', 'Chỉ nhận ảnh JPG, PNG hoặc WebP.');
    const key = `payout-receipts/${admin.id}/${randomUUID()}.${type.ext}`;
    try {
      await this.storage.put(key, file.buffer, type.mime);
    } catch (e) {
      this.logger.error(`Không lưu được biên lai: ${(e as Error).message}`);
      throw new AppError(503, 'STORAGE_UNAVAILABLE', 'Chưa lưu được ảnh, bạn thử lại sau.');
    }
    return { key };
  }

  /** Xem ảnh biên lai chi trả */
  @Get('withdrawals/:withdrawalId/receipt')
  @ApiResponse({ status: 404, description: 'NOT_FOUND: chưa có biên lai' })
  async receipt(@Param('withdrawalId', ParseIdPipe) id: string): Promise<StreamableFile> {
    const key = await this.withdrawals.receiptKey(id);
    const ext = key.split('.').pop();
    const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    return new StreamableFile(await this.storage.get(key), { type });
  }

  /** Đã chuyển khoản: nhập mã giao dịch + biên lai → "đã chi". Ghi nhật ký */
  @Post('withdrawals/:withdrawalId/paid')
  @HttpCode(200)
  @ApiResponse({ status: 403, description: 'SELF_PAYOUT_FORBIDDEN: admin là chủ shop' })
  @ApiResponse({ status: 409, description: 'WITHDRAWAL_NOT_APPROVED' })
  paid(
    @CurrentUser() admin: AuthUser,
    @Param('withdrawalId', ParseIdPipe) id: string,
    @Body() dto: PayoutDto,
  ): Promise<WithdrawalDetailView> {
    return this.withdrawals.paid(admin, id, dto);
  }

  /** Chuyển khoản không thành công: mở khóa tiền cho seller. Ghi nhật ký */
  @Post('withdrawals/:withdrawalId/failed')
  @HttpCode(200)
  @ApiResponse({ status: 403, description: 'SELF_PAYOUT_FORBIDDEN' })
  @ApiResponse({ status: 409, description: 'WITHDRAWAL_NOT_APPROVED' })
  failed(
    @CurrentUser() admin: AuthUser,
    @Param('withdrawalId', ParseIdPipe) id: string,
    @Body() dto: PayoutFailedDto,
  ): Promise<WithdrawalDetailView> {
    return this.withdrawals.failed(admin, id, dto.reason);
  }
}
