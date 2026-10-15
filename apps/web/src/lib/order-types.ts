/**
 * Kiểu dữ liệu P3–P4 (đặt hàng, thanh toán, kiểm tra đơn, hoàn tiền, cấu hình, giao hàng, COD) theo API ở
 * docs/api/README.md mục 4 và 5. Thời gian là chuỗi ISO (UTC).
 */

import type { BankAccount, ReturnSummary } from './after-sales-types';
import type { EarningStatus } from './finance-types';

export type ShopOrderStatus =
  | 'PENDING'
  | 'TO_CONFIRM'
  | 'CONFIRMED'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED'
  // P4: giao hàng
  | 'SHIPPING'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'RETURNING'
  | 'RETURNED'
  | 'FAILED'
  | 'INCIDENT'
  | 'INCIDENT_RESOLVED';
export type PaymentMethod = 'VNPAY' | 'COD';
/** COD: thanh toán khi nhận hàng (không có bước trả trước) */
export type PaymentStatus = 'UNPAID' | 'PAID' | 'COD';
export type ShipmentStatus =
  | 'CREATING'
  | 'UNKNOWN'
  | 'CREATE_FAILED'
  | 'READY_TO_PICK'
  | 'PICKED'
  | 'DELIVERED'
  | 'RETURNING'
  | 'RETURNED'
  | 'CANCELLING'
  | 'CANCELLED'
  | 'LOST';
export type CancelActor = 'BUYER' | 'SELLER' | 'ADMIN' | 'SYSTEM';
export type ShippingFeeSource = 'GHN' | 'FALLBACK' | 'FIXED';
export type RefundStatus = 'NONE' | 'PROCESSING' | 'NEEDS_MANUAL' | 'SUCCEEDED' | 'MANUAL_DONE';

// ----- checkout -----

export type LineState = 'OK' | 'NOT_ENOUGH_STOCK' | 'OUT_OF_STOCK' | 'UNAVAILABLE' | 'OWN_PRODUCT';

export interface CheckoutLine {
  cartItemId: string;
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  image: string | null;
  price: number;
  originalPrice: number | null;
  quantity: number;
  lineTotal: number;
  available: number;
  state: LineState;
}

export interface VoucherOption {
  code: string;
  name: string;
  discountType: 'AMOUNT' | 'PERCENT';
  value: number;
  maxDiscount: number | null;
  minOrder: number;
  endAt: string;
  discount: number;
  eligible: boolean;
  reason: string | null;
}

export interface AppliedVoucher {
  code: string;
  name: string;
  discount: number;
}

export interface CheckoutShop {
  shop: { id: string; name: string; logoUrl: string | null };
  items: CheckoutLine[];
  subtotal: number;
  shopVoucher: AppliedVoucher | null;
  vouchers: VoucherOption[];
  shopDiscount: number;
  shippingFee: number;
  shippingFeeSource: ShippingFeeSource;
  platformDiscount: number;
  total: number;
}

export interface CheckoutPreview {
  checkoutId: string;
  expiresAt: string;
  paymentMethod: PaymentMethod;
  /** Mọi shop trong đơn đều nhận COD */
  codAvailable: boolean;
  address: {
    id: string;
    receiverName: string;
    phone: string;
    provinceName: string;
    fullAddress: string;
  };
  shops: CheckoutShop[];
  platformVoucher: AppliedVoucher | null;
  platformVouchers: VoucherOption[];
  subtotal: number;
  shopDiscount: number;
  platformDiscount: number;
  shippingFee: number;
  total: number;
  problems: Array<{ cartItemId: string | null; message: string }>;
  voucherErrors: Array<{ shopId: string | null; code: string; message: string }>;
  canPlace: boolean;
}

export interface PlacedOrder {
  orderId: string;
  code: string;
  total: number;
  /** Trống với đơn COD */
  payBefore: string | null;
}

export interface PaymentLink {
  paymentId: string;
  attempt: number;
  maxAttempts: number;
  payUrl: string;
  gateway: 'VNPAY' | 'MOCK';
  payBefore: string;
}

/** Tình hình thanh toán (payment-service) */
export interface OrderPayment {
  orderId: string;
  orderCode: string;
  status: 'UNPAID' | 'PAID' | 'EXPIRED' | 'CANCELLED';
  amount: number;
  payBefore: string | null;
  attempts: number;
  maxAttempts: number;
  gateway: 'VNPAY' | 'MOCK';
  lastAttempt: {
    attempt: number;
    status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
    payUrl: string | null;
  } | null;
}

