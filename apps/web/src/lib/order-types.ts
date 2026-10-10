/**
 * Kiểu dữ liệu P3 (đặt hàng, thanh toán, kiểm tra đơn, hoàn tiền, cấu hình) theo API ở
 * docs/api/README.md mục 4. Thời gian là chuỗi ISO (UTC).
 */

export type ShopOrderStatus =
  'PENDING' | 'TO_CONFIRM' | 'CONFIRMED' | 'CANCEL_REQUESTED' | 'CANCELLED';
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
  paymentMethod: 'VNPAY';
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
  payBefore: string;
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
  payBefore: string;
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
  confirmBefore: string | null;
  confirmedAt: string | null;
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
  status: 'PROCESSING' | 'CANCELLED';
  paymentMethod: 'VNPAY';
  paymentStatus: 'UNPAID' | 'PAID';
  checkStatus: 'PENDING' | 'PASSED' | 'REJECTED';
  payBefore: string;
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

export type BuyerTab = 'ALL' | 'UNPAID' | 'PROCESSING' | 'TO_SHIP' | 'CANCELLED';

export interface SellerOrder {
  id: string;
  code: string;
  orderId: string;
  orderCode: string;
  status: ShopOrderStatus;
  createdAt: string;
  paymentStatus: 'UNPAID' | 'PAID';
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
  confirmBefore: string | null;
  confirmedAt: string | null;
  cancelledBy: CancelActor | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  cancelRequestReason: string | null;
  cancelRequestedAt: string | null;
  refundStatus: RefundStatus;
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
    payBefore: string;
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
  paymentRef: string;
  gateway: 'VNPAY' | 'MOCK';
  amount: number;
  reason: 'CANCELLED' | 'LATE_PAYMENT' | 'DUPLICATE_PAYMENT';
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
    status: 'UNPAID' | 'HELD' | 'EXPIRED' | 'CANCELLED';
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
