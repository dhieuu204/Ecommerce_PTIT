import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

/** Giới hạn kỹ thuật cho một lần chọn/xóa nhiều dòng (giỏ thật ít hơn nhiều) */
const MAX_IDS = 500;
/** Số lượng một dòng tối đa = tồn tối đa của một biến thể */
const MAX_QUANTITY = 999_999;

export class AddCartItemDto {
  /** Biến thể (SKU) muốn mua */
  @IsUUID('all', { message: 'Vui lòng chọn phân loại hàng.' })
  variantId!: string;

  /** Số lượng thêm vào (cộng vào dòng có sẵn của biến thể này) */
  @IsInt({ message: 'Số lượng phải là số nguyên.' })
  @Min(1, { message: 'Số lượng ít nhất là 1.' })
  @Max(MAX_QUANTITY, { message: 'Số lượng quá lớn.' })
  quantity!: number;
}

export class UpdateCartItemDto {
  /** Số lượng mới (≥ 1) */
  @IsOptional()
  @IsInt({ message: 'Số lượng phải là số nguyên.' })
  @Min(1, { message: 'Số lượng ít nhất là 1.' })
  @Max(MAX_QUANTITY, { message: 'Số lượng quá lớn.' })
  quantity?: number;

  /** Tick chọn để mua */
  @IsOptional()
  @IsBoolean({ message: 'selected phải là true hoặc false.' })
  selected?: boolean;

  /** Đổi sang biến thể khác của cùng sản phẩm; trùng dòng có sẵn thì gộp số lượng */
  @IsOptional()
  @IsUUID('all', { message: 'Phân loại hàng không hợp lệ.' })
  variantId?: string;
}

export class CartSelectionDto {
  /** Các dòng giỏ cần chọn/bỏ chọn (dòng không phải của mình bị bỏ qua) */
  @ArrayMinSize(1, { message: 'Chưa chọn dòng nào.' })
  @ArrayMaxSize(MAX_IDS)
  @IsUUID('all', { each: true, message: 'Mã dòng giỏ không hợp lệ.' })
  itemIds!: string[];

  @IsBoolean({ message: 'selected phải là true hoặc false.' })
  selected!: boolean;
}

export class RemoveCartItemsDto {
  /** Các dòng giỏ cần xóa (dòng không phải của mình bị bỏ qua) */
  @ArrayMinSize(1, { message: 'Chưa chọn dòng nào.' })
  @ArrayMaxSize(MAX_IDS)
  @IsUUID('all', { each: true, message: 'Mã dòng giỏ không hợp lệ.' })
  itemIds!: string[];
}
