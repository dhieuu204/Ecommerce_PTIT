import { ApiPropertyOptional } from '@nestjs/swagger';
import { PageQuery } from '@san/nest-common';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const REPORT_TARGETS = ['PRODUCT', 'SHOP'] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

/** Lý do báo cáo (quyết định P6 mục 2 số 12) */
export const REPORT_REASONS = [
  'COUNTERFEIT',
  'PROHIBITED',
  'SCAM',
  'WRONG_INFO',
  'OFFENSIVE',
  'OTHER',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ['PENDING', 'RESOLVED', 'DISMISSED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_DECISIONS = ['REMOVE_PRODUCT', 'SUSPEND_SHOP', 'DISMISS'] as const;
export type ReportDecision = (typeof REPORT_DECISIONS)[number];

/** Người mua gửi báo cáo vi phạm */
export class CreateReportDto {
  /** PRODUCT (sản phẩm) hoặc SHOP */
  @IsIn(REPORT_TARGETS, { message: 'Đối tượng báo cáo phải là sản phẩm hoặc shop.' })
  targetType!: ReportTarget;

  /** Mã sản phẩm hoặc mã shop */
  @IsUUID('all', { message: 'Mã đối tượng không hợp lệ.' })
  targetId!: string;

  @IsIn(REPORT_REASONS, { message: 'Vui lòng chọn lý do báo cáo.' })
  reason!: ReportReason;

  /** Mô tả vi phạm, 10–1000 ký tự */
  @Transform(trim)
  @Length(10, 1000, { message: 'Mô tả dài từ 10 đến 1.000 ký tự.' })
  @IsString({ message: 'Mô tả phải là chữ.' })
  @IsNotEmpty({ message: 'Vui lòng mô tả vi phạm.' })
  note!: string;

  /** Khóa ảnh bằng chứng đã tải lên ở marketplace (POST /uploads/report-image), tối đa 5 */
  @IsOptional()
  @IsArray({ message: 'Danh sách ảnh không hợp lệ.' })
  @ArrayMaxSize(20, { message: 'Quá nhiều ảnh.' })
  @IsString({ each: true, message: 'Khóa ảnh không hợp lệ.' })
  @MaxLength(200, { each: true, message: 'Khóa ảnh không hợp lệ.' })
  images?: string[];
}

export class MyReportsQuery extends PageQuery {}

export class AdminReportsQuery extends PageQuery {
  /** Mặc định PENDING (đang chờ xử lý) */
  @ApiPropertyOptional({ enum: REPORT_STATUSES, default: 'PENDING' })
  @IsOptional()
  @IsIn(REPORT_STATUSES, { message: 'Trạng thái không hợp lệ.' })
  status?: ReportStatus;

  @ApiPropertyOptional({ enum: REPORT_TARGETS })
  @IsOptional()
  @IsIn(REPORT_TARGETS, { message: 'Đối tượng không hợp lệ.' })
  targetType?: ReportTarget;
}

/** Admin xử lý báo cáo */
export class ResolveReportDto {
  /** REMOVE_PRODUCT (chỉ báo cáo sản phẩm), SUSPEND_SHOP hoặc DISMISS (bác báo cáo) */
  @IsIn(REPORT_DECISIONS, { message: 'Biện pháp không hợp lệ.' })
  decision!: ReportDecision;

  /** Lý do (seller đọc khi bị gỡ/đình chỉ, người báo cáo đọc ở trang của mình), 5–500 ký tự */
  @Transform(trim)
  @Length(5, 500, { message: 'Lý do dài từ 5 đến 500 ký tự.' })
  @IsString({ message: 'Lý do phải là chữ.' })
  @IsNotEmpty({ message: 'Vui lòng nhập lý do.' })
  reason!: string;
}
