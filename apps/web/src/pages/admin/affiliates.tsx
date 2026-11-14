import {
  IconArrowLeft,
  IconChevronRight,
  IconClipboardCheck,
  IconClock,
  IconSearch,
  IconUsers,
} from '@tabler/icons-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { Pager } from '@/components/console/pager';
import { PageHeader } from '@/components/layout/page-header';
import { ConfirmDialog, ReasonDialog } from '@/components/orders/order-parts';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  AdminAffiliate,
  AffiliateApprovalDetail,
  AffiliateApprovalRow,
  AffiliateApprovalStatus,
  AffiliateStatus,
} from '@/lib/affiliate-types';
import { API, api } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CARD, CardTitle } from '@/pages/checkout/checkout-parts';
import { APPROVAL_STATUS, ApprovalStatusBadge, hoursSince, OVERDUE_HOURS, waited } from './labels';

const PAGE_SIZE = 20;
const approvalsKey = ['admin', 'affiliate-approvals'] as const;
const affiliatesKey = ['admin', 'affiliates'] as const;

const TABS: Array<{ value: AffiliateApprovalStatus; label: string }> = [
  { value: 'PENDING', label: 'Chờ duyệt' },
  { value: 'APPROVED', label: 'Đã duyệt' },
  { value: 'REJECTED', label: 'Từ chối' },
  { value: 'REPLACED', label: 'Đã bị thay' },
];

const AFFILIATE_STATUS: Record<
  AffiliateStatus,
  { label: string; tone: 'pending' | 'danger' | 'success' | 'neutral' }
> = {
  PENDING: { label: 'Chờ duyệt', tone: 'pending' },
  REJECTED: { label: 'Bị từ chối', tone: 'danger' },
  ACTIVE: { label: 'Đang hoạt động', tone: 'success' },
  SUSPENDED: { label: 'Đang bị khóa', tone: 'danger' },
};

