import { IconReceipt } from '@tabler/icons-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { Pager } from '@/components/console/pager';
import { PageHeader } from '@/components/layout/page-header';
import { ShopOrderStatusBadge } from '@/components/orders/order-parts';
import { Skeleton } from '@/components/ui/skeleton';
import { ratePercent, type AffiliateOrder } from '@/lib/affiliate-types';
import { API, api } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { ShopOrderStatus } from '@/lib/order-types';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CARD } from '@/pages/checkout/checkout-parts';

const PAGE_SIZE = 20;
/** Đơn không còn tính hoa hồng */
const LOST = new Set(['CANCELLED', 'FAILED', 'RETURNED', 'INCIDENT', 'INCIDENT_RESOLVED']);

/**
 * Khu Cộng tác viên › Đơn qua link (P7, AFF-06): đơn con gắn với CTV và hoa hồng chụp lúc đặt. Không có
 * thông tin người mua. Tiền thật (đang giữ, khả dụng, trừ do trả hàng) xem ở trang Ví.
 */
export function AffiliateOrdersPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const list = useQuery({
    queryKey: ['affiliate', 'orders', page],
    queryFn: () =>
      api<Page<AffiliateOrder>>(`${API.market}/affiliates/me/orders`, {
        query: { page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ label: 'Tiếp thị' }, { label: 'Đơn qua link của tôi' }]}
        title="Đơn qua link của tôi"
        description="Hoa hồng ghi ở đây là số dự kiến lúc đặt. Đơn hủy, giao thất bại thì không có hoa hồng; trả hàng thì trừ phần của món trả."
      />
      <div className={cn(CARD, 'overflow-hidden')}>
        {list.isPending ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : list.isError ? (
          <LoadError message={list.error.message} onRetry={() => list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon={IconReceipt}
            title="Chưa có đơn nào qua link của bạn"
            text="Chia sẻ link sản phẩm; người mua đặt hàng thì đơn hiện ở đây."
          />
        ) : (
          <>
            <ul className="divide-y divide-ink/[0.06]">
              {list.data.items.map((o) => {
                const lost = LOST.has(o.status);
                return (
                  <li key={o.id} className="px-4 py-4 md:px-5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="font-semibold text-charcoal">{o.code}</span>
                      <ShopOrderStatusBadge status={o.status as ShopOrderStatus} paid />
                      <span className="text-xs text-ink/55">
                        {o.shopName} · {formatDateTime(o.createdAt)}
                      </span>
                      <span
                        className={cn(
                          'ml-auto text-sm font-bold tabular-nums',
                          lost ? 'text-ink/40 line-through' : 'text-navy',
                        )}
                      >
                        {formatMoney(o.commission)}
                      </span>
                    </div>
                    <ul className="mt-3 space-y-2">
                      {o.items.map((i, k) => (
                        <li key={k} className="flex items-center gap-3 text-sm">
                          <span className="size-11 shrink-0 overflow-hidden rounded-lg bg-page ring-1 ring-ink/[0.06]">
                            {i.image && (
                              <img
                                src={i.image}
                                alt=""
                                className="size-full object-cover"
                                loading="lazy"
                              />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-charcoal">{i.productName}</div>
                            <div className="text-xs text-ink/55">
                              {i.variantName && `${i.variantName} · `}x{i.quantity}
                              {i.returnedQuantity > 0 && ` · đã trả ${i.returnedQuantity}`}
                            </div>
                          </div>
                          <div className="shrink-0 text-right text-xs">
                            {i.commission > 0 ? (
                              <>
                                <div className="font-semibold text-charcoal tabular-nums">
                                  {formatMoney(i.commission)}
                                </div>
                                <div className="text-ink/50">{ratePercent(i.commissionRate)}</div>
                              </>
                            ) : (
                              <span className="text-ink/45">Không có hoa hồng</span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
            <Pager
              className="border-t border-ink/[0.06] px-5 py-3"
              page={page}
              pageSize={PAGE_SIZE}
              total={list.data.total}
              onChange={(p) => setParams({ page: String(p) }, { replace: true })}
            />
          </>
        )}
      </div>
    </div>
  );
}
