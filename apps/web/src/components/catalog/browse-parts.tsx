import type { UseQueryResult } from '@tanstack/react-query';
import {
  ArrowDownUp,
  ChevronDown,
  ChevronRight,
  House,
  PackageSearch,
  SearchX,
  Wallet,
  X,
} from 'lucide-react';
import { Popover } from 'radix-ui';
import { useState } from 'react';
import { Link } from 'react-router';
import type { Page } from '@san/shared';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { Pager } from '@/components/console/pager';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ProductCardData, ProductSort } from '@/lib/catalog-types';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { SORT_LABELS } from './browse-query';
import { ProductCard, ProductCardSkeleton, ProductGrid } from './product-card';

// ----- Đường dẫn vị trí (breadcrumb) -----

export interface Crumb {
  label: string;
  to?: string;
}

/** "Trang chủ › Điện thoại › iPhone": mục cuối là trang đang xem (không bấm được) */
export function Breadcrumb({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Vị trí trang" className={cn('text-sm', className)}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-ink/60">
        <li>
          <Link to="/" className="inline-flex items-center gap-1.5 transition hover:text-navy">
            <House className="size-4" />
            Trang chủ
          </Link>
        </li>
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
            <ChevronRight className="size-3.5 text-ink/35" aria-hidden />
            {c.to && i < items.length - 1 ? (
              <Link to={c.to} className="transition hover:text-navy">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium text-ink">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

// ----- Nút dạng viên thuốc (chip) -----

export function chipClass(active: boolean, size: 'md' | 'sm' = 'md') {
  return cn(
    'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-champagne focus-visible:ring-offset-1',
    size === 'md' ? 'h-11 px-5 text-sm sm:px-6 sm:text-[15px]' : 'h-8 px-3.5 text-[13px]',
    active
      ? 'border-navy bg-navy text-white shadow-sm shadow-navy/20'
      : 'border-transparent bg-card text-ink shadow-[0_1px_2px_rgba(15,26,61,0.06)] hover:border-champagne hover:text-navy',
  );
}

/** Hàng chip cuộn ngang trên điện thoại, xuống dòng trên màn lớn */
export function ChipRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        '-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:gap-3 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {children}
    </div>
  );
}

// ----- Bộ lọc giá -----

export const PRICE_PRESETS: Array<{ label: string; min?: number; max?: number }> = [
  { label: 'Dưới 1 triệu', max: 1_000_000 },
  { label: '1–5 triệu', min: 1_000_000, max: 5_000_000 },
  { label: '5–15 triệu', min: 5_000_000, max: 15_000_000 },
  { label: 'Trên 15 triệu', min: 15_000_000 },
];

/** Ô nhập tiền: chỉ nhận chữ số, hiện dấu chấm ngăn nghìn (1.000.000) */
function MoneyInput({
  value,
  onChange,
  placeholder,
  label,
  invalid,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder: string;
  label: string;
  invalid?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink/60">{label}</span>
      <span
        className={cn(
          'flex h-10 items-center rounded-lg border bg-white px-3 text-sm focus-within:border-champagne focus-within:ring-2 focus-within:ring-champagne/30',
          invalid ? 'border-destructive' : 'border-input',
        )}
      >
        <input
          inputMode="numeric"
          aria-invalid={invalid || undefined}
          className="w-full min-w-0 bg-transparent outline-none placeholder:text-ink/35"
          placeholder={placeholder}
          value={value === undefined ? '' : value.toLocaleString('vi-VN')}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
            onChange(digits ? Number(digits) : undefined);
          }}
        />
        <span className="text-ink/45">đ</span>
      </span>
    </label>
  );
}

