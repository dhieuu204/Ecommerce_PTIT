import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Loader2, ShieldCheck, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { Pager } from '@/components/console/pager';
import { PageHeader } from '@/components/layout/page-header';
import { MoneyRow, ReasonDialog, useCountdown } from '@/components/orders/order-parts';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { API, api } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { OrderCheck, OrderCheckStatus } from '@/lib/order-types';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;
const TABS: Array<{ value: OrderCheckStatus; label: string }> = [
  { value: 'PENDING', label: 'Chờ duyệt' },
  { value: 'PASSED', label: 'Đã qua' },
  { value: 'REJECTED', label: 'Từ chối' },
  { value: 'TIMEOUT', label: 'Quá hạn' },
  { value: 'CANCELLED', label: 'Đơn đã hủy' },
];

const STATUS: Record<
  OrderCheckStatus,
  { label: string; tone: 'pending' | 'success' | 'danger' | 'neutral' }
> = {
  PENDING: { label: 'Chờ duyệt', tone: 'pending' },
  PASSED: { label: 'Đã qua', tone: 'success' },
  REJECTED: { label: 'Từ chối', tone: 'danger' },
  TIMEOUT: { label: 'Quá hạn, đã hủy', tone: 'danger' },
  CANCELLED: { label: 'Đơn đã hủy', tone: 'neutral' },
};

const REJECT_REASONS = [
  'Thông tin người nhận bất thường',
  'Nghi ngờ gian lận thanh toán',
  'Số lượng mua bất thường',
];

const checksKey = ['admin', 'order-checks'] as const;

const ruleText = (r: OrderCheck['rulesHit'][number]) =>
  r.rule === 'TOTAL'
    ? `Đơn từ ${formatMoney(r.threshold)}`
    : `Đơn COD từ ${formatMoney(r.threshold)}`;

