/**
 * Hoa hồng cộng tác viên (P7: AFF-04, quyết định ở docs/phan-tich/14-quyet-dinh-p7-affiliate.md mục 2).
 * Hàm thuần (không đọc database) để test đủ trường hợp làm tròn. Tiền là số nguyên đồng, tỉ lệ theo
 * phần vạn (500 = 5%), mọi phép chia làm tròn xuống.
 */
import { shopDiscountByLine } from '../returns/return-money';

/** Một dòng hàng lúc đặt */
export interface CommissionLine {
  /** Mã dòng (order_items.id), dùng để chia voucher shop giống lúc trả hàng */
  id: string;
  price: number;
  quantity: number;
  /** Phần voucher shop + phần voucher sàn chia cho dòng lúc đặt */
  discount: number;
  /** Hoa hồng của sản phẩm lúc đặt; null = sản phẩm không bật */
  rate: number | null;
}

export interface LineCommission {
  id: string;
  /** 0 khi sản phẩm không bật */
  rate: number;
  commission: number;
}

/**
 * Hoa hồng từng dòng = ⌊(thành tiền − phần voucher shop của dòng) × tỉ lệ⌋. Cơ sở tính giống phí sàn: sau
 * voucher shop, không trừ voucher sàn, không tính phí ship. Phần voucher shop chia theo đúng cách P5 dùng
 * khi trả hàng, nên tiền trả hàng và hoa hồng luôn cùng một cơ sở.
 */
export function lineCommissions(lines: CommissionLine[], shopDiscount: number): LineCommission[] {
  const shopShares = shopDiscountByLine(lines, shopDiscount);
  return lines.map((l) => {
    const rate = l.rate && l.rate > 0 ? l.rate : 0;
    const base = Math.max(0, l.price * l.quantity - (shopShares.get(l.id) ?? 0));
    return { id: l.id, rate, commission: Math.floor((base * rate) / 10_000) };
  });
}

/** Lượt bấm còn hạn của một shop, kèm thông tin CTV để xét */
export interface ClickCandidate {
  id: string;
  affiliateId: string;
  /** Tài khoản của CTV */
  affiliateUserId: string;
  affiliateStatus: 'PENDING' | 'REJECTED' | 'ACTIVE' | 'SUSPENDED';
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Lượt bấm được tính cho đơn con: lượt mới nhất còn hạn của CTV đang hoạt động. CTV là người mua (tự mua
 * qua link của mình) hoặc là chủ shop thì không tính lượt đó, xét tiếp lượt cũ hơn của CTV khác.
 */
export function pickClick(
  clicks: ClickCandidate[],
  buyerId: string,
  shopOwnerId: string,
  now: Date,
): ClickCandidate | null {
  const valid = clicks.filter(
    (c) =>
      c.expiresAt > now &&
      c.affiliateStatus === 'ACTIVE' &&
      c.affiliateUserId !== buyerId &&
      c.affiliateUserId !== shopOwnerId,
  );
  valid.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? -1 : 1));
  return valid[0] ?? null;
}

/**
 * Hoa hồng của các món trả: mỗi dòng trả k trong q món thì lấy ⌊hoa hồng dòng × k / q⌋ (trả hết thì đúng
 * bằng hoa hồng dòng). payment-service trừ phần này theo cùng tỉ lệ với phần trừ tiền seller.
 */
export function returnedCommission(
  lines: Array<{ id: string; quantity: number; commission: number }>,
  picks: Array<{ orderItemId: string; quantity: number }>,
): number {
  const byId = new Map(lines.map((l) => [l.id, l]));
  let sum = 0;
  for (const p of picks) {
    const l = byId.get(p.orderItemId);
    if (!l || l.commission <= 0 || l.quantity <= 0) continue;
    sum +=
      p.quantity >= l.quantity
        ? l.commission
        : Math.floor((l.commission * p.quantity) / l.quantity);
  }
  return sum;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Mã CTV 8 ký tự (chữ in hoa và số, bỏ ký tự dễ nhầm như O/0, I/1) */
export function newAffiliateCode(random: (max: number) => number): string {
  let code = '';
  for (let i = 0; i < 8; i++) code += CODE_CHARS[random(CODE_CHARS.length)];
  return code;
}
