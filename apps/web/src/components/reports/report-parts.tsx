import type { LucideIcon } from 'lucide-react';
import { CalendarDays, Info, Package, Store, TicketPercent } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/console/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/lib/format';
import type { TopProduct, TopShop, VoucherPerformance } from '@/lib/report-types';
import { cn } from '@/lib/utils';
import { formatCount, formatPerMille, fullDayLabel, RANGE_PRESETS } from './report-format';

// ----- Khung trang -----

/** Hai tab Vận hành / Tài chính (dạng gạch chân như các trang Kênh người bán) */
export function ReportTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ value: T; label: string; icon: LucideIcon }>;
  value: T;
  onChange: (t: T) => void;
}) {
  if (tabs.length < 2) return null;
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto border-b" aria-label="Loại báo cáo">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          aria-current={value === t.value ? 'page' : undefined}
          className={cn(
            '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm whitespace-nowrap transition',
            value === t.value
              ? 'border-navy font-semibold text-navy'
              : 'border-transparent text-muted-foreground hover:text-ink',
          )}
        >
          <t.icon className="size-4" />
          {t.label}
        </button>
      ))}
    </nav>
  );
}

/** Chọn khoảng ngày: nút nhanh 7/30/90 ngày + chọn ngày tự do (giờ Việt Nam) */
export function RangePicker({
  from,
  to,
  today,
  preset,
  error,
  onPreset,
  onRange,
}: {
  from: string;
  to: string;
  today: string;
  preset?: number;
  error: string | null;
  onPreset: (days: number) => void;
  onRange: (r: { from: string; to: string }) => void;
}) {
  return (
    <div className="mb-6 rounded-2xl border bg-card p-3 shadow-sm shadow-navy/[0.03] md:px-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div
          role="radiogroup"
          aria-label="Khoảng ngày nhanh"
          className="flex w-full rounded-full bg-ivory p-1 md:w-auto"
        >
          {RANGE_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={preset === n}
              onClick={() => onPreset(n)}
              className={cn(
                'flex-1 rounded-full px-4 py-1.5 text-sm whitespace-nowrap transition md:flex-none',
                preset === n
                  ? 'bg-navy font-medium text-white shadow-sm'
                  : 'text-ink/70 hover:text-navy',
              )}
            >
              {n} ngày
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="hidden size-4 shrink-0 text-champagne-600 sm:block" />
          <label className="sr-only" htmlFor="report-from">
            Từ ngày
          </label>
          <Input
            id="report-from"
            type="date"
            value={from}
            max={to < today ? to : today}
            onChange={(e) => e.target.value && onRange({ from: e.target.value, to })}
            className="h-9 min-w-0 flex-1 md:w-40 md:flex-none"
          />
          <span className="text-muted-foreground">–</span>
          <label className="sr-only" htmlFor="report-to">
            Tới ngày
          </label>
          <Input
            id="report-to"
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(e) => e.target.value && onRange({ from, to: e.target.value })}
            className="h-9 min-w-0 flex-1 md:w-40 md:flex-none"
          />
        </div>
      </div>
      <p className={cn('mt-2 text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>
        {error ??
          `Từ ${fullDayLabel(from)} tới hết ${fullDayLabel(to)}, giờ Việt Nam. Tối đa 366 ngày.`}
      </p>
    </div>
  );
}

/** Một khối của báo cáo: tiêu đề, mô tả ngắn, nội dung */
export function ReportSection({
  title,
  description,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn('min-w-0 rounded-2xl border bg-card shadow-sm shadow-navy/[0.03]', className)}
    >
      <header className="border-b px-4 py-3.5 md:px-5">
        <h2 className="font-semibold text-navy">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </header>
      <div className={cn('p-4 md:p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

// ----- Ô số liệu -----

/** Ô số liệu chính: biểu tượng, nhãn, con số, dòng phụ. `highlight` = nền navy cho số quan trọng nhất */
export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  highlight,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: React.ReactNode;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative min-w-0 overflow-hidden rounded-2xl p-4 md:p-5',
        highlight
          ? 'bg-navy text-white shadow-lg shadow-navy/20'
          : 'border bg-card shadow-sm shadow-navy/[0.03]',
        className,
      )}
    >
      {highlight && (
        <div
          className="absolute -top-10 -right-10 size-32 rounded-full bg-champagne/15"
          aria-hidden
        />
      )}
      <div
        className={cn(
          'relative flex items-center gap-2 text-xs font-medium',
          highlight ? 'text-white/75' : 'text-ink/60',
        )}
      >
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full',
            highlight ? 'bg-white/10 text-champagne' : 'bg-champagne-50 text-champagne-600',
          )}
        >
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 leading-tight">{label}</span>
      </div>
      <div
        className={cn(
          'relative mt-3 text-lg font-bold break-words tabular-nums sm:text-2xl',
          highlight ? 'text-champagne' : 'text-navy',
        )}
      >
        {value}
      </div>
      {hint && (
        <div
          className={cn(
            'relative mt-1 text-xs',
            highlight ? 'text-white/65' : 'text-muted-foreground',
          )}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

/** Ô tỉ lệ (phần nghìn) có thanh ngang: tỉ lệ hủy, tỉ lệ trả hàng */
export function RateTile({
  icon: Icon,
  label,
  rate,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  /** Phần nghìn */
  rate: number;
  hint: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border bg-card p-4 shadow-sm shadow-navy/[0.03] md:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-ink/60">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-champagne-50 text-champagne-600">
            <Icon className="size-4" />
          </span>
          {label}
        </div>
        <div className="text-lg font-bold text-navy tabular-nums sm:text-2xl">
          {formatPerMille(rate)}
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ivory-200" aria-hidden>
        <div
          className="h-full rounded-full bg-champagne"
          style={{ width: `${Math.min(100, rate / 10)}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/** Khung chờ khi đang tải báo cáo */
export function ReportSkeleton({ tiles = 4 }: { tiles?: number }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: tiles }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-2xl" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

/** Cách tính các con số (thu gọn được), để người xem hiểu đúng số liệu */
export function FormulaNote({ items }: { items: Array<[string, string]> }) {
  return (
    <details className="group rounded-2xl border border-champagne/40 bg-champagne-50/40 px-4 py-3 text-sm md:px-5">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-navy">
        <Info className="size-4 text-champagne-600" />
        Các con số được tính thế nào?
        <span className="ml-auto text-xs text-muted-foreground group-open:hidden">Xem</span>
        <span className="ml-auto hidden text-xs text-muted-foreground group-open:inline">
          Thu gọn
        </span>
      </summary>
      <dl className="mt-3 grid gap-x-6 gap-y-2 md:grid-cols-2">
        {items.map(([term, text]) => (
          <div key={term}>
            <dt className="font-medium text-ink">{term}</dt>
            <dd className="text-xs text-ink/70">{text}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

// ----- Bảng (thành thẻ trên điện thoại) -----

function Rank({ n }: { n: number }) {
  return (
    <span
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
        n <= 3 ? 'bg-navy text-champagne' : 'bg-ivory text-ink/60',
      )}
    >
      {n}
    </span>
  );
}

/** Ô số của một dòng: trên điện thoại có nhãn bên trái, trên máy tính căn phải theo cột */
function NumCell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-sm md:block md:text-right">
      <span className="text-xs text-muted-foreground md:hidden">{label}</span>
      <span className={cn('tabular-nums', strong ? 'font-semibold text-navy' : 'text-ink')}>
        {value}
      </span>
    </div>
  );
}

/** 10 sản phẩm bán chạy: thanh ngang theo số lượng so với sản phẩm đứng đầu */
export function TopProductsTable({
  items,
  showShop,
  productLink,
}: {
  items: TopProduct[];
  showShop?: boolean;
  /** Đường dẫn khi bấm tên sản phẩm (không có thì không phải link) */
  productLink?: (p: TopProduct) => string;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="Chưa có sản phẩm bán ra"
        text="Sản phẩm trong các đơn không bị hủy hiện ở đây."
        className="py-10"
      />
    );
  }
  const max = Math.max(...items.map((p) => p.quantity), 1);
  return (
    <div>
      <div className="hidden grid-cols-[minmax(0,1fr)_5.5rem_8.5rem] gap-4 border-b pb-2 text-xs font-medium text-muted-foreground md:grid">
        <span>Sản phẩm</span>
        <span className="text-right">Đã bán</span>
        <span className="text-right">Tiền hàng</span>
      </div>
      <ol className="divide-y">
        {items.map((p, i) => (
          <li
            key={p.productId}
            className="grid gap-2 py-3 md:grid-cols-[minmax(0,1fr)_5.5rem_8.5rem] md:items-center md:gap-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Rank n={i + 1} />
              <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-ivory">
                {p.image ? (
                  <img src={p.image} alt="" className="size-full object-cover" loading="lazy" />
                ) : (
                  <Package className="size-4 text-ink/30" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                {productLink ? (
                  <Link
                    to={productLink(p)}
                    className="line-clamp-1 text-sm font-medium text-ink hover:text-navy hover:underline"
                  >
                    {p.name}
                  </Link>
                ) : (
                  <div className="line-clamp-1 text-sm font-medium text-ink">{p.name}</div>
                )}
                {showShop && (
                  <div className="truncate text-xs text-muted-foreground">{p.shopName}</div>
                )}
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-ivory-200" aria-hidden>
                  <div
                    className="h-full rounded-full bg-champagne"
                    style={{ width: `${(p.quantity / max) * 100}%` }}
                  />
                </div>
              </div>
            </div>
            <NumCell label="Đã bán" value={formatCount(p.quantity)} strong />
            <NumCell label="Tiền hàng" value={formatMoney(p.amount)} />
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Hiệu quả voucher: mỗi mã một dòng */
export function VoucherTable({
  items,
  showScope,
}: {
  items: VoucherPerformance[];
  /** Hiện "Voucher sàn" / tên shop (trang quản trị) */
  showScope?: boolean;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={TicketPercent}
        title="Chưa có đơn dùng voucher"
        text="Mã giảm giá được dùng trong các đơn không bị hủy hiện ở đây."
        className="py-10"
      />
    );
  }
  return (
    <div>
      <div className="hidden grid-cols-[minmax(0,1fr)_4rem_7rem_8rem] gap-4 border-b pb-2 text-xs font-medium text-muted-foreground md:grid">
        <span>Mã voucher</span>
        <span className="text-right">Số đơn</span>
        <span className="text-right">Tổng giảm</span>
        <span className="text-right">Giá trị đơn</span>
      </div>
      <ul className="divide-y">
        {items.map((v) => (
          <li
            key={v.voucherId}
            className="grid gap-2 py-3 md:grid-cols-[minmax(0,1fr)_4rem_7rem_8rem] md:items-center md:gap-4"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-dashed border-champagne bg-champagne-50 px-2 py-0.5 font-mono text-xs font-semibold text-navy">
                  {v.code}
                </span>
                {showScope && (
                  <StatusBadge tone={v.scope === 'PLATFORM' ? 'info' : 'neutral'}>
                    {v.scope === 'PLATFORM' ? 'Voucher sàn' : (v.shopName ?? 'Voucher shop')}
                  </StatusBadge>
                )}
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">{v.name}</div>
            </div>
            <NumCell label="Số đơn" value={formatCount(v.orderCount)} strong />
            <NumCell label="Tổng giảm" value={formatMoney(v.discountTotal)} />
            <NumCell label="Giá trị đơn" value={formatMoney(v.orderValue)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 10 shop có giá trị đặt hàng cao nhất (quản trị) */
export function TopShopsTable({
  items,
  shopLink,
}: {
  items: TopShop[];
  shopLink?: (s: TopShop) => string;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Store}
        title="Chưa có shop nào có đơn"
        text="Shop có đơn trong khoảng ngày hiện ở đây."
        className="py-10"
      />
    );
  }
  const max = Math.max(...items.map((s) => s.orderValue), 1);
  return (
    <div>
      <div className="hidden grid-cols-[minmax(0,1fr)_5rem_9rem_9rem] gap-4 border-b pb-2 text-xs font-medium text-muted-foreground md:grid">
        <span>Shop</span>
        <span className="text-right">Số đơn</span>
        <span className="text-right">Giá trị đặt hàng</span>
        <span className="text-right">Doanh số hoàn tất</span>
      </div>
      <ol className="divide-y">
        {items.map((s, i) => (
          <li
            key={s.shopId}
            className="grid gap-2 py-3 md:grid-cols-[minmax(0,1fr)_5rem_9rem_9rem] md:items-center md:gap-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Rank n={i + 1} />
              <div className="min-w-0 flex-1">
                {shopLink ? (
                  <Link
                    to={shopLink(s)}
                    className="truncate text-sm font-medium text-ink hover:text-navy hover:underline"
                  >
                    {s.name}
                  </Link>
                ) : (
                  <div className="truncate text-sm font-medium text-ink">{s.name}</div>
                )}
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-ivory-200" aria-hidden>
                  <div
                    className="h-full rounded-full bg-navy"
                    style={{ width: `${(s.orderValue / max) * 100}%` }}
                  />
                </div>
              </div>
            </div>
            <NumCell label="Số đơn" value={formatCount(s.orderCount)} />
            <NumCell label="Giá trị đặt hàng" value={formatMoney(s.orderValue)} strong />
            <NumCell label="Doanh số hoàn tất" value={formatMoney(s.revenue)} />
          </li>
        ))}
      </ol>
    </div>
  );
}
