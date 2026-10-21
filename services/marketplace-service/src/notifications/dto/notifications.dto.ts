import { ApiPropertyOptional } from '@nestjs/swagger';
import { PageQuery } from '@san/nest-common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class NotificationsQuery extends PageQuery {
  /** true: chỉ thông báo chưa đọc */
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : value,
  )
  @IsBoolean({ message: 'unread phải là true hoặc false.' })
  unread?: boolean;
}

/** Một thông báo trên chuông và trang "Thông báo" */
export class NotificationView {
  id!: string;
  /** Loại, ví dụ ORDER_DELIVERED (docs/phan-tich/13-quyet-dinh-p6.md mục 3) */
  type!: string;
  title!: string;
  content!: string;
  /** Đường dẫn trên web khi bấm vào; null = không có trang để mở */
  link!: string | null;
  /** Đã đọc chưa */
  read!: boolean;
  readAt!: Date | null;
  createdAt!: Date;
}

export class UnreadCountView {
  /** Số thông báo chưa đọc */
  count!: number;
}
