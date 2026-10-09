import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight, Search, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { nativeSelectClass } from '@/components/console/form-field';
import { Pager } from '@/components/console/pager';
import { useDebounced } from '@/hooks/use-debounced';
import { PageHeader } from '@/components/layout/page-header';
import { PERMISSION_LABELS } from '@/components/layout/admin-layout';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/user-avatar';
import type { AdminUserRow, UserStatus } from '@/lib/admin-types';
import { API, api } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { formatDate, formatDateTime } from '@/lib/format';
import type { Page, Permission } from '@/lib/types';
import { cn } from '@/lib/utils';
import { USER_STATUS, UserStatusBadge } from './labels';
import { UserDetailPanel } from './user-detail';

const PAGE_SIZE = 20;
export const usersKey = ['admin', 'users'] as const;

export function PermissionChips({ perms }: { perms: Permission[] }) {
  if (perms.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {perms.map((p) => (
        <span
          key={p}
          className="rounded-md bg-navy/[0.06] px-2 py-0.5 text-xs font-medium whitespace-nowrap text-navy ring-1 ring-navy/10 ring-inset"
        >
          {PERMISSION_LABELS[p]}
        </span>
      ))}
    </div>
  );
}

/**
 * Quản trị › Người dùng và quyền (ACC-05, docs/so-do/13 mục L). Bấm một dòng mở bảng chi tiết bên
 * phải: bộ quyền, khóa/mở khóa (đều cần lý do, ghi nhật ký).
 */
export function UsersPage() {
  const me = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? '') as UserStatus | '';
  const permission = (params.get('permission') ?? '') as Permission | '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const selected = params.get('u');
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebounced(search.trim());

  const update = (next: Record<string, string | null>, keepPage = false) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if (!keepPage && !('page' in next)) p.delete('page');
    setParams(p, { replace: true });
  };

  // Đưa từ khóa (đã chờ gõ xong) lên đường dẫn
  useEffect(() => {
    if ((params.get('q') ?? '') !== q) update({ q: q || null });
    // chỉ chạy lại khi từ khóa đổi
  }, [q]);

  const list = useQuery({
    queryKey: [...usersKey, { q, status, permission, page }],
    queryFn: () =>
      api<Page<AdminUserRow>>(`${API.user}/admin/users`, {
        query: { q, status, permission, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.items ?? [];
  const filtered = !!(q || status || permission);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ label: 'Hệ thống' }, { label: 'Người dùng và quyền' }]}
        title="Người dùng và quyền"
        description="Cấp bộ quyền quản trị, khóa hoặc mở khóa tài khoản. Mọi thay đổi cần lý do và được ghi nhật ký."
      />

      <div className="rounded-2xl border bg-card shadow-sm shadow-navy/[0.03]">
        <div className="flex flex-col gap-2 border-b p-3 sm:flex-row md:p-4">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo email hoặc họ tên"
              className="h-10 rounded-full bg-white pr-9 pl-9"
              aria-label="Tìm người dùng"
            />
            {search && (
              <button
                type="button"
                className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-ink"
                onClick={() => setSearch('')}
                aria-label="Xóa tìm kiếm"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <select
              aria-label="Trạng thái"
              className={cn(nativeSelectClass, 'rounded-full sm:w-44')}
              value={status}
              onChange={(e) => update({ status: e.target.value || null })}
            >
              <option value="">Mọi trạng thái</option>
              {(Object.keys(USER_STATUS) as UserStatus[]).map((s) => (
                <option key={s} value={s}>
                  {USER_STATUS[s].label}
                </option>
              ))}
            </select>
            <select
              aria-label="Bộ quyền"
              className={cn(nativeSelectClass, 'rounded-full sm:w-48')}
              value={permission}
              onChange={(e) => update({ permission: e.target.value || null })}
            >
              <option value="">Mọi bộ quyền</option>
              {(Object.keys(PERMISSION_LABELS) as Permission[]).map((p) => (
                <option key={p} value={p}>
                  {PERMISSION_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {list.isPending ? (
          <div className="divide-y">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-4">
                <Skeleton className="size-10 rounded-full" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-52" />
                </div>
                <Skeleton className="ml-auto h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : list.isError ? (
          <LoadError message={list.error.message} onRetry={() => void list.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={filtered ? 'Không có người dùng khớp bộ lọc' : 'Chưa có người dùng'}
            text={filtered ? 'Thử từ khóa khác hoặc bỏ bớt bộ lọc.' : undefined}
          />
        ) : (
          <div className={cn('transition-opacity', list.isFetching && 'opacity-60')}>
            <table className="hidden w-full text-sm md:table">
              <thead>
                <tr className="bg-ivory text-left text-xs tracking-wide text-muted-foreground uppercase">
                  <th className="px-5 py-3 font-medium">Người dùng</th>
                  <th className="px-3 py-3 font-medium">Trạng thái</th>
                  <th className="px-3 py-3 font-medium">Bộ quyền</th>
                  <th className="px-3 py-3 font-medium">Đăng nhập gần nhất</th>
                  <th className="px-3 py-3 font-medium">Đăng ký</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((u) => (
                  <tr
                    key={u.id}
                    tabIndex={0}
                    onClick={() => update({ u: u.id }, true)}
                    onKeyDown={(e) => e.key === 'Enter' && update({ u: u.id }, true)}
                    className={cn(
                      'cursor-pointer transition outline-none hover:bg-champagne-50/40 focus-visible:bg-champagne-50/60',
                      selected === u.id && 'bg-champagne-50',
                    )}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <UserAvatar name={u.fullName} className="size-9 text-xs" />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-ink">
                            {u.fullName}
                            {me?.id === u.id && (
                              <span className="ml-1.5 text-xs font-normal text-champagne-600">
                                (bạn)
                              </span>
                            )}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <UserStatusBadge status={u.status} />
                    </td>
                    <td className="px-3 py-3">
                      <PermissionChips perms={u.permissions} />
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                      {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Chưa đăng nhập'}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                      {formatDate(u.createdAt)}
                    </td>
                    <td className="pr-4">
                      <ChevronRight className="size-4 text-champagne-600" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="grid gap-2.5 p-3 md:hidden">
              {rows.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => update({ u: u.id }, true)}
                    className="flex w-full items-center gap-3 rounded-xl border bg-white p-3.5 text-left shadow-xs transition active:bg-champagne-50/50"
                  >
                    <UserAvatar name={u.fullName} className="size-10 text-xs" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="truncate font-medium text-ink">
                        {u.fullName}
                        {me?.id === u.id && (
                          <span className="ml-1 text-xs font-normal text-champagne-600">(bạn)</span>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <UserStatusBadge status={u.status} />
                        {u.permissions.length > 0 && <PermissionChips perms={u.permissions} />}
                      </div>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-champagne-600" />
                  </button>
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

      <Sheet open={!!selected} onOpenChange={(o) => !o && update({ u: null }, true)}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-full gap-0 overflow-y-auto bg-ivory p-0 sm:max-w-md"
        >
          <SheetTitle className="sr-only">Chi tiết người dùng</SheetTitle>
          <SheetDescription className="sr-only">
            Thông tin, bộ quyền và khóa tài khoản
          </SheetDescription>
          {selected && <UserDetailPanel userId={selected} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
