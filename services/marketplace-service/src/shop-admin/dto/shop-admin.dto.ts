import { ApiPropertyOptional } from '@nestjs/swagger';
import { PageQuery } from '@san/nest-common';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** Admin chỉ xem shop đã được duyệt: đang hoạt động hoặc bị đình chỉ */
export const ADMIN_SHOP_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;

const trimToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class ListAdminShopsQuery extends PageQuery {
  /** ACTIVE: đang hoạt động, SUSPENDED: bị đình chỉ. Không gửi = cả hai */
  @ApiPropertyOptional({ enum: ADMIN_SHOP_STATUSES })
  @IsOptional()
  @IsIn(ADMIN_SHOP_STATUSES, { message: 'Trạng thái không hợp lệ.' })
  status?: (typeof ADMIN_SHOP_STATUSES)[number];

  /** Tìm theo tên shop (không phân biệt hoa thường) */
  @ApiPropertyOptional({ example: 'hoa mai' })
  @Transform(trimToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Từ khóa tối đa 100 ký tự.' })
  q?: string;
}
