import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** Chỉ cho quay về đường dẫn trong web (bắt đầu bằng "/", không phải "//"), giống user-service */
export function safeReturnTo(value: string | null | undefined): string {
  return value && /^\/(?![/\\])/.test(value) ? value : '/';
}

/** Che bớt email: binh.nguyen@gmail.com → bi***@gmail.com */
export function maskEmail(email: string): string {
  const [name = '', domain = ''] = email.split('@');
  if (!domain) return email;
  return `${name.slice(0, Math.min(2, Math.max(1, name.length - 1)))}***@${domain}`;
}

/** Khung trang đăng nhập/đăng ký: thẻ trắng bo tròn giữa trang, tiêu đề lớn navy, vạch champagne */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
  wide,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="relative overflow-hidden px-4 py-8 md:py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-champagne/10 blur-3xl"
      />
      <div
        className={cn(
          'relative mx-auto w-full rounded-[1.75rem] border border-border/70 bg-card px-5 py-8 shadow-xl shadow-navy/5 sm:px-10 sm:py-10 md:px-14 md:py-12',
          wide ? 'max-w-2xl' : 'max-w-[34rem]',
        )}
      >
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-navy md:text-[2.5rem] md:leading-tight">
            {title}
          </h1>
          <div className="mx-auto mt-3 h-1 w-12 rounded-full bg-champagne" />
          {subtitle && (
            <div className="mt-4 text-sm text-balance text-ink/80 md:text-[15px]">{subtitle}</div>
          )}
        </div>
        <div className="mt-8">{children}</div>
        {footer && <div className="mt-6 text-center text-xs text-muted-foreground">{footer}</div>}
      </div>
    </div>
  );
}

