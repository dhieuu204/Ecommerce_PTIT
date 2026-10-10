import type { Voucher, VoucherState } from '@/lib/catalog-types';
import { formatMoney } from '@/lib/format';

/**
 * Giờ Việt Nam cố định UTC+7 (không đổi giờ mùa hè), nên đổi qua lại giữa ô datetime-local
 * ("2026-10-10T20:30", hiểu là giờ Việt Nam) và ISO (UTC) chỉ cần cộng/trừ 7 giờ.
 */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** ISO (UTC) → "YYYY-MM-DDTHH:mm" theo giờ Việt Nam cho ô datetime-local */
export function isoToVnInput(iso: string | Date): string {
  const d = new Date(new Date(iso).getTime() + VN_OFFSET_MS);
  return d.toISOString().slice(0, 16);
}

/** "YYYY-MM-DDTHH:mm" (giờ Việt Nam) → ISO (UTC); chuỗi sai thì trả null */
export function vnInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(`${value}:00+07:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Bây giờ làm tròn lên phút sau, theo giờ Việt Nam (gợi ý giờ bắt đầu) */
export function nowVnInput(addMinutes = 0): string {
  const ms = Math.ceil(Date.now() / 60_000) * 60_000 + addMinutes * 60_000;
  return isoToVnInput(new Date(ms));
}

/** "Giảm 500.000đ" hoặc "Giảm 10% tối đa 300.000đ" */
export function discountText(v: Pick<Voucher, 'discountType' | 'value' | 'maxDiscount'>): string {
  if (v.discountType === 'AMOUNT') return `Giảm ${formatMoney(v.value)}`;
  return `Giảm ${v.value}%${v.maxDiscount ? ` tối đa ${formatMoney(v.maxDiscount)}` : ''}`;
}

/** Chữ to trên cuống vé: "500K", "1,5TR", "10%" */
export function discountShort(v: Pick<Voucher, 'discountType' | 'value'>): string {
  if (v.discountType === 'PERCENT') return `${v.value}%`;
  if (v.value >= 1_000_000) {
    const m = v.value / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}TR`;
  }
  if (v.value >= 1_000) {
    const k = v.value / 1_000;
    return `${Number.isInteger(k) ? k : k.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}K`;
  }
  return formatMoney(v.value);
}

export const minOrderText = (minOrder: number) =>
  minOrder > 0 ? `Đơn từ ${formatMoney(minOrder)}` : 'Mọi đơn hàng';

export const VOUCHER_STATE: Record<
  VoucherState,
  { label: string; tone: 'success' | 'info' | 'neutral' }
> = {
  RUNNING: { label: 'Đang diễn ra', tone: 'success' },
  UPCOMING: { label: 'Sắp diễn ra', tone: 'info' },
  ENDED: { label: 'Đã kết thúc', tone: 'neutral' },
};

/** Giới hạn nhập của form voucher (khớp VoucherDto của marketplace-service) */
export const VOUCHER_LIMITS = {
  codeMin: 4,
  codeMax: 20,
  nameMin: 3,
  nameMax: 100,
  amountMin: 1_000,
  percentMax: 90,
  maxDiscountMin: 1_000,
  money: 1_000_000_000,
  quantityMax: 1_000_000,
};
