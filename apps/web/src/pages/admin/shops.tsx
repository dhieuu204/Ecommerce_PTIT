import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight, Search, ShieldAlert, Store, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { Pager } from '@/components/console/pager';
import { ShopLogo } from '@/components/console/shop-logo';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebounced } from '@/hooks/use-debounced';
import { API, api } from '@/lib/api';
import type { AdminShopRow, AdminShopStatus } from '@/lib/catalog-types';
import { formatDate } from '@/lib/format';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';
import { shortId, useShopOwners, type ShopOwner } from './shop-owners';

const PAGE_SIZE = 20;
type Tab = AdminShopStatus | 'ALL';
const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'SUSPENDED', label: 'Bị đình chỉ' },
];

export const adminShopsKey = ['admin', 'shops'] as const;

export function ShopStatusBadge({ status }: { status: AdminShopStatus }) {
  return status === 'ACTIVE' ? (
    <StatusBadge tone="success">Đang hoạt động</StatusBadge>
  ) : (
    <StatusBadge tone="danger">Bị đình chỉ</StatusBadge>
  );
}

/** Chủ shop: tên + email theo hồ sơ duyệt; không có thì mã rút gọn */
export function OwnerCell({
  ownerId,
  owner,
  compact,
}: {
  ownerId: string;
  owner?: ShopOwner;
  compact?: boolean;
}) {
  if (!owner) {
    return (
      <span className="font-mono text-xs text-muted-foreground" title={`Mã chủ shop: ${ownerId}`}>
        {shortId(ownerId)}
      </span>
    );
  }
  if (compact) {
    return (
      <span className="min-w-0 truncate">
        {owner.ownerName} · {owner.ownerEmail}
      </span>
    );
  }
  return (
    <div className="min-w-0">
      <div className="truncate text-ink">{owner.ownerName}</div>
      <div className="truncate text-xs text-muted-foreground">{owner.ownerEmail}</div>
    </div>
  );
}

/**
 * Quản trị › Quản lý shop (SHP-04, bộ quyền MODERATION): shop đã được duyệt, lọc trạng thái, tìm
 * theo tên. Bấm vào shop để xem chi tiết, đình chỉ hoặc khôi phục.
 */
