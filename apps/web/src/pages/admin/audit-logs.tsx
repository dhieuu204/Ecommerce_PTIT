import { useInfiniteQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronDown,
  History,
  Loader2,
  RotateCcw,
  UserRound,
  X,
} from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { inputClass, nativeSelectClass } from '@/components/console/form-field';
import { PageHeader } from '@/components/layout/page-header';
import { PERMISSION_LABELS } from '@/components/layout/admin-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { AuditLogRow } from '@/lib/admin-types';
import { API, api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Page, Permission } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Mỗi service tự lưu nhật ký của mình; trang này gọi cả 4 rồi gộp theo thời gian */
const SOURCES = [
  { key: 'user', label: 'Người dùng', prefix: API.user },
  { key: 'market', label: 'Sàn', prefix: API.market },
  { key: 'approval', label: 'Duyệt', prefix: API.approval },
  { key: 'payment', label: 'Thanh toán', prefix: API.payment },
] as const;
type SourceKey = (typeof SOURCES)[number]['key'];
type Cursor = Record<SourceKey, number | null>;
type Row = AuditLogRow & { source: SourceKey };

/** Số dòng lấy mỗi service mỗi lần bấm "Xem thêm" */
const CHUNK = 30;

/**
 * Tên hành động tiếng Việt. Gom từ các lệnh writeAudit(...) trong services/*; hành động mới chưa có
 * ở đây thì hiện mã gốc.
 */
export const AUDIT_ACTIONS: Record<string, { label: string; source: SourceKey }> = {
  SET_PERMISSIONS: { label: 'Cấp / đổi bộ quyền', source: 'user' },
  LOCK_USER: { label: 'Khóa tài khoản', source: 'user' },
  UNLOCK_USER: { label: 'Mở khóa tài khoản', source: 'user' },
  APPROVE_SHOP: { label: 'Duyệt hồ sơ shop', source: 'approval' },
  REJECT_SHOP: { label: 'Từ chối hồ sơ shop', source: 'approval' },
  UPDATE_SHOP: { label: 'Sửa thông tin shop', source: 'market' },
  CANCEL_ORDER: { label: 'Hủy đơn hàng', source: 'market' },
  APPROVE_ORDER: { label: 'Duyệt đơn lớn', source: 'approval' },
  REJECT_ORDER: { label: 'Từ chối đơn lớn', source: 'approval' },
  MANUAL_REFUND: { label: 'Hoàn tiền tay', source: 'payment' },
  UPDATE_SETTING: { label: 'Sửa cấu hình chính sách', source: 'market' },
};

const TARGET_TYPES: Record<string, string> = {
  USER: 'Người dùng',
  SHOP: 'Shop',
  SHOP_ORDER: 'Đơn con',
  ORDER: 'Đơn hàng',
  REFUND: 'Khoản hoàn',
  SETTING: 'Cấu hình',
};

const FIELD_LABELS: Record<string, string> = {
  permissions: 'Bộ quyền',
  status: 'Trạng thái',
  lockReason: 'Lý do khóa',
  version: 'Phiên bản',
  description: 'Mô tả',
  logoUrl: 'Logo',
  phone: 'Số điện thoại',
  pickupAddress: 'Địa chỉ lấy hàng',
  pickupStreet: 'Số nhà, đường',
  pickupProvinceId: 'Mã tỉnh',
  pickupDistrictId: 'Mã quận/huyện',
  pickupWardCode: 'Mã phường/xã',
};

const STATUS_WORDS: Record<string, string> = {
  ACTIVE: 'Hoạt động',
  LOCKED: 'Bị khóa',
  UNVERIFIED: 'Chưa xác minh',
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
};

