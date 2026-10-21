import { Star } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/** Sao trung bình hiển thị kiểu Việt Nam: 4,5 */
export const formatRating = (n: number) =>
  n.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Số gọn: 1234 → "1,2k" */
export const formatCount = (n: number) =>
  n < 1000 ? String(n) : `${(n / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}k`;

/** Một hàng 5 sao, tô theo số sao (có thể lẻ, ví dụ 4,3 tô 4 sao và 30% sao thứ năm) */
export function Stars({
  value,
  className,
  starClassName,
}: {
  value: number;
  className?: string;
  starClassName?: string;
}) {
  return (
    <span
      className={cn('inline-flex items-center gap-0.5', className)}
      role="img"
      aria-label={`${formatRating(value)} trên 5 sao`}
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span key={i} className={cn('relative inline-block size-3.5', starClassName)}>
            <Star className="absolute inset-0 size-full fill-ivory-200 text-ivory-200" />
            {fill > 0 && (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${fill * 100}%` }}
              >
                <Star className="aspect-square h-full w-auto max-w-none fill-champagne text-champagne" />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

export const STAR_LABELS: Record<number, string> = {
  1: 'Tệ',
  2: 'Không hài lòng',
  3: 'Bình thường',
  4: 'Hài lòng',
  5: 'Tuyệt vời',
};

/** Chọn số sao 1–5 (bấm hoặc dùng phím mũi tên), kèm chữ mô tả mức đang chọn */
export function StarInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div
        role="radiogroup"
        aria-label="Số sao"
        className="flex items-center gap-1"
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} sao: ${STAR_LABELS[n]}`}
            disabled={disabled}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(n)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(Math.min(5, value + 1));
              if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(Math.max(1, value - 1));
            }}
            className="rounded-md p-0.5 transition outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-champagne disabled:opacity-50"
          >
            <Star
              className={cn(
                'size-8 transition',
                n <= shown ? 'fill-champagne text-champagne' : 'fill-ivory-200 text-ivory-200',
              )}
            />
          </button>
        ))}
      </div>
      <span className="text-sm font-semibold text-navy" aria-live="polite">
        {shown ? STAR_LABELS[shown] : 'Chọn số sao'}
      </span>
    </div>
  );
}

/** Nhãn nhỏ trên thẻ sản phẩm/shop: ★ 4,8 (12) */
export function RatingInline({
  avg,
  count,
  className,
}: {
  avg: number | null;
  count: number;
  className?: string;
}) {
  if (avg === null || count === 0) return null;
  return (
    <span
      className={cn('inline-flex items-center gap-1 whitespace-nowrap', className)}
      title={`${formatRating(avg)} sao từ ${count.toLocaleString('vi-VN')} đánh giá`}
    >
      <Star className="size-3 fill-champagne text-champagne" />
      <b className="font-semibold text-ink">{formatRating(avg)}</b>
      <span className="text-ink/45">({formatCount(count)})</span>
    </span>
  );
}
