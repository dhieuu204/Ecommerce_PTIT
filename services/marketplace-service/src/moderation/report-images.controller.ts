import {
  Controller,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppError, CurrentUser, type AuthUser } from '@san/nest-common';
import { randomUUID } from 'node:crypto';
import { AppConfig } from '../config';
import { detectImageType } from '../uploads/image-type';
import { StorageService } from '../uploads/storage.service';

/**
 * Thư mục ảnh bằng chứng báo cáo vi phạm của một người, trong bucket riêng tư (P6, MOD-01).
 * approval-service kiểm khóa ảnh gửi kèm báo cáo nằm trong thư mục của chính người báo cáo.
 */
export const reportImagePrefix = (userId: string) => `report-images/${userId}/`;

/** Giới hạn cứng khi nhận file, lớn hơn mức cho phép để còn trả câu báo lỗi tiếng Việt */
const HARD_LIMIT_BYTES = 10 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const IMAGE_FILE = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const;

const imageNotFound = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy ảnh.');

/**
 * Ảnh bằng chứng báo cáo vi phạm (MOD-01): người mua tải lên trước khi gửi báo cáo ở approval-service;
 * chỉ người tải lên và admin kiểm duyệt xem được (bucket riêng tư, xem qua API có kiểm quyền).
 */
@ApiTags('Báo cáo vi phạm')
@ApiBearerAuth()
@Controller()
export class ReportImagesController {
  private readonly logger = new Logger(ReportImagesController.name);

  constructor(
    private readonly storage: StorageService,
    private readonly config: AppConfig,
  ) {}

  /** Tải ảnh bằng chứng: JPG/PNG/WebP, tối đa REPORT_IMAGE_MAX_MB. Trả khóa ảnh để gửi kèm báo cáo */
  @Post('uploads/report-image')
  @HttpCode(201)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiResponse({ status: 400, description: 'FILE_REQUIRED, INVALID_IMAGE hoặc FILE_TOO_LARGE' })
  @ApiResponse({ status: 503, description: 'STORAGE_UNAVAILABLE: chưa lưu được ảnh' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: HARD_LIMIT_BYTES, files: 1 } }))
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ key: string }> {
    if (!file) throw new AppError(400, 'FILE_REQUIRED', 'Vui lòng chọn ảnh.');
    const maxMb = this.config.reportImageMaxMb;
    if (file.size > maxMb * 1024 * 1024) {
      throw new AppError(400, 'FILE_TOO_LARGE', `Ảnh tối đa ${maxMb} MB.`);
    }
    const type = detectImageType(file.buffer);
    if (!type) throw new AppError(400, 'INVALID_IMAGE', 'Chỉ nhận ảnh JPG, PNG hoặc WebP.');
    const key = `${reportImagePrefix(user.id)}${randomUUID()}.${type.ext}`;
    try {
      await this.storage.putPrivate(key, file.buffer, type.mime);
    } catch (e) {
      this.logger.error(`Không lưu được ảnh vào MinIO: ${(e as Error).message}`);
      throw new AppError(503, 'STORAGE_UNAVAILABLE', 'Chưa lưu được ảnh, bạn thử lại sau ít phút.');
    }
    return { key };
  }

  /** Xem ảnh bằng chứng: người tải lên hoặc admin MODERATION; người khác → 404 */
  @Get('report-images/:ownerId/:file')
  @ApiResponse({ status: 404, description: 'NOT_FOUND: không có hoặc không được xem' })
  async image(
    @CurrentUser() user: AuthUser,
    @Param('ownerId') ownerId: string,
    @Param('file') file: string,
  ): Promise<StreamableFile> {
    if (!UUID.test(ownerId) || !IMAGE_FILE.test(file)) throw imageNotFound();
    if (ownerId !== user.id && !user.permissions.includes('MODERATION')) throw imageNotFound();
    const key = `${reportImagePrefix(ownerId)}${file}`;
    const ext = file.split('.').pop() as keyof typeof MIME;
    try {
      return new StreamableFile(await this.storage.getPrivate(key), { type: MIME[ext] });
    } catch (e) {
      this.logger.warn(`Không đọc được ảnh ${key}: ${(e as Error).message}`);
      throw imageNotFound();
    }
  }
}