export function ShopsPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? 'ALL') as Tab;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = params.get('q') ?? '';
  const [search, setSearch] = useState(q);
  const debounced = useDebounced(search.trim());
  const owners = useShopOwners();

  const update = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if (!('page' in next)) p.delete('page');
    setParams(p, { replace: true });
  };

  // Gõ xong mới đưa từ khóa lên đường dẫn (về trang 1)
  useEffect(() => {
    if (debounced !== q) update({ q: debounced || null });
  }, [debounced]);

  const list = useQuery({
    queryKey: [...adminShopsKey, { status, q, page }],
    queryFn: () =>
      api<Page<AdminShopRow>>(`${API.market}/admin/shops`, {
        query: { status: status === 'ALL' ? undefined : status, q, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });
  const counts = useQuery({
    queryKey: [...adminShopsKey, 'counts', q],
    queryFn: async () => {
      const count = (s?: AdminShopStatus) =>
        api<Page<AdminShopRow>>(`${API.market}/admin/shops`, {
          query: { status: s, q, page: 1, pageSize: 1 },
        }).then((r) => r.total);
      const [ALL, ACTIVE, SUSPENDED] = await Promise.all([
        count(),
        count('ACTIVE'),
        count('SUSPENDED'),
      ]);
      return { ALL, ACTIVE, SUSPENDED } as Record<Tab, number>;
    },
    placeholderData: keepPreviousData,
  });

  const rows = list.data?.items ?? [];
  const ownerOf = (id: string) => owners.data?.get(id);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ label: 'Kiểm duyệt' }, { label: 'Quản lý shop' }]}
        title="Quản lý shop"
        description="Shop đã được duyệt. Đình chỉ shop vi phạm: hàng của shop tạm ẩn khỏi sàn cho tới khi khôi phục."
      />

      <div className="rounded-2xl border bg-card shadow-sm shadow-navy/[0.03]">
        <div className="flex flex-col gap-3 border-b px-4 pt-2 md:flex-row md:items-end md:justify-between md:px-5">
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Trạng thái shop">
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
                        t.value === 'SUSPENDED' && n > 0
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
          <div className="relative pb-3 md:w-72 md:pb-2.5">
            <Search className="pointer-events-none absolute top-[18px] left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm tên shop…"
              className="h-9 rounded-full bg-white pr-8 pl-9"
              aria-label="Tìm shop"
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
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <Skeleton className="size-11 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-8 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ) : list.isError ? (
          <LoadError message={list.error.message} onRetry={() => void list.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Store}
            title={q ? 'Không có shop khớp từ khóa' : 'Chưa có shop nào'}
            text={
              q
                ? 'Thử từ khóa khác, hoặc chọn tab "Tất cả".'
                : status === 'SUSPENDED'
                  ? 'Không có shop nào đang bị đình chỉ.'
                  : 'Shop hiện ở đây sau khi hồ sơ mở shop được duyệt.'
            }
            action={
              q && (
                <Button variant="outline" onClick={() => setSearch('')}>
                  Bỏ tìm kiếm
                </Button>
              )
            }
          />
        ) : (
          <div className={cn('transition-opacity', list.isFetching && 'opacity-60')}>
            {/* Máy tính: bảng */}
            <div className="hidden md:block">
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="bg-ivory text-left text-xs tracking-wide whitespace-nowrap text-muted-foreground uppercase">
                    <th className="w-[34%] px-5 py-3 font-medium">Shop</th>
                    <th className="w-[24%] px-3 py-3 font-medium">Chủ shop</th>
                    <th className="w-[11%] px-3 py-3 text-right font-medium">Sản phẩm</th>
                    <th className="w-[12%] px-3 py-3 font-medium">Ngày duyệt</th>
                    <th className="px-3 py-3 font-medium">Trạng thái</th>
                    <th className="w-24 px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((s) => (
                    <tr key={s.id} className="group transition hover:bg-champagne-50/40">
                      <td className="px-5 py-3">
                        <Link
                          to={`/quan-tri/shop/${s.id}`}
                          className="flex min-w-0 items-center gap-3"
                        >
                          <ShopLogo url={s.logoUrl} className="size-11 rounded-xl border" />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-navy group-hover:underline">
                              {s.name}
                            </span>
                            <span className="block font-mono text-xs text-muted-foreground">
                              {shortId(s.id)}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <OwnerCell ownerId={s.ownerId} owner={ownerOf(s.id)} />
                      </td>
                      <td className="px-3 py-3 text-right text-ink tabular-nums">
                        {s.productCount.toLocaleString('vi-VN')}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                        {formatDate(s.approvedAt) || '—'}
                      </td>
                      <td className="px-3 py-3">
                        <ShopStatusBadge status={s.status} />
                        {s.status === 'SUSPENDED' && s.suspendReason && (
                          <p
                            className="mt-1 line-clamp-2 text-xs text-red-700/90"
                            title={s.suspendReason}
                          >
                            {s.suspendReason}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="rounded-full border-navy/30 text-navy group-hover:border-navy"
                        >
                          <Link to={`/quan-tri/shop/${s.id}`}>Xem</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Điện thoại: thẻ */}
            <ul className="grid grid-cols-1 gap-3 p-3 md:hidden">
              {rows.map((s) => (
                <li key={s.id} className="min-w-0">
                  <Link
                    to={`/quan-tri/shop/${s.id}`}
                    className="flex items-center gap-3 rounded-xl border bg-white p-3.5 shadow-xs transition active:bg-champagne-50/50"
                  >
                    <ShopLogo url={s.logoUrl} className="size-12 rounded-xl border" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold text-navy">{s.name}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <ShopStatusBadge status={s.status} />
                        <span>{s.productCount} sản phẩm</span>
                        {s.approvedAt && <span>· duyệt {formatDate(s.approvedAt)}</span>}
                      </div>
                      <div className="flex min-w-0 text-xs text-muted-foreground">
                        <OwnerCell ownerId={s.ownerId} owner={ownerOf(s.id)} compact />
                      </div>
                      {s.status === 'SUSPENDED' && s.suspendReason && (
                        <p className="flex gap-1 text-xs text-red-700">
                          <ShieldAlert className="mt-px size-3.5 shrink-0" />
                          <span className="line-clamp-2">{s.suspendReason}</span>
                        </p>
                      )}
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-champagne-600" />
                  </Link>
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
        Tên và email chủ shop lấy theo hồ sơ mở shop đã duyệt. Số sản phẩm gồm cả hàng đang ẩn.
      </p>
    </div>
  );
}
