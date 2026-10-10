import { ApiPropertyOptional } from '@nestjs/swagger';
import { PageQuery } from '@san/nest-common';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export const PRODUCT_SORTS = [
  'relevance',
  'newest',
  'price_asc',
  'price_desc',
  'best_selling',
] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

/** Tìm và lọc hàng đang bán (SRC-01, CAT-04) */
export class ProductSearchQuery extends PageQuery {
  /** Từ khóa: có dấu hay không dấu đều được, khớp đầu từ ("ip" ra "iPhone") */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100, { message: 'Từ khóa tối đa 100 ký tự.' })
  q?: string;

  /** Danh mục; cấp 1 thì gồm mọi danh mục con */
  @IsOptional()
  @IsUUID('all', { message: 'Danh mục không hợp lệ.' })
  categoryId?: string;

  /** Giá thấp nhất của sản phẩm từ (đồng) */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Giá phải là số nguyên.' })
  @Min(0, { message: 'Giá không được âm.' })
  minPrice?: number;

  /** Giá thấp nhất của sản phẩm đến (đồng) */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Giá phải là số nguyên.' })
  @Min(0, { message: 'Giá không được âm.' })
  maxPrice?: number;

  /** Chỉ hàng của một shop (trang shop) */
  @IsOptional()
  @IsUUID('all', { message: 'Shop không hợp lệ.' })
  shopId?: string;

  /** Mặc định: relevance khi có q, newest khi không có */
  @ApiPropertyOptional({ enum: PRODUCT_SORTS })
  @IsOptional()
  @IsIn(PRODUCT_SORTS, { message: 'Cách sắp xếp không hợp lệ.' })
  sort?: ProductSort;
}
