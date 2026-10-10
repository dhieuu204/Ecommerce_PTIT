import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Chuỗi rỗng coi như không có (null) */
const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SLUG_MESSAGE = 'Slug chỉ gồm chữ thường không dấu, số và dấu gạch nối, ví dụ dien-thoai.';

/** Thêm danh mục (CAT-01) */
export class CreateCategoryDto {
  /** Tên hiển thị, ví dụ "Điện thoại" */
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tên danh mục.' })
  @MaxLength(60, { message: 'Tên danh mục tối đa 60 ký tự.' })
  name!: string;

  /** Dùng trên đường dẫn web: chữ thường không dấu, gạch nối, ví dụ dien-thoai. Không trùng */
  @Transform(trim)
  @IsString()
  @Matches(SLUG, { message: SLUG_MESSAGE })
  @MaxLength(80, { message: 'Slug tối đa 80 ký tự.' })
  slug!: string;

  /** Danh mục cha (cấp 1). Trống = tạo danh mục cấp 1 */
  @IsOptional()
  @IsUUID('all', { message: 'Danh mục cha không hợp lệ.' })
  parentId?: string | null;

  /** Tên icon lucide (dùng cho danh mục cấp 1), ví dụ smartphone */
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(40, { message: 'Tên icon tối đa 40 ký tự.' })
  icon?: string | null;

  /** Thứ tự: số nhỏ đứng trước */
  @IsOptional()
  @IsInt({ message: 'Thứ tự phải là số nguyên.' })
  @Min(0, { message: 'Thứ tự nhỏ nhất là 0.' })
  @Max(9999, { message: 'Thứ tự lớn nhất là 9999.' })
  sort?: number;
}

/** Sửa danh mục: gửi mục muốn đổi. `parentId: null` = chuyển thành cấp 1 */
export class UpdateCategoryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tên danh mục.' })
  @MaxLength(60, { message: 'Tên danh mục tối đa 60 ký tự.' })
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(SLUG, { message: SLUG_MESSAGE })
  @MaxLength(80, { message: 'Slug tối đa 80 ký tự.' })
  slug?: string;

  /** Danh mục cha mới (cấp 1); null = thành danh mục cấp 1 */
  @IsOptional()
  @IsUUID('all', { message: 'Danh mục cha không hợp lệ.' })
  parentId?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(40, { message: 'Tên icon tối đa 40 ký tự.' })
  icon?: string | null;

  @IsOptional()
  @IsInt({ message: 'Thứ tự phải là số nguyên.' })
  @Min(0, { message: 'Thứ tự nhỏ nhất là 0.' })
  @Max(9999, { message: 'Thứ tự lớn nhất là 9999.' })
  sort?: number;

  /** Ẩn khỏi web; sản phẩm đang gắn vẫn bán bình thường */
  @IsOptional()
  @IsBoolean({ message: 'hidden phải là true hoặc false.' })
  hidden?: boolean;
}
