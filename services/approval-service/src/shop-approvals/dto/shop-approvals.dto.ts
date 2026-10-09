import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PageQuery } from '@san/nest-common';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'REPLACED'] as const;
export const APPLICATION_TYPES = ['REGISTER', 'CHANGE'] as const;
export const DECISIONS = ['APPROVE', 'REJECT'] as const;
export type Decision = (typeof DECISIONS)[number];

/** Bỏ khoảng trắng hai đầu; chuỗi chỉ toàn khoảng trắng coi như không nhập */
const trimToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class ListShopApprovalsQuery extends PageQuery {
  /** Trạng thái hồ sơ. Không gửi = mọi trạng thái */
  @ApiPropertyOptional({ enum: APPROVAL_STATUSES })
  @IsOptional()
  @IsIn(APPROVAL_STATUSES, { message: 'Trạng thái không hợp lệ.' })
  status?: (typeof APPROVAL_STATUSES)[number];

  /** REGISTER: hồ sơ mở shop. CHANGE: yêu cầu đổi tên shop / tài khoản ngân hàng */
  @ApiPropertyOptional({ enum: APPLICATION_TYPES })
  @IsOptional()
  @IsIn(APPLICATION_TYPES, { message: 'Loại hồ sơ không hợp lệ.' })
  type?: (typeof APPLICATION_TYPES)[number];

  /** Tìm theo tên shop, tên hoặc email chủ shop (không phân biệt hoa thường) */
  @ApiPropertyOptional({ example: 'hoa mai' })
  @Transform(trimToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Từ khóa tối đa 100 ký tự.' })
  q?: string;
}

export class DecisionDto {
  /** APPROVE: duyệt. REJECT: từ chối (bắt buộc lý do) */
  @ApiProperty({ enum: DECISIONS })
  @IsIn(DECISIONS, { message: 'Quyết định phải là APPROVE hoặc REJECT.' })
  decision!: Decision;

  /** Lý do: bắt buộc khi từ chối (seller sẽ đọc), không bắt buộc khi duyệt. Tối đa 500 ký tự */
  @Transform(trimToUndefined)
  @ValidateIf((o: DecisionDto) => o.decision === 'REJECT' || o.reason != null)
  // Thứ tự: câu báo lỗi của decorator viết dưới cùng được trả trước
  @MaxLength(500, { message: 'Lý do tối đa 500 ký tự.' })
  @IsString({ message: 'Lý do phải là chữ.' })
  @IsNotEmpty({ message: 'Vui lòng nhập lý do từ chối.' })
  reason?: string;
}
