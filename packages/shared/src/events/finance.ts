/** Sự kiện của luồng rút tiền và điều chỉnh sau giải ngân (P5: FIN-04..06, DIS-02). */

import type { BankAccount } from './shop';

/** payment-service → approval-service: seller gửi yêu cầu rút, tiền đã chuyển sang ngăn đang khóa. */
export const WITHDRAWAL_REQUESTED = 'withdrawal.requested';
export interface WithdrawalRequestedPayload {
  withdrawalId: string;
  shopId: string;
  shopName: string;
  /** Chủ shop: approval-service chặn admin là chủ shop tự duyệt */
  owner: { userId: string; name: string };
  amount: number;
  /** Chỉ gửi 4 số cuối của số tài khoản */
  bankAccount: { bankName: string; accountNumberMasked: string; accountName: string };
  /** Số dư ví sau khi khóa */
  wallet: { pending: number; available: number; locked: number };
  requestedAt: string;
}

/** payment-service → approval-service: seller hủy yêu cầu rút khi chưa được duyệt. */
export const WITHDRAWAL_CANCELLED = 'withdrawal.cancelled';
export interface WithdrawalCancelledPayload {
  withdrawalId: string;
  cancelledAt: string;
}

/** approval-service → payment-service: admin tài chính duyệt hoặc từ chối yêu cầu rút. */
export const WITHDRAWAL_APPROVAL_DECIDED = 'withdrawal_approval.decided';
export interface WithdrawalApprovalDecidedPayload {
  withdrawalId: string;
  approvalId: string;
  decision: 'APPROVED' | 'REJECTED';
  /** Bắt buộc khi REJECTED */
  reason: string | null;
  decidedBy: { userId: string; name: string };
  decidedAt: string;
}

/** approval-service → payment-service: admin tài chính thứ hai duyệt đề nghị điều chỉnh (DIS-02). */
export const ADJUSTMENT_APPROVED = 'adjustment.approved';
export interface AdjustmentApprovedPayload {
  adjustmentId: string;
  orderId: string;
  shopOrderId: string;
  shopOrderCode: string;
  shopId: string;
  /** Cộng (dương) hoặc trừ (âm) ngăn khả dụng của shop; 0 = không đổi ví */
  sellerChange: number;
  /** Hoàn thêm cho người mua bằng chuyển khoản; 0 = không */
  buyerRefund: number;
  /** Tài khoản nhận của người mua khi buyerRefund > 0 */
  bankAccount: BankAccount | null;
  reason: string;
  createdBy: { userId: string; name: string };
  approvedBy: { userId: string; name: string };
  approvedAt: string;
}

/** payment-service → approval-service: kết quả thực thi đề nghị điều chỉnh. */
export const ADJUSTMENT_EXECUTED = 'adjustment.executed';
export interface AdjustmentExecutedPayload {
  adjustmentId: string;
  /** FAILED: không thực thi gì (tất cả hoặc không) */
  result: 'APPLIED' | 'FAILED';
  /** Lý do khi FAILED */
  message: string | null;
  executedAt: string;
}
