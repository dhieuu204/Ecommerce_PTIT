import { ApiPropertyOptional } from '@nestjs/swagger';
import { PageQuery } from '@san/nest-common';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { BankAccountDto } from '../../shops/dto/shop.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const RETURN_REASONS = [
  'DEFECTIVE',
  'DAMAGED',
  'WRONG_ITEM',
  'MISSING',
  'NOT_AS_DESCRIBED',
  'COUNTERFEIT',
] as const;

export const RETURN_STATUSES = [
  'REQUESTED',
  'REJECTED',
  'DISPUTED',
  'SHIPPING_BACK',
  'RECEIVED',
  'REFUNDING',
  'REFUNDED',
  'CLOSED',
  'CANCELLED',
] as const;

/** Danh sách khóa ảnh bằng chứng (đã tải lên qua POST /uploads/return-image); số ảnh tối đa kiểm ở service */
function ImageKeys(required: boolean): PropertyDecorator {
  return (target, key) => {
    if (!required) IsOptional()(target, key);
    IsArray({ message: 'Danh sách ảnh không hợp lệ.' })(target, key);
    if (required)
      ArrayMinSize(1, { message: 'Vui lòng tải ít nhất 1 ảnh bằng chứng.' })(target, key);
    ArrayMaxSize(20)(target, key);
    IsString({ each: true, message: 'Ảnh không hợp lệ.' })(target, key);
    MaxLength(200, { each: true })(target, key);
  };
}

export class ReturnItemDto {
  /** Dòng hàng trong đơn con */
  @IsUUID('all', { message: 'Dòng hàng không hợp lệ.' })
  orderItemId!: string;

  /** Số lượng trả (từ 1 tới số đã mua) */
  @Type(() => Number)
  @IsInt({ message: 'Số lượng phải là số nguyên.' })
  @Min(1, { message: 'Số lượng trả ít nhất là 1.' })
  quantity!: number;
}

export class CreateReturnDto {
  /** Các món trả và số lượng */
  @IsArray({ message: 'Vui lòng chọn món muốn trả.' })
  @ArrayMinSize(1, { message: 'Vui lòng chọn ít nhất 1 món muốn trả.' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items!: ReturnItemDto[];

  /** DEFECTIVE, DAMAGED, WRONG_ITEM, MISSING, NOT_AS_DESCRIBED, COUNTERFEIT */
  @IsIn(RETURN_REASONS, { message: 'Vui lòng chọn lý do trả hàng.' })
  reason!: (typeof RETURN_REASONS)[number];

  /** Mô tả vấn đề, 20–1000 ký tự */
  @Transform(trim)
  @IsString({ message: 'Mô tả phải là chữ.' })
  @Length(20, 1000, { message: 'Mô tả dài từ 20 đến 1000 ký tự.' })
  description!: string;

  /** 1–6 ảnh bằng chứng */
  @ImageKeys(true)
  images!: string[];

  /** Tài khoản nhận tiền hoàn: bắt buộc với đơn thanh toán khi nhận hàng (COD) */
  @IsOptional()
  @ValidateNested()
  @Type(() => BankAccountDto)
  bankAccount?: BankAccountDto;
}

export class ReturnsQuery extends PageQuery {
  @ApiPropertyOptional({ enum: RETURN_STATUSES })
  @IsOptional()
  @IsIn(RETURN_STATUSES, { message: 'Trạng thái không hợp lệ.' })
  status?: (typeof RETURN_STATUSES)[number];

  /** Mã yêu cầu hoặc mã đơn con */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  q?: string;
}

export class AcceptReturnDto {
  /** true: hoàn tiền ngay, không cần người mua gửi hàng về */
  @IsBoolean({ message: 'Vui lòng chọn cách xử lý.' })
  refundWithoutReturn!: boolean;
}

export class RejectReturnDto {
  /** Lý do từ chối, 10–1000 ký tự */
  @Transform(trim)
  @IsString({ message: 'Lý do phải là chữ.' })
  @IsNotEmpty({ message: 'Vui lòng nhập lý do.' })
  @Length(10, 1000, { message: 'Lý do dài từ 10 đến 1000 ký tự.' })
  reason!: string;

  /** Ảnh chứng minh (không bắt buộc), tối đa 6 */
  @ImageKeys(false)
  images?: string[];
}

export class InspectReturnDto {
  /** OK: hàng đúng như yêu cầu, hoàn tiền; PROBLEM: hàng trả về không đúng, khiếu nại */
  @IsIn(['OK', 'PROBLEM'], { message: 'Kết quả kiểm hàng không hợp lệ.' })
  result!: 'OK' | 'PROBLEM';

  /** Các dòng hàng nhập lại kho (dòng không có trong danh sách = không nhập) */
  @IsArray({ message: 'Danh sách dòng hàng không hợp lệ.' })
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true, message: 'Dòng hàng không hợp lệ.' })
  restockItemIds!: string[];

  /** Bắt buộc khi PROBLEM: hàng không đúng thế nào, 10–1000 ký tự */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000, { message: 'Ghi chú tối đa 1000 ký tự.' })
  note?: string;

  /** Bắt buộc khi PROBLEM: 1–6 ảnh hàng nhận về */
  @ImageKeys(false)
  images?: string[];
}

export class DisputeReturnDto {
  /** Lời trình bày, 20–1000 ký tự */
  @Transform(trim)
  @IsString({ message: 'Lời trình bày phải là chữ.' })
  @Length(20, 1000, { message: 'Lời trình bày dài từ 20 đến 1000 ký tự.' })
  statement!: string;

  /** Ảnh bổ sung (không bắt buộc), tối đa 6 */
  @ImageKeys(false)
  images?: string[];
}

export class LostReturnDto {
  /** Ghi chú xác nhận (ví dụ GHN xác nhận thất lạc ngày nào), 3–500 ký tự */
  @Transform(trim)
  @IsString({ message: 'Ghi chú phải là chữ.' })
  @Length(3, 500, { message: 'Ghi chú dài từ 3 đến 500 ký tự.' })
  note!: string;
}

export class ResolveFailedShipmentDto {
  /** CANCEL: hủy yêu cầu (đơn hoàn tất, seller nhận tiền); REFUND: hoàn tiền không cần gửi trả */
  @IsIn(['CANCEL', 'REFUND'], { message: 'Vui lòng chọn cách xử lý.' })
  result!: 'CANCEL' | 'REFUND';

  /** Ghi chú xử lý (ví dụ đã liên hệ người mua ngày nào), 3–500 ký tự */
  @Transform(trim)
  @IsString({ message: 'Ghi chú phải là chữ.' })
  @Length(3, 500, { message: 'Ghi chú dài từ 3 đến 500 ký tự.' })
  note!: string;
}
