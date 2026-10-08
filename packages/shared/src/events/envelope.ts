import type { ServiceName } from '../index';

/** Exchange kiểu topic trên RabbitMQ; routing key = tên sự kiện (type). */
export const EVENTS_EXCHANGE = 'san.events';

/**
 * Vỏ chung của mọi sự kiện. Bên gửi ghi vào bảng outbox trong cùng giao dịch DB,
 * tiến trình relay mới đẩy lên RabbitMQ. Bên nhận lưu eventId vào bảng inbox để bỏ bản trùng.
 */
export interface EventEnvelope<TType extends string, TPayload> {
  /** UUID, duy nhất cho mỗi sự kiện */
  eventId: string;
  /** Tên sự kiện dạng <thực thể>.<động từ quá khứ>, ví dụ shop.application_submitted */
  type: TType;
  /** Phiên bản nội dung; đổi kiểu payload không tương thích thì tăng số này */
  version: number;
  /** Thời điểm xảy ra (ISO 8601, UTC) */
  occurredAt: string;
  producer: ServiceName;
  /** Mã nối các bước của cùng một thao tác qua nhiều service (lấy từ request gốc) */
  correlationId: string;
  payload: TPayload;
}
