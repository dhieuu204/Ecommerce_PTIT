import { ApiPropertyOptional } from '@nestjs/swagger';
import { PageQuery } from '@san/nest-common';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  NotEquals,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Chuỗi rỗng coi như không có (null) */
const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

/** Một biến thể (SKU) khi tạo/sửa sản phẩm */
export class VariantInputDto {
  /** Chỉ khi sửa (PUT): mã biến thể đang có. Không gửi = biến thể mới */
  @IsOptional()
  @IsUUID('all', { message: 'Mã biến thể không hợp lệ.' })
  id?: string;

  /** Lựa chọn của nhóm 1, ví dụ "Đen". Trống nếu sản phẩm không có nhóm 1 */
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(30, { message: 'Tên lựa chọn tối đa 30 ký tự.' })
  option1Value?: string | null;

  /** Lựa chọn của nhóm 2, ví dụ "256GB". Trống nếu sản phẩm không có nhóm 2 */
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(30, { message: 'Tên lựa chọn tối đa 30 ký tự.' })
  option2Value?: string | null;

  /** Giá bán (đồng) */
  @IsInt({ message: 'Giá phải là số nguyên (đồng).' })
  price!: number;

  /** Giá gốc (đồng), phải lớn hơn giá bán; trống = không giảm giá */
  @IsOptional()
  @IsInt({ message: 'Giá gốc phải là số nguyên (đồng).' })
  originalPrice?: number | null;

  /**
   * Tồn kho ban đầu, bắt buộc với biến thể mới. Biến thể đang có (gửi `id`) bỏ qua trường này:
   * đổi tồn bằng API điều chỉnh tồn
   */
  @IsOptional()
  @IsInt({ message: 'Tồn kho phải là số nguyên.' })
  @Min(0, { message: 'Tồn kho không được âm.' })
  stock?: number;
}

/** Một ảnh sản phẩm */
export class ImageInputDto {
  /** Đường dẫn trả về từ POST /uploads/product-image */
  @IsString({ message: 'Đường dẫn ảnh không hợp lệ.' })
  @IsNotEmpty({ message: 'Đường dẫn ảnh không hợp lệ.' })
  @MaxLength(255)
  url!: string;

  /** Trống = ảnh chung; có giá trị = ảnh riêng của lựa chọn đó ở nhóm 1 (ví dụ ảnh màu Đen) */
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(30)
  option1Value?: string | null;
}

/** Tạo sản phẩm, hoặc gửi lại toàn bộ khi sửa (CAT-02, CAT-03) */
export class ProductInputDto {
  /** Tên sản phẩm, 5–120 ký tự */
  @Transform(trim)
  @IsString()
  @Length(5, 120, { message: 'Tên sản phẩm từ 5 đến 120 ký tự.' })
  name!: string;

  /** Mô tả, 20–5000 ký tự */
  @Transform(trim)
  @IsString()
  @Length(20, 5000, { message: 'Mô tả từ 20 đến 5000 ký tự.' })
  description!: string;

  /** Danh mục cấp 2, chưa ẩn */
  @IsUUID('all', { message: 'Vui lòng chọn danh mục.' })
  categoryId!: string;

  /** Khối lượng khi đóng gói (gram) */
  @IsInt({ message: 'Khối lượng phải là số nguyên (gram).' })
  @Min(1, { message: 'Khối lượng ít nhất 1 g.' })
  weight!: number;

  /** Tên nhóm phân loại 1, ví dụ "Màu sắc". Trống = sản phẩm không phân loại */
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(30, { message: 'Tên nhóm phân loại tối đa 30 ký tự.' })
  option1Name?: string | null;

  /** Tên nhóm phân loại 2, ví dụ "Dung lượng". Chỉ có khi đã có nhóm 1 */
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(30, { message: 'Tên nhóm phân loại tối đa 30 ký tự.' })
  option2Name?: string | null;

  /** Các biến thể. Không có nhóm phân loại thì gửi đúng 1 biến thể không có lựa chọn */
  @IsArray({ message: 'Vui lòng thêm biến thể.' })
  @ArrayMinSize(1, { message: 'Sản phẩm cần ít nhất 1 biến thể.' })
  @ArrayMaxSize(400, { message: 'Quá nhiều biến thể.' })
  @ValidateNested({ each: true })
  @Type(() => VariantInputDto)
  variants!: VariantInputDto[];

  /** Ảnh chung (ảnh đầu là ảnh bìa) và ảnh theo lựa chọn nhóm 1 */
  @IsArray({ message: 'Vui lòng thêm ảnh sản phẩm.' })
  @ArrayMinSize(1, { message: 'Sản phẩm cần ít nhất 1 ảnh.' })
  @ArrayMaxSize(100, { message: 'Quá nhiều ảnh.' })
  @ValidateNested({ each: true })
  @Type(() => ImageInputDto)
  images!: ImageInputDto[];
}

/** Ẩn/hiện sản phẩm */
export class ProductStatusDto {
  /** ACTIVE = đang bán, HIDDEN = tạm ẩn */
  @IsIn(['ACTIVE', 'HIDDEN'], { message: 'Trạng thái phải là ACTIVE hoặc HIDDEN.' })
  status!: 'ACTIVE' | 'HIDDEN';
}

/** Điều chỉnh tồn kho một biến thể (INV-01) */
export class StockAdjustDto {
  /** Số thay đổi, khác 0: dương = nhập thêm, âm = bớt */
  @IsInt({ message: 'Số thay đổi phải là số nguyên.' })
  @NotEquals(0, { message: 'Số thay đổi phải khác 0.' })
  change!: number;

  /** Lý do, ví dụ "Nhập thêm lô tháng 10" */
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập lý do.' })
  @MaxLength(200, { message: 'Lý do tối đa 200 ký tự.' })
  reason!: string;
}

/** Lọc danh sách sản phẩm của shop */
export class SellerProductQuery extends PageQuery {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'HIDDEN'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'HIDDEN'], { message: 'Trạng thái phải là ACTIVE hoặc HIDDEN.' })
  status?: 'ACTIVE' | 'HIDDEN';

  /** Danh mục (cấp 1 thì gồm cả danh mục con) */
  @IsOptional()
  @IsUUID('all', { message: 'Danh mục không hợp lệ.' })
  categoryId?: string;

  /** Tìm theo tên (không phân biệt hoa thường, có dấu hay không dấu) */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;
}

/** Lọc lịch sử tồn kho */
export class StockHistoryQuery extends PageQuery {
  /** Chỉ một biến thể */
  @IsOptional()
  @IsUUID('all', { message: 'Biến thể không hợp lệ.' })
  variantId?: string;
}
