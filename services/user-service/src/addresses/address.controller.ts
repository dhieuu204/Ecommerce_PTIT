import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ParseIdPipe, type AuthUser } from '@san/nest-common';
import { AddressService, type AddressView } from './address.service';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

/** Sổ địa chỉ của tôi (ACC-04) */
@ApiTags('Sổ địa chỉ')
@ApiBearerAuth()
@Controller('me/addresses')
export class AddressController {
  constructor(private readonly addresses: AddressService) {}

  /** Danh sách, địa chỉ mặc định lên đầu */
  @Get()
  list(@CurrentUser() user: AuthUser): Promise<AddressView[]> {
    return this.addresses.list(user.id);
  }

  /** Thêm địa chỉ (tối đa 10); địa chỉ đầu tiên tự thành mặc định */
  @Post()
  @ApiResponse({ status: 409, description: 'ADDRESS_LIMIT: đã đủ 10 địa chỉ' })
  @ApiResponse({
    status: 503,
    description: 'LOCATION_SERVICE_UNAVAILABLE: chưa kiểm được tỉnh/huyện/xã',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAddressDto): Promise<AddressView> {
    return this.addresses.create(user.id, dto);
  }

  @Patch(':addressId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('addressId', ParseIdPipe) addressId: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<AddressView> {
    return this.addresses.update(user.id, addressId, dto);
  }

  /** Xóa; xóa địa chỉ mặc định thì địa chỉ mới nhất còn lại thành mặc định */
  @Delete(':addressId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('addressId', ParseIdPipe) addressId: string,
  ): Promise<void> {
    return this.addresses.remove(user.id, addressId);
  }

  /** Đặt làm địa chỉ mặc định */
  @Post(':addressId/default')
  @HttpCode(204)
  setDefault(
    @CurrentUser() user: AuthUser,
    @Param('addressId', ParseIdPipe) addressId: string,
  ): Promise<void> {
    return this.addresses.setDefault(user.id, addressId);
  }
}
