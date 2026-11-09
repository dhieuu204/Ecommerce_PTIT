import { IconCheck, IconCopy } from '@tabler/icons-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { Voucher } from '@/lib/catalog-types';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

const dayMonthParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
});

/** "09/11" theo giờ Việt Nam */
export function dayMonth(iso: string) {
  const parts = dayMonthParts.formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${get('day')}/${get('month')}`;
}

/** "Giảm 500.000đ" hoặc "Giảm 10% tối đa 300.000đ" */
export function voucherDiscountText(v: Pick<Voucher, 'discountType' | 'value' | 'maxDiscount'>) {
  if (v.discountType === 'PERCENT') {
    return `Giảm ${v.value}%${v.maxDiscount ? ` tối đa ${formatMoney(v.maxDiscount)}` : ''}`;
  }
  return `Giảm ${formatMoney(v.value)}`;
}

/** Chữ lớn trên cuống vé: "500K", "1,5TR", "10%" */
export function shortValue(v: Pick<Voucher, 'discountType' | 'value'>) {
  if (v.discountType === 'PERCENT') return `${v.value}%`;
  if (v.value >= 1_000_000) {
    return `${(v.value / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}TR`;
  }
  if (v.value >= 1000) return `${Math.round(v.value / 1000)}K`;
  return formatMoney(v.value);
}

/**
 * Vé voucher cùng kiểu mã giảm giá ở trang chủ: cuống cam răng cưa ghi mức giảm, thân vé ghi điều kiện, hạn
 * dùng và nút sao chép mã.
 */
export function VoucherTicket({ voucher, className }: { voucher: Voucher; className?: string }) {
  const [copied, setCopied] = useState(false);
  const left = voucher.quantity - voucher.usedCount;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(voucher.code);
      setCopied(true);
      toast.success(`Đã sao chép mã ${voucher.code}`);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(`Không sao chép được. Mã voucher là ${voucher.code}.`);
    }
  };

  return (
    <div
      className={cn(
        'flex min-h-24 overflow-hidden rounded-lg border border-navy/25 bg-card',
        className,
      )}
    >
      <div className="relative flex w-[5.5rem] shrink-0 flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-header-from to-header-to px-2 text-center text-white">
        <span
          aria-hidden
          className="absolute inset-y-1.5 -left-[3px] flex flex-col justify-between"
        >
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className="size-1.5 rounded-full bg-card" />
          ))}
        </span>
        <span className="text-[11px] font-medium opacity-90">Giảm</span>
        <span className="text-xl leading-tight font-bold">{shortValue(voucher)}</span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0">
          <div className="text-sm leading-snug font-bold text-charcoal">
            {voucherDiscountText(voucher)}
          </div>
          <div className="mt-0.5 text-xs text-ink/55">
            Đơn từ {formatMoney(voucher.minOrder)}
            <span className="text-ink/30"> · </span>
            HSD {dayMonth(voucher.endAt)}
            {left > 0 && left <= 20 && (
              <span className="font-medium text-navy"> · Còn {left} lượt</span>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span title="Mã voucher" className="min-w-0 truncate text-xs font-semibold text-charcoal">
            {voucher.code}
          </span>
          <button
            type="button"
            onClick={() => void copy()}
            aria-label={`Sao chép mã ${voucher.code}`}
            className={cn(
              'inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold transition outline-none focus-visible:ring-2 focus-visible:ring-champagne',
              copied
                ? 'border-navy bg-champagne-50 text-navy'
                : 'border-navy/40 text-navy hover:bg-champagne-50',
            )}
          >
            {copied ? (
              <IconCheck className="size-3.5 [stroke-width:2.5]" />
            ) : (
              <IconCopy className="size-3.5" />
            )}
            {copied ? 'Đã chép' : 'Sao chép'}
          </button>
        </div>
      </div>
    </div>
  );
}
