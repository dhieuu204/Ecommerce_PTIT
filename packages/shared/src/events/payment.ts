/** Sự kiện của luồng thanh toán và hoàn tiền (P3: PAY-02, PAY-04, REF-01, ORD-04). */

/** Phí sàn và tiền seller của một đơn con (payment-service sở hữu phí sàn) */
export interface ShopOrderEarning {
  shopOrderId: string;
  /** Phí sàn tính theo phần vạn: 500 = 5,00% */
  platformFeeRate: number;
  platformFee: number;
  /** Seller dự kiến nhận = tiền hàng sau voucher shop - phí sàn */
  sellerAmount: number;
}

/** payment-service → marketplace-service: tiền của đơn tổng đã về và được áp vào đơn. */
export const PAYMENT_SUCCEEDED = 'payment.succeeded';
export interface PaymentSucceededPayload {
  orderId: string;
  paymentId: string;
  amount: number;
  paidAt: string;
  shopOrders: ShopOrderEarning[];
}

/** payment-service → marketplace-service: hết hạn thanh toán / hết số lần thử mà không có tiền. */
export const PAYMENT_EXPIRED = 'payment.expired';
export interface PaymentExpiredPayload {
  orderId: string;
  reason: 'TIMEOUT' | 'ATTEMPTS_EXHAUSTED';
  expiredAt: string;
}

/** Trạng thái khoản hoàn mà marketplace hiển thị cho buyer/seller */
export type RefundDisplayStatus = 'PROCESSING' | 'NEEDS_MANUAL' | 'SUCCEEDED' | 'MANUAL_DONE';

/** payment-service → marketplace-service: khoản hoàn đổi trạng thái. */
export const REFUND_UPDATED = 'refund.updated';
export interface RefundUpdatedPayload {
  refundId: string;
  orderId: string;
  /** null: hoàn cả khoản trả muộn/trả trùng, không gắn đơn con */
  shopOrderId: string | null;
  amount: number;
  status: RefundDisplayStatus;
  /** marketplace chỉ áp trạng thái mới hơn */
  updatedAt: string;
}
