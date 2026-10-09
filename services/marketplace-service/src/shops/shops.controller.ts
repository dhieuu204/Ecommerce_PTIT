import { Body, Controller, Get, Headers, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppError, CurrentUser, type AuthUser } from '@san/nest-common';
import { ChangeRequestDto, ShopApplicationDto, UpdateShopDto } from './dto/shop.dto';
import { ShopsService, type MyShop } from './shops.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Header Idempotency-Key bắt buộc: web sinh UUID mới mỗi lần bấm nút gửi */
function requireKey(key: string | undefined): string {
  if (!key || !UUID.test(key)) {
    throw new AppError(
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
      'Thiếu mã chống gửi lặp (Idempotency-Key).',
    );
  }
  return key.toLowerCase();
}

const idempotencyHeader = ApiHeader({
  name: 'Idempotency-Key',
  required: true,
  description: 'UUID do web sinh mỗi lần bấm nút; gửi lại cùng mã thì trả kết quả cũ',
});

/** Shop của tôi: mở shop, sửa thông tin, yêu cầu đổi tên/tài khoản ngân hàng (SHP-01, SHP-03) */
@ApiTags('Shop của tôi')
@ApiBearerAuth()
@Controller('shops/me')
export class ShopsController {
  constructor(private readonly shops: ShopsService) {}

  /** Trạng thái shop (NONE, PENDING, REJECTED, ACTIVE), thông tin đang dùng, hồ sơ và yêu cầu đổi mới nhất */
  @Get()
  get(@CurrentUser() user: AuthUser): Promise<MyShop> {
    return this.shops.myShop(user.id);
  }

  /** Nộp hồ sơ mở shop, hoặc nộp lại sau khi bị từ chối (SHP-01) */
  @Post('applications')
  @HttpCode(201)
  @idempotencyHeader
  @ApiResponse({ status: 409, description: 'SHOP_ALREADY_ACTIVE hoặc SHOP_NAME_TAKEN' })
  submit(
    @CurrentUser() user: AuthUser,
    @Body() dto: ShopApplicationDto,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<MyShop> {
    return this.shops.submitApplication(user, dto, requireKey(key));
  }

  /** Sửa mô tả, logo, SĐT, địa chỉ lấy hàng: dùng ngay (SHP-03) */
  @Patch()
  @ApiResponse({ status: 409, description: 'SHOP_NOT_ACTIVE' })
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateShopDto): Promise<MyShop> {
    return this.shops.update(user, dto);
  }

  /** Yêu cầu đổi tên shop và/hoặc tài khoản ngân hàng: admin duyệt lại (SHP-03) */
  @Post('change-requests')
  @HttpCode(201)
  @idempotencyHeader
  @ApiResponse({
    status: 400,
    description: 'NOTHING_TO_CHANGE: không có gì khác thông tin hiện tại',
  })
  @ApiResponse({ status: 409, description: 'SHOP_NOT_ACTIVE hoặc SHOP_NAME_TAKEN' })
  requestChange(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangeRequestDto,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<MyShop> {
    return this.shops.requestChange(user, dto, requireKey(key));
  }
}
