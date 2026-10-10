import { Check, Copy, TicketPercent } from 'lucide-react';
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
function dayMonth(iso: string) {
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
function shortValue(v: Pick<Voucher, 'discountType' | 'value'>) {
  if (v.discountType === 'PERCENT') return `${v.value}%`;
  if (v.value >= 1_000_000) {
    return `${(v.value / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}TR`;
  }
  if (v.value >= 1000) return `${Math.round(v.value / 1000)}K`;
  return formatMoney(v.value);
}

/**
 * Vé voucher (chỉ hiển thị ở P2; lưu và áp voucher có từ P3): cuống navy ghi mức giảm, thân vé ghi
 * điều kiện, hạn dùng và nút sao chép mã.
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
        'relative flex min-h-28 overflow-hidden rounded-2xl border border-champagne/40 bg-card shadow-[0_1px_2px_rgba(15,26,61,0.05)]',
        className,
      )}
    >
      {/* Cuống vé */}
      <div className="relative flex w-24 shrink-0 flex-col items-center justify-center gap-1 bg-gradient-to-br from-navy to-navy-800 px-2 text-center text-white sm:w-28">
        <TicketPercent className="size-5 text-champagne" />
        <span className="text-[10px] font-medium tracking-[0.18em] text-champagne/90 uppercase">
          Giảm
        </span>
        <span className="text-xl leading-none font-bold text-champagne">{shortValue(voucher)}</span>
        {/* Răng cưa mép vé */}
        <span aria-hidden className="absolute inset-y-2 -right-1 flex flex-col justify-between">
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className="size-2 rounded-full bg-card" />
          ))}
        </span>
      </div>
      {/* Hai khuyết tròn trên dưới chỗ nối cuống vé */}
      <span
        aria-hidden
        className="absolute -top-2 left-[5.5rem] size-4 rounded-full border border-champagne/40 bg-ivory sm:left-[6.5rem]"
      />
      <span
        aria-hidden
        className="absolute -bottom-2 left-[5.5rem] size-4 rounded-full border border-champagne/40 bg-ivory sm:left-[6.5rem]"
      />

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2.5 py-3 pr-3 pl-4">
        <div className="min-w-0">
          <div className="text-[15px] leading-snug font-semibold text-navy">
            {voucherDiscountText(voucher)}
          </div>
          <div className="mt-0.5 text-xs text-ink/60">
            Đơn từ {formatMoney(voucher.minOrder)}
            <span className="text-ink/30"> · </span>
            HSD {dayMonth(voucher.endAt)}
          </div>
          {left > 0 && left <= 20 && (
            <div className="mt-0.5 text-[11px] font-medium text-champagne-600">
              Chỉ còn {left} lượt
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span
            title="Mã voucher"
            className="min-w-0 truncate rounded-md border border-dashed border-champagne/60 bg-champagne-50 px-2 py-1 font-mono text-xs font-semibold tracking-wide text-navy"
          >
            {voucher.code}
          </span>
          <button
            type="button"
            onClick={() => void copy()}
            aria-label={`Sao chép mã ${voucher.code}`}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition outline-none focus-visible:ring-2 focus-visible:ring-champagne',
              copied
                ? 'border-navy bg-navy text-white'
                : 'border-navy/20 text-navy hover:border-navy hover:bg-navy hover:text-white',
            )}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? 'Đã chép' : 'Sao chép mã'}
          </button>
        </div>
      </div>
    </div>
  );
}
