import { ApiPropertyOptional } from '@nestjs/swagger';
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
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const WITHDRAWAL_STATUSES = [
  'PENDING',
  'APPROVED',
  'PAID',
  'REJECTED',
  'CANCELLED',
  'FAILED',
] as const;

export class CreateWithdrawalDto {
  /** Số tiền rút (đồng), từ mức tối thiểu tới toàn bộ số dư khả dụng */
  @Type(() => Number)
  @IsInt({ message: 'Số tiền phải là số nguyên đồng.' })
  @Min(1, { message: 'Số tiền rút phải lớn hơn 0.' })
  amount!: number;
}

export class WithdrawalsQuery extends PageQuery {
  @ApiPropertyOptional({ enum: WITHDRAWAL_STATUSES })
  @IsOptional()
  @IsIn(WITHDRAWAL_STATUSES, { message: 'Trạng thái không hợp lệ.' })
  status?: (typeof WITHDRAWAL_STATUSES)[number];

  /** Từ thời điểm (tạo yêu cầu) */
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'Thời điểm không hợp lệ.' })
  from?: Date;

  /** Tới thời điểm */
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'Thời điểm không hợp lệ.' })
  to?: Date;
}

export class PayoutDto {
  /** Mã giao dịch chuyển khoản cho seller */
  @Transform(trim)
  @Length(3, 60, { message: 'Mã giao dịch dài từ 3 đến 60 ký tự.' })
  @IsString({ message: 'Mã giao dịch phải là chữ.' })
  @IsNotEmpty({ message: 'Vui lòng nhập mã giao dịch.' })
  transferCode!: string;

  /** Mã ảnh biên lai nhận từ POST /admin/uploads/payout-receipt */
  @IsString({ message: 'Vui lòng tải ảnh biên lai.' })
  @IsNotEmpty({ message: 'Vui lòng tải ảnh biên lai.' })
  @MaxLength(200)
  receiptKey!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class PayoutFailedDto {
  /** Vì sao chuyển khoản không thành công (ví dụ ngân hàng trả lại vì sai tên), 5–500 ký tự */
  @Transform(trim)
  @Length(5, 500, { message: 'Lý do dài từ 5 đến 500 ký tự.' })
  @IsString({ message: 'Lý do phải là chữ.' })
  @IsNotEmpty({ message: 'Vui lòng nhập lý do.' })
  reason!: string;
}
