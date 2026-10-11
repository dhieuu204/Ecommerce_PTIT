/**
 * Kiểu dữ liệu P4 về tiền: ví seller, tiền từng đơn con, đối soát COD và VNPay, bảng GHN mô phỏng
 * (docs/api/README.md mục 5). Thời gian là chuỗi ISO (UTC).
 */

import type { AdminRefund, AdminRefundStatus, ShipmentStatus } from './order-types';

export type EarningStatus =
  'UNPAID' | 'HELD' | 'AVAILABLE' | 'EXPIRED' | 'CANCELLED' | 'FAILED' | 'COMPENSATED';

export type WalletBucket = 'PENDING' | 'AVAILABLE' | 'LOCKED';
export type WalletTxType = 'HELD' | 'RELEASED' | 'REVERSED' | 'COMPENSATION';

export interface Wallet {
  /** null: shop chưa có đơn nào */
  shopId: string | null;
  pending: number;
  available: number;
  locked: number;
  pendingWaitingCompletion: number;
  pendingWaitingCod: number;
}

export interface WalletTransaction {
  id: string;
  type: WalletTxType;
  amount: number;
  fromBucket: WalletBucket | null;
  toBucket: WalletBucket | null;
  shopOrderId: string | null;
  shopOrderCode: string | null;
  note: string | null;
  createdAt: string;
}

export interface Earning {
  shopOrderId: string;
  shopOrderCode: string;
  orderCode: string;
  paymentMethod: 'VNPAY' | 'COD';
  subtotal: number;
  shopDiscount: number;
  platformFeeRate: number;
  platformFee: number;
  sellerAmount: number;
  status: EarningStatus;
  waitingFor: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  moneyReceivedAt: string | null;
  releasedAt: string | null;
  createdAt: string;
}

// ----- đối soát COD -----

export type ReconcileResult =
  'MATCHED' | 'MISMATCHED' | 'DUPLICATE' | 'NOT_FOUND' | 'NOT_DELIVERED';

export interface CodReconciliation {
  id: string;
  fileName: string;
  uploadedByName: string;
  totalRows: number;
  matched: number;
  mismatched: number;
  duplicated: number;
  notFound: number;
  notDelivered: number;
  totalCod: number;
  createdAt: string;
}

export interface CodReconciliationItem {
  id: string;
  rowNumber: number;
  ghnCode: string;
  shopOrderId: string | null;
  shopOrderCode: string | null;
  codAmount: number;
  shipFee: number;
  returnFee: number;
  expectedCod: number | null;
  buyerShippingFee: number | null;
  codDifference: number | null;
  shippingDifference: number | null;
  result: ReconcileResult;
  resolution: 'ACCEPTED' | 'NOTED' | null;
  note: string | null;
  resolvedAt: string | null;
}

export interface CodReconciliationDetail extends CodReconciliation {
  items: CodReconciliationItem[];
}

// ----- đối soát VNPay -----

export type VnpayExceptionKind = 'MISMATCH' | 'UNKNOWN' | 'LATE_OR_DUPLICATE';

export interface VnpayPaymentException {
  paymentId: string;
  kind: VnpayExceptionKind;
  ref: string;
  orderId: string;
  orderCode: string | null;
  gateway: 'VNPAY' | 'MOCK';
  amount: number;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
  applied: boolean;
  paidAt: string | null;
  transactionNo: string | null;
  reconcileStatus: 'MATCHED' | 'MISMATCH' | 'RESOLVED' | null;
  reconcileNote: string | null;
  reconciledAt: string | null;
}

export interface VnpayReconciliation {
  lastRunAt: string | null;
  payments: VnpayPaymentException[];
  refunds: Array<{
    refundId: string;
    orderCode: string | null;
    amount: number;
    reason: AdminRefund['reason'];
    status: AdminRefundStatus;
    lastError: string | null;
    createdAt: string;
  }>;
  resolved: VnpayPaymentException[];
}

// ----- GHN mô phỏng -----

export type SimulatorEvent =
  'PICKED' | 'DELIVERY_FAILED' | 'DELIVERED' | 'RETURN' | 'RETURNED' | 'LOST';

export interface SimulatorRow {
  id: string;
  ghnCode: string | null;
  status: ShipmentStatus;
  failedAttempts: number;
  shopOrderId: string;
  shopOrderCode: string;
  shopName: string;
  receiverName: string;
  address: string;
  codAmount: number;
  createdAt: string;
  actions: SimulatorEvent[];
}
