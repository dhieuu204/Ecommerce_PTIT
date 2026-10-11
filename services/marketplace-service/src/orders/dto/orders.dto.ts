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

export const BUYER_TABS = [
  'ALL',
  'UNPAID',
  'PROCESSING',
  'TO_SHIP',
  'SHIPPING',
  'COMPLETED',
  'CANCELLED',
] as const;
export const ADMIN_TABS = [...BUYER_TABS, 'INCIDENT'] as const;
export type BuyerTab = (typeof ADMIN_TABS)[number];

export const SHOP_ORDER_STATUSES = [
  'PENDING',
  'TO_CONFIRM',
  'CONFIRMED',
  'CANCEL_REQUESTED',
  'CANCELLED',
  'SHIPPING',
  'DELIVERED',
  'COMPLETED',
  'RETURNING',
  'RETURNED',
  'FAILED',
  'INCIDENT',
  'INCIDENT_RESOLVED',
] as const;

export class BuyerOrdersQuery extends PageQuery {
  /** ALL, UNPAID (chưa trả), PROCESSING (chờ duyệt/xác nhận), TO_SHIP (chờ giao), SHIPPING (đang giao), COMPLETED, CANCELLED */
  @ApiPropertyOptional({ enum: BUYER_TABS, default: 'ALL' })
  @IsOptional()
  @IsIn(BUYER_TABS, { message: 'Tab không hợp lệ.' })
  tab: BuyerTab = 'ALL';
}

export class AdminOrdersQuery extends BuyerOrdersQuery {
  /** Như người mua, thêm INCIDENT (đơn có sự cố GHN chờ xác nhận) */
  @ApiPropertyOptional({ enum: ADMIN_TABS, default: 'ALL' })
  @IsOptional()
  @IsIn(ADMIN_TABS, { message: 'Tab không hợp lệ.' })
  override tab: BuyerTab = 'ALL';

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

export class ReturnReceivedDto {
  /** Các dòng hàng nhập lại kho (dòng không có trong danh sách = hàng hỏng, không nhập) */
  @IsArray({ message: 'Danh sách dòng hàng không hợp lệ.' })
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true, message: 'Dòng hàng không hợp lệ.' })
  restockItemIds!: string[];
}

export class IncidentDto {
  /** Ghi chú xác nhận sự cố (ví dụ GHN xác nhận thất lạc ngày nào), 3–500 ký tự */
  @Transform(trim)
  @Length(3, 500, { message: 'Ghi chú dài từ 3 đến 500 ký tự.' })
  @IsString({ message: 'Ghi chú phải là chữ.' })
  @IsNotEmpty({ message: 'Vui lòng nhập ghi chú.' })
  note!: string;
}
