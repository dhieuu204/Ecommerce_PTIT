import { ApiPropertyOptional } from '@nestjs/swagger';
import { PageQuery } from '@san/nest-common';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreatePaymentDto {
  @IsUUID('all', { message: 'Đơn không hợp lệ.' })
  orderId!: string;

  /** IP của buyer (marketplace chuyển kèm); không có thì lấy IP người gọi */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientIp?: string;
}

export class PaymentReturnDto {
  /** Các tham số VNPay gắn vào đường dẫn quay về (vnp_TxnRef, vnp_ResponseCode, vnp_SecureHash...) */
  @IsObject({ message: 'Thiếu dữ liệu cổng thanh toán.' })
  params!: Record<string, string>;
}

export class MockCompleteDto {
  /** SUCCESS: trả thành công; FAILED: thất bại; PAID_NO_NOTICE: trả tiền nhưng mất tin báo */
  @IsIn(['SUCCESS', 'FAILED', 'PAID_NO_NOTICE'], { message: 'Kết quả không hợp lệ.' })
  result!: 'SUCCESS' | 'FAILED' | 'PAID_NO_NOTICE';
}

export const REFUND_STATUSES = [
  'PENDING',
  'FAILED',
  'UNKNOWN',
  'NEEDS_MANUAL',
  'SUCCEEDED',
  'MANUAL_DONE',
] as const;

export class RefundsQuery extends PageQuery {
  @ApiPropertyOptional({ enum: REFUND_STATUSES })
  @IsOptional()
  @IsIn(REFUND_STATUSES, { message: 'Trạng thái không hợp lệ.' })
  status?: (typeof REFUND_STATUSES)[number];
}

export class ManualRefundDto {
  /** Mã giao dịch chuyển khoản cho buyer */
  @Transform(trim)
  @Length(3, 60, { message: 'Mã giao dịch dài từ 3 đến 60 ký tự.' })
  @IsString({ message: 'Mã giao dịch phải là chữ.' })
  @IsNotEmpty({ message: 'Vui lòng nhập mã giao dịch.' })
  transferCode!: string;

  /** Mã ảnh biên lai nhận từ POST /admin/uploads/refund-receipt */
  @IsString({ message: 'Vui lòng tải ảnh biên lai.' })
  @IsNotEmpty({ message: 'Vui lòng tải ảnh biên lai.' })
  @MaxLength(200)
  receiptKey!: string;

  /** Ghi chú (ví dụ chuyển vào tài khoản nào) */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string;
}
