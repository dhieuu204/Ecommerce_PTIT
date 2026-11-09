import { IconChevronRight, IconClock, IconReceipt } from '@tabler/icons-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
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
import { Skeleton } from '@/components/ui/skeleton';
import { API, api } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { BuyerTab, Order } from '@/lib/order-types';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CARD, PRIMARY_BUTTON } from '@/pages/checkout/checkout-parts';

const PAGE_SIZE = 10;
const TABS: Array<{ value: BuyerTab; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'UNPAID', label: 'Chờ thanh toán' },
  { value: 'PROCESSING', label: 'Đang xử lý' },
  { value: 'TO_SHIP', label: 'Chờ giao hàng' },
  { value: 'SHIPPING', label: 'Đang giao' },
  { value: 'COMPLETED', label: 'Hoàn tất' },
  { value: 'CANCELLED', label: 'Đã hủy' },
];

export const ordersKey = ['orders'] as const;

/** Tài khoản › Đơn mua (ORD-02, SHIP-03): đơn tổng mới nhất trước, mỗi đơn chia theo shop */
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
      <h1 className="mb-4 text-xl font-bold tracking-tight text-charcoal md:text-2xl">Đơn mua</h1>
      <nav
        className={cn(
          CARD,
          'mb-4 flex gap-1 overflow-x-auto px-2 [scrollbar-width:none] md:px-3 [&::-webkit-scrollbar]:hidden',
        )}
        aria-label="Trạng thái đơn"
      >
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => go({ tab: t.value })}
            className={cn(
              'shrink-0 border-b-2 px-3 py-3.5 text-sm whitespace-nowrap transition',
              tab === t.value
                ? 'border-navy font-semibold text-navy'
                : 'border-transparent text-ink/60 hover:text-navy',
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
        <LoadError className={CARD} message={list.error.message} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState
          className={CARD}
          icon={IconReceipt}
          title="Chưa có đơn hàng"
          text="Đơn bạn đặt sẽ hiện ở đây."
          action={
            <Link
              to="/"
              className={cn(PRIMARY_BUTTON, 'inline-flex h-11 items-center px-7 text-sm')}
            >
              Mua sắm ngay
            </Link>
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

const SMALL_PRIMARY = cn(PRIMARY_BUTTON, 'inline-flex h-9 items-center px-5 text-sm');

function OrderCard({ order }: { order: Order }) {
  const paid = order.paymentStatus !== 'UNPAID';
  const toReceive = order.shopOrders.some((so) => so.canConfirmReceived);
  const left = useCountdown(order.canPay ? order.payBefore : null);
  const link = `/tai-khoan/don-mua/${order.id}`;
  return (
    <article className={cn(CARD, 'overflow-hidden')}>
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-page/60 px-4 py-2.5 text-[13px] text-ink/55 lg:px-5">
        <div className="flex flex-wrap items-center gap-x-2">
          <b className="font-semibold text-charcoal">{order.code}</b>
          <span aria-hidden className="text-ink/25">
            |
          </span>
          <span>{formatDateTime(order.createdAt)}</span>
        </div>
        {order.canPay && left ? (
          <span className="flex items-center gap-1 font-medium text-navy">
            <IconClock className="size-3.5 [stroke-width:1.75]" /> Còn {left} để thanh toán
          </span>
        ) : order.status === 'CANCELLED' ? (
          <span className="font-medium text-ink/50">Đã hủy</span>
        ) : order.status === 'COMPLETED' ? (
          <span className="font-medium text-ship">Hoàn tất</span>
        ) : order.paymentMethod === 'COD' ? (
          <span className="font-medium text-champagne-600">Thanh toán khi nhận hàng</span>
        ) : null}
      </header>
      <div className="divide-y divide-ink/[0.06]">
        {order.shopOrders.map((so) => (
          <div key={so.id} className="px-4 pt-3 lg:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5 text-sm font-semibold text-charcoal">
                <ShopLogo
                  url={so.shop.logoUrl}
                  className="size-7 rounded-lg ring-1 ring-ink/[0.08]"
                />
                <span className="truncate">{so.shop.name}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <RefundBadge status={so.refundStatus} />
                <ShopOrderStatusBadge status={so.status} paid={paid} />
              </div>
            </div>
            <Link to={link} className="block divide-y divide-ink/[0.06]">
              {so.items.slice(0, 2).map((it) => (
                <OrderItemRow key={it.id} item={it} link={false} />
              ))}
              {so.items.length > 2 && (
                <div className="py-2.5 text-[13px] text-ink/55">
                  và {so.items.length - 2} sản phẩm khác
                </div>
              )}
            </Link>
          </div>
        ))}
      </div>
      <footer className="flex flex-col gap-3 border-t border-ink/[0.06] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between lg:px-5">
        <div className="text-sm text-ink/60">
          Tổng thanh toán{' '}
          <span className="ml-1 text-lg font-bold text-navy">{formatMoney(order.total)}</span>
        </div>
        <div className="flex gap-2">
          <Link
            to={link}
            className="inline-flex h-9 items-center gap-0.5 rounded-lg border border-ink/15 pr-3 pl-4 text-sm font-medium text-charcoal transition hover:border-navy/40 hover:text-navy"
          >
            Xem chi tiết <IconChevronRight className="size-4 [stroke-width:2]" />
          </Link>
          {order.canPay && (
            <Link to={link} className={SMALL_PRIMARY}>
              Thanh toán
            </Link>
          )}
          {toReceive && (
            <Link to={link} className={SMALL_PRIMARY}>
              Đã nhận hàng
            </Link>
          )}
        </div>
      </footer>
    </article>
  );
}
