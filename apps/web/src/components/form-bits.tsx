import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * Mảnh form dùng chung cho trang đăng nhập và tài khoản: ô nhập, ô mật khẩu có nút hiện/ẩn,
 * nhãn + lỗi dưới ô, nút gửi có vòng quay.
 */

/** Ô nhập chuẩn (khớp ô chọn trong LocationFields) */
export const inputClass =
  'h-10 w-full min-w-0 rounded-lg border border-input bg-white px-3 text-sm text-ink outline-none transition placeholder:text-muted-foreground/80 focus:border-champagne focus:ring-[3px] focus:ring-champagne/30 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-destructive aria-invalid:focus:ring-destructive/20';

/** Ô nhập bo tròn, cao hơn: dùng ở các trang đăng nhập/đăng ký */
export const pillInputClass = cn(inputClass, 'h-12 rounded-full px-5 text-[15px]');

interface FieldProps {
  id: string;
  label: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  /** Chữ nhỏ bên phải nhãn, ví dụ bộ đếm ký tự hoặc link "Quên mật khẩu?" */
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** Nhãn + ô + gợi ý / lỗi tiếng Việt ngay dưới ô */
export function Field({ id, label, error, hint, aside, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id} className="text-ink">
          {label}
        </Label>
        {aside && <div className="text-xs text-muted-foreground">{aside}</div>}
      </div>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

type PasswordInputProps = Omit<React.ComponentProps<'input'>, 'type'> & { pill?: boolean };

/** Ô mật khẩu có nút hiện/ẩn bên phải */
export function PasswordInput({ className, pill, ...props }: PasswordInputProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        className={cn(pill ? pillInputClass : inputClass, pill ? 'pr-12' : 'pr-10', className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className={cn(
          'absolute top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:bg-ivory-200 hover:text-navy',
          pill ? 'right-3' : 'right-1.5',
        )}
        aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        tabIndex={-1}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

/** Nút gửi form: khóa và hiện vòng quay khi đang gửi */
export function SubmitButton({
  pending,
  children,
  className,
  pill,
  ...props
}: React.ComponentProps<typeof Button> & { pending?: boolean; pill?: boolean }) {
  return (
    <Button
      type="submit"
      disabled={pending || props.disabled}
      className={cn(
        'bg-navy font-semibold text-white shadow-sm shadow-navy/20 hover:bg-navy-800',
        pill ? 'h-12 w-full rounded-full text-[15px]' : 'h-10 rounded-lg px-6',
        className,
      )}
      {...props}
    >
      {pending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </Button>
  );
}

/**
 * Độ mạnh mật khẩu chỉ để gợi ý. Luật thật của backend: 8–72 ký tự, không bắt buộc chữ hoa/số/ký tự đặc biệt.
 * 0: chưa nhập, 1: yếu (dưới 8), 2: tạm được, 3: khá, 4: mạnh
 */
export function passwordStrength(pw: string): 0 | 1 | 2 | 3 | 4 {
  if (!pw) return 0;
  if (pw.length < 8) return 1;
  let score = 2;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (pw.length >= 12 || kinds >= 3) score++;
  if (pw.length >= 12 && kinds >= 3) score++;
  return Math.min(score, 4) as 2 | 3 | 4;
}

const STRENGTH: Record<number, { label: string; bar: string }> = [
  { label: '', bar: '' },
  { label: 'Chưa đủ 8 ký tự', bar: 'bg-destructive' },
  { label: 'Dùng được', bar: 'bg-amber-500' },
  { label: 'Khá mạnh', bar: 'bg-champagne' },
  { label: 'Mạnh', bar: 'bg-emerald-600' },
];

/** Thanh 4 vạch gợi ý độ mạnh mật khẩu */
export function PasswordStrength({ password }: { password: string }) {
  const s = passwordStrength(password);
  const level = STRENGTH[s] ?? { label: '', bar: '' };
  return (
    <div className="space-y-1" aria-live="polite">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn('h-1 flex-1 rounded-full bg-ivory-200 transition', i <= s && level.bar)}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {s === 0 ? 'Từ 8 đến 72 ký tự. Nên trộn chữ hoa, chữ số và ký hiệu.' : level.label}
        {s >= 2 && s < 4 && ' · thêm chữ hoa, số hoặc ký hiệu để mạnh hơn'}
      </p>
    </div>
  );
}

/** Luật mật khẩu mới cho react-hook-form (khớp IsNewPassword ở user-service) */
export const newPasswordRules = {
  required: 'Vui lòng nhập mật khẩu.',
  minLength: { value: 8, message: 'Mật khẩu cần ít nhất 8 ký tự.' },
  maxLength: { value: 72, message: 'Mật khẩu tối đa 72 ký tự.' },
};

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_PATTERN = /^0\d{9}$/;
