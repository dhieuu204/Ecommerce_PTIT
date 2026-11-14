import { PageQuery } from '@san/nest-common';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { BankAccountDto } from '../../shops/dto/shop.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Hồ sơ cộng tác viên (AFF-01) */
export class AffiliateApplicationDto {
  /** Tên hiển thị với shop và trong báo cáo, 2–60 ký tự */
  @Transform(trim)
  @IsString()
  @Length(2, 60, { message: 'Tên hiển thị từ 2 đến 60 ký tự.' })
  displayName!: string;

  /** Đường dẫn kênh bán hàng (Facebook, TikTok, YouTube, website), 1–3 kênh */
  @IsArray({ message: 'Vui lòng nhập ít nhất một kênh bán hàng.' })
  @ArrayMinSize(1, { message: 'Vui lòng nhập ít nhất một kênh bán hàng.' })
  @ArrayMaxSize(3, { message: 'Tối đa 3 kênh bán hàng.' })
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim() : v)) : value,
  )
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { each: true, message: 'Kênh bán hàng phải là đường dẫn bắt đầu bằng http:// hoặc https://.' },
  )
  @MaxLength(255, { each: true, message: 'Đường dẫn tối đa 255 ký tự.' })
  channels!: string[];

  @Transform(trim)
  @Matches(/^0\d{9}$/, { message: 'Số điện thoại gồm số 0 và 9 chữ số.' })
  phone!: string;

  @ValidateNested()
  @Type(() => BankAccountDto)
  bankAccount!: BankAccountDto;
}

/** Đổi tài khoản nhận tiền (AFF-05) */
export class AffiliateBankAccountDto {
  @ValidateNested()
  @Type(() => BankAccountDto)
  bankAccount!: BankAccountDto;
}

/** Ghi lượt bấm link tiếp thị (AFF-03): link sản phẩm gửi productId, link shop gửi shopId */
export class AffiliateClickDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z0-9]{8}$/, { message: 'Mã cộng tác viên không hợp lệ.' })
  code!: string;

  @ValidateIf((o: AffiliateClickDto) => !o.shopId)
  @IsUUID('all', { message: 'Sản phẩm không hợp lệ.' })
  productId?: string;

  @ValidateIf((o: AffiliateClickDto) => !o.productId)
  @IsUUID('all', { message: 'Shop không hợp lệ.' })
  shopId?: string;
}

export const AFFILIATE_PRODUCT_SORTS = ['rate', 'best_selling', 'newest'] as const;

/** Sản phẩm có hoa hồng cho CTV chọn (AFF-03) */
export class AffiliateProductsQuery extends PageQuery {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100, { message: 'Từ khóa tối đa 100 ký tự.' })
  q?: string;

  /** Danh mục; cấp 1 thì gồm mọi danh mục con */
  @IsOptional()
  @IsUUID('all', { message: 'Danh mục không hợp lệ.' })
  categoryId?: string;

  /** rate: hoa hồng cao trước (mặc định); best_selling: bán chạy; newest: mới nhất */
  @IsOptional()
  @IsIn(AFFILIATE_PRODUCT_SORTS, { message: 'Cách sắp xếp không hợp lệ.' })
  sort?: (typeof AFFILIATE_PRODUCT_SORTS)[number];
}

/** Shop đặt hoặc tắt hoa hồng cho nhiều sản phẩm (AFF-02) */
export class ProductCommissionDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Chọn ít nhất một sản phẩm.' })
  @ArrayMaxSize(100, { message: 'Mỗi lần tối đa 100 sản phẩm.' })
  @IsUUID('all', { each: true, message: 'Sản phẩm không hợp lệ.' })
  productIds!: string[];

  /** Phần vạn (500 = 5%), trong khoảng sàn cho phép; null = tắt hoa hồng */
  @ValidateIf((o: ProductCommissionDto) => o.rate !== null)
  @Type(() => Number)
  @IsInt({ message: 'Hoa hồng phải là số nguyên (phần vạn).' })
  @Min(1, { message: 'Hoa hồng phải lớn hơn 0.' })
  @Max(10_000, { message: 'Hoa hồng không quá 100%.' })
  rate!: number | null;
}

/** Danh sách CTV của admin (AFF-01) */
export class AdminAffiliatesQuery extends PageQuery {
  @IsOptional()
  @IsIn(['PENDING', 'REJECTED', 'ACTIVE', 'SUSPENDED'], { message: 'Trạng thái không hợp lệ.' })
  status?: 'PENDING' | 'REJECTED' | 'ACTIVE' | 'SUSPENDED';

  /** Tìm theo tên hiển thị hoặc mã CTV */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  q?: string;
}
