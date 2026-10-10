import { Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Ô số lượng có nút −/+ (trang sản phẩm, giỏ hàng). Gõ số tay thì chốt khi rời ô hoặc Enter,
 * tự kẹp trong khoảng 1..max.
 */
export function QuantityStepper({
  value,
  max,
  onChange,
  disabled,
  size = 'md',
  className,
}: {
  value: number;
  max: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const limit = Math.max(1, max);
  const commit = () => {
    const n = Math.floor(Number(text));
    const next = Number.isFinite(n) ? Math.min(Math.max(1, n), limit) : value;
    setText(String(next));
    if (next !== value) onChange(next);
  };

  const btn = cn(
    'flex items-center justify-center text-ink/70 transition hover:bg-ivory hover:text-navy disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent',
    size === 'sm' ? 'size-8' : 'size-10',
  );

  return (
    <div
      className={cn(
        'inline-flex items-center overflow-hidden rounded-lg border border-ivory-200 bg-card',
        disabled && 'opacity-60',
        className,
      )}
    >
      <button
        type="button"
        aria-label="Giảm số lượng"
        className={btn}
        disabled={disabled || value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <Minus className="size-3.5" />
      </button>
      <input
        aria-label="Số lượng"
        inputMode="numeric"
        className={cn(
          'border-x border-ivory-200 bg-transparent text-center text-sm font-semibold text-ink tabular-nums outline-none focus:bg-champagne-50/60',
          size === 'sm' ? 'h-8 w-10' : 'h-10 w-14',
        )}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      <button
        type="button"
        aria-label="Tăng số lượng"
        className={btn}
        disabled={disabled || value >= limit}
        onClick={() => onChange(value + 1)}
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
