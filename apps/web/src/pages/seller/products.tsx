import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Eye,
  EyeOff,
  ExternalLink,
  History,
  Loader2,
  MoreHorizontal,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { nativeSelectClass } from '@/components/console/form-field';
import { Pager } from '@/components/console/pager';
import { PageHeader } from '@/components/layout/page-header';
import { RemovedReasonLine } from '@/components/moderation/removed-note';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useCategories } from '@/hooks/use-catalog';
import { useDebounced } from '@/hooks/use-debounced';
import { useMyShop } from '@/hooks/use-my-shop';
import { API, api } from '@/lib/api';
import type { ProductStatus, SellerProductRow } from '@/lib/catalog-types';
import { formatDateTime, formatMoney } from '@/lib/format';
import { showApiError } from '@/lib/form';
import { PRODUCT_LIMITS } from '@/lib/product-limits';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  priceRange,
  productPath,
  ProductStatusBadge,
  ProductThumb,
  SELLER_PRODUCTS_KEY,
  sellerProductKey,
} from './product-shared';
import { StockAdjustDialog, StockHistoryDialog } from './stock-dialogs';

const PAGE_SIZE = 20;
const TABS: Array<{ value: ProductStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'ACTIVE', label: 'Đang bán' },
  { value: 'HIDDEN', label: 'Đã ẩn' },
  { value: 'REMOVED', label: 'Bị gỡ' },
];

/**
 * Kênh người bán › Sản phẩm (CAT-02, INV-01): lọc theo trạng thái, danh mục, tên; ẩn/hiện, điều chỉnh
 * tồn, xem lịch sử tồn. Bộ lọc giữ trên đường dẫn để quay lại từ trang sửa không mất.
 */
