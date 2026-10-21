import { IsOptional, Matches } from 'class-validator';

/** Khoảng ngày của báo cáo, theo giờ Việt Nam, gồm cả hai ngày. Trống = 30 ngày gần nhất; tối đa 366 ngày */
export class ReportRangeQuery {
  /** Từ ngày, dạng YYYY-MM-DD (ví dụ 2026-10-01) */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày phải có dạng YYYY-MM-DD.' })
  from?: string;

  /** Tới ngày (gồm cả ngày này), dạng YYYY-MM-DD */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày phải có dạng YYYY-MM-DD.' })
  to?: string;
}
