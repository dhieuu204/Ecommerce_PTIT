import { forwardRef } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** "12990000" → "12.990.000" */
export const groupDigits = (n: number | null | undefined) =>
  n === null || n === undefined || Number.isNaN(n) ? '' : n.toLocaleString('vi-VN');

/**
 * Ô nhập số nguyên có dấu chấm ngăn hàng nghìn (giá tiền, số lượng). Giá trị là số hoặc null (ô trống).
 * `suffix`: chữ nhỏ bên phải, ví dụ "đ" hoặc "g".
 */
export const NumberInput = forwardRef<
  HTMLInputElement,
  {
    value: number | null | undefined;
    onChange: (value: number | null) => void;
    onBlur?: () => void;
    suffix?: string;
    className?: string;
    inputClassName?: string;
    placeholder?: string;
    disabled?: boolean;
    id?: string;
    'aria-invalid'?: boolean;
    'aria-label'?: string;
    /** Số chữ số tối đa (chặn gõ quá dài) */
    maxDigits?: number;
  }
>(function NumberInput(
  { value, onChange, suffix, className, inputClassName, maxDigits = 10, ...rest },
  ref,
) {
  return (
    <div className={cn('relative', className)}>
      <Input
        ref={ref}
        inputMode="numeric"
        autoComplete="off"
        value={groupDigits(value)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, maxDigits);
          onChange(digits ? Number(digits) : null);
        }}
        className={cn(
          'h-10 rounded-lg bg-white tabular-nums focus-visible:border-champagne',
          suffix && 'pr-8',
          inputClassName,
        )}
        {...rest}
      />
      {suffix && (
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  );
});