export function ProductsPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? 'ALL') as ProductStatus | 'ALL';
  const categoryId = params.get('category') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = params.get('q') ?? '';
  const [search, setSearch] = useState(q);
  const debounced = useDebounced(search.trim());
  const categories = useCategories();
  const shop = useMyShop();
  const [stockFor, setStockFor] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  const update = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if (!('page' in next)) p.delete('page');
    setParams(p, { replace: true });
  };

  useEffect(() => {
    if (debounced !== q) update({ q: debounced || null });
    // chỉ chạy khi từ khóa (đã chờ gõ xong) đổi
  }, [debounced]);

  const list = useQuery({
    queryKey: [...SELLER_PRODUCTS_KEY, { status, categoryId, q, page }],
    queryFn: () =>
      api<Page<SellerProductRow>>(`${API.market}/shops/me/products`, {
        query: {
          status: status === 'ALL' ? undefined : status,
          categoryId,
          q,
          page,
          pageSize: PAGE_SIZE,
        },
      }),
    placeholderData: keepPreviousData,
  });
  // Số sản phẩm mỗi tab (theo danh mục, từ khóa đang lọc)
  const counts = useQuery({
    queryKey: [...SELLER_PRODUCTS_KEY, 'counts', { categoryId, q }],
    queryFn: async () => {
      const count = (s?: ProductStatus) =>
        api<Page<SellerProductRow>>(`${API.market}/shops/me/products`, {
          query: { status: s, categoryId, q, page: 1, pageSize: 1 },
        }).then((r) => r.total);
      const [ALL, ACTIVE, HIDDEN, REMOVED] = await Promise.all([
        count(),
        count('ACTIVE'),
        count('HIDDEN'),
        count('REMOVED'),
      ]);
      return { ALL, ACTIVE, HIDDEN, REMOVED } as Record<ProductStatus | 'ALL', number>;
    },
    placeholderData: keepPreviousData,
  });

  const rows = list.data?.items ?? [];
  const filtered = !!(q || categoryId || status !== 'ALL');
  const shopActive = shop.data?.status === 'ACTIVE';

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ label: 'Sản phẩm' }, { label: 'Tất cả sản phẩm' }]}
        title="Sản phẩm của shop"
        description="Đăng là bán ngay. Tồn kho đổi bằng nút Điều chỉnh tồn, mỗi lần đều ghi lịch sử."
        actions={
          <Button asChild className="h-10 rounded-full px-5">
            <Link to="/kenh-nguoi-ban/san-pham/moi">
              <Plus /> Thêm sản phẩm
            </Link>
          </Button>
        }
      />

      <div className="rounded-2xl border bg-card shadow-sm shadow-navy/[0.03]">
        <div className="flex flex-col gap-3 border-b px-4 pt-2 md:px-5 lg:flex-row lg:items-end lg:justify-between">
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Trạng thái sản phẩm">
            {TABS.map((t) => {
              const active = status === t.value;
              const n = counts.data?.[t.value];
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => update({ status: t.value === 'ALL' ? null : t.value })}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm whitespace-nowrap transition',
                    active
                      ? 'border-navy font-semibold text-navy'
                      : 'border-transparent text-muted-foreground hover:text-ink',
                  )}
                >
                  {t.label}
                  {n !== undefined && (
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums',
                        active ? 'bg-navy text-white' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
          <div className="flex flex-col gap-2 pb-3 sm:flex-row lg:pb-2.5">
            <div className="relative sm:flex-1 lg:w-64 lg:flex-none">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm tên sản phẩm…"
                className="h-9 rounded-full bg-white pr-8 pl-9"
                aria-label="Tìm sản phẩm"
              />
              {search && (
                <button
                  type="button"
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-ink"
                  onClick={() => setSearch('')}
                  aria-label="Xóa tìm kiếm"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <select
              aria-label="Danh mục"
              className={cn(nativeSelectClass, 'h-9 rounded-full sm:w-52')}
              value={categoryId}
              onChange={(e) => update({ category: e.target.value || null })}
            >
              <option value="">Mọi danh mục</option>
              {(categories.data ?? []).map((c) => (
                <optgroup key={c.id} label={c.name}>
                  <option value={c.id}>Tất cả {c.name.toLowerCase()}</option>
                  {c.children?.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        {list.isPending ? (
          <ListSkeleton />
        ) : list.isError ? (
          <LoadError message={list.error.message} onRetry={() => void list.refetch()} />
        ) : rows.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={Search}
              title="Không có sản phẩm khớp bộ lọc"
              text="Thử từ khóa khác, chọn danh mục khác hoặc tab Tất cả."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch('');
                    setParams(new URLSearchParams(), { replace: true });
                  }}
                >
                  Bỏ lọc
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Package}
              title="Shop chưa có sản phẩm nào"
              text="Thêm ảnh, giá, phân loại và tồn kho. Đăng xong là hàng lên sàn ngay."
              action={
                <Button asChild className="rounded-full px-5">
                  <Link to="/kenh-nguoi-ban/san-pham/moi">
                    <Plus /> Thêm sản phẩm đầu tiên
                  </Link>
                </Button>
              }
            />
          )
        ) : (
          <div className={cn('transition-opacity', list.isFetching && 'opacity-60')}>
            {/* Máy tính: bảng */}
            <div className="hidden lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-ivory text-left text-xs tracking-wide whitespace-nowrap text-muted-foreground uppercase">
                    <th className="px-5 py-3 font-medium">Sản phẩm</th>
                    <th className="px-3 py-3 font-medium">Giá</th>
                    <th className="px-3 py-3 font-medium">Còn bán / Tồn</th>
                    <th className="px-3 py-3 text-right font-medium">Đã bán</th>
                    <th className="px-3 py-3 font-medium">Trạng thái</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((p) => (
                    <tr key={p.id} className="group transition hover:bg-champagne-50/40">
                      <td className="min-w-[260px] px-5 py-3">
                        <div className="flex items-center gap-3">
                          <ProductThumb url={p.image} className="size-14" />
                          <div className="min-w-0">
                            <Link
                              to={`/kenh-nguoi-ban/san-pham/${p.id}`}
                              className="line-clamp-2 font-medium text-ink hover:text-navy hover:underline"
                            >
                              {p.name}
                            </Link>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {p.categoryName} · {variantText(p.variantCount)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-medium whitespace-nowrap text-navy tabular-nums">
                        {formatMoney(p.minPrice)}
                        {p.maxPrice !== p.minPrice && (
                          <div className="text-xs font-normal text-muted-foreground">
                            đến {formatMoney(p.maxPrice)}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <StockCell row={p} />
                      </td>
                      <td className="px-3 py-3 text-right text-ink tabular-nums">
                        {p.soldCount.toLocaleString('vi-VN')}
                      </td>
                      <td className="px-3 py-3">
                        <ProductStatusBadge status={p.status} />
                        <RemovedReasonLine reason={p.removedReason} />
                        <div
                          className="mt-1 text-[11px] whitespace-nowrap text-muted-foreground"
                          title="Lần sửa gần nhất"
                        >
                          Sửa {formatDateTime(p.updatedAt)}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="rounded-full border-navy/30 text-navy group-hover:border-navy"
                          >
                            <Link to={`/kenh-nguoi-ban/san-pham/${p.id}`}>
                              <Pencil /> Sửa
                            </Link>
                          </Button>
                          <RowMenu
                            row={p}
                            shopActive={shopActive}
                            onStock={() => setStockFor(p.id)}
                            onHistory={() => setHistoryFor(p.id)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Điện thoại, máy tính bảng: thẻ */}
            <ul className="grid gap-3 p-3 md:grid-cols-2 lg:hidden">
              {rows.map((p) => (
                <li key={p.id} className="rounded-xl border bg-white p-3.5 shadow-xs">
                  <div className="flex gap-3">
                    <ProductThumb url={p.image} className="size-20" />
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/kenh-nguoi-ban/san-pham/${p.id}`}
                        className="line-clamp-2 text-sm font-medium text-ink"
                      >
                        {p.name}
                      </Link>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {p.categoryName} · {variantText(p.variantCount)}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-navy tabular-nums">
                        {priceRange(p.minPrice, p.maxPrice)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                    <ProductStatusBadge status={p.status} />
                    <StockCell row={p} inline />
                    <span className="text-muted-foreground">
                      Đã bán <b className="text-ink">{p.soldCount.toLocaleString('vi-VN')}</b>
                    </span>
                  </div>
                  <RemovedReasonLine reason={p.removedReason} className="max-w-none text-xs" />
                  <div className="mt-3 flex items-center gap-2 border-t pt-3">
                    <Button asChild size="sm" variant="outline" className="flex-1 rounded-full">
                      <Link to={`/kenh-nguoi-ban/san-pham/${p.id}`}>
                        <Pencil /> Sửa
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 rounded-full"
                      onClick={() => setStockFor(p.id)}
                    >
                      <PackagePlus /> Tồn kho
                    </Button>
                    <RowMenu
                      row={p}
                      shopActive={shopActive}
                      onStock={() => setStockFor(p.id)}
                      onHistory={() => setHistoryFor(p.id)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {list.data && list.data.total > 0 && (
          <div className="border-t px-4 py-3 md:px-5">
            <Pager
              page={page}
              pageSize={PAGE_SIZE}
              total={list.data.total}
              onChange={(p) => update({ page: p > 1 ? String(p) : null })}
            />
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        "Còn bán" = tồn kho trừ số đang giữ cho đơn chưa thanh toán. Tô vàng khi còn bán từ{' '}
        {PRODUCT_LIMITS.lowStock} trở xuống.
      </p>

      <StockAdjustDialog
        productId={stockFor}
        open={!!stockFor}
        onOpenChange={(o) => !o && setStockFor(null)}
      />
      <StockHistoryDialog
        productId={historyFor}
        open={!!historyFor}
        onOpenChange={(o) => !o && setHistoryFor(null)}
      />
    </div>
  );
}

const variantText = (n: number) => (n > 1 ? `${n} phân loại` : 'Không phân loại');

/** Tổng tồn / còn bán; tô vàng khi sắp hết, đỏ khi hết hàng */
function StockCell({ row, inline }: { row: SellerProductRow; inline?: boolean }) {
  const out = row.totalAvailable <= 0;
  const low = !out && row.totalAvailable <= PRODUCT_LIMITS.lowStock;
  const tone = out ? 'text-red-600' : low ? 'text-amber-700' : 'text-ink';
  const badge = out ? (
    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 ring-1 ring-red-200 ring-inset">
      Hết hàng
    </span>
  ) : low ? (
    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200 ring-inset">
      Sắp hết
    </span>
  ) : null;
  if (inline) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        Còn bán <b className={cn('tabular-nums', tone)}>{row.totalAvailable}</b>/{row.totalStock}
        {badge && <span className="ml-1">{badge}</span>}
      </span>
    );
  }
  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-1 whitespace-nowrap">
        <span className={cn('font-semibold tabular-nums', tone)}>
          {row.totalAvailable.toLocaleString('vi-VN')}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          / {row.totalStock.toLocaleString('vi-VN')}
        </span>
      </div>
      {badge}
    </div>
  );
}

/** Menu "⋯" của một dòng: điều chỉnh tồn, lịch sử tồn, ẩn/hiện, xem trên sàn */
function RowMenu({
  row,
  shopActive,
  onStock,
  onHistory,
}: {
  row: SellerProductRow;
  shopActive: boolean;
  onStock: () => void;
  onHistory: () => void;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const hide = row.status === 'ACTIVE';

  async function toggle() {
    setBusy(true);
    try {
      const result = await api(`${productPath(row.id)}/status`, {
        method: 'PATCH',
        body: { status: hide ? 'HIDDEN' : 'ACTIVE' },
      });
      queryClient.setQueryData(sellerProductKey(row.id), result);
      await queryClient.invalidateQueries({ queryKey: SELLER_PRODUCTS_KEY });
      toast.success(hide ? 'Đã ẩn sản phẩm khỏi sàn.' : 'Sản phẩm đã bán trở lại.');
    } catch (e) {
      showApiError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          className="rounded-full"
          aria-label="Thao tác khác"
          disabled={busy}
        >
          {busy ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={onStock}>
          <PackagePlus /> Nhập / điều chỉnh tồn
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onHistory}>
          <History /> Lịch sử tồn kho
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {row.status === 'REMOVED' ? (
          <DropdownMenuItem disabled>
            <EyeOff /> Bị gỡ: không tự bật bán được
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => void toggle()}>
            {hide ? <EyeOff /> : <Eye />} {hide ? 'Ẩn khỏi sàn' : 'Hiện lại (bán tiếp)'}
          </DropdownMenuItem>
        )}
        {row.status === 'ACTIVE' && shopActive && (
          <DropdownMenuItem asChild>
            <Link to={`/san-pham/${row.id}`} target="_blank" rel="noreferrer">
              <ExternalLink /> Xem trên sàn
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <Skeleton className="size-14 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-64 max-w-full" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="hidden h-4 w-24 md:block" />
          <Skeleton className="hidden h-4 w-20 md:block" />
          <Skeleton className="h-8 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
