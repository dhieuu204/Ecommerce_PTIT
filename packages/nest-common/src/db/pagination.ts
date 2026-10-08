import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type Page } from '@san/shared';

/** Query phân trang dùng chung: ?page=1&pageSize=20. Kế thừa class này cho DTO có thêm bộ lọc. */
export class PageQuery {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page phải là số nguyên.' })
  @Min(1, { message: 'page nhỏ nhất là 1.' })
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize phải là số nguyên.' })
  @Min(1, { message: 'pageSize nhỏ nhất là 1.' })
  @Max(MAX_PAGE_SIZE, { message: `pageSize lớn nhất là ${MAX_PAGE_SIZE}.` })
  pageSize: number = DEFAULT_PAGE_SIZE;
}

/** Đưa vào findMany của Prisma: prisma.user.findMany({ ...skipTake(q), where }) */
export function skipTake(q: PageQuery): { skip: number; take: number } {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}

/** Đóng gói kết quả theo dạng chung { items, page, pageSize, total }. */
export function toPage<T>(items: T[], total: number, q: PageQuery): Page<T> {
  return { items, page: q.page, pageSize: q.pageSize, total };
}
