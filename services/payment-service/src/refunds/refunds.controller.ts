import {
  Body,
  Controller,
  Get,
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
import { ManualRefundDto, RefundsQuery } from '../payments/dto/payments.dto';
import { detectImageType } from './image-type';
import { ReceiptStorage } from './receipt-storage.service';
import { RefundsService, type RefundView } from './refunds.service';

const HARD_LIMIT_BYTES = 10 * 1024 * 1024;

/** Hoàn tiền cần admin tài chính xử lý (REF-01, STATE-02 R8–R9) */
@ApiTags('Admin: hoàn tiền')
@ApiBearerAuth()
@RequirePermissions('FINANCE')
@Controller('admin')
export class RefundsController {
  private readonly logger = new Logger(RefundsController.name);

  constructor(
    private readonly refunds: RefundsService,
    private readonly storage: ReceiptStorage,
    private readonly config: AppConfig,
  ) {}

  /** Danh sách khoản hoàn, mới nhất trước; lọc NEEDS_MANUAL để xem khoản cần hoàn tay */
  @Get('refunds')
  list(@Query() q: RefundsQuery): Promise<Page<RefundView>> {
    return this.refunds.list(q);
  }

  /** Tải ảnh biên lai chuyển khoản (JPG/PNG/WebP), lưu bucket riêng tư, trả mã ảnh */
  @Post('uploads/refund-receipt')
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
    const key = `refund-receipts/${admin.id}/${randomUUID()}.${type.ext}`;
    try {
      await this.storage.put(key, file.buffer, type.mime);
    } catch (e) {
      this.logger.error(`Không lưu được biên lai: ${(e as Error).message}`);
      throw new AppError(503, 'STORAGE_UNAVAILABLE', 'Chưa lưu được ảnh, bạn thử lại sau.');
    }
    return { key };
  }

  /** Xem ảnh biên lai của một khoản đã hoàn tay */
  @Get('refunds/:refundId/receipt')
  @ApiResponse({ status: 404, description: 'NOT_FOUND: chưa có biên lai' })
  async receipt(@Param('refundId', ParseIdPipe) id: string): Promise<StreamableFile> {
    const key = await this.refunds.receiptKey(id);
    const ext = key.split('.').pop();
    const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    return new StreamableFile(await this.storage.get(key), { type });
  }

  /** Đã chuyển khoản tay cho buyer: lưu mã giao dịch + biên lai, đóng khoản hoàn. Ghi nhật ký */
  @Post('refunds/:refundId/manual')
  @HttpCode(200)
  @ApiResponse({
    status: 409,
    description: 'REFUND_NOT_MANUAL: khoản không ở trạng thái chờ hoàn tay',
  })
  manual(
    @CurrentUser() admin: AuthUser,
    @Param('refundId', ParseIdPipe) id: string,
    @Body() dto: ManualRefundDto,
  ): Promise<RefundView> {
    return this.refunds.manual(admin, id, dto);
  }
}
