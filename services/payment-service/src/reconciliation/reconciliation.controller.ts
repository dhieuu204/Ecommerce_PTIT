import {
  Body,
  Controller,
  Get,
  HttpCode,
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
  PageQuery,
  ParseIdPipe,
  RequirePermissions,
  type AuthUser,
} from '@san/nest-common';
import type { Page } from '@san/shared';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import {
  COD_FILE_MAX_MB,
  CodReconciliationService,
  type ReconciliationDetail,
  type ReconciliationItemView,
  type ReconciliationView,
} from './cod-reconciliation.service';
import {
  VnpayReconciliationService,
  type VnpayPaymentException,
  type VnpayReconciliationView,
} from './vnpay-reconciliation.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export class ResolveCodItemDto {
  /** true: chấp nhận số GHN, coi tiền đã về; false: chỉ ghi chú */
  @IsBoolean({ message: 'Chọn chấp nhận hoặc chỉ ghi chú.' })
  accept!: boolean;

  @Transform(trim)
  @IsString({ message: 'Ghi chú phải là chữ.' })
  @IsNotEmpty({ message: 'Vui lòng nhập ghi chú xử lý.' })
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự.' })
  note!: string;
}

export class ReconcileNoteDto {
  @Transform(trim)
  @IsString({ message: 'Ghi chú phải là chữ.' })
  @IsNotEmpty({ message: 'Vui lòng nhập ghi chú xử lý.' })
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự.' })
  note!: string;
}

/** Đối soát COD với GHN và đối soát VNPay cho admin tài chính (COD-02, SHIP-05, PAY-05) */
@ApiTags('Admin: đối soát')
@ApiBearerAuth()
@RequirePermissions('FINANCE')
@Controller('admin')
export class ReconciliationController {
  constructor(
    private readonly cod: CodReconciliationService,
    private readonly vnpay: VnpayReconciliationService,
  ) {}

  // ----- COD -----

  /** Các lần nhập file đối soát COD, mới nhất trước */
  @Get('cod-reconciliations')
  list(@Query() q: PageQuery): Promise<Page<ReconciliationView>> {
    return this.cod.list(q);
  }

  /** Tải file Excel mẫu (các cột hệ thống đọc được) */
  @Get('cod-reconciliations/template')
  async template(): Promise<StreamableFile> {
    return new StreamableFile(await this.cod.template(), {
      type: XLSX,
      disposition: 'attachment; filename="mau-doi-soat-cod.xlsx"',
    });
  }

  /** File MÔ PHỎNG "GHN chuyển tiền" từ các đơn COD đã giao chưa đối soát */
  @Get('cod-reconciliations/simulated-file')
  async simulated(): Promise<StreamableFile> {
    return new StreamableFile(await this.cod.simulatedFile(), {
      type: XLSX,
      disposition: 'attachment; filename="MO-PHONG-ghn-chuyen-tien-cod.xlsx"',
    });
  }

  /** Nhập file đối soát COD (.xlsx hoặc .csv, tối đa 5 MB). Ghi nhật ký */
  @Post('cod-reconciliations')
  @HttpCode(201)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiResponse({
    status: 400,
    description: 'FILE_REQUIRED, FILE_TOO_LARGE, INVALID_RECONCILIATION_FILE',
  })
  @ApiResponse({ status: 409, description: 'FILE_ALREADY_IMPORTED: file này đã nhập' })
  @ApiResponse({ status: 503, description: 'STORAGE_UNAVAILABLE' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: (COD_FILE_MAX_MB + 1) * 1024 * 1024, files: 1 },
    }),
  )
  upload(
    @CurrentUser() admin: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ReconciliationDetail> {
    if (!file) throw new AppError(400, 'FILE_REQUIRED', 'Vui lòng chọn file đối soát.');
    return this.cod.upload(admin, file);
  }

  /** Các dòng của một lần đối soát: tiền COD theo GHN và theo sàn, phí ship, chênh lệch, kết quả */
  @Get('cod-reconciliations/:id')
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  detail(@Param('id', ParseIdPipe) id: string): Promise<ReconciliationDetail> {
    return this.cod.detail(id);
  }

  /** Xử lý dòng lệch: chấp nhận số GHN hoặc chỉ ghi chú. Ghi nhật ký */
  @Post('cod-reconciliations/items/:itemId/resolve')
  @HttpCode(200)
  @ApiResponse({
    status: 409,
    description: 'ITEM_NOT_MISMATCHED: dòng không lệch hoặc đã chấp nhận',
  })
  resolve(
    @CurrentUser() admin: AuthUser,
    @Param('itemId', ParseIdPipe) itemId: string,
    @Body() dto: ResolveCodItemDto,
  ): Promise<ReconciliationItemView> {
    return this.cod.resolve(admin, itemId, dto);
  }

  // ----- VNPay -----

  /** Các khoản cần xem: lệch, chưa rõ, tiền về muộn/trùng, khoản hoàn chưa rõ hoặc chờ hoàn tay */
  @Get('vnpay-reconciliation')
  vnpayView(): Promise<VnpayReconciliationView> {
    return this.vnpay.view();
  }

  /** Chạy ngay việc đối soát (bình thường chạy mỗi đêm lúc 2 giờ) */
  @Post('vnpay-reconciliation/run')
  @HttpCode(200)
  async vnpayRun(): Promise<VnpayReconciliationView & { checked: number; mismatched: number }> {
    const r = await this.vnpay.run();
    return { ...r, ...(await this.vnpay.view()) };
  }

  /** Ghi chú xử lý khoản lệch, đánh dấu đã xử lý. Ghi nhật ký */
  @Post('vnpay-reconciliation/payments/:paymentId/note')
  @HttpCode(200)
  @ApiResponse({ status: 409, description: 'NOT_RECONCILE_EXCEPTION: giao dịch không cần xử lý' })
  vnpayNote(
    @CurrentUser() admin: AuthUser,
    @Param('paymentId', ParseIdPipe) paymentId: string,
    @Body() dto: ReconcileNoteDto,
  ): Promise<VnpayPaymentException> {
    return this.vnpay.note(admin, paymentId, dto.note);
  }
}
