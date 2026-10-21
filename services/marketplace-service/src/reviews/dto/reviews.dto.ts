import { ApiPropertyOptional } from '@nestjs/swagger';
import { PageQuery } from '@san/nest-common';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** "true"/"false" trên đường dẫn → boolean; giá trị khác giữ nguyên để báo lỗi */
const toBool = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

/** Số sao 1–5 */
function Stars(): PropertyDecorator {
  return (target, key) => {
    Type(() => Number)(target, key);
    IsInt({ message: 'Số sao phải là số nguyên từ 1 đến 5.' })(target, key);
    Min(1, { message: 'Số sao phải là số nguyên từ 1 đến 5.' })(target, key);
    Max(5, { message: 'Số sao phải là số nguyên từ 1 đến 5.' })(target, key);
  };
}

/** Viết hoặc sửa đánh giá: sao, nội dung (được để trống), ảnh */
export class ReviewContentDto {
  /** 1–5 sao */
  @Stars()
  rating!: number;

  /** Nội dung, tối đa 1000 ký tự, được để trống (chỉ chấm sao) */
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'Nội dung phải là chữ.' })
  @MaxLength(1000, { message: 'Nội dung tối đa 1000 ký tự.' })
  content?: string;

  /** Đường dẫn ảnh đã tải lên qua POST /uploads/review-image (tối đa REVIEW_MAX_IMAGES, kiểm ở service) */
  @IsOptional()
  @IsArray({ message: 'Danh sách ảnh không hợp lệ.' })
  @ArrayMaxSize(20, { message: 'Quá nhiều ảnh.' })
  @IsString({ each: true, message: 'Ảnh không hợp lệ.' })
  @MaxLength(255, { each: true, message: 'Ảnh không hợp lệ.' })
  images?: string[];
}

export class CreateReviewDto extends ReviewContentDto {
  /** Dòng hàng trong đơn con đã hoàn tất */
  @IsUUID('all', { message: 'Dòng hàng không hợp lệ.' })
  orderItemId!: string;
}

export const MY_REVIEW_STATES = ['PENDING', 'DONE'] as const;

/** Đánh giá của tôi: dòng hàng chờ đánh giá hoặc đánh giá đã viết */
export class MyReviewsQuery extends PageQuery {
  @ApiPropertyOptional({ enum: MY_REVIEW_STATES, default: 'PENDING' })
  @IsOptional()
  @IsIn(MY_REVIEW_STATES, { message: 'Trạng thái không hợp lệ.' })
  state?: (typeof MY_REVIEW_STATES)[number];
}

/** Đánh giá công khai của sản phẩm hoặc shop */
export class PublicReviewsQuery extends PageQuery {
  /** Chỉ đánh giá đúng số sao này */
  @IsOptional()
  @Stars()
  rating?: number;

  /** true: chỉ đánh giá có ảnh */
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(toBool)
  @IsIn([true, false], { message: 'Giá trị không hợp lệ.' })
  withImages?: boolean;
}

/** Đánh giá của shop tôi */
export class SellerReviewsQuery extends PageQuery {
  @IsOptional()
  @Stars()
  rating?: number;

  /** true: đã trả lời; false: chưa trả lời */
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(toBool)
  @IsIn([true, false], { message: 'Giá trị không hợp lệ.' })
  replied?: boolean;
}

/** Shop trả lời (hoặc sửa câu trả lời) */
export class ReplyDto {
  @Transform(trim)
  @IsString({ message: 'Câu trả lời phải là chữ.' })
  @Length(1, 1000, { message: 'Câu trả lời dài từ 1 đến 1000 ký tự.' })
  content!: string;
}