/** Quản trị › Duyệt đơn lớn (RSK-01, bộ quyền FINANCE) */
export function OrderChecksPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? 'PENDING') as OrderCheckStatus;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const list = useQuery({
    queryKey: [...checksKey, status, page],
    queryFn: () =>
      api<Page<OrderCheck>>(`${API.approval}/admin/order-checks`, {
        query: { status, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
    refetchInterval: status === 'PENDING' ? 30_000 : false,
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ label: 'Tài chính' }, { label: 'Duyệt đơn lớn' }]}
        title="Duyệt đơn lớn"
        description="Đơn chạm luật kiểm tra (mặc định từ 10 triệu) chờ duyệt song song với thanh toán. Không bao giờ tự duyệt: quá hạn thì đơn tự hủy và hoàn tiền."
      />
      <div className="rounded-2xl border bg-card shadow-sm shadow-navy/[0.03]">
        <nav className="-mb-px flex gap-1 overflow-x-auto border-b px-4 pt-2 md:px-5">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() =>
                setParams(t.value === 'PENDING' ? {} : { status: t.value }, { replace: true })
              }
              className={cn(
                'shrink-0 border-b-2 px-3 py-3 text-sm whitespace-nowrap transition',
                status === t.value
                  ? 'border-navy font-semibold text-navy'
                  : 'border-transparent text-muted-foreground hover:text-ink',
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
        {list.isPending ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : list.isError ? (
          <LoadError message={list.error.message} onRetry={() => list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title={status === 'PENDING' ? 'Không có đơn chờ duyệt' : 'Chưa có đơn nào'}
          />
        ) : (
          <>
            <div className="divide-y">
              {list.data.items.map((c) => (
                <CheckRow key={c.id} check={c} />
              ))}
            </div>
            <Pager
              className="border-t px-5 py-3"
              page={page}
              pageSize={PAGE_SIZE}
              total={list.data.total}
              onChange={(p) =>
                setParams({ ...(status !== 'PENDING' ? { status } : {}), page: String(p) })
              }
            />
          </>
        )}
      </div>
    </div>
  );
}

function CheckRow({ check: c }: { check: OrderCheck }) {
  const left = useCountdown(c.status === 'PENDING' ? c.deadline : null);
  const s = STATUS[c.status];
  return (
    <Link
      to={`/quan-tri/duyet-don/${c.id}`}
      className="grid gap-2 px-4 py-4 transition hover:bg-ivory/50 md:grid-cols-[minmax(0,1fr)_10rem_11rem_1.5rem] md:items-center md:gap-4 md:px-5"
    >
      <div className="min-w-0 text-sm">
        <div className="font-semibold text-navy">Đơn {c.orderCode}</div>
        <div className="truncate text-muted-foreground">
          {c.buyer.name} · {c.buyer.email}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-1">
          {c.rulesHit.map((r) => (
            <span key={r.rule} className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700">
              {ruleText(r)}
            </span>
          ))}
        </div>
      </div>
      <div className="text-sm font-bold text-navy md:text-right">{formatMoney(c.amount)}</div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
        {left && <span className="font-medium text-red-600 tabular-nums">còn {left}</span>}
      </div>
      <ChevronRight className="hidden size-4 text-ink/30 md:block" />
    </Link>
  );
}

/** Chi tiết một đơn cần duyệt: đơn, luật đã chạm, lịch sử mua của buyer, nút duyệt/từ chối */
export function OrderCheckDetailPage() {
  const { checkId = '' } = useParams();
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: [...checksKey, 'detail', checkId],
    queryFn: () => api<OrderCheck>(`${API.approval}/admin/order-checks/${checkId}`),
  });
  const [rejecting, setRejecting] = useState(false);
  const decide = useMutation({
    mutationFn: (body: { decision: 'APPROVE' | 'REJECT'; reason?: string }) =>
      api<OrderCheck>(`${API.approval}/admin/order-checks/${checkId}/decision`, {
        method: 'POST',
        body,
      }),
    onSuccess: (c) => {
      qc.setQueryData([...checksKey, 'detail', checkId], c);
      void qc.invalidateQueries({ queryKey: checksKey });
      toast.success(c.status === 'PASSED' ? 'Đã duyệt đơn.' : 'Đã từ chối đơn.');
    },
    onError: (e) => {
      toast.error(e.message);
      void detail.refetch();
    },
  });
  const left = useCountdown(detail.data?.status === 'PENDING' ? detail.data.deadline : null);

  if (detail.isPending) return <Skeleton className="mx-auto h-96 max-w-5xl rounded-2xl" />;
  if (detail.isError) {
    return <LoadError message={detail.error.message} onRetry={() => detail.refetch()} />;
  }
  const c = detail.data;
  const s = STATUS[c.status];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        crumbs={[{ label: 'Duyệt đơn lớn', to: '/quan-tri/duyet-don' }, { label: c.orderCode }]}
        title={`Đơn ${c.orderCode}`}
        description={`Nhận lúc ${formatDateTime(c.createdAt)}`}
        actions={<StatusBadge tone={s.tone}>{s.label}</StatusBadge>}
      />
      {c.status === 'PENDING' ? (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 sm:flex-row sm:items-center md:px-5">
          <div className="min-w-0 flex-1 text-sm text-amber-900">
            <div className="font-semibold">
              Đơn chạm luật: {c.rulesHit.map(ruleText).join(', ')}
            </div>
            <div>
              Còn <b className="tabular-nums">{left ?? '00:00'}</b> để quyết định, quá hạn đơn tự
              hủy.
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setRejecting(true)}
              disabled={decide.isPending}
            >
              Từ chối
            </Button>
            <Button
              onClick={() => decide.mutate({ decision: 'APPROVE' })}
              disabled={decide.isPending}
            >
              {decide.isPending && <Loader2 className="size-4 animate-spin" />}
              Duyệt đơn
            </Button>
          </div>
        </div>
      ) : (
        <div className="mb-4 rounded-2xl border bg-ivory px-4 py-3 text-sm text-ink/75 md:px-5">
          {c.decidedByName ? `${c.decidedByName} · ` : ''}
          {formatDateTime(c.decidedAt)}
          {c.reason && <> · Lý do: {c.reason}</>}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          {c.order?.shopOrders.map((so) => (
            <section key={so.shopOrderId} className="rounded-2xl border bg-card px-4 py-4 md:px-5">
              <div className="mb-2 flex justify-between gap-2 font-semibold text-navy">
                <span>{so.shopName}</span>
                <span className="text-xs font-normal text-muted-foreground">{so.code}</span>
              </div>
              <ul className="divide-y text-sm">
                {so.items.map((it, i) => (
                  <li key={i} className="flex justify-between gap-3 py-2">
                    <span className="min-w-0">
                      {it.name}
                      {it.variant && <span className="text-muted-foreground"> · {it.variant}</span>}
                      <span className="text-muted-foreground"> × {it.quantity}</span>
                    </span>
                    <span className="shrink-0 font-medium">
                      {formatMoney(it.price * it.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 border-t pt-2">
                <MoneyRow label="Buyer trả cho shop này" value={so.total} />
              </div>
            </section>
          ))}
        </div>
        <div className="space-y-4">
          <section className="rounded-2xl border bg-card px-4 py-4 text-sm md:px-5">
            <div className="mb-2 flex items-center gap-2 font-semibold text-navy">
              <UserRound className="size-4" /> Người mua
            </div>
            <div className="font-medium">{c.buyer.name}</div>
            <div className="text-muted-foreground">{c.buyer.email}</div>
            <div className="mt-1 text-muted-foreground">
              Nhận hàng tại: {c.order?.shippingProvince}
            </div>
            {c.buyerStats && (
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-ivory/70 p-3 text-center">
                <Stat label="Đơn trước" value={String(c.buyerStats.orders)} />
                <Stat label="Tổng tiền" value={formatMoney(c.buyerStats.total)} />
                <Stat
                  label="Bị từ chối"
                  value={String(c.buyerStats.rejected)}
                  warn={c.buyerStats.rejected > 0}
                />
              </div>
            )}
          </section>
          <section className="rounded-2xl border bg-card px-4 py-4 md:px-5">
            <MoneyRow label="Tổng đơn" value={c.amount} strong />
            <div className="text-xs text-muted-foreground">Thanh toán: {c.paymentMethod}</div>
          </section>
        </div>
      </div>

      <ReasonDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title="Từ chối đơn này?"
        description="Mọi đơn con bị hủy; nếu người mua đã trả, sàn hoàn đủ tiền."
        reasons={REJECT_REASONS}
        confirmLabel="Từ chối đơn"
        onSubmit={(reason) => decide.mutateAsync({ decision: 'REJECT', reason })}
      />
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <div className={cn('text-sm font-bold', warn ? 'text-red-600' : 'text-navy')}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
