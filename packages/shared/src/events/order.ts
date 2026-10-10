/** Sự kiện của luồng đặt hàng và kiểm tra đơn (P3: ORD-01, ORD-05, RSK-01). */

/** P3 chỉ có trả trước qua VNPay; COD thêm ở P4 */
export type PaymentMethod = 'VNPAY';

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
  /** Hạn thanh toán */
  payBefore: string;
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
