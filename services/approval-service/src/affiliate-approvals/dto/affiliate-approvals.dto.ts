import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PageQuery } from '@san/nest-common';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export const AFFILIATE_APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'REPLACED'] as const;
export const AFFILIATE_APPROVAL_TYPES = ['REGISTER', 'SUSPEND', 'RESTORE'] as const;

const trimToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class ListAffiliateApprovalsQuery extends PageQuery {
  /** Mặc định PENDING (chờ duyệt) */
  @ApiPropertyOptional({ enum: AFFILIATE_APPROVAL_STATUSES, default: 'PENDING' })
  @IsOptional()
  @IsIn(AFFILIATE_APPROVAL_STATUSES, { message: 'Trạng thái không hợp lệ.' })
  status?: (typeof AFFILIATE_APPROVAL_STATUSES)[number];

  /** REGISTER: hồ sơ đăng ký; SUSPEND/RESTORE: lịch sử khóa/mở */
  @ApiPropertyOptional({ enum: AFFILIATE_APPROVAL_TYPES })
  @IsOptional()
  @IsIn(AFFILIATE_APPROVAL_TYPES, { message: 'Loại hồ sơ không hợp lệ.' })
  type?: (typeof AFFILIATE_APPROVAL_TYPES)[number];

  /** Tìm theo tên hiển thị, tên hoặc email người nộp */
  @ApiPropertyOptional()
  @Transform(trimToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Từ khóa tối đa 100 ký tự.' })
  q?: string;
}

/** Khóa hoặc mở một CTV đang hoạt động (AFF-01) */
export class AffiliateSuspensionDto {
  @ApiProperty({ enum: ['SUSPEND', 'RESTORE'] })
  @IsIn(['SUSPEND', 'RESTORE'], { message: 'Thao tác phải là SUSPEND hoặc RESTORE.' })
  action!: 'SUSPEND' | 'RESTORE';

  /** Lý do (CTV đọc trong thông báo), 10–500 ký tự */
  @Transform(trimToUndefined)
  @IsNotEmpty({ message: 'Vui lòng nhập lý do.' })
  @IsString({ message: 'Lý do phải là chữ.' })
  @Length(10, 500, { message: 'Lý do từ 10 đến 500 ký tự.' })
  reason!: string;
}