/** Quản trị › Duyệt cộng tác viên (P7, AFF-01): hồ sơ đăng ký, nộp sớm nhất lên đầu */
export function AffiliateApprovalsPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? 'PENDING') as AffiliateApprovalStatus;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const list = useQuery({
    queryKey: [...approvalsKey, status, page],
    queryFn: () =>
      api<Page<AffiliateApprovalRow>>(`${API.approval}/admin/affiliate-approvals`, {
        query: { status, type: 'REGISTER', page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.items ?? [];
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ label: 'Kiểm duyệt' }, { label: 'Duyệt cộng tác viên' }]}
        title="Duyệt cộng tác viên"
        description="Xem kênh bán hàng của người đăng ký trước khi duyệt. Không duyệt hồ sơ của chính mình."
      />
      <div className={cn(CARD, 'overflow-hidden')}>
        <nav
          className="flex gap-1 overflow-x-auto border-b border-ink/[0.06] px-2 [scrollbar-width:none] md:px-3 [&::-webkit-scrollbar]:hidden"
          aria-label="Trạng thái hồ sơ"
        >
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() =>
                setParams(t.value === 'PENDING' ? {} : { status: t.value }, { replace: true })
              }
              className={cn(
                '-mb-px shrink-0 border-b-2 px-3 py-3.5 text-sm whitespace-nowrap transition',
                status === t.value
                  ? 'border-navy font-semibold text-navy'
                  : 'border-transparent text-ink/60 hover:text-navy',
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
        {list.isPending ? (
          <RowsSkeleton />
        ) : list.isError ? (
          <LoadError message={list.error.message} onRetry={() => void list.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={IconClipboardCheck}
            title={status === 'PENDING' ? 'Không còn hồ sơ chờ duyệt' : 'Chưa có hồ sơ nào'}
            text={
              status === 'PENDING'
                ? 'Hồ sơ mới hiện ở đây khi người dùng đăng ký cộng tác viên.'
                : `Không có hồ sơ "${APPROVAL_STATUS[status].label}".`
            }
          />
        ) : (
          <ul className="divide-y divide-ink/[0.06]">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/quan-tri/duyet-ctv/${r.id}`}
                  className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-page/50 md:px-5"
                >
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-charcoal">{r.displayName}</span>
                      <span className="text-xs text-muted-foreground">v{r.version}</span>
                      {status !== 'PENDING' && <ApprovalStatusBadge status={r.status} />}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {r.userName} · {r.userEmail}
                    </div>
                  </div>
                  <div className="hidden text-xs sm:block">
                    {r.status === 'PENDING' ? (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 font-medium',
                          hoursSince(r.submittedAt) >= OVERDUE_HOURS
                            ? 'text-red-600'
                            : 'text-charcoal',
                        )}
                      >
                        <IconClock className="size-3.5" /> {waited(r.submittedAt)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {r.decidedAt ? formatDateTime(r.decidedAt) : '—'}
                      </span>
                    )}
                  </div>
                  <IconChevronRight className="size-5 shrink-0 text-ink/35" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {list.data && list.data.total > 0 && (
          <div className="border-t border-ink/[0.06] px-4 py-3 md:px-5">
            <Pager
              page={page}
              pageSize={PAGE_SIZE}
              total={list.data.total}
              onChange={(p) =>
                setParams(
                  { ...(status !== 'PENDING' && { status }), page: String(p) },
                  { replace: true },
                )
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** Quản trị › Duyệt cộng tác viên › Chi tiết: hồ sơ, lịch sử duyệt/khóa/mở, duyệt hoặc từ chối */
export function AffiliateApprovalDetailPage() {
  const { approvalId = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useCurrentUser();
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const q = useQuery({
    queryKey: [...approvalsKey, 'detail', approvalId],
    queryFn: () =>
      api<AffiliateApprovalDetail>(`${API.approval}/admin/affiliate-approvals/${approvalId}`),
  });
  const decide = useMutation({
    mutationFn: (body: { decision: 'APPROVE' | 'REJECT'; reason?: string }) =>
      api(`${API.approval}/admin/affiliate-approvals/${approvalId}/decision`, {
        method: 'POST',
        body,
      }),
    onSuccess: (_, body) => {
      void qc.invalidateQueries({ queryKey: approvalsKey });
      toast.success(body.decision === 'APPROVE' ? 'Đã duyệt cộng tác viên.' : 'Đã từ chối hồ sơ.');
      navigate('/quan-tri/duyet-ctv');
    },
    onError: (e) => toast.error(e.message),
  });

  if (q.isPending) return <Skeleton className="mx-auto h-96 max-w-4xl rounded-2xl" />;
  if (q.isError) {
    return (
      <LoadError
        className={cn(CARD, 'mx-auto max-w-4xl')}
        message={q.error.message}
        onRetry={() => q.refetch()}
      />
    );
  }
  const a = q.data;
  const self = a.userId === me?.id;
  const canDecide = a.status === 'PENDING' && a.type === 'REGISTER';
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        crumbs={[
          { label: 'Kiểm duyệt' },
          { label: 'Duyệt cộng tác viên', to: '/quan-tri/duyet-ctv' },
          { label: a.displayName },
        ]}
        title={a.displayName}
        actions={
          <Button asChild variant="outline" className="rounded-lg">
            <Link to="/quan-tri/duyet-ctv">
              <IconArrowLeft className="size-4" /> Danh sách
            </Link>
          </Button>
        }
      />
      <div className="space-y-4">
        <section className={cn(CARD, 'p-5 md:p-7')}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Hồ sơ v{a.version}</CardTitle>
            <ApprovalStatusBadge status={a.status} />
          </div>
          <dl className="mt-5 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
            <Info label="Người nộp">
              {a.userName} · {a.userEmail}
            </Info>
            <Info label="Số điện thoại">{a.data.phone}</Info>
            <Info label="Kênh bán hàng" wide>
              <ul className="space-y-0.5">
                {a.data.channels.map((c) => (
                  <li key={c} className="truncate">
                    <a
                      href={c}
                      target="_blank"
                      rel="noreferrer"
                      className="text-navy hover:underline"
                    >
                      {c}
                    </a>
                  </li>
                ))}
              </ul>
            </Info>
            <Info label="Tài khoản nhận tiền" wide>
              {a.data.bankAccount.bankName} · {a.data.bankAccount.accountNumberMasked} ·{' '}
              {a.data.bankAccount.accountName}
            </Info>
            <Info label="Nộp lúc">{formatDateTime(a.submittedAt)}</Info>
            {a.reason && <Info label="Lý do">{a.reason}</Info>}
          </dl>
          {canDecide && (
            <div className="mt-6 flex flex-wrap gap-2 border-t border-ink/[0.06] pt-5">
              {self ? (
                <p className="text-sm text-muted-foreground">
                  Đây là hồ sơ của bạn: nhờ admin kiểm duyệt khác xét.
                </p>
              ) : (
                <>
                  <Button onClick={() => setApproving(true)} className="rounded-lg">
                    Duyệt
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setRejecting(true)}
                    className="rounded-lg"
                  >
                    Từ chối
                  </Button>
                </>
              )}
            </div>
          )}
        </section>
        <section className={cn(CARD, 'p-5 md:p-7')}>
          <CardTitle>Lịch sử</CardTitle>
          <ol className="mt-4 space-y-3">
            {a.history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-medium text-charcoal">
                  {h.type === 'REGISTER'
                    ? `Hồ sơ v${h.version}`
                    : h.type === 'SUSPEND'
                      ? 'Khóa'
                      : 'Mở khóa'}
                </span>
                {h.type === 'REGISTER' && <ApprovalStatusBadge status={h.status} />}
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(h.decidedAt ?? h.submittedAt)}
                  {h.decidedByName && ` · ${h.decidedByName}`}
                </span>
                {h.reason && <span className="w-full text-xs text-ink/70">Lý do: {h.reason}</span>}
              </li>
            ))}
          </ol>
        </section>
      </div>
      <ConfirmDialog
        open={approving}
        onOpenChange={setApproving}
        title={`Duyệt ${a.displayName} làm cộng tác viên?`}
        description="Người này nhận mã cộng tác viên và lấy được link tiếp thị ngay."
        confirmLabel="Duyệt"
        onConfirm={() => decide.mutateAsync({ decision: 'APPROVE' })}
      />
      <ReasonDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title="Từ chối hồ sơ cộng tác viên?"
        description="Người nộp đọc lý do này và sửa hồ sơ để nộp lại."
        reasons={[
          'Kênh bán hàng không mở được hoặc không có nội dung',
          'Tên hiển thị không phù hợp',
          'Thông tin liên hệ chưa đúng',
        ]}
        confirmLabel="Từ chối"
        onSubmit={(reason) => decide.mutateAsync({ decision: 'REJECT', reason })}
      />
    </div>
  );
}

function Info({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('min-w-0', wide && 'sm:col-span-2')}>
      <dt className="text-xs text-ink/55">{label}</dt>
      <dd className="mt-0.5 font-medium break-words text-charcoal">{children}</dd>
    </div>
  );
}

/** Quản trị › Cộng tác viên (P7, AFF-01): danh sách, số đơn, hoa hồng; khóa hoặc mở */
export function AdminAffiliatesPage() {
  const qc = useQueryClient();
  const me = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? '') as AffiliateStatus | '';
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [search, setSearch] = useState(q);
  const [target, setTarget] = useState<{ a: AdminAffiliate; action: 'SUSPEND' | 'RESTORE' } | null>(
    null,
  );
  const list = useQuery({
    queryKey: [...affiliatesKey, status, q, page],
    queryFn: () =>
      api<Page<AdminAffiliate>>(`${API.market}/admin/affiliates`, {
        query: { status: status || undefined, q: q || undefined, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });
  const suspension = useMutation({
    mutationFn: ({
      a,
      action,
      reason,
    }: {
      a: AdminAffiliate;
      action: 'SUSPEND' | 'RESTORE';
      reason: string;
    }) =>
      api(`${API.approval}/admin/affiliates/${a.id}/suspension`, {
        method: 'POST',
        body: { action, reason },
      }),
    onSuccess: (_, { action }) => {
      toast.success(
        action === 'SUSPEND'
          ? 'Đã khóa. Trạng thái cập nhật sau vài giây.'
          : 'Đã mở khóa. Trạng thái cập nhật sau vài giây.',
      );
      window.setTimeout(() => void qc.invalidateQueries({ queryKey: affiliatesKey }), 1500);
    },
    onError: (e) => toast.error(e.message),
  });
  const update = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if (!('page' in next)) p.delete('page');
    setParams(p, { replace: true });
  };
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ label: 'Kiểm duyệt' }, { label: 'Cộng tác viên' }]}
        title="Cộng tác viên"
        actions={
          <form
            className="relative sm:w-64"
            onSubmit={(e) => {
              e.preventDefault();
              update({ q: search.trim() || null });
            }}
          >
            <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink/40" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tên hiển thị hoặc mã CTV"
              className="h-10 rounded-lg bg-card pl-9"
              aria-label="Tìm cộng tác viên"
            />
          </form>
        }
      />
      <div className={cn(CARD, 'overflow-hidden')}>
        <div
          className="flex flex-wrap gap-2 border-b border-ink/[0.06] px-4 py-3 md:px-5"
          role="radiogroup"
        >
          {(['', 'ACTIVE', 'SUSPENDED', 'PENDING', 'REJECTED'] as const).map((s) => (
            <button
              key={s || 'ALL'}
              type="button"
              role="radio"
              aria-checked={status === s}
              onClick={() => update({ status: s || null })}
              className={cn(
                'rounded-lg border px-3 py-1 text-xs transition',
                status === s
                  ? 'border-navy bg-champagne-50 font-semibold text-navy'
                  : 'border-ink/15 bg-card text-ink/70 hover:border-navy/40 hover:text-navy',
              )}
            >
              {s ? AFFILIATE_STATUS[s].label : 'Tất cả'}
            </button>
          ))}
        </div>
        {list.isPending ? (
          <RowsSkeleton />
        ) : list.isError ? (
          <LoadError message={list.error.message} onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={IconUsers} title="Chưa có cộng tác viên nào" />
        ) : (
          <ul className="divide-y divide-ink/[0.06]">
            {list.data.items.map((a) => {
              const st = AFFILIATE_STATUS[a.status];
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 md:px-5">
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-charcoal">{a.displayName}</span>
                      {a.code && (
                        <span className="font-mono text-xs tracking-wider text-ink/55">
                          {a.code}
                        </span>
                      )}
                      <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {a.orderCount} đơn · hoa hồng {formatMoney(a.commission)} · {a.phone}
                      {a.approvedAt && ` · duyệt ${formatDateTime(a.approvedAt)}`}
                    </div>
                    {a.suspendReason && (
                      <div className="text-xs text-red-700">Lý do khóa: {a.suspendReason}</div>
                    )}
                  </div>
                  {a.userId === me?.id ? (
                    <span className="text-xs text-muted-foreground">Tài khoản của bạn</span>
                  ) : a.status === 'ACTIVE' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => setTarget({ a, action: 'SUSPEND' })}
                    >
                      Khóa
                    </Button>
                  ) : a.status === 'SUSPENDED' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => setTarget({ a, action: 'RESTORE' })}
                    >
                      Mở khóa
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {list.data && list.data.total > 0 && (
          <div className="border-t border-ink/[0.06] px-4 py-3 md:px-5">
            <Pager
              page={page}
              pageSize={PAGE_SIZE}
              total={list.data.total}
              onChange={(p) => update({ page: String(p) })}
            />
          </div>
        )}
      </div>
      <ReasonDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        destructive={target?.action === 'SUSPEND'}
        title={
          target?.action === 'SUSPEND'
            ? `Khóa ${target.a.displayName}?`
            : `Mở khóa ${target?.a.displayName ?? ''}?`
        }
        description={
          target?.action === 'SUSPEND'
            ? 'Link của CTV ngừng tính đơn mới, CTV không rút được tiền. Đơn đã đặt vẫn tính hoa hồng.'
            : 'CTV dùng lại link và rút tiền như bình thường.'
        }
        reasons={
          target?.action === 'SUSPEND'
            ? [
                'Spam link ở nơi không được phép',
                'Quảng cáo sai sự thật về sản phẩm',
                'Có dấu hiệu tự đặt đơn ảo',
              ]
            : ['Đã xác minh, cộng tác viên đã gỡ nội dung vi phạm']
        }
        confirmLabel={target?.action === 'SUSPEND' ? 'Khóa' : 'Mở khóa'}
        onSubmit={(reason) =>
          suspension.mutateAsync({ a: target!.a, action: target!.action, reason })
        }
      />
    </div>
  );
}

function RowsSkeleton() {
  return (
    <div className="divide-y divide-ink/[0.06]">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="hidden h-4 w-48 md:block" />
          <Skeleton className="ml-auto h-8 w-16 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