function CustomPrice({
  minPrice,
  maxPrice,
  active,
  onApply,
}: {
  minPrice?: number;
  maxPrice?: number;
  active: boolean;
  onApply: (min?: number, max?: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [min, setMin] = useState<number | undefined>(minPrice);
  const [max, setMax] = useState<number | undefined>(maxPrice);
  const [error, setError] = useState<string | null>(null);

  const label = active
    ? `${minPrice !== undefined ? formatMoney(minPrice) : '0đ'} – ${maxPrice !== undefined ? formatMoney(maxPrice) : 'trở lên'}`
    : 'Khoảng giá khác';

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setMin(minPrice);
          setMax(maxPrice);
          setError(null);
        }
      }}
    >
      <Popover.Trigger className={chipClass(active, 'sm')}>
        {label}
        <ChevronDown className="size-3.5 opacity-70" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          collisionPadding={16}
          className="z-50 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-ivory-200 bg-card p-4 shadow-xl shadow-navy/10 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (min !== undefined && max !== undefined && min > max) {
                setError('Giá “từ” phải nhỏ hơn hoặc bằng giá “đến”.');
                return;
              }
              onApply(min, max);
              setOpen(false);
            }}
          >
            <div className="text-sm font-semibold text-navy">Chọn khoảng giá</div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <MoneyInput
                label="Từ"
                placeholder="0"
                value={min}
                onChange={setMin}
                invalid={!!error}
              />
              <MoneyInput
                label="Đến"
                placeholder="Không giới hạn"
                value={max}
                onChange={setMax}
                invalid={!!error}
              />
            </div>
            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMin(undefined);
                  setMax(undefined);
                  setError(null);
                }}
              >
                Nhập lại
              </Button>
              <Button type="submit" size="sm" className="rounded-full px-5">
                Áp dụng
              </Button>
            </div>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ----- Thanh công cụ: sắp xếp + mức giá -----