function show(key: string, v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  if (key === 'permissions' && Array.isArray(v)) {
    return v.length
      ? v.map((p) => PERMISSION_LABELS[p as Permission] ?? p).join(', ')
      : '(không có)';
  }
  if (key === 'status' && typeof v === 'string') return STATUS_WORDS[v] ?? v;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Ngày (YYYY-MM-DD, giờ Việt Nam) → thời điểm ISO đầu / cuối ngày */
const dayStart = (d: string) => (d ? new Date(`${d}T00:00:00+07:00`).toISOString() : undefined);
const dayEnd = (d: string) => (d ? new Date(`${d}T23:59:59.999+07:00`).toISOString() : undefined);

/**
 * Quản trị › Nhật ký thao tác (ADM-02, docs/so-do/13 mục M). Gộp nhật ký của các service theo thời
 * gian, mới nhất trước. Một service không trả lời thì vẫn hiện phần còn lại kèm cảnh báo.
 */
export function AuditLogsPage() {
  const [params, setParams] = useSearchParams();
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const action = params.get('action') ?? '';
  const actorId = params.get('actor') ?? '';
  const actorName = params.get('actorName') ?? '';
  const [open, setOpen] = useState<string | null>(null);

  const update = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
  };
  const rangeError = from && to && from > to ? 'Ngày bắt đầu phải trước ngày kết thúc.' : null;

  const query = useInfiniteQuery({
    queryKey: ['admin', 'audit-logs', { from, to, action, actorId }],
    enabled: !rangeError,
    initialPageParam: { user: 1, market: 1, approval: 1, payment: 1 } as Cursor,
    queryFn: async ({ pageParam }) => {
      const next = { ...pageParam };
      const failed: Partial<Record<SourceKey, string>> = {};
      const results = await Promise.all(
        SOURCES.map(async (s) => {
          const page = pageParam[s.key];
          if (page === null) return [] as Row[];
          try {
            const res = await api<Page<AuditLogRow>>(`${s.prefix}/admin/audit-logs`, {
              query: {
                from: dayStart(from),
                to: dayEnd(to),
                action: action || undefined,
                actorId: actorId || undefined,
                page,
                pageSize: CHUNK,
              },
            });
            next[s.key] = page * CHUNK < res.total && res.items.length > 0 ? page + 1 : null;
            return res.items.map((r) => ({ ...r, source: s.key }));
          } catch (e) {
            next[s.key] = null;
            failed[s.key] = e instanceof Error ? e.message : 'Lỗi không rõ';
            return [] as Row[];
          }
        }),
      );
      return { items: results.flat(), next, failed };
    },
    getNextPageParam: (last) =>
      Object.values(last.next).some((v) => v !== null) ? last.next : undefined,
  });

  const merged = useMemo(() => {
    const pages = query.data?.pages ?? [];
    const all = pages.flatMap((p) => p.items);
    all.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    const failed: Partial<Record<SourceKey, string>> = {};
    pages.forEach((p) => Object.assign(failed, p.failed));
    // Chỉ hiện tới mốc mà mọi service còn dữ liệu đều đã tải qua, để thứ tự thời gian luôn đúng
    const last = pages[pages.length - 1];
    let frontier = '';
    if (last) {
      for (const s of SOURCES) {
        if (last.next[s.key] === null) continue;
        const own = all.filter((r) => r.source === s.key);
        const oldest = own[own.length - 1]?.createdAt ?? '';
        if (oldest > frontier) frontier = oldest;
      }
    }
    const visible = frontier ? all.filter((r) => r.createdAt >= frontier) : all;
    return { visible, failed };
  }, [query.data]);

  const failedSources = SOURCES.filter((s) => merged.failed[s.key]);
  const allFailed = failedSources.length === SOURCES.length;
  const filtered = !!(from || to || action || actorId);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ label: 'Hệ thống' }, { label: 'Nhật ký thao tác' }]}
        title="Nhật ký thao tác"
        description="Ai đã làm gì, lúc nào, với đối tượng nào và vì sao. Gộp từ nhật ký của các service, mới nhất trước."
      />

      <div className="rounded-2xl border bg-card shadow-sm shadow-navy/[0.03]">
        <div className="grid grid-cols-2 gap-3 border-b p-3 md:p-4 lg:grid-cols-[auto_auto_1fr_auto] lg:items-end">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Từ ngày</span>
            <Input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => update({ from: e.target.value || null })}
              className={cn(inputClass, 'lg:w-44')}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Đến ngày</span>
            <Input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => update({ to: e.target.value || null })}
              className={cn(inputClass, 'lg:w-44')}
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1 lg:col-span-1">
            <span className="text-xs font-medium text-muted-foreground">Hành động</span>
            <select
              className={cn(nativeSelectClass, 'lg:max-w-64')}
              value={action}
              onChange={(e) => update({ action: e.target.value || null })}
            >
              <option value="">Tất cả hành động</option>
              {Object.entries(AUDIT_ACTIONS).map(([code, a]) => (
                <option key={code} value={code}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          {filtered && (
            <Button
              variant="ghost"
              className="col-span-2 justify-self-start text-muted-foreground lg:col-span-1"
              onClick={() => setParams(new URLSearchParams(), { replace: true })}
            >
              <RotateCcw /> Bỏ lọc
            </Button>
          )}
          {(actorId || rangeError) && (
            <div className="col-span-2 flex flex-wrap items-center gap-2 lg:col-span-4">
              {actorId && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-champagne-50 py-1 pr-1.5 pl-3 text-xs text-navy ring-1 ring-champagne/40">
                  <UserRound className="size-3.5" /> Người làm: {actorName || actorId.slice(0, 8)}
                  <button
                    type="button"
                    aria-label="Bỏ lọc người làm"
                    className="rounded-full p-0.5 hover:bg-champagne/30"
                    onClick={() => update({ actor: null, actorName: null })}
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              )}
              {rangeError && <span className="text-xs text-destructive">{rangeError}</span>}
            </div>
          )}
        </div>

        {failedSources.length > 0 && !allFailed && (
          <div className="flex items-start gap-2 border-b bg-amber-50 px-4 py-2.5 text-xs text-amber-900 md:px-5">
            <AlertTriangle className="mt-px size-3.5 shrink-0 text-amber-600" />
            <span>
              Chưa tải được nhật ký của{' '}
              {failedSources.map((s, i) => (
                <Fragment key={s.key}>
                  {i > 0 && ', '}
                  <b className="font-medium">{s.label}</b>
                </Fragment>
              ))}
              . Danh sách dưới đây chỉ gồm các phần còn lại.
            </span>
          </div>
        )}

        {rangeError ? null : query.isPending ? (
          <div className="divide-y">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-5 px-5 py-4">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-36" />
                <Skeleton className="ml-auto h-4 w-32" />
              </div>
            ))}
          </div>
        ) : query.isError || allFailed ? (
          <LoadError
            message={
              query.error?.message ??
              merged.failed.user ??
              'Không service nào trả lời. Bạn kiểm tra các service đã chạy chưa.'
            }
            onRetry={() => void query.refetch()}
          />
        ) : merged.visible.length === 0 ? (
          <EmptyState
            icon={History}
            title={filtered ? 'Không có thao tác khớp bộ lọc' : 'Chưa có thao tác nào'}
            text={
              filtered
                ? 'Thử nới khoảng ngày hoặc bỏ bớt bộ lọc.'
                : 'Duyệt shop, cấp quyền, khóa tài khoản… sẽ được ghi lại ở đây.'
            }
          />
        ) : (
          <>
            <table className="hidden w-full text-sm md:table">
              <thead>
                <tr className="bg-ivory text-left text-xs tracking-wide text-muted-foreground uppercase">
                  <th className="px-5 py-3 font-medium">Thời gian</th>
                  <th className="px-3 py-3 font-medium">Người làm</th>
                  <th className="px-3 py-3 font-medium">Hành động</th>
                  <th className="px-3 py-3 font-medium">Đối tượng</th>
                  <th className="px-3 py-3 font-medium">Lý do</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {merged.visible.map((r) => {
                  const key = `${r.source}-${r.id}`;
                  const expanded = open === key;
                  return (
                    <Fragment key={key}>
                      <tr
                        onClick={() => setOpen(expanded ? null : key)}
                        className={cn(
                          'cursor-pointer border-t transition hover:bg-champagne-50/40',
                          expanded && 'bg-champagne-50/60',
                        )}
                      >
                        <td className="px-5 py-3 whitespace-nowrap text-muted-foreground">
                          {formatDateTime(r.createdAt)}
                        </td>
                        <td className="px-3 py-3">
                          <ActorButton row={r} onPick={update} />
                        </td>
                        <td className="px-3 py-3">
                          <ActionLabel row={r} />
                        </td>
                        <td className="px-3 py-3">
                          <Target row={r} />
                        </td>
                        <td className="max-w-64 px-3 py-3">
                          <span className="line-clamp-2 text-ink">{r.reason ?? '—'}</span>
                        </td>
                        <td className="pr-4">
                          <ChevronDown
                            className={cn(
                              'size-4 text-champagne-600 transition',
                              expanded && 'rotate-180',
                            )}
                          />
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-champagne-50/30">
                          <td colSpan={6} className="px-5 pt-1 pb-4">
                            <Detail row={r} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>

            <ul className="grid gap-2.5 p-3 md:hidden">
              {merged.visible.map((r) => {
                const key = `${r.source}-${r.id}`;
                const expanded = open === key;
                return (
                  <li key={key} className="rounded-xl border bg-white shadow-xs">
                    <button
                      type="button"
                      className="flex w-full items-start gap-3 p-3.5 text-left"
                      onClick={() => setOpen(expanded ? null : key)}
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <ActionLabel row={r} />
                        <div className="text-xs text-muted-foreground">
                          {formatDateTime(r.createdAt)} · {r.actorName}
                        </div>
                        <div className="text-xs">
                          <Target row={r} />
                        </div>
                        {r.reason && (
                          <div className="text-xs text-ink">
                            <span className="text-muted-foreground">Lý do: </span>
                            {r.reason}
                          </div>
                        )}
                      </div>
                      <ChevronDown
                        className={cn(
                          'mt-1 size-4 shrink-0 text-champagne-600 transition',
                          expanded && 'rotate-180',
                        )}
                      />
                    </button>
                    {expanded && (
                      <div className="border-t px-3.5 pt-2 pb-3.5">
                        <Detail row={r} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-col items-center gap-2 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:justify-between md:px-5">
              <span>Đang hiện {merged.visible.length.toLocaleString('vi-VN')} thao tác</span>
              {query.hasNextPage ? (
                <Button
                  variant="outline"
                  className="rounded-full"
                  disabled={query.isFetchingNextPage}
                  onClick={() => void query.fetchNextPage()}
                >
                  {query.isFetchingNextPage && <Loader2 className="animate-spin" />}
                  Xem thêm
                </Button>
              ) : (
                <span className="text-xs">Đã hiện hết</span>
              )}
            </div>
          </>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Bấm một dòng để xem dữ liệu trước và sau khi đổi. Bấm tên người làm để lọc theo người đó.
      </p>
    </div>
  );
}

function ActorButton({
  row,
  onPick,
}: {
  row: Row;
  onPick: (next: Record<string, string | null>) => void;
}) {
  return (
    <button
      type="button"
      title="Lọc theo người này"
      onClick={(e) => {
        e.stopPropagation();
        onPick({ actor: row.actorId, actorName: row.actorName });
      }}
      className="text-left font-medium text-ink hover:text-navy hover:underline"
    >
      {row.actorName}
    </button>
  );
}

const SOURCE_TONE: Record<SourceKey, string> = {
  user: 'bg-navy/[0.06] text-navy',
  market: 'bg-champagne-50 text-champagne-600',
  approval: 'bg-blue-50 text-blue-700',
  payment: 'bg-emerald-50 text-emerald-700',
};

function ActionLabel({ row }: { row: Row }) {
  const known = AUDIT_ACTIONS[row.action];
  const source = SOURCES.find((s) => s.key === row.source)!;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={cn(
          'font-medium',
          row.action.startsWith('REJECT') || row.action === 'LOCK_USER'
            ? 'text-red-700'
            : 'text-ink',
        )}
      >
        {known?.label ?? row.action}
      </span>
      <span
        className={cn(
          'rounded px-1.5 py-px text-[10px] font-semibold uppercase',
          SOURCE_TONE[row.source],
        )}
        title={`Ghi bởi ${source.label}`}
      >
        {source.label}
      </span>
    </span>
  );
}

function Target({ row }: { row: Row }) {
  const version = asObject(row.after).version;
  return (
    <span className="text-ink" title={row.targetId}>
      {TARGET_TYPES[row.targetType] ?? row.targetType}{' '}
      <span className="font-mono text-xs text-muted-foreground">{row.targetId.slice(0, 8)}</span>
      {typeof version === 'number' && <span className="text-muted-foreground"> (v{version})</span>}
    </span>
  );
}

/** Phần mở rộng của một dòng: trước → sau theo từng mục, kèm JSON gốc */
function Detail({ row }: { row: Row }) {
  const [raw, setRaw] = useState(false);
  const before = asObject(row.before);
  const after = asObject(row.after);
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return (
    <div className="space-y-3 rounded-xl border bg-white p-3.5">
      {keys.length > 0 ? (
        <dl className="grid gap-2 text-sm">
          {keys.map((k) => (
            <div key={k} className="grid gap-1 sm:grid-cols-[160px_1fr] sm:items-baseline">
              <dt className="text-xs font-medium text-muted-foreground">{FIELD_LABELS[k] ?? k}</dt>
              <dd className="flex flex-wrap items-center gap-x-2 gap-y-1 break-all">
                <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-800 line-through decoration-red-300">
                  {show(k, before[k])}
                </span>
                <span className="text-muted-foreground">→</span>
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-800">
                  {show(k, after[k])}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">Không có dữ liệu trước / sau.</p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          Mã đối tượng: <span className="font-mono">{row.targetId}</span>
        </span>
        <button
          type="button"
          className="font-medium text-navy hover:underline"
          onClick={() => setRaw((v) => !v)}
        >
          {raw ? 'Ẩn JSON gốc' : 'Xem JSON gốc'}
        </button>
      </div>
      {raw && (
        <pre className="max-h-72 overflow-auto rounded-lg bg-navy-900 p-3 text-xs leading-relaxed text-ivory">
          {JSON.stringify({ before: row.before, after: row.after }, null, 2)}
        </pre>
      )}
    </div>
  );
}
