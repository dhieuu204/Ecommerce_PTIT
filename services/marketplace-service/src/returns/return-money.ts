/**
 * Tiền của phần trả hàng (REF-02, VCH-03, quyết định P5 số 4). Hàm thuần (không đọc database) để test đủ
 * trường hợp làm tròn. Tiền là số nguyên đồng.
 */
import { itemDiscounts } from '../checkout/pricing';

/** Một dòng hàng của đơn con (chép từ order_items) */
export interface ReturnLine {
  id: string;
  price: number;
  /** Số đã mua */
  quantity: number;
  /** Phần voucher shop + phần voucher sàn chia cho dòng lúc đặt */
  discount: number;
}

export interface ReturnPick {
  orderItemId: string;
  quantity: number;
}

export interface ReturnItemAmounts {
  orderItemId: string;
  quantity: number;
  /** Người mua đã trả cho số món này: giá × số lượng − phần giảm giá chia theo số lượng (làm tròn lên) */
  refundAmount: number;
  /** Tiền hàng sau voucher shop của số món này (phần seller bị trừ trước khi tính lại phí sàn) */
  sellerBase: number;
}

/**
 * Phần voucher shop của từng dòng: chia theo thành tiền như lúc đặt (cùng cách với checkout). Xếp dòng
 * theo mã trước khi chia để kết quả không phụ thuộc thứ tự database trả về (phần dư khi các dòng bằng
 * nhau luôn rơi vào cùng một dòng), và không cho vượt phần giảm giá đã chia cho dòng lúc đặt.
 */
export function shopDiscountByLine(lines: ReturnLine[], shopDiscount: number): Map<string, number> {
  const sorted = [...lines].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const parts = itemDiscounts(
    sorted.map((l) => l.price * l.quantity),
    shopDiscount,
  );
  return new Map(sorted.map((l, i) => [l.id, Math.min(parts[i]!, l.discount)]));
}

/** Phần giảm `discount` của dòng ứng với `k` món trong `quantity` món, làm tròn lên tới đồng */
export function discountShare(discount: number, k: number, quantity: number): number {
  if (k >= quantity) return discount;
  return Math.ceil((discount * k) / quantity);
}

/**
 * Tiền của các món người mua chọn trả. Phần giảm giá làm tròn lên nên tiền hoàn làm tròn xuống: trả hết
 * mọi món thì tổng tiền hoàn đúng bằng tiền hàng sau voucher người mua đã trả, không bao giờ hơn.
 * Người gọi đã kiểm số lượng hợp lệ (1..số đã mua) và dòng thuộc đơn con.
 */
export function returnAmounts(
  lines: ReturnLine[],
  shopDiscount: number,
  picks: ReturnPick[],
): { items: ReturnItemAmounts[]; refundAmount: number; sellerBase: number } {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const shopShares = shopDiscountByLine(lines, shopDiscount);
  const items = picks.map((p) => {
    const line = byId.get(p.orderItemId)!;
    const gross = line.price * p.quantity;
    return {
      orderItemId: p.orderItemId,
      quantity: p.quantity,
      refundAmount: Math.max(0, gross - discountShare(line.discount, p.quantity, line.quantity)),
      sellerBase: Math.max(
        0,
        gross - discountShare(shopShares.get(line.id) ?? 0, p.quantity, line.quantity),
      ),
    };
  });
  return {
    items,
    refundAmount: items.reduce((a, i) => a + i.refundAmount, 0),
    sellerBase: items.reduce((a, i) => a + i.sellerBase, 0),
  };
}
