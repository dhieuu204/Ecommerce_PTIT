/**
 * Phép tính tiền của checkout (ORD-01, VCH-02, VCH-03). Hàm thuần (không đọc database) để test đủ trường hợp.
 * Tiền là số nguyên đồng; mọi phép chia làm tròn xuống, phần dư dồn vào phần lớn nhất.
 */

export interface VoucherRule {
  discountType: 'AMOUNT' | 'PERCENT';
  /** AMOUNT: số đồng; PERCENT: số % */
  value: number;
  /** Chỉ với PERCENT */
  maxDiscount: number | null;
  minOrder: number;
}

/**
 * Số tiền voucher giảm trên một khoản `base` (tiền hàng của shop, hoặc tổng tiền hàng sau voucher shop
 * với voucher sàn). Chưa đạt đơn tối thiểu thì 0. Không bao giờ giảm quá `base`.
 */
export function voucherDiscount(v: VoucherRule, base: number): number {
  if (base <= 0 || base < v.minOrder) return 0;
  const raw =
    v.discountType === 'AMOUNT'
      ? v.value
      : Math.min(Math.floor((base * v.value) / 100), v.maxDiscount ?? Number.MAX_SAFE_INTEGER);
  return Math.max(0, Math.min(raw, base));
}

/**
 * Chia `total` theo tỉ lệ `weights` (FLOW-02 quyết định 4): mỗi phần làm tròn xuống tới đồng,
 * phần dư cộng vào phần có trọng số lớn nhất (bằng nhau thì phần đứng trước).
 * Tổng các phần luôn đúng bằng `total`. Mọi trọng số bằng 0 thì dồn hết vào phần đầu.
 */
export function splitByWeight(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map((_, i) => (i === 0 ? total : 0));
  const parts = weights.map((w) => Math.floor((total * w) / sum));
  const rest = total - parts.reduce((a, b) => a + b, 0);
  let largest = 0;
  weights.forEach((w, i) => {
    if (w > weights[largest]!) largest = i;
  });
  parts[largest]! += rest;
  return parts;
}

export interface ShopAmounts {
  subtotal: number;
  shopDiscount: number;
  shippingFee: number;
}

export interface ShopTotals extends ShopAmounts {
  platformDiscount: number;
  /** Buyer trả cho đơn con = subtotal - shopDiscount - platformDiscount + shippingFee */
  total: number;
}

/**
 * Áp voucher sàn lên các đơn con: giảm trên tổng tiền hàng sau voucher shop rồi chia theo tỉ lệ
 * tiền hàng sau voucher shop của từng đơn con. Phí ship không được giảm.
 */
export function applyPlatformVoucher(
  shops: ShopAmounts[],
  platformDiscount: number,
): { shops: ShopTotals[]; total: number } {
  const bases = shops.map((s) => s.subtotal - s.shopDiscount);
  const parts = splitByWeight(platformDiscount, bases);
  const result = shops.map((s, i) => {
    const pd = parts[i]!;
    return { ...s, platformDiscount: pd, total: s.subtotal - s.shopDiscount - pd + s.shippingFee };
  });
  return { shops: result, total: result.reduce((a, s) => a + s.total, 0) };
}

/** Phần giảm giá (voucher shop + phần voucher sàn) chia về từng dòng hàng theo thành tiền của dòng */
export function itemDiscounts(lineTotals: number[], discount: number): number[] {
  return splitByWeight(discount, lineTotals);
}
