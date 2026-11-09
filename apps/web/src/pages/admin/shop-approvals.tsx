import {
  IconChevronRight,
  IconClipboardCheck,
  IconClock,
  IconSearch,
  IconX,
} from '@tabler/icons-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { nativeSelectClass } from '@/components/console/form-field';
import { Pager } from '@/components/console/pager';
import { PageHeader } from '@/components/layout/page-header';
import { useDebounced } from '@/hooks/use-debounced';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { ApprovalStatus, ApprovalType, ShopApprovalRow } from '@/lib/admin-types';
import { API, api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CARD } from '@/pages/checkout/checkout-parts';
import {
  APPROVAL_STATUS,
  ApprovalStatusBadge,
  ApprovalTypeBadge,
  hoursSince,
  OVERDUE_HOURS,
  waited,
} from './labels';

const PAGE_SIZE = 20;
const TABS: Array<{ value: ApprovalStatus | 'ALL'; label: string }> = [
  { value: 'PENDING', label: 'Chờ duyệt' },
  { value: 'APPROVED', label: 'Đã duyệt' },
  { value: 'REJECTED', label: 'Từ chối' },
  { value: 'REPLACED', label: 'Đã bị thay' },
  { value: 'ALL', label: 'Tất cả' },
];

export const approvalsKey = ['admin', 'shop-approvals'] as const;

/** "Đã chờ 26 giờ" (đỏ khi quá hạn) cho hồ sơ chờ; hồ sơ đã quyết thì hiện lúc quyết */
function Waiting({ row, compact }: { row: ShopApprovalRow; compact?: boolean }) {
  if (row.status !== 'PENDING') {
    return (
      <span className="text-muted-foreground">
        {row.decidedAt ? `Quyết lúc ${formatDateTime(row.decidedAt)}` : '—'}
      </span>
    );
  }
  const late = hoursSince(row.submittedAt) >= OVERDUE_HOURS;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium',
        late ? 'text-red-600' : 'text-charcoal',
      )}
    >
      <IconClock className="size-3.5" />
      {compact ? 'Đã chờ ' : ''}
      {waited(row.submittedAt)}
    </span>
  );
}

/**
 * Quản trị › Duyệt shop (SHP-02, docs/so-do/13 mục J, N2): hồ sơ mở shop và yêu cầu đổi thông tin,
 * nộp sớm nhất lên đầu. Bộ lọc giữ trên đường dẫn để quay lại từ trang chi tiết không mất.
 */
