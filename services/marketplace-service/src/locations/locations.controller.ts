import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '@san/nest-common';
import { LocationsService, type Place, type WardPlace } from './locations.service';

/** Tỉnh/huyện/xã theo mã GHN, cho ô chọn địa chỉ (SHP-03, ACC-04). Không cần đăng nhập. */
@ApiTags('Địa giới hành chính')
@Public()
@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  /** Tỉnh/thành, sắp theo tên */
  @Get('provinces')
  @Header('Cache-Control', 'public, max-age=3600')
  provinces(): Promise<Place[]> {
    return this.locations.provinces();
  }

  /** Quận/huyện của một tỉnh (mã tỉnh lạ: mảng rỗng) */
  @Get('provinces/:provinceId/districts')
  @Header('Cache-Control', 'public, max-age=3600')
  districts(@Param('provinceId') provinceId: string): Promise<Place[]> {
    return this.locations.districts(Number(provinceId));
  }

  /** Phường/xã của một quận/huyện */
  @Get('districts/:districtId/wards')
  @Header('Cache-Control', 'public, max-age=3600')
  wards(@Param('districtId') districtId: string): Promise<WardPlace[]> {
    return this.locations.wards(Number(districtId));
  }
}
