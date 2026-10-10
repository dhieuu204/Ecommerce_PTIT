import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Loader2, Minus, PackagePlus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { nativeSelectClass } from '@/components/console/form-field';
import { NumberInput } from '@/components/console/money-input';
import { Pager } from '@/components/console/pager';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { API, api, ApiError } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import type { SellerProduct, SellerVariant, StockHistoryRow } from '@/lib/catalog-types';
import { formatDateTime } from '@/lib/format';
import { showApiError } from '@/lib/form';
import { PRODUCT_LIMITS } from '@/lib/product-limits';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  actorLabel,
  productPath,
  SELLER_PRODUCTS_KEY,
  sellerProductKey,
  stockHistoryKey,
  useSellerProduct,
  variantLabel,
} from './product-shared';

const REASON_MAX = 200;
const QUICK_REASONS = {
  in: ['Nhập thêm hàng', 'Hàng khách trả lại', 'Kiểm kho: thừa so với hệ thống'],
  out: ['Hàng lỗi, hỏng', 'Kiểm kho: thiếu so với hệ thống', 'Bán ngoài sàn'],
};

/**
 * Điều chỉnh tồn một biến thể (INV-01): "Nhập thêm" hoặc "Giảm" kèm lý do bắt buộc.
 * Tồn sau điều chỉnh không được nhỏ hơn lượng đang giữ cho đơn (409 STOCK_BELOW_RESERVED).
 */
