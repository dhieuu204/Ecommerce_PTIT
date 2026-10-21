/**
 * Kiểu dữ liệu báo cáo (P6: RPT-01 vận hành ở marketplace-service, RPT-02 tài chính ở payment-service).
 * Tiền là số nguyên đồng; tỉ lệ theo phần nghìn (125 = 12,5%). Ngày dạng YYYY-MM-DD theo giờ Việt Nam.
 */

export interface ReportRange {
  from: string;
  to: string;
  days: number;
}

// ----- Vận hành (RPT-01) -----

export interface OperationsSummary {
  orderCount: number;
  orderValue: number;
  completedCount: number;
  revenue: number;
  cancelledCount: number;
  /** Phần nghìn */
  cancelRate: number;
  deliveredCount: number;
  returnedCount: number;
  /** Phần nghìn */
  returnRate: number;
}

export interface DailyOperations {
  date: string;
  orderCount: number;
  orderValue: number;
}

export interface TopProduct {
  productId: string;
  name: string;
  image: string | null;
  shopId: string;
  shopName: string;
  quantity: number;
  amount: number;
}

export interface VoucherPerformance {
  voucherId: string;
  code: string;
  name: string;
  scope: 'SHOP' | 'PLATFORM';
  shopId: string | null;
  shopName: string | null;
  orderCount: number;
  discountTotal: number;
  orderValue: number;
}

export interface TopShop {
  shopId: string;
  name: string;
  orderCount: number;
  orderValue: number;
  revenue: number;
}

export interface ShopOperationsReport {
  range: ReportRange;
  summary: OperationsSummary;
  daily: DailyOperations[];
  topProducts: TopProduct[];
  vouchers: VoucherPerformance[];
}

export interface AdminOperationsReport extends ShopOperationsReport {
  shopCount: number;
  topShops: TopShop[];
}

// ----- Tài chính (RPT-02) -----

export interface BalanceView {
  pending: number;
  available: number;
  locked: number;
  total: number;
}

export interface SellerFinanceReport {
  range: ReportRange;
  /** false: shop chưa có đơn nào tới sổ tiền, mọi số bằng 0 */
  hasWallet: boolean;
  summary: {
    orderCount: number;
    orderValue: number;
    refunded: number;
    platformFee: number;
    sellerReceives: number;
    released: number;
    withdrawn: number;
  };
  balance: BalanceView;
  daily: Array<{ date: string; sellerReceives: number; refunded: number }>;
}

export interface AdminFinanceReport {
  range: ReportRange;
  summary: {
    orderCount: number;
    orderValue: number;
    collected: number;
    collectedVnpay: number;
    collectedCod: number;
    refunded: number;
    platformSubsidy: number;
    platformFee: number;
    payableToSellers: number;
    paidToSellers: number;
  };
  payable: BalanceView;
  daily: Array<{ date: string; collected: number; refunded: number; platformFee: number }>;
}
