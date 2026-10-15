import { ApiPropertyOptional } from '@nestjs/swagger';
import { PageQuery } from '@san/nest-common';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const DISPUTE_STATUSES = ['PENDING', 'RESOLVED'] as const;
export const ADJUSTMENT_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXECUTED',
  'FAILED',
] as const;

export class DisputesQuery extends PageQuery {
  /** Mặc định PENDING (đang chờ phân xử) */
  @ApiPropertyOptional({ enum: DISPUTE_STATUSES, default: 'PENDING' })
  @IsOptional()
  @IsIn(DISPUTE_STATUSES, { message: 'Trạng thái không hợp lệ.' })
  status?: (typeof DISPUTE_STATUSES)[number];
}

export class DisputeDecisionDto {
  /** ACCEPT_RETURN (chỉ khi shop từ chối yêu cầu), REFUND, REJECT */
  @IsIn(['ACCEPT_RETURN', 'REFUND', 'REJECT'], { message: 'Quyết định không hợp lệ.' })
  decision!: 'ACCEPT_RETURN' | 'REFUND' | 'REJECT';

  /** Bắt buộc khi REFUND: từ 1 tới số hoàn tối đa (bằng = hoàn toàn bộ) */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số tiền phải là số nguyên đồng.' })
  @Min(1, { message: 'Số tiền hoàn phải lớn hơn 0.' })
  refundAmount?: number;

  /** Lời giải thích quyết định (hai bên sẽ đọc), 10–500 ký tự */
  @Transform(trim)
  @IsString({ message: 'Lời giải thích phải là chữ.' })
  @Length(10, 500, { message: 'Lời giải thích dài từ 10 đến 500 ký tự.' })
  note!: string;
}

export class AdjustmentsQuery extends PageQuery {
  @ApiPropertyOptional({ enum: ADJUSTMENT_STATUSES })
  @IsOptional()
  @IsIn(ADJUSTMENT_STATUSES, { message: 'Trạng thái không hợp lệ.' })
  status?: (typeof ADJUSTMENT_STATUSES)[number];
}

export class AdjustmentBankAccountDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng chọn ngân hàng.' })
  @MaxLength(100)
  bankName!: string;

  /** 6 đến 20 chữ số */
  @Transform(trim)
  @Matches(/^\d{6,20}$/, { message: 'Số tài khoản gồm 6 đến 20 chữ số.' })
  accountNumber!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tên chủ tài khoản.' })
  @MaxLength(100)
  accountName!: string;
}

export class CreateAdjustmentDto {
  /** Mã đơn con, ví dụ 261011ABC123-1 */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString({ message: 'Vui lòng nhập mã đơn con.' })
  @Length(8, 24, { message: 'Mã đơn con không hợp lệ.' })
  shopOrderCode!: string;

  /** Cộng (dương) hoặc trừ (âm) ngăn khả dụng của shop; 0 = không đổi ví */
  @Type(() => Number)
  @IsInt({ message: 'Số tiền phải là số nguyên đồng.' })
  sellerChange!: number;

  /** Hoàn thêm cho người mua bằng chuyển khoản; 0 = không */
  @Type(() => Number)
  @IsInt({ message: 'Số tiền phải là số nguyên đồng.' })
  @Min(0, { message: 'Số tiền hoàn không được âm.' })
  buyerRefund!: number;

  /** Bắt buộc khi hoàn thêm cho người mua */
  @IsOptional()
  @ValidateNested()
  @Type(() => AdjustmentBankAccountDto)
  bankAccount?: AdjustmentBankAccountDto;

  /** Lý do (căn cứ điều chỉnh), 10–500 ký tự */
  @Transform(trim)
  @IsString({ message: 'Lý do phải là chữ.' })
  @Length(10, 500, { message: 'Lý do dài từ 10 đến 500 ký tự.' })
  reason!: string;
}

export class ApprovalDecisionDto {
  @IsIn(['APPROVE', 'REJECT'], { message: 'Quyết định phải là APPROVE hoặc REJECT.' })
  decision!: 'APPROVE' | 'REJECT';

  /** Bắt buộc khi từ chối, tối đa 500 ký tự */
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'Lý do phải là chữ.' })
  @MaxLength(500, { message: 'Lý do tối đa 500 ký tự.' })
  reason?: string;
}
