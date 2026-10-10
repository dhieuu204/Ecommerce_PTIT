import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() || null : value;

export class ShopVoucherChoice {
  @IsUUID('all', { message: 'Shop không hợp lệ.' })
  shopId!: string;

  /** Mã voucher shop muốn áp; null = không dùng voucher cho shop này */
  @IsOptional()
  @Transform(upper)
  @IsString({ message: 'Mã voucher phải là chữ.' })
  @MaxLength(20, { message: 'Mã voucher dài tối đa 20 ký tự.' })
  code?: string | null;
}

export class PreviewCheckoutDto {
  /** Các dòng giỏ muốn mua (của chính người gọi) */
  @IsArray({ message: 'Chưa chọn sản phẩm nào.' })
  @ArrayMinSize(1, { message: 'Chưa chọn sản phẩm nào.' })
  @ArrayMaxSize(100, { message: 'Mỗi lần đặt tối đa 100 dòng hàng.' })
  @IsUUID('all', { each: true, message: 'Dòng giỏ không hợp lệ.' })
  itemIds!: string[];

  /** Địa chỉ trong sổ địa chỉ; bỏ trống = địa chỉ mặc định */
  @IsOptional()
  @IsUUID('all', { message: 'Địa chỉ không hợp lệ.' })
  addressId?: string;

  /**
   * Voucher shop đã chọn. Bỏ trống cả trường = tự chọn voucher giảm nhiều nhất cho từng shop;
   * shop không có trong danh sách cũng được tự chọn; `code: null` = không dùng.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ShopVoucherChoice)
  shopVouchers?: ShopVoucherChoice[];

  /** Mã voucher sàn. Bỏ trống trường = tự chọn voucher sàn giảm nhiều nhất; null = không dùng */
  @IsOptional()
  @Transform(upper)
  @IsString({ message: 'Mã voucher phải là chữ.' })
  @MaxLength(20, { message: 'Mã voucher dài tối đa 20 ký tự.' })
  platformVoucherCode?: string | null;
}

export class PlaceOrderDto {
  /** Mã phiên nhận từ bước xem trước */
  @IsUUID('all', { message: 'Mã phiên đặt hàng không hợp lệ.' })
  checkoutId!: string;
}
