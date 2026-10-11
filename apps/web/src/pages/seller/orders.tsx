import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight, ClipboardList, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { Pager } from '@/components/console/pager';
import { PageHeader } from '@/components/layout/page-header';
import { RefundBadge, ShopOrderStatusBadge } from '@/components/orders/order-parts';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebounced } from '@/hooks/use-debounced';
import { API, api } from '@/lib/api';
import { elapsed, formatDateTime, formatMoney } from '@/lib/format';
import type { SellerOrder, SellerOrderPage, ShopOrderStatus } from '@/lib/order-types';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;
type Tab = ShopOrderStatus | 'ALL';
/** Tab luôn hiện; `rare` = chỉ hiện khi có đơn hoặc đang chọn (đỡ rối thanh tab) */
const TABS: Array<{ value: Tab; label: string; rare?: boolean }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'TO_CONFIRM', label: 'Chờ xác nhận' },
  { value: 'CONFIRMED', label: 'Chờ lấy hàng' },
  { value: 'CANCEL_REQUESTED', label: 'Yêu cầu hủy', rare: true },
  { value: 'SHIPPING', label: 'Đang giao' },
  { value: 'DELIVERED', label: 'Đã giao' },
  { value: 'COMPLETED', label: 'Hoàn tất' },
  { value: 'RETURNING', label: 'Đang hoàn', rare: true },
  { value: 'RETURNED', label: 'Chờ nhận hàng hoàn', rare: true },
  { value: 'FAILED', label: 'Giao thất bại', rare: true },
  { value: 'INCIDENT', label: 'Sự cố', rare: true },
  { value: 'INCIDENT_RESOLVED', label: 'Đã xử lý sự cố', rare: true },
  { value: 'PENDING', label: 'Chờ thanh toán / duyệt' },
  { value: 'CANCELLED', label: 'Đã hủy' },
];

/** Tab cần seller làm gì đó: số đơn tô đỏ */
const URGENT: Tab[] = ['TO_CONFIRM', 'CANCEL_REQUESTED', 'RETURNED'];

export const sellerOrdersKey = ['seller', 'orders'] as const;

