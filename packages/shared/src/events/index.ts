import type { EventEnvelope } from './envelope';
import {
  SHOP_APPLICATION_DECIDED,
  SHOP_APPLICATION_SUBMITTED,
  type ShopApplicationDecidedPayload,
  type ShopApplicationSubmittedPayload,
} from './shop';

export * from './envelope';
export * from './shop';

/**
 * Bảng tra tên sự kiện → kiểu payload. Thêm sự kiện mới: khai báo payload ở file theo chủ đề,
 * thêm một dòng vào đây và một mục vào docs/api/events.md.
 */
export interface EventPayloads {
  [SHOP_APPLICATION_SUBMITTED]: ShopApplicationSubmittedPayload;
  [SHOP_APPLICATION_DECIDED]: ShopApplicationDecidedPayload;
}

export type EventType = keyof EventPayloads;
export type SanEvent<T extends EventType = EventType> = EventEnvelope<T, EventPayloads[T]>;
