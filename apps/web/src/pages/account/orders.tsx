import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight, Clock, ReceiptText } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { Pager } from '@/components/console/pager';
import { ShopLogo } from '@/components/console/shop-logo';
import {
  OrderItemRow,
  RefundBadge,
  ShopOrderStatusBadge,
  useCountdown,
} from '@/components/orders/order-parts';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { API, api } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { BuyerTab, Order } from '@/lib/order-types';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 10;
const TABS: Array<{ value: BuyerTab; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'UNPAID', label: 'Chờ thanh toán' },
  { value: 'PROCESSING', label: 'Đang xử lý' },
  { value: 'TO_SHIP', label: 'Chờ giao hàng' },
  { value: 'CANCELLED', label: 'Đã hủy' },
];

export const ordersKey = ['orders'] as const;

/** Tài khoản › Đơn mua (ORD-02): đơn tổng mới nhất trước, mỗi đơn chia theo shop */
export function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') ?? 'ALL') as BuyerTab;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const list = useQuery({
    queryKey: [...ordersKey, 'list', tab, page],
    queryFn: () =>
      api<Page<Order>>(`${API.market}/orders`, {
        query: { tab, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });

  const go = (next: { tab?: BuyerTab; page?: number }) => {
    const p = new URLSearchParams(params);
    if (next.tab) {
      if (next.tab === 'ALL') p.delete('tab');
      else p.set('tab', next.tab);
      p.delete('page');
    }
    if (next.page) p.set('page', String(next.page));
    setParams(p, { replace: true });
  };

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-navy">Đơn mua</h1>
      <nav
        className="-mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-ivory-200 bg-card px-4 md:mx-0 md:rounded-t-2xl"
        aria-label="Trạng thái đơn"
      >
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => go({ tab: t.value })}
            className={cn(
              'shrink-0 border-b-2 px-3 py-3 text-sm whitespace-nowrap transition md:px-4',
              tab === t.value
                ? 'border-navy font-semibold text-navy'
                : 'border-transparent text-ink/60 hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {list.isPending ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-52 rounded-2xl" />
          ))}
        </div>
      ) : list.isError ? (
        <LoadError
          className="rounded-2xl border bg-card"
          message={list.error.message}
          onRetry={() => list.refetch()}
        />
      ) : list.data.items.length === 0 ? (
        <EmptyState
          className="rounded-2xl border bg-card"
          icon={ReceiptText}
          title="Chưa có đơn hàng"
          text="Đơn bạn đặt sẽ hiện ở đây."
          action={
            <Button asChild>
              <Link to="/">Mua sắm ngay</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {list.data.items.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            total={list.data.total}
            onChange={(p) => go({ page: p })}
          />
        </div>
      )}
    </div>
  );
}

function OrderCard({ order }: { order: Order }) {
  const paid = order.paymentStatus === 'PAID';
  const left = useCountdown(order.canPay ? order.payBefore : null);
  const link = `/tai-khoan/don-mua/${order.id}`;
  return (
    <article className="overflow-hidden rounded-2xl border border-ivory-200 bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ivory-200 px-4 py-3 text-sm md:px-5">
        <div className="text-ink/60">
          Đơn <b className="font-semibold text-navy">{order.code}</b> ·{' '}
          {formatDateTime(order.createdAt)}
        </div>
        {order.canPay && left ? (
          <span className="flex items-center gap-1 text-xs font-medium text-amber-700">
            <Clock className="size-3.5" /> Còn {left} để thanh toán
          </span>
        ) : order.status === 'CANCELLED' ? (
          <span className="text-xs font-medium text-ink/50">Đã hủy</span>
        ) : null}
      </header>
      <div className="divide-y divide-ivory-200">
        {order.shopOrders.map((so) => (
          <div key={so.id} className="px-4 py-3 md:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-navy">
                <ShopLogo url={so.shop.logoUrl} className="size-6 rounded-md border" />
                <span className="truncate">{so.shop.name}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <RefundBadge status={so.refundStatus} />
                <ShopOrderStatusBadge status={so.status} paid={paid} />
              </div>
            </div>
            <Link to={link} className="block">
              {so.items.slice(0, 2).map((it) => (
                <OrderItemRow key={it.id} item={it} link={false} />
              ))}
              {so.items.length > 2 && (
                <div className="pb-1 text-xs text-ink/50">
                  và {so.items.length - 2} sản phẩm khác
                </div>
              )}
            </Link>
          </div>
        ))}
      </div>
      <footer className="flex flex-col gap-3 border-t border-ivory-200 bg-ivory/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-5">
        <div className="text-sm text-ink/65">
          Tổng thanh toán:{' '}
          <span className="text-lg font-bold text-navy">{formatMoney(order.total)}</span>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="rounded-lg">
            <Link to={link}>
              Xem chi tiết <ChevronRight className="size-4" />
            </Link>
          </Button>
          {order.canPay && (
            <Button asChild size="sm" className="rounded-lg">
              <Link to={link}>Thanh toán</Link>
            </Button>
          )}
        </div>
      </footer>
    </article>
  );
}