// ----- đơn hàng -----

export interface OrderItem {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  image: string | null;
  price: number;
  originalPrice: number | null;
  quantity: number;
}

export interface OrderHistoryRow {
  fromStatus: ShopOrderStatus | null;
  toStatus: ShopOrderStatus;
  actorType: CancelActor;
  actorName: string | null;
  note: string | null;
  createdAt: string;
}

/** Một mốc vận chuyển GHN báo về (mới nhất trước) */
export interface TrackingRow {
  ghnStatus: string;
  note: string | null;
  happenedAt: string;
}

/** Vận đơn của đơn con */
export interface Shipment {
  ghnCode: string | null;
  status: ShipmentStatus;
  failedAttempts: number;
  fee: number | null;
  /** Vận đơn MÔ PHỎNG (chưa nối GHN thật) */
  simulated: boolean;
  lastError: string | null;
  /** Chỉ ở trang chi tiết */
  tracking?: TrackingRow[];
}

export interface ShopOrder {
  id: string;
  code: string;
  shop: { id: string; name: string; logoUrl: string | null };
  status: ShopOrderStatus;
  subtotal: number;
  shopVoucherCode: string | null;
  shopDiscount: number;
  platformDiscount: number;
  shippingFee: number;
  shippingFeeSource: ShippingFeeSource;
  total: number;
  codAmount: number;
  confirmBefore: string | null;
  confirmedAt: string | null;
  deliveredAt: string | null;
  /** Tự hoàn tất lúc này nếu người mua chưa bấm "Đã nhận hàng" */
  completeBefore: string | null;
  completedAt: string | null;
  incidentNote: string | null;
  canConfirmReceived: boolean;
  /** Gửi được yêu cầu trả hàng: đã giao, còn hạn, chưa có yêu cầu (P5) */
  canRequestReturn: boolean;
  returnRequest: ReturnSummary | null;
  shipment: Shipment | null;
  cancelledBy: CancelActor | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  cancelRequestReason: string | null;
  cancelRequestUsed: boolean;
  refundStatus: RefundStatus;
  cancelAction: 'NOW' | 'REQUEST' | null;
  items: OrderItem[];
  history?: OrderHistoryRow[];
}

export interface Order {
  id: string;
  code: string;
  status: 'PROCESSING' | 'COMPLETED' | 'PARTIALLY_COMPLETED' | 'CANCELLED';
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  checkStatus: 'PENDING' | 'PASSED' | 'REJECTED';
  /** Trống với đơn COD */
  payBefore: string | null;
  paidAt: string | null;
  createdAt: string;
  canPay: boolean;
  canCancel: boolean;
  receiver: { name: string; phone: string; address: string };
  platformVoucherCode: string | null;
  subtotal: number;
  shopDiscount: number;
  platformDiscount: number;
  shippingFee: number;
  total: number;
  shopOrders: ShopOrder[];
  buyer?: { id: string; name: string; email: string };
}

export type BuyerTab =
  'ALL' | 'UNPAID' | 'PROCESSING' | 'TO_SHIP' | 'SHIPPING' | 'COMPLETED' | 'CANCELLED';
/** Admin có thêm tab đơn có sự cố GHN chờ xác nhận */
export type AdminTab = BuyerTab | 'INCIDENT';

export interface SellerOrder {
  id: string;
  code: string;
  orderId: string;
  orderCode: string;
  status: ShopOrderStatus;
  createdAt: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paidAt: string | null;
  checkStatus: 'PENDING' | 'PASSED' | 'REJECTED';
  buyerName: string;
  receiver: { name: string; phone: string; address: string };
  items: OrderItem[];
  subtotal: number;
  shopVoucherCode: string | null;
  shopDiscount: number;
  shippingFee: number;
  shippingFeeSource: ShippingFeeSource;
  platformFeeRate: number | null;
  platformFee: number | null;
  sellerAmount: number | null;
  codAmount: number;
  confirmBefore: string | null;
  confirmedAt: string | null;
  /** Hạn bàn giao cho GHN */
  handoverBefore: string | null;
  pickedAt: string | null;
  deliveredAt: string | null;
  completeBefore: string | null;
  completedAt: string | null;
  returnedAt: string | null;
  /** Hạn shop xác nhận đã nhận kiện hoàn (quá hạn thì tự đóng, không cộng kho) */
  returnCloseBefore: string | null;
  cancelledBy: CancelActor | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  cancelRequestReason: string | null;
  cancelRequestedAt: string | null;
  refundStatus: RefundStatus;
  incidentNote: string | null;
  returnRequest: ReturnSummary | null;
  shipment: Shipment | null;
  history?: OrderHistoryRow[];
}

