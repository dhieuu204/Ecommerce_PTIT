/**
 * Tiền seller sau khi trả hàng (REF-02, FIN-03, quyết định P5 số 4–6). Hàm thuần để test đủ trường hợp.
 * Tiền là số nguyên đồng; phí sàn theo phần vạn (500 = 5%), làm tròn xuống như lúc nhận đơn.
 */

/** Tiền của đơn con lúc nhận đơn (bản chụp trong seller_earnings) */
export interface EarningAmounts {
  subtotal: number;
  shopDiscount: number;
  platformFeeRate: number;
  platformFee: number;
  /** Đã trừ hoa hồng CTV (P7) */
  sellerAmount: number;
  /** Hoa hồng CTV chụp lúc đặt (P7); thiếu = 0 */
  commission?: number;
}

/** Kết quả yêu cầu trả hàng nhận qua return.resolved */
export interface ReturnRefundInput {
  /** Số hoàn cho người mua */
  refundAmount: number;
  /** Số hoàn tối đa (tổng số người mua đã trả cho các món trả) */
  maxRefundAmount: number;
  /** Tiền hàng sau voucher shop của các món trả */
  sellerBase: number;
  /** Hoa hồng CTV của các món trả (P7); thiếu = 0 */
  commissionBase?: number;
  /** Sàn chịu (kiện trả thất lạc): không trừ tiền seller */
  platformCovers: boolean;
}

export interface ReturnSettlement {
  /** Phần tiền hàng (sau voucher shop) bị bớt khỏi đơn con */
  baseReduction: number;
  /** Phí sàn tính lại trên tiền hàng còn lại */
  newPlatformFee: number;
  /** Seller nhận cuối cùng */
  newSellerAmount: number;
  /** Seller bị trừ = seller nhận lúc đầu − seller nhận cuối cùng */
  deduction: number;
  /** Phí sàn được giảm */
  feeReversed: number;
  /** Hoa hồng CTV bị trừ (P7): cùng tỉ lệ với phần tiền hàng bị bớt */
  commissionReduction: number;
}

/**
 * Hoàn toàn bộ: bớt đúng tiền hàng sau voucher shop của các món trả. Hoàn một phần X: bớt theo tỉ lệ
 * X / số hoàn tối đa (làm tròn xuống). Sàn chịu: không bớt. Phí sàn tính lại trên tiền hàng còn lại.
 */
export function settleReturn(e: EarningAmounts, r: ReturnRefundInput): ReturnSettlement {
  const full = r.refundAmount >= r.maxRefundAmount;
  const baseReduction = r.platformCovers
    ? 0
    : full
      ? r.sellerBase
      : r.maxRefundAmount > 0
        ? Math.floor((r.sellerBase * r.refundAmount) / r.maxRefundAmount)
        : 0;
  const base = e.subtotal - e.shopDiscount;
  const newBase = Math.max(0, base - baseReduction);
  const newPlatformFee =
    baseReduction === 0 ? e.platformFee : Math.floor((newBase * e.platformFeeRate) / 10_000);
  // P7: hoa hồng CTV của các món trả bị trừ theo đúng tỉ lệ như tiền hàng (hoàn đủ → cả phần của món trả)
  const commission = e.commission ?? 0;
  const commissionBase = Math.min(r.commissionBase ?? 0, commission);
  const commissionReduction =
    baseReduction === 0
      ? 0
      : full
        ? commissionBase
        : Math.floor((commissionBase * r.refundAmount) / r.maxRefundAmount);
  const newCommission = commission - commissionReduction;
  const newSellerAmount =
    baseReduction === 0 ? e.sellerAmount : Math.max(0, newBase - newPlatformFee - newCommission);
  return {
    baseReduction,
    newPlatformFee,
    newSellerAmount,
    deduction: Math.max(0, e.sellerAmount - newSellerAmount),
    feeReversed: Math.max(0, e.platformFee - newPlatformFee),
    commissionReduction,
  };
}