export function StockAdjustDialog({
  productId,
  initialVariantId,
  open,
  onOpenChange,
}: {
  productId: string | null;
  initialVariantId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const product = useSellerProduct(open ? productId : null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2 text-navy">
            <PackagePlus className="size-5 text-champagne-600" /> Điều chỉnh tồn kho
          </DialogTitle>
          <DialogDescription className="line-clamp-2">
            {product.data?.name ?? 'Nhập thêm hàng hoặc giảm tồn, mỗi lần ghi một dòng lịch sử.'}
          </DialogDescription>
        </DialogHeader>
        {product.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-10 rounded-lg" />
          </div>
        ) : product.isError ? (
          <LoadError message={product.error.message} onRetry={() => void product.refetch()} />
        ) : (
          <AdjustForm
            key={`${productId}-${initialVariantId ?? ''}`}
            product={product.data}
            initialVariantId={initialVariantId}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AdjustForm({
  product,
  initialVariantId,
  onDone,
}: {
  product: SellerProduct;
  initialVariantId?: string | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const variants = product.variants;
  const [variantId, setVariantId] = useState(
    initialVariantId && variants.some((v) => v.id === initialVariantId)
      ? initialVariantId
      : (variants[0]?.id ?? ''),
  );
  const [mode, setMode] = useState<'in' | 'out'>('in');
  const [quantity, setQuantity] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ quantity?: string; reason?: string }>({});
  const [busy, setBusy] = useState(false);
  const variant = variants.find((v) => v.id === variantId);

  const change = quantity ? (mode === 'in' ? quantity : -quantity) : 0;
  const after = variant ? variant.stock + change : 0;

  async function submit() {
    if (!variant) return;
    const next: typeof errors = {};
    if (!quantity) next.quantity = 'Vui lòng nhập số lượng lớn hơn 0.';
    else if (mode === 'out' && after < variant.reserved)
      next.quantity =
        variant.reserved > 0
          ? `Chỉ giảm được tối đa ${variant.stock - variant.reserved} (đang giữ ${variant.reserved} cho đơn chưa thanh toán).`
          : `Chỉ giảm được tối đa ${variant.stock}.`;
    else if (after > PRODUCT_LIMITS.stockMax)
      next.quantity = `Tồn mỗi biến thể tối đa ${PRODUCT_LIMITS.stockMax.toLocaleString('vi-VN')}.`;
    if (!reason.trim()) next.reason = 'Vui lòng nhập lý do.';
    else if (reason.trim().length > REASON_MAX) next.reason = `Lý do tối đa ${REASON_MAX} ký tự.`;
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const res = await api<{ variantId: string; stock: number; reserved: number }>(
        `${productPath(product.id)}/variants/${variant.id}/stock`,
        { method: 'POST', body: { change, reason: reason.trim() } },
      );
      // Cập nhật ngay số tồn trong cache chi tiết, rồi tải lại danh sách và lịch sử
      queryClient.setQueryData<SellerProduct>(sellerProductKey(product.id), (old) =>
        old
          ? {
              ...old,
              variants: old.variants.map((v) =>
                v.id === res.variantId
                  ? {
                      ...v,
                      stock: res.stock,
                      reserved: res.reserved,
                      available: res.stock - res.reserved,
                    }
                  : v,
              ),
            }
          : old,
      );
      void queryClient.invalidateQueries({ queryKey: SELLER_PRODUCTS_KEY });
      void queryClient.invalidateQueries({ queryKey: stockHistoryKey(product.id) });
      toast.success(
        `${mode === 'in' ? 'Đã nhập thêm' : 'Đã giảm'} ${quantity} · ${variantLabel(variant)}: tồn còn ${res.stock}.`,
      );
      onDone();
    } catch (e) {
      if (
        e instanceof ApiError &&
        (e.code === 'STOCK_BELOW_RESERVED' || e.code === 'STOCK_TOO_LARGE')
      ) {
        setErrors({ quantity: e.message });
        void queryClient.invalidateQueries({ queryKey: sellerProductKey(product.id) });
      } else if (e instanceof ApiError && Object.keys(e.fields).length) {
        setErrors({ quantity: e.fields.change, reason: e.fields.reason });
      } else {
        showApiError(e);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="space-y-5">
        {variants.length > 1 && (
          <div className="space-y-1.5">
            <div className="text-sm font-medium text-ink">Biến thể</div>
            <ul
              role="radiogroup"
              aria-label="Chọn biến thể"
              className="max-h-56 space-y-1.5 overflow-y-auto pr-1"
            >
              {variants.map((v) => (
                <li key={v.id}>
                  <VariantChoice
                    variant={v}
                    active={v.id === variantId}
                    onSelect={() => {
                      setVariantId(v.id);
                      setErrors({});
                    }}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
        {variants.length === 1 && variant && (
          <StockFigures variant={variant} className="rounded-xl border bg-ivory px-4 py-3" />
        )}

        <div className="grid grid-cols-2 gap-2 rounded-xl bg-ivory p-1">
          {(
            [
              { value: 'in', label: 'Nhập thêm', icon: Plus },
              { value: 'out', label: 'Giảm', icon: Minus },
            ] as const
          ).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => {
                setMode(value);
                setErrors({});
              }}
              className={cn(
                'flex h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition',
                mode === value
                  ? value === 'in'
                    ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-200'
                    : 'bg-white text-red-700 shadow-sm ring-1 ring-red-200'
                  : 'text-muted-foreground hover:text-ink',
              )}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
          <div className="space-y-1.5">
            <label htmlFor="stock-qty" className="text-sm font-medium text-ink">
              Số lượng {mode === 'in' ? 'nhập thêm' : 'giảm'}
              <span className="text-destructive">*</span>
            </label>
            <NumberInput
              id="stock-qty"
              value={quantity}
              maxDigits={6}
              aria-invalid={!!errors.quantity}
              placeholder="Ví dụ: 20"
              onChange={(v) => {
                setQuantity(v);
                setErrors((e) => ({ ...e, quantity: undefined }));
              }}
            />
            {errors.quantity && (
              <p className="text-xs text-destructive" role="alert">
                {errors.quantity}
              </p>
            )}
          </div>
          {variant && (
            <div className="rounded-xl border border-dashed border-champagne/60 px-4 py-2 text-sm sm:mt-6 sm:text-right">
              <div className="text-xs text-muted-foreground">Tồn sau điều chỉnh</div>
              <div
                className={cn(
                  'font-semibold tabular-nums',
                  after < variant.reserved ? 'text-destructive' : 'text-navy',
                )}
              >
                {variant.stock} → {after}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="stock-reason" className="text-sm font-medium text-ink">
            Lý do<span className="text-destructive">*</span>
          </label>
          <Input
            id="stock-reason"
            value={reason}
            maxLength={REASON_MAX}
            aria-invalid={!!errors.reason}
            placeholder="Ví dụ: Nhập thêm lô tháng 10"
            className="h-10 rounded-lg bg-white focus-visible:border-champagne"
            onChange={(e) => {
              setReason(e.target.value);
              setErrors((x) => ({ ...x, reason: undefined }));
            }}
          />
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REASONS[mode].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setReason(r);
                  setErrors((x) => ({ ...x, reason: undefined }));
                }}
                className="rounded-full border border-champagne/50 bg-champagne-50/60 px-2.5 py-1 text-xs text-navy transition hover:border-champagne hover:bg-champagne-50"
              >
                {r}
              </button>
            ))}
          </div>
          {errors.reason && (
            <p className="text-xs text-destructive" role="alert">
              {errors.reason}
            </p>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" disabled={busy} onClick={onDone}>
          Hủy
        </Button>
        <Button
          disabled={busy || !variant}
          onClick={() => void submit()}
          className={cn('min-w-36', mode === 'out' && 'bg-red-600 hover:bg-red-700')}
        >
          {busy && <Loader2 className="animate-spin" />}
          {mode === 'in' ? 'Nhập thêm' : 'Giảm tồn'}
        </Button>
      </DialogFooter>
    </>
  );
}

function StockFigures({ variant, className }: { variant: SellerVariant; className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground', className)}>
      <span>
        Tồn <b className="font-semibold text-ink tabular-nums">{variant.stock}</b>
      </span>
      <span>
        Đang giữ <b className="font-semibold text-ink tabular-nums">{variant.reserved}</b>
      </span>
      <span>
        Còn bán{' '}
        <b
          className={cn(
            'font-semibold tabular-nums',
            variant.available <= 0
              ? 'text-red-600'
              : variant.available <= PRODUCT_LIMITS.lowStock
                ? 'text-amber-700'
                : 'text-emerald-700',
          )}
        >
          {variant.available}
        </b>
      </span>
    </div>
  );
}

function VariantChoice({
  variant,
  active,
  onSelect,
}: {
  variant: SellerVariant;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition',
        active
          ? 'border-champagne bg-champagne-50/70 ring-1 ring-champagne'
          : 'bg-white hover:border-champagne/60',
      )}
    >
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-full border',
          active ? 'border-navy' : 'border-input',
        )}
      >
        {active && <span className="size-2 rounded-full bg-navy" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{variantLabel(variant)}</span>
        <StockFigures variant={variant} className="mt-0.5" />
      </span>
    </button>
  );
}

const HISTORY_PAGE_SIZE = 10;

/** Lịch sử tồn kho của một sản phẩm: lọc theo biến thể, phân trang, mới nhất lên đầu */
export function StockHistoryList({
  productId,
  variants,
  className,
}: {
  productId: string;
  variants: SellerVariant[];
  className?: string;
}) {
  const me = useCurrentUser();
  const [variantId, setVariantId] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [variantId]);

  const list = useQuery({
    queryKey: [...stockHistoryKey(productId), { variantId, page }],
    queryFn: () =>
      api<Page<StockHistoryRow>>(`${API.market}/shops/me/products/${productId}/stock-history`, {
        query: { variantId, page, pageSize: HISTORY_PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.items ?? [];

  return (
    <div className={className}>
      {variants.length > 1 && (
        <select
          aria-label="Lọc theo biến thể"
          className={cn(nativeSelectClass, 'mb-3 h-9 rounded-full sm:w-64')}
          value={variantId}
          onChange={(e) => setVariantId(e.target.value)}
        >
          <option value="">Mọi biến thể</option>
          {variants.map((v) => (
            <option key={v.id} value={v.id}>
              {variantLabel(v)}
            </option>
          ))}
        </select>
      )}
      {list.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10 rounded-lg" />
          ))}
        </div>
      ) : list.isError ? (
        <LoadError message={list.error.message} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={History}
          title="Chưa có lịch sử tồn kho"
          text="Mỗi lần nhập thêm hoặc giảm tồn sẽ hiện ở đây."
          className="py-8"
        />
      ) : (
        <div className={cn('transition-opacity', list.isFetching && 'opacity-60')}>
          <div className="hidden overflow-hidden rounded-xl border sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ivory text-left text-xs tracking-wide text-muted-foreground uppercase">
                  <th className="px-4 py-2.5 font-medium">Thời gian</th>
                  <th className="px-3 py-2.5 font-medium">Biến thể</th>
                  <th className="px-3 py-2.5 text-right font-medium">Thay đổi</th>
                  <th className="px-3 py-2.5 text-right font-medium">Tồn sau</th>
                  <th className="px-4 py-2.5 font-medium">Lý do</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id} className="bg-white">
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                      {formatDateTime(r.createdAt)}
                    </td>
                    <td className="px-3 py-2.5 text-ink">{variantLabel(r)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <ChangeValue change={r.change} />
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-ink tabular-nums">
                      {r.stockAfter}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-ink">{r.reason}</div>
                      <div className="text-xs text-muted-foreground">
                        {actorLabel(r.createdBy, me?.id)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 sm:hidden">
            {rows.map((r) => (
              <li key={r.id} className="rounded-xl border bg-white px-3.5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium text-ink">{variantLabel(r)}</span>
                  <ChangeValue change={r.change} />
                </div>
                <div className="mt-1 text-sm text-ink">{r.reason}</div>
                <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                  <span>
                    {formatDateTime(r.createdAt)} · {actorLabel(r.createdBy, me?.id)}
                  </span>
                  <span>
                    Tồn sau <b className="text-ink tabular-nums">{r.stockAfter}</b>
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {list.data && (
            <Pager
              className="mt-3"
              page={page}
              pageSize={HISTORY_PAGE_SIZE}
              total={list.data.total}
              onChange={setPage}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ChangeValue({ change }: { change: number }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums',
        change > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
      )}
    >
      {change > 0 ? `+${change}` : `−${Math.abs(change)}`}
    </span>
  );
}

/** Cửa sổ "Lịch sử tồn kho" mở từ danh sách sản phẩm */
export function StockHistoryDialog({
  productId,
  open,
  onOpenChange,
}: {
  productId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const product = useSellerProduct(open ? productId : null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-3xl">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2 text-navy">
            <History className="size-5 text-champagne-600" /> Lịch sử tồn kho
          </DialogTitle>
          <DialogDescription className="line-clamp-2">
            {product.data?.name ?? 'Mỗi lần nhập thêm hoặc giảm tồn là một dòng.'}
          </DialogDescription>
        </DialogHeader>
        {product.isPending ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : product.isError ? (
          <LoadError message={product.error.message} onRetry={() => void product.refetch()} />
        ) : (
          <StockHistoryList productId={product.data.id} variants={product.data.variants} />
        )}
      </DialogContent>
    </Dialog>
  );
}
