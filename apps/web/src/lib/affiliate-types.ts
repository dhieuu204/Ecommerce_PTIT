/**
 * Kiểu dữ liệu P7: cộng tác viên bán hàng (docs/phan-tich/14-quyet-dinh-p7-affiliate.md). Thời gian là
 * chuỗi ISO (UTC); tỉ lệ hoa hồng theo phần vạn (500 = 5%).
 */

import type { EarningStatus } from './finance-types';
import type { BankAccount } from './types';

export type AffiliateStatus = 'PENDING' | 'REJECTED' | 'ACTIVE' | 'SUSPENDED';

export interface Affiliate {
  id: string;
  /** Mã CTV trong link, có khi được duyệt */
  code: string | null;
  status: AffiliateStatus;
  version: number;
  displayName: string;
  channels: string[];
  phone: string;
  bankAccount: BankAccount;
  rejectReason: string | null;
  suspendReason: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface MyAffiliate {
  status: AffiliateStatus | 'NONE';
  affiliate: Affiliate | null;
}

export interface AffiliateProduct {
  id: string;
  name: string;
  image: string | null;
  minPrice: number;
  maxPrice: number;
  soldCount: number;
  ratingCount: number;
  ratingTotal: number;
  commissionRate: number;
  /** Hoa hồng ước tính khi bán một sản phẩm ở giá thấp nhất */
  commissionFrom: number;
  shop: { id: string; name: string };
}

export interface AffiliateStats {
  range: { from: string; to: string; days: number };
  clicks: number;
  orders: number;
  commission: number;
  daily: Array<{ date: string; clicks: number; orders: number; commission: number }>;
  topProducts: Array<{ productId: string; name: string; quantity: number; commission: number }>;
}

export interface AffiliateOrder {
  id: string;
  code: string;
  shopName: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  commission: number;
  items: Array<{
    productName: string;
    variantName: string;
    image: string | null;
    quantity: number;
    returnedQuantity: number;
    commissionRate: number;
    commission: number;
  }>;
}

/** Hoa hồng một đơn con theo sổ tiền (payment-service) */
export interface Commission {
  shopOrderId: string;
  shopOrderCode: string;
  commission: number;
  returnCommissionReversed: number;
  receives: number;
  status: EarningStatus;
  waitingFor: string | null;
  completedAt: string | null;
  releasedAt: string | null;
  createdAt: string;
}

export interface SellerAffiliateOrder {
  id: string;
  code: string;
  status: string;
  createdAt: string;
  affiliateName: string;
  subtotal: number;
  shopDiscount: number;
  commission: number;
}

/** CTV trong danh sách của admin (marketplace) */
export interface AdminAffiliate {
  id: string;
  userId: string;
  code: string | null;
  status: AffiliateStatus;
  displayName: string;
  channels: string[];
  phone: string;
  suspendReason: string | null;
  approvedAt: string | null;
  createdAt: string;
  orderCount: number;
  commission: number;
}

export type AffiliateApprovalType = 'REGISTER' | 'SUSPEND' | 'RESTORE';
export type AffiliateApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REPLACED';

/** Hồ sơ duyệt CTV (approval-service) */
export interface AffiliateApprovalRow {
  id: string;
  affiliateId: string;
  type: AffiliateApprovalType;
  version: number;
  status: AffiliateApprovalStatus;
  displayName: string;
  userName: string;
  userEmail: string;
  submittedAt: string;
  decidedAt: string | null;
}

export interface AffiliateApprovalDetail extends AffiliateApprovalRow {
  userId: string;
  data: {
    displayName: string;
    channels: string[];
    phone: string;
    bankAccount: { bankName: string; accountNumberMasked: string; accountName: string };
  };
  reason: string | null;
  decidedByName: string | null;
  history: Array<{
    id: string;
    type: AffiliateApprovalType;
    version: number;
    status: AffiliateApprovalStatus;
    reason: string | null;
    decidedByName: string | null;
    submittedAt: string;
    decidedAt: string | null;
  }>;
}

/** 500 → "5%", 1250 → "12,5%" */
export function ratePercent(rate: number): string {
  return `${(rate / 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`;
}
