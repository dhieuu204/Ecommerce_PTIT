/** Sự kiện của luồng đặt hàng và kiểm tra đơn (P3: ORD-01, ORD-05, RSK-01). */

/** Trả trước qua VNPay, hoặc thanh toán khi nhận hàng (COD, từ P4) */
export type PaymentMethod = 'VNPAY' | 'COD';

/** Ai hủy đơn con */
export type CancelActor = 'BUYER' | 'SELLER' | 'ADMIN' | 'SYSTEM';

/** Một dòng hàng chép vào sự kiện (để admin duyệt đơn xem được mà không gọi ngược marketplace) */
export interface PlacedOrderItem {
  name: string;
  /** Ví dụ "Đen, 128GB"; '' nếu không có phân loại */
  variant: string;
  price: number;
  quantity: number;
}

export interface PlacedShopOrder {
  shopOrderId: string;
  /** Mã đơn con, ví dụ 261011ABC123-1 */
  code: string;
  shopId: string;
  shopName: string;
  /** Chủ shop: approval-service chặn admin tự duyệt đơn của shop mình */
  ownerId: string;
  /** Tiền hàng */
  subtotal: number;
  shopDiscount: number;
  /** Phần voucher sàn chia cho đơn con này */
  platformDiscount: number;
  shippingFee: number;
  /** Buyer trả cho đơn con này = subtotal - shopDiscount - platformDiscount + shippingFee */
  total: number;
  items: PlacedOrderItem[];
}

/** marketplace-service → payment-service, approval-service: buyer đặt hàng thành công. */
export const ORDER_PLACED = 'order.placed';
export interface OrderPlacedPayload {
  orderId: string;
  /** Mã đơn tổng, ví dụ 261011ABC123 */
  code: string;
  buyer: { userId: string; name: string; email: string };
  paymentMethod: PaymentMethod;
  /** Tổng buyer phải trả (đồng) = tổng total các đơn con */
  total: number;
  /** Hạn thanh toán; null với đơn COD */
  payBefore: string | null;
  /** Tên tỉnh/thành nhận hàng */
  shippingProvince: string;
  shopOrders: PlacedShopOrder[];
  placedAt: string;
}

/** marketplace-service → payment-service, approval-service: một đơn con bị hủy. */
export const SHOP_ORDER_CANCELLED = 'shop_order.cancelled';
export interface ShopOrderCancelledPayload {
  orderId: string;
  shopOrderId: string;
  code: string;
  shopId: string;
  cancelledBy: CancelActor;
  reason: string;
  /** true khi sau lần hủy này mọi đơn con của đơn tổng đều đã hủy */
  orderCancelled: boolean;
  cancelledAt: string;
}

/** approval-service → marketplace-service: kết quả kiểm tra đơn. */
export const ORDER_CHECK_DECIDED = 'order_check.decided';
export interface OrderCheckDecidedPayload {
  orderId: string;
  checkId: string;
  /** PASSED: qua (tự động hoặc admin duyệt); REJECTED: admin từ chối; TIMEOUT: quá hạn chưa duyệt */
  result: 'PASSED' | 'REJECTED' | 'TIMEOUT';
  /** Bắt buộc khi REJECTED/TIMEOUT */
  reason: string | null;
  /** null khi tự động (không chạm luật, quá hạn) */
  decidedBy: { userId: string; name: string } | null;
  decidedAt: string;
}

// ----- P4: giao hàng -----

/** marketplace-service → payment-service: GHN giao thành công một đơn con. */
export const SHOP_ORDER_DELIVERED = 'shop_order.delivered';
export interface ShopOrderDeliveredPayload {
  orderId: string;
  shopOrderId: string;
  paymentMethod: PaymentMethod;
  /** Mã vận đơn GHN (khớp file đối soát COD) */
  ghnCode: string;
  /** Số GHN thu hộ; 0 với trả trước */
  codAmount: number;
  /** Phí GHN tính cho vận đơn; null nếu chưa biết */
  carrierFee: number | null;
  deliveredAt: string;
}

/** marketplace-service → payment-service: đơn con hoàn tất. */
export const SHOP_ORDER_COMPLETED = 'shop_order.completed';
export interface ShopOrderCompletedPayload {
  orderId: string;
  shopOrderId: string;
  /** BUYER: người mua bấm "Đã nhận"; SYSTEM: hết hạn */
  completedBy: 'BUYER' | 'SYSTEM';
  completedAt: string;
}

/** marketplace-service → payment-service: giao thất bại lần cuối, bắt đầu hoàn kiện. */
export const SHOP_ORDER_DELIVERY_FAILED = 'shop_order.delivery_failed';
export interface ShopOrderDeliveryFailedPayload {
  orderId: string;
  shopOrderId: string;
  paymentMethod: PaymentMethod;
  /** Trả trước: tiền hàng sau voucher (không hoàn phí ship chiều đi); COD: 0 */
  refundAmount: number;
  failedAt: string;
}

/** marketplace-service → payment-service: admin xác nhận GHN làm mất/hỏng hàng. */
export const SHOP_ORDER_INCIDENT_CONFIRMED = 'shop_order.incident_confirmed';
export interface ShopOrderIncidentConfirmedPayload {
  orderId: string;
  shopOrderId: string;
  paymentMethod: PaymentMethod;
  /** Trả trước: hoàn đủ số đã trả cho đơn con; COD: 0 */
  refundAmount: number;
  note: string;
  confirmedAt: string;
}