/** Kênh người bán › Đơn hàng (ORD-02, ORD-03): đơn con của shop theo trạng thái */
export function SellerOrdersPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? 'ALL') as Tab;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = params.get('q') ?? '';
  const [search, setSearch] = useState(q);
  const debounced = useDebounced(search.trim());

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
  }, [debounced]);

  const list = useQuery({
    queryKey: [...sellerOrdersKey, { status, q, page }],
    queryFn: () =>
      api<SellerOrderPage>(`${API.market}/shops/me/orders`, {
        query: { status: status === 'ALL' ? undefined : status, q, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  const counts = list.data?.counts;
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : undefined;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ label: 'Đơn hàng' }]}
        title="Đơn hàng"
        description="Xác nhận đơn trong hạn để tạo vận đơn GHN, rồi đóng gói chờ GHN đến lấy. Quá hạn xác nhận hoặc bàn giao thì đơn tự hủy."
      />
      <div className="rounded-2xl border bg-card shadow-sm shadow-navy/[0.03]">
        <div className="flex flex-col gap-3 border-b px-4 pt-2 md:flex-row md:items-end md:justify-between md:px-5">
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Trạng thái đơn">
            {TABS.map((t) => {
              const active = status === t.value;
              const n = t.value === 'ALL' ? total : counts?.[t.value];
              if (t.rare && !active && !n) return null;
              const urgent = URGENT.includes(t.value) && !!n;
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
                        urgent
                          ? 'bg-red-100 text-red-700'
                          : active
                            ? 'bg-navy text-white'
                            : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
          <div className="relative pb-3 md:w-64 md:pb-2.5">
            <Search className="pointer-events-none absolute top-[18px] left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm mã đơn…"
              className="h-9 rounded-full bg-white pr-8 pl-9"
              aria-label="Tìm mã đơn"
            />
            {search && (
              <button
                type="button"
                className="absolute top-[18px] right-2.5 -translate-y-1/2 text-muted-foreground hover:text-ink"
                onClick={() => setSearch('')}
                aria-label="Xóa tìm kiếm"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        {list.isPending ? (
          <div className="divide-y">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex gap-4 px-5 py-4">
                <Skeleton className="size-14 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            ))}
          </div>
        ) : list.isError ? (
          <LoadError message={list.error.message} onRetry={() => list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={q ? 'Không có đơn khớp mã này' : 'Chưa có đơn nào ở mục này'}
            text="Đơn mới sẽ hiện ở tab Chờ xác nhận khi người mua đã thanh toán hoặc chọn COD."
          />
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(0,1fr)_9rem_9rem_10rem_2rem] gap-4 border-b bg-ivory/40 px-5 py-2.5 text-xs font-medium text-muted-foreground lg:grid">
              <span>Sản phẩm</span>
              <span className="text-right">Tiền hàng</span>
              <span className="text-right">Dự kiến nhận</span>
              <span>Trạng thái</span>
              <span />
            </div>
            <div className="divide-y">
              {list.data.items.map((o) => (
                <Row key={o.id} order={o} />
              ))}
            </div>
            <Pager
              className="border-t px-5 py-3"
              page={page}
              pageSize={PAGE_SIZE}
              total={list.data.total}
              onChange={(p) => update({ page: String(p) })}
            />
          </>
        )}
      </div>
    </div>
  );
}

function Row({ order }: { order: SellerOrder }) {
  const first = order.items[0];
  const more = order.items.length - 1;
  // Hạn đang đếm: xác nhận (Chờ xác nhận) hoặc bàn giao cho GHN (Chờ lấy hàng)
  const deadline =
    order.status === 'TO_CONFIRM'
      ? order.confirmBefore
      : order.status === 'CONFIRMED'
        ? order.handoverBefore
        : null;
  const hoursLeft = deadline ? (new Date(deadline).getTime() - Date.now()) / 3_600_000 : null;
  return (
    <Link
      to={`/kenh-nguoi-ban/don-hang/${order.id}`}
      className="grid gap-3 px-4 py-4 transition hover:bg-ivory/50 md:px-5 lg:grid-cols-[minmax(0,1fr)_9rem_9rem_10rem_2rem] lg:items-center lg:gap-4"
    >
      <div className="flex min-w-0 gap-3">
        <div className="size-14 shrink-0 overflow-hidden rounded-xl border bg-white p-1">
          {first?.image && <img src={first.image} alt="" className="size-full object-contain" />}
        </div>
        <div className="min-w-0 text-sm">
          <div className="font-semibold text-navy">{order.code}</div>
          <div className="truncate text-ink">
            {first?.productName}
            {more > 0 && <span className="text-ink/50"> và {more} sản phẩm khác</span>}
          </div>
          <div className="text-xs text-muted-foreground">
            {order.buyerName} · {formatDateTime(order.createdAt)}
          </div>
        </div>
      </div>
      <div className="flex justify-between text-sm lg:block lg:text-right">
        <span className="text-xs text-muted-foreground lg:hidden">Tiền hàng</span>
        <span className="font-medium text-ink">
          {formatMoney(order.subtotal - order.shopDiscount)}
        </span>
      </div>
      <div className="flex justify-between text-sm lg:block lg:text-right">
        <span className="text-xs text-muted-foreground lg:hidden">Dự kiến nhận</span>
        <span className="font-semibold text-navy">
          {order.sellerAmount !== null ? formatMoney(order.sellerAmount) : '—'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <ShopOrderStatusBadge status={order.status} paid={order.paymentStatus !== 'UNPAID'} />
        <RefundBadge status={order.refundStatus} />
        {order.paymentMethod === 'COD' && (
          <span className="rounded-md bg-champagne-50 px-1.5 py-0.5 text-[11px] font-semibold text-champagne-600">
            COD
          </span>
        )}
        {deadline && hoursLeft !== null && (
          <span
            className={cn(
              'text-xs',
              hoursLeft < 6 ? 'font-semibold text-red-600' : 'text-muted-foreground',
            )}
          >
            còn {hoursLeft <= 0 ? '0 giờ' : elapsedUntil(deadline)}
          </span>
        )}
      </div>
      <ChevronRight className="hidden size-4 text-ink/30 lg:block" />
    </Link>
  );
}

/** Thời gian còn lại tới một mốc, cùng cách viết với `elapsed` */
function elapsedUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  return elapsed(new Date(Date.now() - ms).toISOString());
}
