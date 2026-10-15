import { Controller, HttpCode, Logger, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppError, CurrentUser, type AuthUser } from '@san/nest-common';
import { randomUUID } from 'node:crypto';
import { AppConfig } from '../config';
import { PrismaService } from '../prisma.service';
import { requireSellerShop } from '../products/seller-shop';
import { detectImageType, type ImageType } from './image-type';
import { StorageService } from './storage.service';

/** Thư mục logo của một người trong bucket công khai; khi nộp hồ sơ shop kiểm logo nằm trong đây. */
export const shopLogoPrefix = (userId: string) => `shop-logos/${userId}/`;

/** Thư mục ảnh sản phẩm của một người; khi lưu sản phẩm kiểm mọi ảnh nằm trong đây (CAT-02). */
export const productImagePrefix = (userId: string) => `product-images/${userId}/`;

/** Thư mục ảnh bằng chứng trả hàng của một người, trong bucket riêng tư (P5: RET-01, DIS-01). */
export const returnImagePrefix = (userId: string) => `return-images/${userId}/`;

/** Giới hạn cứng khi nhận file, lớn hơn mức cho phép để còn trả câu báo lỗi tiếng Việt */
const HARD_LIMIT_BYTES = 10 * 1024 * 1024;

@ApiTags('Tải ảnh')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  private readonly logger = new Logger(UploadsController.name);

  constructor(
    private readonly storage: StorageService,
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
  ) {}

  /** Tải logo shop: JPG/PNG/WebP, tối đa 2 MB. Trả đường dẫn ảnh để gửi kèm hồ sơ shop (SHP-01) */
  @Post('shop-logo')
  @HttpCode(201)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiResponse({ status: 400, description: 'FILE_REQUIRED, INVALID_IMAGE hoặc FILE_TOO_LARGE' })
  @ApiResponse({ status: 503, description: 'STORAGE_UNAVAILABLE: chưa lưu được ảnh' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: HARD_LIMIT_BYTES, files: 1 } }))
  async shopLogo(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ url: string }> {
    return this.save(
      file,
      shopLogoPrefix(user.id),
      this.config.logoMaxMb,
      'Vui lòng chọn ảnh logo.',
    );
  }

  /**
   * Tải ảnh sản phẩm: JPG/PNG/WebP, tối đa 5 MB. Chỉ chủ shop đã được duyệt (kể cả đang bị đình chỉ).
   * Trả đường dẫn ảnh để gửi kèm khi lưu sản phẩm (CAT-02)
   */
  @Post('product-image')
  @HttpCode(201)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiResponse({ status: 400, description: 'FILE_REQUIRED, INVALID_IMAGE hoặc FILE_TOO_LARGE' })
  @ApiResponse({ status: 409, description: 'SHOP_NOT_ACTIVE: shop chưa được duyệt' })
  @ApiResponse({ status: 503, description: 'STORAGE_UNAVAILABLE: chưa lưu được ảnh' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: HARD_LIMIT_BYTES, files: 1 } }))
  async productImage(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ url: string }> {
    await requireSellerShop(this.prisma, user.id);
    return this.save(
      file,
      productImagePrefix(user.id),
      this.config.productImageMaxMb,
      'Vui lòng chọn ảnh sản phẩm.',
    );
  }

  /**
   * Tải ảnh bằng chứng trả hàng/khiếu nại (người mua hoặc shop): JPG/PNG/WebP, tối đa 5 MB. Lưu bucket
   * riêng tư, trả mã ảnh để gửi kèm yêu cầu; xem lại qua GET /return-images/{mã} (có kiểm quyền)
   */
  @Post('return-image')
  @HttpCode(201)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiResponse({ status: 400, description: 'FILE_REQUIRED, INVALID_IMAGE hoặc FILE_TOO_LARGE' })
  @ApiResponse({ status: 503, description: 'STORAGE_UNAVAILABLE: chưa lưu được ảnh' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: HARD_LIMIT_BYTES, files: 1 } }))
  async returnImage(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ key: string }> {
    const type = this.check(file, this.config.returnImageMaxMb, 'Vui lòng chọn ảnh.');
    const key = `${returnImagePrefix(user.id)}${randomUUID()}.${type.ext}`;
    try {
      await this.storage.putPrivate(key, file!.buffer, type.mime);
    } catch (e) {
      this.logger.error(`Không lưu được ảnh vào MinIO: ${(e as Error).message}`);
      throw new AppError(503, 'STORAGE_UNAVAILABLE', 'Chưa lưu được ảnh, bạn thử lại sau ít phút.');
    }
    return { key };
  }

  /** Kiểm loại và cỡ ảnh rồi lưu vào thư mục `prefix` trong bucket công khai */
  private async save(
    file: Express.Multer.File | undefined,
    prefix: string,
    maxMb: number,
    requiredMessage: string,
  ): Promise<{ url: string }> {
    const type = this.check(file, maxMb, requiredMessage);
    const key = `${prefix}${randomUUID()}.${type.ext}`;
    try {
      return { url: await this.storage.putPublic(key, file!.buffer, type.mime) };
    } catch (e) {
      this.logger.error(`Không lưu được ảnh vào MinIO: ${(e as Error).message}`);
      throw new AppError(503, 'STORAGE_UNAVAILABLE', 'Chưa lưu được ảnh, bạn thử lại sau ít phút.');
    }
  }

  /** Có file, đúng cỡ, đúng loại ảnh (nhận diện theo nội dung) */
  private check(
    file: Express.Multer.File | undefined,
    maxMb: number,
    requiredMessage: string,
  ): ImageType {
    if (!file) throw new AppError(400, 'FILE_REQUIRED', requiredMessage);
    if (file.size > maxMb * 1024 * 1024) {
      throw new AppError(400, 'FILE_TOO_LARGE', `Ảnh tối đa ${maxMb} MB.`);
    }
    const type = detectImageType(file.buffer);
    if (!type) throw new AppError(400, 'INVALID_IMAGE', 'Chỉ nhận ảnh JPG, PNG hoặc WebP.');
    return type;
  }
}