export function CatalogToolbar({
  sort,
  sorts,
  onSort,
  minPrice,
  maxPrice,
  onPrice,
  total,
  className,
}: {
  sort: ProductSort;
  /** Các cách sắp xếp cho chọn (trang tìm kiếm có thêm "Liên quan") */
  sorts: ProductSort[];
  onSort: (s: ProductSort) => void;
  minPrice?: number;
  maxPrice?: number;
  onPrice: (min?: number, max?: number) => void;
  /** Số kết quả; undefined khi đang tải lần đầu */
  total?: number;
  className?: string;
}) {
  const hasPrice = minPrice !== undefined || maxPrice !== undefined;
  const presetIndex = PRICE_PRESETS.findIndex((p) => p.min === minPrice && p.max === maxPrice);
  const customActive = hasPrice && presetIndex < 0;

  return (
    <div
      className={cn(
        'rounded-2xl border border-ivory-200 bg-card p-3 shadow-[0_1px_2px_rgba(15,26,61,0.04)] sm:p-4',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span className="hidden shrink-0 items-center gap-1.5 text-sm font-medium text-ink/70 md:inline-flex">
          <ArrowDownUp className="size-4 text-champagne-600" />
          Sắp xếp
        </span>
        <div className="hidden flex-wrap gap-2 md:flex" role="radiogroup" aria-label="Sắp xếp">
          {sorts.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={s === sort}
              onClick={() => onSort(s)}
              className={cn(
                'h-8 rounded-full border px-3.5 text-[13px] font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-champagne',
                s === sort
                  ? 'border-navy bg-navy text-white'
                  : 'border-ivory-200 bg-ivory/60 text-ink/80 hover:border-champagne hover:text-navy',
              )}
            >
              {SORT_LABELS[s]}
            </button>
          ))}
        </div>
        <div className="md:hidden">
          <Select value={sort} onValueChange={(v) => onSort(v as ProductSort)}>
            <SelectTrigger
              size="sm"
              className="h-9 rounded-full bg-ivory/60 pl-3"
              aria-label="Sắp xếp"
            >
              <ArrowDownUp className="size-3.5 text-champagne-600" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sorts.map((s) => (
                <SelectItem key={s} value={s}>
                  {SORT_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="ml-auto shrink-0 text-sm text-ink/60" aria-live="polite">
          {total !== undefined && (
            <>
              <b className="font-semibold text-navy">{total.toLocaleString('vi-VN')}</b> sản phẩm
            </>
          )}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3 border-t border-dashed border-ivory-200 pt-3">
        <span className="hidden shrink-0 items-center gap-1.5 text-sm font-medium text-ink/70 md:inline-flex">
          <Wallet className="size-4 text-champagne-600" />
          Mức giá
        </span>
        <div className="-mx-3 flex flex-1 items-center gap-2 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
          <button type="button" className={chipClass(!hasPrice, 'sm')} onClick={() => onPrice()}>
            Tất cả
          </button>
          {PRICE_PRESETS.map((p, i) => (
            <button
              key={p.label}
              type="button"
              aria-pressed={i === presetIndex}
              className={chipClass(i === presetIndex, 'sm')}
              onClick={() => onPrice(p.min, p.max)}
            >
              {p.label}
            </button>
          ))}
          <CustomPrice
            minPrice={minPrice}
            maxPrice={maxPrice}
            active={customActive}
            onApply={onPrice}
          />
          {hasPrice && (
            <button
              type="button"
              onClick={() => onPrice()}
              className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[13px] font-medium text-champagne-600 transition hover:text-navy"
            >
              <X className="size-3.5" />
              Bỏ lọc giá
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ----- Kết quả: lưới thẻ + chờ tải + trống + lỗi + phân trang -----

export function ProductResults({
  query,
  onPage,
  empty,
  skeletonCount = 10,
}: {
  query: UseQueryResult<Page<ProductCardData>>;
  onPage: (page: number) => void;
  /** Ô trống khi không có kết quả */
  empty: React.ReactNode;
  skeletonCount?: number;
}) {
  const { data, isPending, isError, error, refetch, isPlaceholderData } = query;

  if (isPending) {
    return (
      <ProductGrid>
        {Array.from({ length: skeletonCount }, (_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </ProductGrid>
    );
  }
  if (isError) {
    return (
      <div className="rounded-2xl border border-ivory-200 bg-card">
        <LoadError message={error.message} onRetry={() => void refetch()} />
      </div>
    );
  }
  if (data.items.length === 0) {
    return <div className="rounded-2xl border border-ivory-200 bg-card">{empty}</div>;
  }
  return (
    <div>
      <ProductGrid
        className={cn('transition-opacity', isPlaceholderData && 'pointer-events-none opacity-60')}
      >
        {data.items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </ProductGrid>
      <Pager
        className="mt-8"
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
        onChange={onPage}
      />
    </div>
  );
}

/** Ô trống mặc định của danh sách hàng đã lọc */
export function NoProducts({
  filtered,
  onClear,
  title,
  text,
}: {
  filtered: boolean;
  onClear: () => void;
  title?: string;
  text?: string;
}) {
  return (
    <EmptyState
      icon={filtered ? SearchX : PackageSearch}
      title={title ?? (filtered ? 'Không có sản phẩm hợp bộ lọc' : 'Chưa có sản phẩm')}
      text={
        text ??
        (filtered
          ? 'Thử bỏ bớt điều kiện lọc giá hoặc chọn danh mục khác.'
          : 'Các shop chưa đăng sản phẩm nào ở đây. Bạn quay lại sau nhé.')
      }
      action={
        filtered && (
          <Button variant="outline" className="rounded-full px-5" onClick={onClear}>
            Xóa bộ lọc
          </Button>
        )
      }
    />
  );
}

/** Khối "không tìm thấy" trong trang (danh mục/shop không có) */
export function NotFoundBlock({
  title,
  text,
  icon = SearchX,
}: {
  title: string;
  text: string;
  icon?: typeof SearchX;
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="rounded-3xl border border-ivory-200 bg-card">
        <EmptyState
          icon={icon}
          title={title}
          text={text}
          className="py-20"
          action={
            <Button asChild className="rounded-full px-6">
              <Link to="/">Về trang chủ</Link>
            </Button>
          }
        />
      </div>
    </div>
  );
}
