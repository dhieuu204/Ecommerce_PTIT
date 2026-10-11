import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class PickupAddressDto {
  /** Mã tỉnh/thành (GET /locations/provinces) */
  @Type(() => Number)
  @IsInt({ message: 'Vui lòng chọn tỉnh/thành.' })
  @Min(1, { message: 'Vui lòng chọn tỉnh/thành.' })
  provinceId!: number;

  @Type(() => Number)
  @IsInt({ message: 'Vui lòng chọn quận/huyện.' })
  @Min(1, { message: 'Vui lòng chọn quận/huyện.' })
  districtId!: number;

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
}

export class BankAccountDto {
  /** Tên ngân hàng (web chọn từ danh sách cố định) */
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng chọn ngân hàng.' })
  @MaxLength(100)
  bankName!: string;

  /** Số tài khoản: 6 đến 20 chữ số */
  @Transform(trim)
  @Matches(/^\d{6,20}$/, { message: 'Số tài khoản gồm 6 đến 20 chữ số.' })
  accountNumber!: string;

  /** Tên chủ tài khoản (viết hoa, như trên thẻ) */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tên chủ tài khoản.' })
  @MaxLength(100, { message: 'Tên chủ tài khoản tối đa 100 ký tự.' })
  accountName!: string;
}

function ShopName(): PropertyDecorator {
  return (target, key) => {
    Transform(trim)(target, key);
    IsString()(target, key);
    Length(3, 80, { message: 'Tên shop từ 3 đến 80 ký tự.' })(target, key);
  };
}
function Phone(): PropertyDecorator {
  return (target, key) => {
    Transform(trim)(target, key);
    Matches(/^0\d{9}$/, { message: 'Số điện thoại gồm số 0 và 9 chữ số.' })(target, key);
  };
}
function Description(): PropertyDecorator {
  return (target, key) => {
    Transform(trim)(target, key);
    IsString()(target, key);
    IsNotEmpty({ message: 'Vui lòng nhập mô tả shop.' })(target, key);
    MaxLength(3000, { message: 'Mô tả tối đa 3000 ký tự.' })(target, key);
  };
}
function LogoUrl(): PropertyDecorator {
  return (target, key) => {
    IsUrl({ require_tld: false }, { message: 'Vui lòng tải logo shop.' })(target, key);
    MaxLength(255)(target, key);
  };
}

/** Hồ sơ mở shop (SHP-01). Bị từ chối thì sửa và nộp lại bằng chính API này. */
export class ShopApplicationDto {
  /** Tên shop, không trùng với shop khác */
  @ShopName()
  name!: string;

  @Description()
  description!: string;

  /** Đường dẫn trả về từ POST /uploads/shop-logo */
  @LogoUrl()
  logoUrl!: string;

  /** Số điện thoại shop: 0 + 9 số */
  @Phone()
  phone!: string;

  @ValidateNested()
  @Type(() => PickupAddressDto)
  pickupAddress!: PickupAddressDto;

  @ValidateNested()
  @Type(() => BankAccountDto)
  bankAccount!: BankAccountDto;
}

/** Sửa thông tin dùng ngay, không cần duyệt (SHP-03). Gửi mục muốn đổi. */
export class UpdateShopDto {
  @IsOptional()
  @Description()
  description?: string;

  @IsOptional()
  @LogoUrl()
  logoUrl?: string;

  @IsOptional()
  @Phone()
  phone?: string;

  @ApiPropertyOptional({ type: PickupAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PickupAddressDto)
  pickupAddress?: PickupAddressDto;

  /** Nhận thanh toán khi nhận hàng (COD-01) */
  @IsOptional()
  @IsBoolean({ message: 'Lựa chọn COD không hợp lệ.' })
  codEnabled?: boolean;
}

/** Đổi tên shop và/hoặc tài khoản ngân hàng: phải duyệt lại (SHP-03). Gửi ít nhất một mục. */
export class ChangeRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @ShopName()
  name?: string;

  @ApiPropertyOptional({ type: BankAccountDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BankAccountDto)
  bankAccount?: BankAccountDto;
}
