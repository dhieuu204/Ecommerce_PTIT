import {
  IconChevronRight,
  IconClipboardList,
  IconClock,
  IconPhotoOff,
  IconSearch,
  IconX,
} from '@tabler/icons-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
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
import { CARD } from '@/pages/checkout/checkout-parts';

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

/** Tab cần seller làm gì đó: số đơn nổi bật */
const URGENT: Tab[] = ['TO_CONFIRM', 'CANCEL_REQUESTED', 'RETURNED'];

/** Việc shop cần làm ở đơn này (hiện ở cột cuối của dòng) */
const NEXT_ACTION: Partial<Record<ShopOrderStatus, string>> = {
  TO_CONFIRM: 'Xác nhận đơn',
  CANCEL_REQUESTED: 'Trả lời yêu cầu',
  RETURNED: 'Nhận hàng hoàn',
};

/** Cột của dòng đơn trên màn rộng: sản phẩm | tiền hàng | dự kiến nhận | trạng thái */
const COLS = 'lg:grid-cols-[minmax(0,1fr)_8rem_8rem_11rem]';

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
        actions={
          <div className="relative w-full sm:w-72">
            <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink/40 [stroke-width:1.75]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm mã đơn…"
              className="h-10 rounded-lg bg-card pr-8 pl-9"
              aria-label="Tìm mã đơn"
            />
            {search && (
              <button
                type="button"
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-ink/40 transition hover:text-navy"
                onClick={() => setSearch('')}
                aria-label="Xóa tìm kiếm"
              >
                <IconX className="size-4 [stroke-width:2]" />
              </button>
            )}
          </div>
        }
      />
      <div className={cn(CARD, 'overflow-hidden')}>
        <nav
          className="flex gap-1 overflow-x-auto border-b border-ink/[0.06] px-2 [scrollbar-width:none] md:px-3 [&::-webkit-scrollbar]:hidden"
          aria-label="Trạng thái đơn"
        >
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
                  '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3.5 text-sm whitespace-nowrap transition',
                  active
                    ? 'border-navy font-semibold text-navy'
                    : 'border-transparent text-ink/60 hover:text-navy',
                )}
              >
                {t.label}
                {n !== undefined && n > 0 && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums',
                      urgent
                        ? 'bg-navy text-white'
                        : active
                          ? 'bg-champagne-50 text-navy'
                          : 'bg-page text-ink/50',
                    )}
                  >
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {list.isPending ? (
          <div className="divide-y divide-ink/[0.06]">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex gap-4 px-5 py-4">
                <Skeleton className="size-16 rounded-xl" />
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
            icon={IconClipboardList}
            title={q ? 'Không có đơn khớp mã này' : 'Chưa có đơn nào ở mục này'}
            text="Đơn mới sẽ hiện ở tab Chờ xác nhận khi người mua đã thanh toán hoặc chọn COD."
          />
        ) : (
          <>
            <div
              className={cn(
                'hidden gap-4 border-b border-ink/[0.06] px-5 py-2.5 text-[13px] text-ink/55 lg:grid',
                COLS,
              )}
            >
              <span>Sản phẩm</span>
              <span className="text-right">Tiền hàng</span>
              <span className="text-right">Dự kiến nhận</span>
              <span className="text-right">Trạng thái</span>
            </div>
            <div className="divide-y divide-ink/[0.06]">
              {list.data.items.map((o) => (
                <Row key={o.id} order={o} />
              ))}
            </div>
            <Pager
              className="border-t border-ink/[0.06] px-5 py-3"
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
  const action = NEXT_ACTION[order.status];
  return (
    <Link
      to={`/kenh-nguoi-ban/don-hang/${order.id}`}
      className="group block transition hover:bg-page/50"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-page/60 px-4 py-2 text-xs text-ink/55 lg:px-5">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2">
          <b className="text-[13px] font-semibold text-charcoal">{order.code}</b>
          <span aria-hidden className="text-ink/25">
            |
          </span>
          <span>{order.buyerName}</span>
          <span aria-hidden className="text-ink/25">
            |
          </span>
          <span>{formatDateTime(order.createdAt)}</span>
        </span>
        <span className="flex items-center gap-2">
          {order.paymentMethod === 'COD' && (
            <span className="rounded-md bg-champagne-50 px-1.5 py-0.5 text-[11px] font-semibold text-champagne-600">
              COD
            </span>
          )}
          {deadline && hoursLeft !== null && (
            <span
              className={cn(
                'flex items-center gap-1',
                hoursLeft < 6 ? 'font-semibold text-red-600' : 'text-ink/55',
              )}
            >
              <IconClock className="size-3.5 [stroke-width:1.75]" />
              Còn {hoursLeft <= 0 ? '0 giờ' : elapsedUntil(deadline)}
            </span>
          )}
        </span>
      </div>

      <div className={cn('grid gap-3 px-4 py-4 lg:items-center lg:gap-4 lg:px-5', COLS)}>
        <div className="flex min-w-0 gap-3">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-card p-1.5 ring-1 ring-ink/[0.08]">
            {first?.image ? (
              <img src={first.image} alt="" className="size-full object-contain" />
            ) : (
              <IconPhotoOff className="size-5 text-ink/25" />
            )}
          </div>
          <div className="min-w-0 self-center text-sm">
            <div className="line-clamp-2 leading-5 font-medium text-charcoal transition group-hover:text-navy">
              {first?.productName}
            </div>
            <div className="mt-1 text-xs text-ink/55">
              {first?.variantName && `${first.variantName} · `}Số lượng: {first?.quantity}
              {more > 0 && <span> · và {more} sản phẩm khác</span>}
            </div>
          </div>
        </div>
        <div className="flex justify-between text-sm lg:block lg:text-right">
          <span className="text-xs text-ink/55 lg:hidden">Tiền hàng</span>
          <span className="font-medium text-charcoal">
            {formatMoney(order.subtotal - order.shopDiscount)}
          </span>
        </div>
        <div className="flex justify-between text-sm lg:block lg:text-right">
          <span className="text-xs text-ink/55 lg:hidden">Dự kiến nhận</span>
          <span className="font-bold text-navy">
            {order.sellerAmount !== null ? formatMoney(order.sellerAmount) : '—'}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-1.5 lg:flex-col lg:items-end">
          <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
            <ShopOrderStatusBadge status={order.status} paid={order.paymentStatus !== 'UNPAID'} />
            <RefundBadge status={order.refundStatus} />
          </div>
          <span
            className={cn(
              'flex items-center text-[13px] font-semibold',
              action ? 'text-navy' : 'text-ink/40 transition group-hover:text-navy',
            )}
          >
            {action ?? 'Xem chi tiết'}
            <IconChevronRight className="size-4 [stroke-width:2] transition group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

/** Thời gian còn lại tới một mốc, cùng cách viết với `elapsed` */
function elapsedUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  return elapsed(new Date(Date.now() - ms).toISOString());
}
