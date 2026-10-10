import { ApiPropertyOptional } from '@nestjs/swagger';
import { PageQuery } from '@san/nest-common';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, Length, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const BUYER_TABS = ['ALL', 'UNPAID', 'PROCESSING', 'TO_SHIP', 'CANCELLED'] as const;
export type BuyerTab = (typeof BUYER_TABS)[number];

export const SHOP_ORDER_STATUSES = [
  'PENDING',
  'TO_CONFIRM',
  'CONFIRMED',
  'CANCEL_REQUESTED',
  'CANCELLED',
] as const;

export class BuyerOrdersQuery extends PageQuery {
  /** ALL, UNPAID (chưa trả), PROCESSING (chờ duyệt/xác nhận), TO_SHIP (chờ giao), CANCELLED */
  @ApiPropertyOptional({ enum: BUYER_TABS, default: 'ALL' })
  @IsOptional()
  @IsIn(BUYER_TABS, { message: 'Tab không hợp lệ.' })
  tab: BuyerTab = 'ALL';
}

export class AdminOrdersQuery extends BuyerOrdersQuery {
  /** Mã đơn tổng hoặc mã đơn con */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  q?: string;
}

export class ShopOrdersQuery extends PageQuery {
  @ApiPropertyOptional({ enum: SHOP_ORDER_STATUSES })
  @IsOptional()
  @IsIn(SHOP_ORDER_STATUSES, { message: 'Trạng thái không hợp lệ.' })
  status?: (typeof SHOP_ORDER_STATUSES)[number];

  /** Mã đơn con hoặc mã đơn tổng */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  q?: string;
}

export class ReasonDto {
  /** Lý do (bắt buộc), 3–500 ký tự */
  @Transform(trim)
  @Length(3, 500, { message: 'Lý do dài từ 3 đến 500 ký tự.' })
  @IsString({ message: 'Lý do phải là chữ.' })
  @IsNotEmpty({ message: 'Vui lòng nhập lý do.' })
  reason!: string;
}
