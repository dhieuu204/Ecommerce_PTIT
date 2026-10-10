import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  ParseIdPipe,
  Public,
  RequirePermissions,
  type AuthUser,
} from '@san/nest-common';
import type { Page } from '@san/shared';
import { ListVouchersQuery, VoucherDto } from './dto/voucher.dto';
import { VouchersService, type VoucherView } from './vouchers.service';

const createErrors = ApiResponse({
  status: 409,
  description: 'VOUCHER_CODE_TAKEN: mã đã có trên sàn',
});
const updateErrors = ApiResponse({
  status: 409,
  description:
    'VOUCHER_STARTED: voucher đang chạy, chỉ lùi giờ kết thúc và tăng số lượt; ' +
    'VOUCHER_ENDED: voucher đã kết thúc; VOUCHER_CODE_TAKEN: mã đã có trên sàn',
});
const endErrors = ApiResponse({ status: 409, description: 'VOUCHER_ENDED: voucher đã kết thúc' });
const deleteErrors = ApiResponse({
  status: 409,
  description: 'VOUCHER_STARTED: voucher đang chạy; VOUCHER_ENDED: voucher đã kết thúc',
});
const notFound = ApiResponse({ status: 404, description: 'NOT_FOUND: không có voucher này' });

/** Voucher của shop mình (VCH-01). Shop đang hoạt động hoặc bị đình chỉ đều quản lý được */
@ApiTags('Voucher shop')
@ApiBearerAuth()
@ApiResponse({ status: 409, description: 'SHOP_NOT_ACTIVE: chưa có shop được duyệt' })
@Controller('shops/me/vouchers')
export class SellerVouchersController {
  constructor(private readonly vouchers: VouchersService) {}

  /** Danh sách voucher của shop, mới tạo trước; lọc theo trạng thái */
  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query() q: ListVouchersQuery,
  ): Promise<Page<VoucherView>> {
    return this.vouchers.list(await this.vouchers.sellerShopId(user.id), q);
  }

  /** Tạo voucher shop (shop chịu tiền giảm) */
  @Post()
  @HttpCode(201)
  @createErrors
  async create(@CurrentUser() user: AuthUser, @Body() dto: VoucherDto): Promise<VoucherView> {
    return this.vouchers.create(await this.scope(user), dto);
  }

  /** Sửa voucher (gửi lại đầy đủ) */
  @Put(':voucherId')
  @notFound
  @updateErrors
  async update(
    @CurrentUser() user: AuthUser,
    @Param('voucherId', ParseIdPipe) voucherId: string,
    @Body() dto: VoucherDto,
  ): Promise<VoucherView> {
    return this.vouchers.update(await this.scope(user), voucherId, dto);
  }

  /** Kết thúc sớm */
  @Post(':voucherId/end')
  @HttpCode(200)
  @notFound
  @endErrors
  async end(
    @CurrentUser() user: AuthUser,
    @Param('voucherId', ParseIdPipe) voucherId: string,
  ): Promise<VoucherView> {
    return this.vouchers.end(await this.scope(user), voucherId);
  }

  /** Xóa voucher chưa bắt đầu */
  @Delete(':voucherId')
  @HttpCode(204)
  @notFound
  @deleteErrors
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('voucherId', ParseIdPipe) voucherId: string,
  ): Promise<void> {
    await this.vouchers.remove(await this.scope(user), voucherId);
  }

  private async scope(user: AuthUser) {
    return { shopId: await this.vouchers.sellerShopId(user.id), actor: user };
  }
}

/** Voucher sàn (VCH-01): sàn chịu tiền giảm. Admin có bộ quyền FINANCE; mọi thay đổi ghi nhật ký */
@ApiTags('Admin: voucher sàn')
@ApiBearerAuth()
@RequirePermissions('FINANCE')
@Controller('admin/vouchers')
export class AdminVouchersController {
  constructor(private readonly vouchers: VouchersService) {}

  /** Danh sách voucher sàn, mới tạo trước; lọc theo trạng thái */
  @Get()
  list(@Query() q: ListVouchersQuery): Promise<Page<VoucherView>> {
    return this.vouchers.list(null, q);
  }

  @Post()
  @HttpCode(201)
  @createErrors
  create(@CurrentUser() admin: AuthUser, @Body() dto: VoucherDto): Promise<VoucherView> {
    return this.vouchers.create({ shopId: null, actor: admin }, dto);
  }

  @Put(':voucherId')
  @notFound
  @updateErrors
  update(
    @CurrentUser() admin: AuthUser,
    @Param('voucherId', ParseIdPipe) voucherId: string,
    @Body() dto: VoucherDto,
  ): Promise<VoucherView> {
    return this.vouchers.update({ shopId: null, actor: admin }, voucherId, dto);
  }

  @Post(':voucherId/end')
  @HttpCode(200)
  @notFound
  @endErrors
  end(
    @CurrentUser() admin: AuthUser,
    @Param('voucherId', ParseIdPipe) voucherId: string,
  ): Promise<VoucherView> {
    return this.vouchers.end({ shopId: null, actor: admin }, voucherId);
  }

  @Delete(':voucherId')
  @HttpCode(204)
  @notFound
  @deleteErrors
  async remove(
    @CurrentUser() admin: AuthUser,
    @Param('voucherId', ParseIdPipe) voucherId: string,
  ): Promise<void> {
    await this.vouchers.remove({ shopId: null, actor: admin }, voucherId);
  }
}

/** Voucher công khai của một shop (trang shop, trang sản phẩm). Không cần đăng nhập */
@ApiTags('Voucher shop')
@Controller('shops')
export class ShopVouchersController {
  constructor(private readonly vouchers: VouchersService) {}

  /** Voucher đang chạy và còn lượt của shop đang hoạt động (shop bị đình chỉ: mảng rỗng) */
  @Public()
  @Get(':shopId/vouchers')
  @ApiResponse({ status: 404, description: 'NOT_FOUND: không có shop hoặc shop chưa được duyệt' })
  list(@Param('shopId', ParseIdPipe) shopId: string): Promise<VoucherView[]> {
    return this.vouchers.publicList(shopId);
  }
}
