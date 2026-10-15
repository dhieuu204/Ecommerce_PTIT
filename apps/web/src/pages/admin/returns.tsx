import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronRight, Search, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { Pager } from '@/components/console/pager';
import { inputClass } from '@/components/form-bits';
import { PageHeader } from '@/components/layout/page-header';
import { ReasonDialog } from '@/components/orders/order-parts';
import {
  RETURN_REASONS,
  RETURN_STATUS,
  ReturnStatusBadge,
} from '@/components/returns/return-parts';
import { ActionBar, ReturnBody } from '@/components/returns/return-view';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { API, api } from '@/lib/api';
import type { ReturnRequest, ReturnStatus } from '@/lib/after-sales-types';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;
const adminReturnsKey = ['admin', 'returns'] as const;
const FILTERS: Array<ReturnStatus | 'ALL'> = [
  'ALL',
  'REQUESTED',
  'SHIPPING_BACK',
  'RECEIVED',
  'DISPUTED',
  'REFUNDING',
  'REFUNDED',
  'CLOSED',
  'CANCELLED',
];

/** Quản trị › Trả hàng (RET-01..04, bộ quyền SUPPORT): tra cứu mọi yêu cầu, xác nhận kiện trả thất lạc */
export function AdminReturnsPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? 'ALL') as ReturnStatus | 'ALL';
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [text, setText] = useState(q);
  const list = useQuery({
    queryKey: [...adminReturnsKey, status, q, page],
    queryFn: () =>
      api<Page<ReturnRequest>>(`${API.market}/admin/returns`, {
        query: { status: status === 'ALL' ? undefined : status, q, page, pageSize: PAGE_SIZE },
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
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ label: 'Hỗ trợ' }, { label: 'Trả hàng' }]}
        title="Yêu cầu trả hàng"
        description="Tra cứu yêu cầu của mọi shop. Tranh chấp phân xử ở trang Tranh chấp; vận đơn trả bấm các mốc ở GHN mô phỏng."
      />
      <div className="rounded-2xl border bg-card shadow-sm shadow-navy/[0.03]">
        <div className="flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-center md:px-5">
          <form
            className="relative md:w-72"
            onSubmit={(e) => {
              e.preventDefault();
              set({ q: text.trim() || null });
            }}
          >
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink/40" />
            <input
              className={cn(inputClass, 'pl-9')}
              placeholder="Mã yêu cầu hoặc mã đơn con"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </form>
          <div className="flex gap-2 overflow-x-auto pb-1" role="radiogroup">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={status === f}
                onClick={() => set({ status: f === 'ALL' ? null : f })}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1 text-xs transition',
                  status === f
                    ? 'border-navy bg-navy text-white'
                    : 'border-ivory-200 bg-card text-ink/70 hover:border-champagne',
                )}
              >
                {f === 'ALL' ? 'Tất cả' : RETURN_STATUS[f].label}
              </button>
            ))}
          </div>
        </div>
        {list.isPending ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : list.isError ? (
          <LoadError message={list.error.message} onRetry={() => list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={Undo2} title="Không có yêu cầu trả hàng nào" />
        ) : (
          <>
            <ul className="divide-y">
              {list.data.items.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/quan-tri/tra-hang/${r.id}`}
                    className="flex flex-wrap items-center gap-3 px-4 py-3.5 transition hover:bg-ivory/50 md:px-5"
                  >
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-navy">{r.code}</span>
                        <ReturnStatusBadge status={r.status} />
                        {r.shipment?.status === 'LOST' && r.status === 'SHIPPING_BACK' && (
                          <span className="text-xs font-semibold text-red-600">
                            Kiện trả thất lạc
                          </span>
                        )}
                        {r.actions.canResolveFailedShipment && (
                          <span className="text-xs font-semibold text-red-600">
                            Vận đơn trả lỗi quá hạn
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.shop.name} · {r.buyer?.name} · {RETURN_REASONS[r.reason]} ·{' '}
                        {formatDateTime(r.createdAt)}
                      </div>
                    </div>
                    <div className="text-right text-sm font-semibold text-navy">
                      {formatMoney(r.decidedRefund ?? r.refundAmount)}
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
              onChange={(p) => set({ page: String(p) })}
            />
          </>
        )}
      </div>
    </div>
  );
}

/** Chi tiết một yêu cầu trả hàng; xác nhận kiện trả thất lạc khi GHN báo */
export function AdminReturnDetailPage() {
  const { returnId = '' } = useParams();
  const qc = useQueryClient();
  const key = [...adminReturnsKey, 'detail', returnId];
  const detail = useQuery({
    queryKey: key,
    queryFn: () => api<ReturnRequest>(`${API.market}/admin/returns/${returnId}`),
  });
  const [lost, setLost] = useState(false);
  const [failed, setFailed] = useState<'CANCEL' | 'REFUND' | null>(null);
  const resolveFailed = useMutation({
    mutationFn: (body: { result: 'CANCEL' | 'REFUND'; note: string }) =>
      api<ReturnRequest>(`${API.market}/admin/returns/${returnId}/failed-shipment`, {
        method: 'POST',
        body,
      }),
    onSuccess: (r) => {
      qc.setQueryData(key, r);
      void qc.invalidateQueries({ queryKey: adminReturnsKey });
      toast.success(
        r.status === 'CANCELLED'
          ? 'Đã hủy yêu cầu: đơn hoàn tất, shop nhận tiền.'
          : 'Đã chuyển hoàn tiền cho người mua (không cần gửi trả).',
      );
    },
    onError: (e) => toast.error(e.message),
  });
  const confirmLost = useMutation({
    mutationFn: (note: string) =>
      api<ReturnRequest>(`${API.market}/admin/returns/${returnId}/lost`, {
        method: 'POST',
        body: { note },
      }),
    onSuccess: (r) => {
      qc.setQueryData(key, r);
      void qc.invalidateQueries({ queryKey: adminReturnsKey });
      toast.success('Đã xác nhận thất lạc: người mua được hoàn đủ, sàn chịu.');
    },
    onError: (e) => toast.error(e.message),
  });

  if (detail.isPending) return <Skeleton className="mx-auto h-96 max-w-5xl rounded-2xl" />;
  if (detail.isError) {
    return (
      <LoadError
        className="mx-auto max-w-5xl rounded-2xl border bg-card"
        message={detail.error.message}
        onRetry={() => detail.refetch()}
      />
    );
  }
  const r = detail.data;
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        crumbs={[{ label: 'Trả hàng', to: '/quan-tri/tra-hang' }, { label: r.code }]}
        title={`Yêu cầu ${r.code}`}
        description={`Đơn ${r.shopOrderCode} · ${r.shop.name} · người mua ${r.buyer?.name ?? ''}`}
        actions={
          <div className="flex items-center gap-2">
            <ReturnStatusBadge status={r.status} className="text-sm" />
            <Button asChild variant="outline" size="sm">
              <Link to={`/quan-tri/don-hang/${r.orderId}`}>Xem đơn</Link>
            </Button>
          </div>
        }
      />
      {r.actions.canConfirmLost && (
        <ActionBar
          tone="danger"
          icon={AlertTriangle}
          title="GHN báo kiện trả thất lạc/hư hỏng"
          text="Xác nhận sau khi đã kiểm tra với GHN: người mua được hoàn đủ, shop không bị trừ tiền (sàn chịu, tự khiếu nại GHN)."
          actions={<Button onClick={() => setLost(true)}>Xác nhận thất lạc</Button>}
        />
      )}
      {r.actions.canResolveFailedShipment && (
        <ActionBar
          tone="danger"
          icon={AlertTriangle}
          title="Vận đơn trả bị GHN từ chối, đã quá hạn giao hàng trả"
          text="Người mua chưa bấm tạo lại vận đơn. Liên hệ người mua rồi chọn: hủy yêu cầu (đơn hoàn tất, shop nhận tiền) hoặc hoàn tiền không cần gửi trả (shop bị trừ như khi tự chọn cách này)."
          actions={
            <>
              <Button variant="outline" onClick={() => setFailed('CANCEL')}>
                Hủy yêu cầu
              </Button>
              <Button onClick={() => setFailed('REFUND')}>Hoàn tiền, không cần gửi trả</Button>
            </>
          }
        />
      )}
      {r.status === 'DISPUTED' && (
        <ActionBar
          tone="warn"
          icon={AlertTriangle}
          title="Yêu cầu đang tranh chấp"
          text={
            <>
              Phân xử ở trang{' '}
              <Link to="/quan-tri/tranh-chap" className="font-semibold underline">
                Tranh chấp
              </Link>
              .
            </>
          }
        />
      )}
      <ReturnBody ret={r} viewer="ADMIN" />
      <ReasonDialog
        open={lost}
        onOpenChange={setLost}
        title="Xác nhận kiện trả thất lạc?"
        description={`Người mua được hoàn ${formatMoney(r.refundAmount)}; sàn chịu khoản này.`}
        reasons={['GHN xác nhận thất lạc', 'GHN xác nhận hư hỏng khi vận chuyển']}
        confirmLabel="Xác nhận"
        destructive={false}
        onSubmit={(note) => confirmLost.mutateAsync(note)}
      />
      <ReasonDialog
        open={failed !== null}
        onOpenChange={(o) => !o && setFailed(null)}
        title={failed === 'REFUND' ? 'Hoàn tiền không cần gửi trả?' : 'Hủy yêu cầu trả hàng?'}
        description={
          failed === 'REFUND'
            ? `Người mua được hoàn ${formatMoney(r.refundAmount)}, giữ lại hàng; shop bị trừ phần tiền hàng tương ứng.`
            : 'Yêu cầu bị hủy, đơn hoàn tất và tiền về cho shop.'
        }
        reasons={['Đã liên hệ người mua nhưng không phản hồi', 'Người mua đồng ý hủy yêu cầu']}
        confirmLabel="Xác nhận"
        destructive={failed === 'CANCEL'}
        onSubmit={(note) => resolveFailed.mutateAsync({ result: failed!, note })}
      />
    </div>
  );
}
