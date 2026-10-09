import { OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { PHONE_PATTERN } from '../../me/dto/me.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Thêm địa chỉ (ACC-04). Mã tỉnh/huyện/xã lấy từ API /locations của marketplace-service. */
export class CreateAddressDto {
  /** Tên người nhận */
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tên người nhận.' })
  @MaxLength(100, { message: 'Tên người nhận tối đa 100 ký tự.' })
  receiverName!: string;

  /** 0 + 9 số */
  @Transform(trim)
  @Matches(PHONE_PATTERN, { message: 'Số điện thoại gồm số 0 và 9 chữ số.' })
  phone!: string;

  /** Mã tỉnh/thành theo GHN */
  @Type(() => Number)
  @IsInt({ message: 'Vui lòng chọn tỉnh/thành.' })
  @Min(1, { message: 'Vui lòng chọn tỉnh/thành.' })
  provinceId!: number;

  /** Mã quận/huyện theo GHN */
  @Type(() => Number)
  @IsInt({ message: 'Vui lòng chọn quận/huyện.' })
  @Min(1, { message: 'Vui lòng chọn quận/huyện.' })
  districtId!: number;

  /** Mã phường/xã theo GHN */
  @Transform(trim)
  @IsString({ message: 'Vui lòng chọn phường/xã.' })
  @IsNotEmpty({ message: 'Vui lòng chọn phường/xã.' })
  @MaxLength(20)
  wardCode!: string;

  /** Số nhà, tên đường */
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập số nhà, tên đường.' })
  @MaxLength(200, { message: 'Địa chỉ tối đa 200 ký tự.' })
  street!: string;

  /** Đặt làm mặc định. Địa chỉ đầu tiên luôn là mặc định */
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

/** Sửa địa chỉ: gửi trường muốn đổi. Đổi tỉnh/huyện/xã thì gửi đủ cả 3 mã. Đặt mặc định dùng API riêng. */
export class UpdateAddressDto extends PartialType(
  OmitType(CreateAddressDto, ['isDefault'] as const),
) {}
