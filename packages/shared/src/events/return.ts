/** Sự kiện của luồng trả hàng và tranh chấp (P5: RET-01..04, DIS-01). */

import type { PaymentMethod } from './order';
import type { BankAccount } from './shop';

/** Lý do trả hàng: chỉ lỗi hàng hoặc lỗi shop, không nhận "đổi ý" (quyết định P5 số 1) */
export type ReturnReason =
  'DEFECTIVE' | 'DAMAGED' | 'WRONG_ITEM' | 'MISSING' | 'NOT_AS_DESCRIBED' | 'COUNTERFEIT';

/** REQUEST_REJECTED: shop từ chối, người mua khiếu nại. GOODS_PROBLEM: shop báo hàng trả về không đúng */
export type DisputeStage = 'REQUEST_REJECTED' | 'GOODS_PROBLEM';

/** marketplace-service → payment-service: người mua gửi yêu cầu trả hàng (giữ tiền seller của đơn con). */
export const RETURN_REQUESTED = 'return.requested';
export interface ReturnRequestedPayload {
  returnId: string;
  /** Mã đơn con + "-TH" */
  code: string;
  orderId: string;
  shopOrderId: string;
  /** Số hoàn tối đa người mua yêu cầu */
  refundAmount: number;
  requestedAt: string;
}

/** marketplace-service → payment-service: yêu cầu trả hàng có kết quả (hoàn tiền, đóng, hủy). */
export const RETURN_RESOLVED = 'return.resolved';
export interface ReturnResolvedPayload {
  returnId: string;
  code: string;
  orderId: string;
  shopOrderId: string;
  /** REFUND: hoàn tiền; NO_REFUND: đóng không hoàn, người mua hủy, quá hạn gửi hàng */
  outcome: 'REFUND' | 'NO_REFUND';
  /** Số hoàn cho người mua; 0 khi NO_REFUND */
  refundAmount: number;
  /** Số hoàn tối đa = tổng số người mua đã trả cho các món trả */
  maxRefundAmount: number;
  /** Tiền hàng sau voucher shop của các món trả (phần trừ tiền seller khi hoàn toàn bộ) */
  sellerBase: number;
  /** true: sàn chịu (kiện trả bị GHN làm thất lạc), không trừ tiền seller */
  platformCovers: boolean;
  /** Tài khoản nhận tiền hoàn của đơn COD; null với đơn trả trước (hoàn qua cổng) */
  bankAccount: BankAccount | null;
  resolvedAt: string;
}

/** Lời trình bày của một bên trong tranh chấp */
export interface DisputeStatement {
  text: string;
  /** Khóa ảnh trong MinIO riêng tư của marketplace (xem qua API của marketplace) */
  images: string[];
}

/** marketplace-service → approval-service: mở tranh chấp trả hàng. */
export const DISPUTE_OPENED = 'dispute.opened';
export interface DisputeOpenedPayload {
  returnId: string;
  returnCode: string;
  stage: DisputeStage;
  orderId: string;
  orderCode: string;
  shopOrderId: string;
  shopOrderCode: string;
  /** ownerId: chủ shop, approval-service chặn admin là chủ shop tự quyết */
  shop: { shopId: string; name: string; ownerId: string };
  buyer: { userId: string; name: string };
  paymentMethod: PaymentMethod;
  reason: ReturnReason;
  description: string;
  images: string[];
  items: Array<{
    name: string;
    /** '' nếu không phân loại */
    variant: string;
    price: number;
    /** Số lượng trả */
    quantity: number;
    refundAmount: number;
  }>;
  maxRefundAmount: number;
  buyerStatement: DisputeStatement;
  sellerStatement: DisputeStatement;
  openedAt: string;
}

/** approval-service → marketplace-service: admin hỗ trợ phân xử tranh chấp trả hàng. */
export const DISPUTE_DECIDED = 'dispute.decided';
export interface DisputeDecidedPayload {
  disputeId: string;
  returnId: string;
  stage: DisputeStage;
  /**
   * ACCEPT_RETURN: người mua gửi hàng về rồi shop kiểm như thường (chỉ giai đoạn REQUEST_REJECTED);
   * REFUND: hoàn refundAmount; REJECT: không hoàn
   */
  decision: 'ACCEPT_RETURN' | 'REFUND' | 'REJECT';
  /** Chỉ khi REFUND: từ 1 tới số hoàn tối đa */
  refundAmount: number | null;
  note: string;
  decidedBy: { userId: string; name: string };
  decidedAt: string;
}