/** Đường kẻ có chữ "hoặc" ở giữa */
export function OrDivider() {
  return (
    <div className="my-6 flex items-center gap-3 text-xs tracking-wide text-muted-foreground uppercase">
      <span className="h-px flex-1 bg-border" />
      hoặc
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Thông báo trong thẻ (lỗi đỏ, nhắc vàng, thành công xanh) */
export function Notice({
  tone,
  icon,
  children,
  className,
}: {
  tone: 'danger' | 'warning' | 'success' | 'info';
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    danger: 'border-red-200 bg-red-50 text-red-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    info: 'border-champagne/40 bg-champagne-50 text-navy',
  };
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-xl border px-4 py-3 text-sm', tones[tone], className)}
    >
      {icon && <span className="mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span>}
      <div className="min-w-0 flex-1 space-y-2">{children}</div>
    </div>
  );
}

/** Đếm ngược theo giây tới một mốc thời gian (ms). Trả 0 khi đã qua. */
export function useCountdown(until: number | null): number {
  const calc = () => (until ? Math.max(0, Math.ceil((until - Date.now()) / 1000)) : 0);
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    setLeft(calc());
    if (!until) return;
    const t = setInterval(() => {
      const v = calc();
      setLeft(v);
      if (v === 0) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [until]);
  return left;
}

/** 125 → "02:05" */
export const mmss = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

/**
 * Mốc gửi mã gần nhất theo email + mục đích, lưu sessionStorage để tải lại trang vẫn đếm đúng.
 * Backend không trả số giây còn chờ (gửi lại luôn trả 202), nên web tự đếm theo cấu hình.
 */
type CodePurpose = 'verify' | 'reset';
const codeKey = (purpose: CodePurpose, email: string) =>
  `san:code:${purpose}:${email.trim().toLowerCase()}`;

/** Ghi lại lúc vừa gửi mã (gọi ở trang khác trước khi chuyển sang trang nhập mã) */
export function rememberCodeSent(purpose: CodePurpose, email: string, at = Date.now()) {
  try {
    sessionStorage.setItem(codeKey(purpose, email), String(at));
  } catch {
    // trình duyệt chặn lưu trữ: bỏ qua
  }
}

export function useCodeClock(purpose: CodePurpose, email: string) {
  const key = codeKey(purpose, email);
  const read = () => {
    try {
      const v = Number(sessionStorage.getItem(key));
      return Number.isFinite(v) && v > 0 ? v : null;
    } catch {
      return null;
    }
  };
  const [sentAt, setSentAt] = useState<number | null>(read);
  useEffect(() => setSentAt(read()), [key]);
  const markSent = (at = Date.now()) => {
    rememberCodeSent(purpose, email, at);
    setSentAt(at);
  };
  return { sentAt, markSent };
}

/**
 * 6 ô nhập mã: dán mã vào ô nào cũng điền đủ 6 ô, gõ xong tự sang ô sau,
 * xóa ở ô trống thì lùi về ô trước, mũi tên trái/phải để di chuyển.
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  invalid,
  disabled,
  autoFocus,
}: {
  value: string;
  onChange: (code: string) => void;
  onComplete?: (code: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  // value: chuỗi tối đa 6 ký tự, ô trống ở giữa ghi bằng dấu cách
  const digits = Array.from({ length: 6 }, (_, i) => (value[i] ?? '').trim());
  // Mã bị xóa trắng (nhập sai, gửi mã mới): đưa con trỏ về ô đầu
  const empty = value.trim() === '';
  useEffect(() => {
    if (empty && !disabled && autoFocus) refs.current[0]?.focus();
  }, [empty, disabled, autoFocus]);
  const emit = (next: string[]) =>
    onChange(
      next
        .map((x) => x || ' ')
        .join('')
        .trimEnd(),
    );

  const focus = (i: number) => refs.current[Math.max(0, Math.min(5, i))]?.focus();

  const setFrom = (start: number, text: string) => {
    const clean = text.replace(/\D/g, '');
    if (!clean) return;
    const next = digits.slice();
    let i = start;
    for (const ch of clean) {
      if (i > 5) break;
      next[i++] = ch;
    }
    emit(next);
    focus(Math.min(i, 5));
    if (next.every(Boolean)) onComplete?.(next.join(''));
  };

  return (
    <div className="flex justify-center gap-2 sm:gap-3" role="group" aria-label="Mã 6 số">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={6}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          aria-label={`Số thứ ${i + 1}`}
          aria-invalid={invalid}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) {
              const next = digits.slice();
              next[i] = '';
              emit(next);
              return;
            }
            // Ô đã có số mà gõ thêm: lấy số vừa gõ
            setFrom(i, d && v.length === 2 ? (v[0] === d ? v[1]! : v[0]!) : v);
          }}
          onPaste={(e) => {
            e.preventDefault();
            setFrom(0, e.clipboardData.getData('text'));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !d && i > 0) {
              e.preventDefault();
              const next = digits.slice();
              next[i - 1] = '';
              emit(next);
              focus(i - 1);
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              focus(i - 1);
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              focus(i + 1);
            }
          }}
          className={cn(
            'size-11 rounded-xl border-2 border-input bg-white text-center text-xl font-semibold text-navy caret-champagne transition outline-none sm:size-14 sm:text-2xl',
            'focus:border-champagne focus:ring-4 focus:ring-champagne/20',
            d && 'border-navy/40 bg-ivory',
            invalid &&
              'border-destructive/70 bg-red-50/50 focus:border-destructive focus:ring-destructive/15',
            disabled && 'opacity-60',
          )}
        />
      ))}
    </div>
  );
}

/**
 * Dòng "Mã hết hạn sau 09:41" + nút "Gửi lại mã" có đếm ngược.
 * sentAt: lúc gửi mã gần nhất (null: không rõ, cho gửi lại ngay).
 */
export function CodeTimers({
  sentAt,
  cooldownSeconds,
  ttlMinutes,
  onResend,
}: {
  sentAt: number | null;
  cooldownSeconds: number;
  ttlMinutes: number;
  onResend: () => Promise<void>;
}) {
  const [sending, setSending] = useState(false);
  const cooldown = useCountdown(sentAt ? sentAt + cooldownSeconds * 1000 : null);
  const ttl = useCountdown(sentAt ? sentAt + ttlMinutes * 60_000 : null);

  return (
    <div className="space-y-3 text-center text-sm">
      {sentAt && (
        <p className="text-muted-foreground">
          {ttl > 0 ? (
            <>
              Mã hết hạn sau{' '}
              <span className="font-semibold text-navy tabular-nums">{mmss(ttl)}</span>
            </>
          ) : (
            <span className="text-amber-700">Mã đã hết hạn, bạn bấm gửi lại mã mới.</span>
          )}
        </p>
      )}
      <p className="text-muted-foreground">
        Chưa nhận được mã?{' '}
        {cooldown > 0 ? (
          <span className="text-ink/70">
            Gửi lại sau <span className="font-medium tabular-nums">{mmss(cooldown)}</span>
          </span>
        ) : (
          <button
            type="button"
            disabled={sending}
            onClick={async () => {
              setSending(true);
              try {
                await onResend();
              } finally {
                setSending(false);
              }
            }}
            className="font-semibold text-champagne-600 hover:underline disabled:opacity-60"
          >
            {sending ? 'Đang gửi…' : 'Gửi lại mã'}
          </button>
        )}
      </p>
    </div>
  );
}

/** Nhắc khi chạy thử: thư thật không gửi đi, xem trong hộp thư giả Mailpit */
export function DevMailHint() {
  if (!import.meta.env.DEV) return null;
  return (
    <p className="rounded-lg border border-dashed border-champagne/50 bg-ivory px-3 py-2 text-center text-xs text-muted-foreground">
      <span className="font-semibold text-champagne-600">Môi trường thử:</span> thư không gửi thật,
      xem mã trong hộp thư giả Mailpit (
      <a href="http://localhost:8025" target="_blank" rel="noreferrer" className="underline">
        localhost:8025
      </a>
      ).
    </p>
  );
}
