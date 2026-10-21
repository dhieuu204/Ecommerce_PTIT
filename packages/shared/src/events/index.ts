import type { EventEnvelope } from './envelope';
import {
  ADJUSTMENT_APPROVED,
  ADJUSTMENT_EXECUTED,
  WITHDRAWAL_APPROVAL_DECIDED,
  WITHDRAWAL_CANCELLED,
  WITHDRAWAL_REQUESTED,
  WITHDRAWAL_UPDATED,
  type AdjustmentApprovedPayload,
  type AdjustmentExecutedPayload,
  type WithdrawalApprovalDecidedPayload,
  type WithdrawalCancelledPayload,
  type WithdrawalRequestedPayload,
  type WithdrawalUpdatedPayload,
} from './finance';
import { NOTIFICATION_CREATED, type NotificationCreatedPayload } from './notification';
import {
  ORDER_CHECK_DECIDED,
  ORDER_PLACED,
  SHOP_ORDER_CANCELLED,
  SHOP_ORDER_COMPLETED,
  SHOP_ORDER_DELIVERED,
  SHOP_ORDER_DELIVERY_FAILED,
  SHOP_ORDER_INCIDENT_CONFIRMED,
  type OrderCheckDecidedPayload,
  type OrderPlacedPayload,
  type ShopOrderCancelledPayload,
  type ShopOrderCompletedPayload,
  type ShopOrderDeliveredPayload,
  type ShopOrderDeliveryFailedPayload,
  type ShopOrderIncidentConfirmedPayload,
} from './order';
import {
  PAYMENT_EXPIRED,
  PAYMENT_SUCCEEDED,
  REFUND_UPDATED,
  SELLER_EARNINGS_RECORDED,
  type PaymentExpiredPayload,
  type PaymentSucceededPayload,
  type RefundUpdatedPayload,
  type SellerEarningsRecordedPayload,
} from './payment';
import {
  DISPUTE_DECIDED,
  DISPUTE_OPENED,
  RETURN_REQUESTED,
  RETURN_RESOLVED,
  type DisputeDecidedPayload,
  type DisputeOpenedPayload,
  type ReturnRequestedPayload,
  type ReturnResolvedPayload,
} from './return';
import {
  SHOP_APPLICATION_DECIDED,
  SHOP_APPLICATION_SUBMITTED,
  SHOP_SUSPENSION_DECIDED,
  PRODUCT_MODERATION_DECIDED,
  type ProductModerationDecidedPayload,
  type ShopApplicationDecidedPayload,
  type ShopApplicationSubmittedPayload,
  type ShopSuspensionDecidedPayload,
} from './shop';

export * from './envelope';
export * from './finance';
export * from './notification';
export * from './order';
export * from './payment';
export * from './return';
export * from './shop';

/**
 * Bảng tra tên sự kiện → kiểu payload. Thêm sự kiện mới: khai báo payload ở file theo chủ đề,
 * thêm một dòng vào đây và một mục vào docs/api/events.md.
 */
export interface EventPayloads {
  [SHOP_APPLICATION_SUBMITTED]: ShopApplicationSubmittedPayload;
  [SHOP_APPLICATION_DECIDED]: ShopApplicationDecidedPayload;
  [SHOP_SUSPENSION_DECIDED]: ShopSuspensionDecidedPayload;
  [ORDER_PLACED]: OrderPlacedPayload;
  [SHOP_ORDER_CANCELLED]: ShopOrderCancelledPayload;
  [ORDER_CHECK_DECIDED]: OrderCheckDecidedPayload;
  [PAYMENT_SUCCEEDED]: PaymentSucceededPayload;
  [PAYMENT_EXPIRED]: PaymentExpiredPayload;
  [REFUND_UPDATED]: RefundUpdatedPayload;
  [SHOP_ORDER_DELIVERED]: ShopOrderDeliveredPayload;
  [SHOP_ORDER_COMPLETED]: ShopOrderCompletedPayload;
  [SHOP_ORDER_DELIVERY_FAILED]: ShopOrderDeliveryFailedPayload;
  [SHOP_ORDER_INCIDENT_CONFIRMED]: ShopOrderIncidentConfirmedPayload;
  [SELLER_EARNINGS_RECORDED]: SellerEarningsRecordedPayload;
  [RETURN_REQUESTED]: ReturnRequestedPayload;
  [RETURN_RESOLVED]: ReturnResolvedPayload;
  [DISPUTE_OPENED]: DisputeOpenedPayload;
  [DISPUTE_DECIDED]: DisputeDecidedPayload;
  [WITHDRAWAL_REQUESTED]: WithdrawalRequestedPayload;
  [WITHDRAWAL_CANCELLED]: WithdrawalCancelledPayload;
  [WITHDRAWAL_APPROVAL_DECIDED]: WithdrawalApprovalDecidedPayload;
  [ADJUSTMENT_APPROVED]: AdjustmentApprovedPayload;
  [ADJUSTMENT_EXECUTED]: AdjustmentExecutedPayload;
  [PRODUCT_MODERATION_DECIDED]: ProductModerationDecidedPayload;
  [WITHDRAWAL_UPDATED]: WithdrawalUpdatedPayload;
  [NOTIFICATION_CREATED]: NotificationCreatedPayload;
}

export type EventType = keyof EventPayloads;
export type SanEvent<T extends EventType = EventType> = EventEnvelope<T, EventPayloads[T]>;