export function ShopApprovalsPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? 'PENDING') as ApprovalStatus | 'ALL';
  const type = (params.get('type') ?? '') as ApprovalType | '';
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

  // Gõ xong mới đưa từ khóa lên đường dẫn (về trang 1), API tìm trên mọi trang
  useEffect(() => {
    if (debounced !== q) update({ q: debounced || null });
  }, [debounced]);

  const list = useQuery({
    queryKey: [...approvalsKey, { status, type, page, q }],
    queryFn: () =>
      api<Page<ShopApprovalRow>>(`${API.approval}/admin/shop-approvals`, {
        query: {
          status: status === 'ALL' ? undefined : status,
          type: type || undefined,
          q: q || undefined,
          page,
          pageSize: PAGE_SIZE,
        },
      }),
    placeholderData: keepPreviousData,
  });
  // Số hồ sơ đang chờ (luôn hiện trên tab "Chờ duyệt")
  const pendingCount = useQuery({
    queryKey: [...approvalsKey, 'pending-count', type],
    queryFn: () =>
      api<Page<ShopApprovalRow>>(`${API.approval}/admin/shop-approvals`, {
        query: { status: 'PENDING', type: type || undefined, page: 1, pageSize: 1 },
      }),
  });

  const rows = list.data?.items ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ label: 'Kiểm duyệt' }, { label: 'Duyệt shop' }]}
        title="Duyệt shop"
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <div className="relative sm:w-64">
              <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink/40" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm tên shop, chủ shop…"
                className="h-10 rounded-lg bg-card pr-8 pl-9"
                aria-label="Tìm hồ sơ"
              />
              {search && (
                <button
                  type="button"
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 text-ink/40 transition hover:text-navy"
                  onClick={() => setSearch('')}
                  aria-label="Xóa tìm kiếm"
                >
                  <IconX className="size-4" />
                </button>
              )}
            </div>
            <select
              aria-label="Loại hồ sơ"
              className={cn(nativeSelectClass, 'h-10 rounded-lg bg-card sm:w-44')}
              value={type}
              onChange={(e) => update({ type: e.target.value || null })}
            >
              <option value="">Loại: Tất cả</option>
              <option value="REGISTER">Mở shop</option>
              <option value="CHANGE">Đổi thông tin</option>
            </select>
          </div>
        }
      />

      <div className={cn(CARD, 'overflow-hidden')}>
        <nav
          className="flex gap-1 overflow-x-auto border-b border-ink/[0.06] px-2 [scrollbar-width:none] md:px-3 [&::-webkit-scrollbar]:hidden"
          aria-label="Trạng thái hồ sơ"
        >
          {TABS.map((t) => {
            const active = status === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => update({ status: t.value === 'PENDING' ? null : t.value })}
                className={cn(
                  '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3.5 text-sm whitespace-nowrap transition',
                  active
                    ? 'border-navy font-semibold text-navy'
                    : 'border-transparent text-ink/60 hover:text-navy',
                )}
              >
                {t.label}
                {t.value === 'PENDING' && pendingCount.data && pendingCount.data.total > 0 && (
                  <span className="rounded-full bg-navy px-1.5 py-px text-[11px] font-semibold text-white tabular-nums">
                    {pendingCount.data.total}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {list.isPending ? (
          <ListSkeleton />
        ) : list.isError ? (
          <LoadError message={list.error.message} onRetry={() => void list.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={IconClipboardCheck}
            title={
              q
                ? 'Không có hồ sơ khớp từ khóa'
                : status === 'PENDING'
                  ? 'Không còn hồ sơ chờ duyệt'
                  : 'Chưa có hồ sơ nào'
            }
            text={
              q
                ? 'Thử từ khóa khác, hoặc chọn tab "Tất cả".'
                : status === 'PENDING'
                  ? 'Bạn đã xử lý hết. Hồ sơ mới sẽ hiện ở đây khi seller nộp.'
                  : `Không có hồ sơ "${status === 'ALL' ? 'nào' : APPROVAL_STATUS[status].label}" theo bộ lọc này.`
            }
          />
        ) : (
          <div className={cn('transition-opacity', list.isFetching && 'opacity-60')}>
            {/* Máy tính: bảng */}
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/[0.06] text-left text-[13px] text-ink/55">
                    <th className="px-5 py-2.5 font-normal">Shop</th>
                    <th className="px-3 py-2.5 font-normal">Chủ shop</th>
                    <th className="px-3 py-2.5 font-normal">Loại</th>
                    <th className="px-3 py-2.5 font-normal">Bản</th>
                    <th className="px-3 py-2.5 font-normal">Nộp lúc</th>
                    <th className="px-3 py-2.5 font-normal">
                      {status === 'PENDING' ? 'Đã chờ' : 'Trạng thái'}
                    </th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/[0.06]">
                  {rows.map((r) => (
                    <tr key={r.id} className="group transition hover:bg-page/50">
                      <td className="px-5 py-3.5">
                        <Link
                          to={`/quan-tri/duyet-shop/${r.id}`}
                          className="font-semibold text-charcoal transition hover:text-navy"
                        >
                          {r.shopName}
                        </Link>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="text-charcoal">{r.ownerName}</div>
                        <div className="text-xs text-muted-foreground">{r.ownerEmail}</div>
                      </td>
                      <td className="px-3 py-3.5">
                        <ApprovalTypeBadge type={r.type} />
                      </td>
                      <td className="px-3 py-3.5 text-muted-foreground">v{r.version}</td>
                      <td className="px-3 py-3.5 whitespace-nowrap text-muted-foreground">
                        {formatDateTime(r.submittedAt)}
                      </td>
                      <td className="px-3 py-3.5">
                        {status === 'PENDING' ? (
                          <Waiting row={r} />
                        ) : (
                          <div className="space-y-1">
                            <ApprovalStatusBadge status={r.status} />
                            {r.decidedAt && (
                              <div className="text-xs text-muted-foreground">
                                {formatDateTime(r.decidedAt)}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="rounded-lg border-ink/15 text-charcoal group-hover:border-navy/40 group-hover:text-navy hover:bg-transparent"
                        >
                          <Link to={`/quan-tri/duyet-shop/${r.id}`}>Xem</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Điện thoại: thẻ */}
            <ul className="grid gap-3 p-3 md:hidden">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/quan-tri/duyet-shop/${r.id}`}
                    className="flex items-center gap-3 rounded-xl border border-ink/10 bg-card p-4 transition active:bg-page"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="truncate font-semibold text-charcoal">{r.shopName}</div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <ApprovalTypeBadge type={r.type} />
                        {status !== 'PENDING' && <ApprovalStatusBadge status={r.status} />}
                        <span className="text-xs text-muted-foreground">v{r.version}</span>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {r.ownerName} · {r.ownerEmail}
                      </div>
                      <div className="text-xs">
                        <Waiting row={r} compact />
                      </div>
                    </div>
                    <IconChevronRight className="size-5 shrink-0 text-ink/35" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {list.data && list.data.total > 0 && (
          <div className="border-t border-ink/[0.06] px-4 py-3 md:px-5">
            <Pager
              page={page}
              pageSize={PAGE_SIZE}
              total={list.data.total}
              onChange={(p) => update({ page: p > 1 ? String(p) : null })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-ink/[0.06]">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="hidden h-4 w-48 md:block" />
          <Skeleton className="h-5 w-20 rounded-md" />
          <Skeleton className="ml-auto h-8 w-16 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
