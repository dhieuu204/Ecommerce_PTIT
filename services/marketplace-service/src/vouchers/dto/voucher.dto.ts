import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PageQuery } from '@san/nest-common';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export const VOUCHER_STATES = ['UPCOMING', 'RUNNING', 'ENDED'] as const;
export type VoucherState = (typeof VOUCHER_STATES)[number];
export const DISCOUNT_TYPES = ['AMOUNT', 'PERCENT'] as const;

/** Giới hạn kỹ thuật để số tiền vừa cột số nguyên trong database */
const MAX_MONEY = 1_000_000_000;

export class ListVouchersQuery extends PageQuery {
  /** UPCOMING: sắp diễn ra, RUNNING: đang chạy, ENDED: đã kết thúc. Không gửi = tất cả */
  @ApiPropertyOptional({ enum: VOUCHER_STATES })
  @IsOptional()
  @IsIn(VOUCHER_STATES, { message: 'Trạng thái không hợp lệ.' })
  state?: VoucherState;
}

/** Tạo hoặc sửa voucher (sửa thì gửi lại đầy đủ như khi tạo) */
export class VoucherDto {
  /** Mã buyer nhập: 4–20 chữ in hoa hoặc số, không trùng trên toàn sàn (chữ thường tự đổi sang in hoa) */
  @ApiProperty({ example: 'GIAM50K' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z0-9]{4,20}$/, { message: 'Mã voucher gồm 4–20 chữ in hoa hoặc số, không dấu.' })
  code!: string;

  /** Tên hiển thị, ví dụ "Giảm 50K đơn từ 500K" */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @Length(3, 100, { message: 'Tên voucher dài từ 3 đến 100 ký tự.' })
  @IsString({ message: 'Vui lòng nhập tên voucher.' })
  @IsNotEmpty({ message: 'Vui lòng nhập tên voucher.' })
  name!: string;

  /** AMOUNT: giảm số tiền, PERCENT: giảm % (có mức giảm tối đa) */
  @ApiProperty({ enum: DISCOUNT_TYPES })
  @IsIn(DISCOUNT_TYPES, { message: 'Loại giảm giá phải là AMOUNT hoặc PERCENT.' })
  discountType!: (typeof DISCOUNT_TYPES)[number];

  /** AMOUNT: số đồng giảm (≥ 1.000đ); PERCENT: số % giảm (1–90) */
  @IsInt({ message: 'Mức giảm phải là số nguyên.' })
  @Min(1, { message: 'Mức giảm phải lớn hơn 0.' })
  @Max(MAX_MONEY, { message: 'Mức giảm quá lớn.' })
  value!: number;

  /** Chỉ với PERCENT (bắt buộc): giảm tối đa bao nhiêu đồng (≥ 1.000đ). AMOUNT bỏ qua trường này */
  @ValidateIf((o: VoucherDto) => o.discountType === 'PERCENT')
  @IsInt({ message: 'Vui lòng nhập mức giảm tối đa.' })
  @Min(1000, { message: 'Mức giảm tối đa ít nhất 1.000đ.' })
  @Max(MAX_MONEY, { message: 'Mức giảm tối đa quá lớn.' })
  maxDiscount?: number | null;

  /** Đơn tối thiểu (tiền hàng, đồng) để dùng được; 0 = không yêu cầu */
  @IsOptional()
  @IsInt({ message: 'Đơn tối thiểu phải là số nguyên.' })
  @Min(0, { message: 'Đơn tối thiểu không được âm.' })
  @Max(MAX_MONEY, { message: 'Đơn tối thiểu quá lớn.' })
  minOrder: number = 0;

  /** Bắt đầu (từ bây giờ trở đi) */
  @Type(() => Date)
  @IsDate({ message: 'Thời gian bắt đầu không hợp lệ.' })
  startAt!: Date;

  /** Kết thúc (sau lúc bắt đầu, dài tối đa VOUCHER_MAX_DAYS ngày) */
  @Type(() => Date)
  @IsDate({ message: 'Thời gian kết thúc không hợp lệ.' })
  endAt!: Date;

  /** Tổng số lượt dùng (1–1.000.000) */
  @IsInt({ message: 'Số lượt phải là số nguyên.' })
  @Min(1, { message: 'Số lượt ít nhất là 1.' })
  @Max(1_000_000, { message: 'Số lượt tối đa 1.000.000.' })
  quantity!: number;

  /** Mỗi người dùng tối đa mấy lần */
  @IsOptional()
  @IsInt({ message: 'Số lần mỗi người phải là số nguyên.' })
  @Min(1, { message: 'Mỗi người dùng được ít nhất 1 lần.' })
  @Max(1_000_000, { message: 'Số lần mỗi người quá lớn.' })
  perUserLimit: number = 1;
}