export interface SellerOrderPage {
  items: SellerOrder[];
  page: number;
  pageSize: number;
  total: number;
  counts: Record<ShopOrderStatus, number>;
}

// ----- admin -----

export type OrderCheckStatus = 'PENDING' | 'PASSED' | 'REJECTED' | 'TIMEOUT' | 'CANCELLED';

export interface OrderCheck {
  id: string;
  orderId: string;
  orderCode: string;
  buyer: { id: string; name: string; email: string };
  amount: number;
  paymentMethod: string;
  rulesHit: Array<{ rule: 'TOTAL' | 'COD'; threshold: number }>;
  status: OrderCheckStatus;
  deadline: string | null;
  reason: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  createdAt: string;
  order?: {
    shippingProvince: string;
    payBefore: string | null;
    placedAt: string;
    shopOrders: Array<{
      shopOrderId: string;
      code: string;
      shopName: string;
      subtotal: number;
      shopDiscount: number;
      platformDiscount: number;
      shippingFee: number;
      total: number;
      items: Array<{ name: string; variant: string; price: number; quantity: number }>;
    }>;
  };
  buyerStats?: { orders: number; total: number; rejected: number };
}

export type AdminRefundStatus =
  'PENDING' | 'FAILED' | 'UNKNOWN' | 'NEEDS_MANUAL' | 'SUCCEEDED' | 'MANUAL_DONE';

export interface AdminRefund {
  id: string;
  orderId: string;
  orderCode: string | null;
  shopOrderId: string | null;
  shopOrderCode: string | null;
  /** null khi hoàn bằng chuyển khoản không gắn giao dịch (P5) */
  paymentRef: string | null;
  gateway: 'VNPAY' | 'MOCK' | null;
  amount: number;
  reason:
    | 'CANCELLED'
    | 'LATE_PAYMENT'
    | 'DUPLICATE_PAYMENT'
    | 'DELIVERY_FAILED'
    | 'INCIDENT'
    | 'RETURN'
    | 'ADJUSTMENT';
  /** GATEWAY: qua cổng; BANK_TRANSFER: chuyển khoản tay (P5) */
  method: 'GATEWAY' | 'BANK_TRANSFER';
  bankAccount: BankAccount | null;
  returnId: string | null;
  adjustmentId: string | null;
  status: AdminRefundStatus;
  tries: number;
  nextTryAt: string | null;
  lastError: string | null;
  transferCode: string | null;
  hasReceipt: boolean;
  manualNote: string | null;
  completedAt: string | null;
  createdAt: string;
}

/** Thanh toán của một đơn nhìn từ admin (payment-service) */
export interface AdminOrderPayments {
  earnings: Array<{
    shopOrderId: string;
    shopOrderCode: string;
    subtotal: number;
    shopDiscount: number;
    platformDiscount: number;
    shippingFee: number;
    buyerPaid: number;
    platformFeeRate: number;
    platformFee: number;
    sellerAmount: number;
    status: EarningStatus;
  }>;
  payments: Array<{
    id: string;
    attempt: number;
    ref: string;
    gateway: 'VNPAY' | 'MOCK';
    amount: number;
    status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
    applied: boolean;
    transactionNo: string | null;
    bankCode: string | null;
    paidAt: string | null;
    createdAt: string;
  }>;
  refunds: Array<{
    id: string;
    shopOrderId: string | null;
    amount: number;
    reason: AdminRefund['reason'];
    status: AdminRefundStatus;
    tries: number;
    transferCode: string | null;
    completedAt: string | null;
    createdAt: string;
  }>;
}

export interface SettingRow {
  key: string;
  label: string;
  unit: string;
  description: string | null;
  min: number;
  max: number;
  defaultValue: number;
  version: number;
  value: number;
  effectiveFrom: string | null;
  createdBy: string | null;
  createdByName: string | null;
  reason: string | null;
}
