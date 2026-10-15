import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight, Undo2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { Pager } from '@/components/console/pager';
import { PageHeader } from '@/components/layout/page-header';
import { RETURN_REASONS, ReturnStatusBadge } from '@/components/returns/return-parts';
import { Skeleton } from '@/components/ui/skeleton';
import { API, api } from '@/lib/api';
import type { ReturnStatus, SellerReturnPage } from '@/lib/after-sales-types';
import { formatDateTime, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

export const sellerReturnsKey = ['seller', 'returns'] as const;
const PAGE_SIZE = 20;

const TABS: Array<{ value: ReturnStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'REQUESTED', label: 'Chờ trả lời' },
  { value: 'RECEIVED', label: 'Chờ kiểm hàng' },
  { value: 'SHIPPING_BACK', label: 'Đang gửi về' },
  { value: 'DISPUTED', label: 'Đang khiếu nại' },
  { value: 'REJECTED', label: 'Đã từ chối' },
  { value: 'REFUNDING', label: 'Đang hoàn tiền' },
  { value: 'REFUNDED', label: 'Đã hoàn tiền' },
];

/** Kênh người bán › Trả hàng (RET-02): yêu cầu trả hàng của shop, chờ trả lời sắp hết hạn lên đầu */
export function SellerReturnsPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? 'ALL') as ReturnStatus | 'ALL';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const list = useQuery({
    queryKey: [...sellerReturnsKey, 'list', status, page],
    queryFn: () =>
      api<SellerReturnPage>(`${API.market}/shops/me/returns`, {
        query: { status: status === 'ALL' ? undefined : status, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });
  const counts = list.data?.counts;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ label: 'Đơn hàng', to: '/kenh-nguoi-ban/don-hang' }, { label: 'Trả hàng' }]}
        title="Trả hàng / Hoàn tiền"
        description="Trả lời yêu cầu trong hạn (quá hạn thì tự chấp nhận). Khi hàng trả về tới shop, kiểm hàng rồi xác nhận để sàn hoàn tiền cho người mua."
      />
      <div className="rounded-2xl border bg-card shadow-sm shadow-navy/[0.03]">
        <nav
          className="flex gap-1 overflow-x-auto border-b px-4 pt-2 md:px-5"
          aria-label="Trạng thái"
        >
          {TABS.map((t) => {
            const n = t.value === 'ALL' ? null : counts?.[t.value];
            return (
              <button
                key={t.value}
                type="button"
                onClick={() =>
                  setParams(t.value === 'ALL' ? {} : { status: t.value }, { replace: true })
                }
                className={cn(
                  '-mb-px shrink-0 border-b-2 px-3 py-3 text-sm whitespace-nowrap transition',
                  status === t.value
                    ? 'border-navy font-semibold text-navy'
                    : 'border-transparent text-muted-foreground hover:text-ink',
                )}
              >
                {t.label}
                {!!n && (
                  <span className="ml-1 rounded-full bg-champagne-50 px-1.5 text-xs text-champagne-600">
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        {list.isPending ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : list.isError ? (
          <LoadError message={list.error.message} onRetry={() => list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon={Undo2}
            title="Không có yêu cầu trả hàng"
            text="Người mua gửi yêu cầu từ đơn đã giao, trong hạn trước khi đơn tự hoàn tất."
          />
        ) : (
          <>
            <ul className="divide-y">
              {list.data.items.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/kenh-nguoi-ban/tra-hang/${r.id}`}
                    className="flex flex-wrap items-center gap-3 px-4 py-3.5 transition hover:bg-ivory/50 md:px-5"
                  >
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-navy">{r.code}</span>
                        <ReturnStatusBadge status={r.status} />
                        {r.paymentMethod === 'COD' && (
                          <span className="rounded-md bg-champagne-50 px-1.5 text-xs font-semibold text-champagne-600">
                            COD
                          </span>
                        )}
                      </div>
                      <div className="truncate text-ink/70">
                        {r.items.map((i) => `${i.productName} ×${i.quantity}`).join(', ')}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {RETURN_REASONS[r.reason]} · {r.buyer?.name} · {formatDateTime(r.createdAt)}
                        {r.deadline && (r.status === 'REQUESTED' || r.status === 'RECEIVED') && (
                          <span className="text-amber-700">
                            {' '}
                            · hạn {formatDateTime(r.deadline)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="text-xs text-muted-foreground">
                        {r.decidedRefund !== null ? 'Hoàn' : 'Hoàn tối đa'}
                      </div>
                      <div className="font-semibold text-navy">
                        {formatMoney(r.decidedRefund ?? r.refundAmount)}
                      </div>
                    </div>
                    <ChevronRight className="size-4 text-ink/35" />
                  </Link>
                </li>
              ))}
            </ul>
            <Pager
              className="border-t px-5 py-3"
              page={page}
              pageSize={PAGE_SIZE}
              total={list.data.total}
              onChange={(p) =>
                setParams({ ...(status !== 'ALL' ? { status } : {}), page: String(p) })
              }
            />
          </>
        )}
      </div>
    </div>
  );
}
