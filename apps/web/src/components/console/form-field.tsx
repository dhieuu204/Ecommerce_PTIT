import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** Ô nhập cao 40px, viền champagne khi chọn: dùng chung trong Kênh người bán / Quản trị */
export const inputClass = 'h-10 rounded-lg bg-white focus-visible:border-champagne';
/** select gốc của trình duyệt (trên điện thoại mở bảng chọn của máy) cùng kiểu với ô nhập */
export const nativeSelectClass =
  'h-10 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none transition focus:border-champagne focus:ring-[3px] focus:ring-champagne/30 disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-destructive';

/** Nhãn + ô nhập + câu lỗi tiếng Việt ngay dưới ô */
export function FormField({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor} className="text-ink">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

/** Khung thẻ trắng bo tròn có tiêu đề, dùng cho từng phần của trang */
export function SectionCard({
  title,
  description,
  actions,
  id,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        'scroll-mt-20 rounded-2xl border bg-card shadow-sm shadow-navy/[0.03]',
        className,
      )}
    >
      <header className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-navy">
            <span className="h-4 w-1 rounded-full bg-champagne" aria-hidden />
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </header>
      <div className="p-5 md:p-6">{children}</div>
    </section>
  );
}
