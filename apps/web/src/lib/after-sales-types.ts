/**
 * Kiểu dữ liệu P5 (trả hàng, tranh chấp, rút tiền, điều chỉnh sau giải ngân) theo API ở docs/api/README.md
 * mục 6. Thời gian là chuỗi ISO (UTC).
 */

import type { CancelActor, PaymentMethod, RefundStatus, Shipment } from './order-types';
import type { WalletTransaction } from './finance-types';

export type ReturnStatus =
  | 'REQUESTED'
  | 'REJECTED'
  | 'DISPUTED'
  | 'SHIPPING_BACK'
  | 'RECEIVED'
  | 'REFUNDING'
  | 'REFUNDED'
  | 'CLOSED'
  | 'CANCELLED';

export type ReturnReason =
  'DEFECTIVE' | 'DAMAGED' | 'WRONG_ITEM' | 'MISSING' | 'NOT_AS_DESCRIBED' | 'COUNTERFEIT';

export type DisputeStage = 'REQUEST_REJECTED' | 'GOODS_PROBLEM';

export interface BankAccount {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

/** Tóm tắt yêu cầu trả hàng gắn vào đơn con (trang đơn) */
export interface ReturnSummary {
  id: string;
  code: string;
  status: ReturnStatus;
  refundAmount: number;
  decidedRefund: number | null;
}

export interface ReturnItem {
  orderItemId: string;
  productName: string;
  variantName: string;
  image: string | null;
  price: number;
  purchasedQuantity: number;
  quantity: number;
  refundAmount: number;
  restocked: boolean;
}

export interface ReturnHistoryEntry {
  at: string;
  actorType: CancelActor;
  actorName: string | null;
  status: ReturnStatus;
  note: string | null;
}

export interface ReturnRequest {
  id: string;
  code: string;
  status: ReturnStatus;
  reason: ReturnReason;
  description: string;
  /** Khóa ảnh; xem qua GET /return-images/{khóa} (cần đăng nhập) */
  images: string[];
  orderId: string;
  orderCode: string;
  shopOrderId: string;
  shopOrderCode: string;
  shop: { id: string; name: string; logoUrl: string | null };
  /** Shop và admin thấy */
  buyer?: { id: string; name: string };
  paymentMethod: PaymentMethod;
  items: ReturnItem[];
  refundAmount: number;
  decidedRefund: number | null;
  refundWithoutReturn: boolean;
  platformCovers: boolean;
  refundStatus: RefundStatus;
  /** Shop và admin chỉ thấy 4 số cuối */
  bankAccount: BankAccount | null;
  sellerNote: string | null;
  sellerImages: string[];
  disputeNote: string | null;
  disputeImages: string[];
  disputeStage: DisputeStage | null;
  deadline: string | null;
  createdAt: string;
  resolvedAt: string | null;
  shipment: Omit<Shipment, 'failedAttempts'> | null;
  /** Chỉ ở trang chi tiết */
  history?: ReturnHistoryEntry[];
  actions: {
    canCancel: boolean;
    canDispute: boolean;
    canRetryShipment: boolean;
    canRespond: boolean;
    canInspect: boolean;
    canConfirmLost: boolean;
    /** Admin: vận đơn trả lỗi quá hạn, hủy yêu cầu hoặc hoàn tiền không cần gửi trả */
    canResolveFailedShipment: boolean;
  };
}

export interface SellerReturnPage {
  items: ReturnRequest[];
  page: number;
  pageSize: number;
  total: number;
  counts: Record<ReturnStatus, number>;
}

// ----- rút tiền -----

export type WithdrawalStatus =
  'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED' | 'CANCELLED' | 'FAILED';

export interface Withdrawal {
  id: string;
  shopId: string;
  shopName: string;
  ownerId: string;
  ownerName: string;
  amount: number;
  status: WithdrawalStatus;
  /** Seller thấy 4 số cuối; admin tài chính thấy đủ */
  bankAccount: BankAccount;
  reason: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  transferCode: string | null;
  hasReceipt: boolean;
  paidByName: string | null;
  paidAt: string | null;
  note: string | null;
  createdAt: string;
  canCancel: boolean;
}

export interface AdminWallet {
  shopId: string;
  ownerId: string;
  pending: number;
  available: number;
  locked: number;
  openWithdrawal: {
    id: string;
    amount: number;
    status: WithdrawalStatus;
    createdAt: string;
  } | null;
  recentTransactions: WalletTransaction[];
}

export interface WithdrawalDetail extends Withdrawal {
  wallet: AdminWallet;
}

export interface AdminWithdrawalPage {
  items: Withdrawal[];
  page: number;
  pageSize: number;
  total: number;
  totalAmount: number;
}

/** Hồ sơ duyệt rút (approval-service) */
export interface WithdrawalApproval {
  id: string;
  withdrawalId: string;
  shop: { id: string; name: string };
  owner: { id: string; name: string };
  amount: number;
  bankAccount: { bankName: string; accountNumberMasked: string; accountName: string };
  wallet: { pending: number; available: number; locked: number };
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  reason: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  requestedAt: string;
}

// ----- tranh chấp, điều chỉnh (approval-service) -----

export interface Dispute {
  id: string;
  returnId: string;
  returnCode: string;
  stage: DisputeStage;
  orderCode: string;
  shopOrderCode: string;
  shop: { id: string; name: string; ownerId: string };
  buyer: { id: string; name: string };
  status: 'PENDING' | 'RESOLVED';
  decision: 'ACCEPT_RETURN' | 'REFUND' | 'REJECT' | null;
  maxRefund: number;
  refundAmount: number | null;
  deadline: string | null;
  overdue: boolean;
  decisionNote: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  createdAt: string;
  returnData?: {
    paymentMethod: PaymentMethod;
    reason: ReturnReason;
    description: string;
    images: string[];
    items: Array<{
      name: string;
      variant: string;
      price: number;
      quantity: number;
      refundAmount: number;
    }>;
  };
  buyerStatement?: { text: string; images: string[] };
  sellerStatement?: { text: string; images: string[] };
}

export type AdjustmentStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'FAILED';

export interface Adjustment {
  id: string;
  orderCode: string;
  shopOrderCode: string;
  shop: { id: string; name: string };
  buyer: { id: string; name: string };
  sellerChange: number;
  buyerRefund: number;
  bankAccount: BankAccount | null;
  reason: string;
  status: AdjustmentStatus;
  createdById: string;
  createdByName: string;
  createdAt: string;
  decisionNote: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  executionNote: string | null;
  executedAt: string | null;
}

/** Tiền của một đơn con (payment-service) để lập điều chỉnh */
export interface ShopOrderMoney {
  shopOrderId: string;
  shopOrderCode: string;
  orderId: string;
  orderCode: string;
  shopId: string;
  buyerId: string;
  paymentMethod: PaymentMethod;
  buyerPaid: number;
  refunded: number;
  sellerAmount: number;
  returnDeduction: number;
  sellerReceives: number;
  status: string;
  wallet: { pending: number; available: number; locked: number };
}
