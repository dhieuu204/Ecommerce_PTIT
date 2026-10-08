import type { EventEnvelope } from './envelope';
import {
  SHOP_APPLICATION_SUBMITTED,
  SHOP_REVIEW_DECIDED,
  type ShopApplicationSubmittedPayload,
  type ShopReviewDecidedPayload,
} from './shop';

export * from './envelope';
export * from './shop';

/**
 * Bảng tra tên sự kiện → kiểu payload. Thêm sự kiện mới: khai báo payload ở file theo chủ đề,
 * thêm một dòng vào đây và một mục vào docs/api/events.md.
 */
export interface EventPayloads {
  [SHOP_APPLICATION_SUBMITTED]: ShopApplicationSubmittedPayload;
  [SHOP_REVIEW_DECIDED]: ShopReviewDecidedPayload;
}

export type EventType = keyof EventPayloads;
export type SanEvent<T extends EventType = EventType> = EventEnvelope<T, EventPayloads[T]>;
