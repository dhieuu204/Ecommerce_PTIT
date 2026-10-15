import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight, Undo2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { Pager } from '@/components/console/pager';
import { ShopLogo } from '@/components/console/shop-logo';
import { RETURN_REASONS, ReturnStatusBadge } from '@/components/returns/return-parts';
import { Skeleton } from '@/components/ui/skeleton';
import { API, api } from '@/lib/api';
import type { ReturnRequest, ReturnStatus } from '@/lib/after-sales-types';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';

export const returnsKey = ['returns'] as const;
const PAGE_SIZE = 10;

const FILTERS: Array<{ value: ReturnStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'REQUESTED', label: 'Chờ shop trả lời' },
  { value: 'SHIPPING_BACK', label: 'Đang gửi trả' },
  { value: 'DISPUTED', label: 'Đang khiếu nại' },
  { value: 'REFUNDING', label: 'Đang hoàn tiền' },
  { value: 'REFUNDED', label: 'Đã hoàn tiền' },
];

/** Tài khoản › Trả hàng/Hoàn tiền (RET-01..04): các yêu cầu của tôi, mới nhất trước */
export function ReturnsPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? 'ALL') as ReturnStatus | 'ALL';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const list = useQuery({
    queryKey: [...returnsKey, 'list', status, page],
    queryFn: () =>
      api<Page<ReturnRequest>>(`${API.market}/returns`, {
        query: { status: status === 'ALL' ? undefined : status, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });
  const set = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if (!('page' in next)) p.delete('page');
    setParams(p, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-ivory-200 bg-card px-4 py-4 md:px-5">
        <h1 className="text-lg font-semibold text-navy">Trả hàng / Hoàn tiền</h1>
        <p className="mt-1 text-sm text-ink/60">
          Gửi yêu cầu từ trang chi tiết đơn đã giao, trong hạn trước khi đơn tự hoàn tất.
        </p>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="radiogroup">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={status === f.value}
              onClick={() => set({ status: f.value === 'ALL' ? null : f.value })}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 text-xs transition',
                status === f.value
                  ? 'border-navy bg-navy text-white'
                  : 'border-ivory-200 bg-card text-ink/70 hover:border-champagne',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {list.isPending ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : list.isError ? (
        <LoadError
          className="rounded-2xl border bg-card"
          message={list.error.message}
          onRetry={() => list.refetch()}
        />
      ) : list.data.items.length === 0 ? (
        <EmptyState
          className="rounded-2xl border bg-card"
          icon={Undo2}
          title="Chưa có yêu cầu trả hàng"
          text="Khi bạn gửi yêu cầu trả hàng, tình hình xử lý hiện ở đây."
        />
      ) : (
        <>
          {list.data.items.map((r) => (
            <Link
              key={r.id}
              to={`/tai-khoan/tra-hang/${r.id}`}
              className="block rounded-2xl border border-ivory-200 bg-card px-4 py-3 transition hover:border-champagne md:px-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 font-semibold text-navy">
                  <ShopLogo url={r.shop.logoUrl} className="size-6 rounded-md border" />
                  <span className="truncate">{r.shop.name}</span>
                </div>
                <ReturnStatusBadge status={r.status} />
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="min-w-0 flex-1 text-sm">
                  <div className="truncate text-ink">
                    {r.items.map((i) => `${i.productName} ×${i.quantity}`).join(', ')}
                  </div>
                  <div className="text-xs text-ink/55">
                    {r.code} · {RETURN_REASONS[r.reason]} · {formatDateTime(r.createdAt)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs text-ink/50">
                    {r.decidedRefund !== null ? 'Hoàn' : 'Hoàn tối đa'}
                  </div>
                  <div className="font-semibold text-navy">
                    {formatMoney(r.decidedRefund ?? r.refundAmount)}
                  </div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-ink/35" />
              </div>
            </Link>
          ))}
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            total={list.data.total}
            onChange={(p) => set({ page: String(p) })}
          />
        </>
      )}
    </div>
  );
}
