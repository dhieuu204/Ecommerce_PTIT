import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PageQuery } from '@san/nest-common';
import { PERMISSIONS, type Permission } from '@san/shared';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const STATUSES = ['UNVERIFIED', 'ACTIVE', 'LOCKED'] as const;

export class ListUsersQuery extends PageQuery {
  /** Tìm theo email hoặc họ tên (không phân biệt hoa thường) */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES, { message: 'Trạng thái không hợp lệ.' })
  status?: (typeof STATUSES)[number];

  /** Chỉ người có bộ quyền này */
  @ApiPropertyOptional({ enum: PERMISSIONS })
  @IsOptional()
  @IsIn(PERMISSIONS, { message: 'Bộ quyền không hợp lệ.' })
  permission?: Permission;
}

class ReasonDto {
  /** Lý do (ghi vào nhật ký thao tác) */
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập lý do.' })
  @MaxLength(500, { message: 'Lý do tối đa 500 ký tự.' })
  reason!: string;
}

export class SetPermissionsDto extends ReasonDto {
  /** Danh sách đầy đủ bộ quyền sau khi đổi; rỗng = bỏ hết quyền admin */
  @ApiProperty({ enum: PERMISSIONS, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsIn(PERMISSIONS, { each: true, message: 'Bộ quyền không hợp lệ.' })
  permissions!: Permission[];
}

export class LockUserDto extends ReasonDto {}
