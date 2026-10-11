import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, PlayCircle, ScanSearch } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { ReasonDialog } from '@/components/orders/order-parts';
import { SimulatedChip } from '@/components/orders/shipment-parts';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { API, api } from '@/lib/api';
import type {
  VnpayExceptionKind,
  VnpayPaymentException,
  VnpayReconciliation,
} from '@/lib/finance-types';
import { formatDateTime, formatMoney } from '@/lib/format';
import { REFUND_REASON, REFUND_STATUS } from './refunds';

const key = ['admin', 'vnpay-reconciliation'] as const;

const KIND: Record<
  VnpayExceptionKind,
  { label: string; tone: 'danger' | 'pending'; text: string }
> = {
  MISMATCH: {
    label: 'Lệch khi tra cứu lại',
    tone: 'danger',
    text: 'Sàn ghi thành công nhưng VNPay tra cứu lại báo khác (trạng thái hoặc số tiền).',
  },
  UNKNOWN: {
    label: 'Chưa rõ kết quả',
    tone: 'pending',
    text: 'Hệ thống đang tự tra cứu mỗi phút, chưa cần xử lý.',
  },
  LATE_OR_DUPLICATE: {
    label: 'Tiền về muộn / trả trùng',
    tone: 'pending',
    text: 'Tiền về sau khi đơn hết hạn hoặc đã được trả; hệ thống đã tạo khoản hoàn.',
  },
};

/**
 * Quản trị › Đối soát VNPay (PAY-05, bộ quyền FINANCE): job mỗi đêm tra cứu lại giao dịch thành công gần
 * đây; trang này gom các khoản cần xem để admin ghi chú xử lý. Có nút chạy ngay.
 */
export function VnpayReconciliationPage() {
  const qc = useQueryClient();
  const view = useQuery({
    queryKey: key,
    queryFn: () => api<VnpayReconciliation>(`${API.payment}/admin/vnpay-reconciliation`),
  });
  const run = useMutation({
    mutationFn: () =>
      api<VnpayReconciliation & { checked: number; mismatched: number }>(
        `${API.payment}/admin/vnpay-reconciliation/run`,
        { method: 'POST' },
      ),
    onSuccess: (r) => {
      qc.setQueryData(key, r);
      toast.success(`Đã tra cứu lại ${r.checked} giao dịch, ${r.mismatched} khoản lệch.`);
    },
    onError: (e) => toast.error(e.message),
  });
  const [target, setTarget] = useState<VnpayPaymentException | null>(null);
  const note = useMutation({
    mutationFn: ({ p, text }: { p: VnpayPaymentException; text: string }) =>
      api<VnpayPaymentException>(
        `${API.payment}/admin/vnpay-reconciliation/payments/${p.paymentId}/note`,
        { method: 'POST', body: { note: text } },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key });
      toast.success('Đã ghi chú, khoản này đánh dấu đã xử lý.');
    },
    onError: (e) => toast.error(e.message),
  });

  const simulated = view.data?.payments
    .concat(view.data.resolved)
    .some((p) => p.gateway === 'MOCK');

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ label: 'Tài chính' }, { label: 'Đối soát VNPay' }]}
        title={
          <span className="flex flex-wrap items-center gap-2">
            Đối soát VNPay {simulated && <SimulatedChip />}
          </span>
        }
        description="Mỗi đêm lúc 2 giờ, hệ thống tra cứu lại các giao dịch thành công 2 ngày gần nhất. Khoản lệch, chưa rõ hoặc tiền về muộn hiện ở đây."
        actions={
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <PlayCircle className="size-4" />
            )}
            Chạy đối soát ngay
          </Button>
        }
      />
      {view.isPending ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : view.isError ? (
        <LoadError
          className="rounded-2xl border bg-card"
          message={view.error.message}
          onRetry={() => view.refetch()}
        />
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Lần đối soát gần nhất:{' '}
            <b className="text-ink">
              {view.data.lastRunAt ? formatDateTime(view.data.lastRunAt) : 'chưa chạy lần nào'}
            </b>
          </p>

          <section className="rounded-2xl border bg-card shadow-sm shadow-navy/[0.03]">
            <header className="border-b px-4 py-3 font-semibold text-navy md:px-5">
              Giao dịch cần xem ({view.data.payments.length})
            </header>
            {view.data.payments.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="Không có khoản lệch"
                text="Mọi giao dịch đã tra cứu đều khớp với VNPay."
              />
            ) : (
              <ul className="divide-y">
                {view.data.payments.map((p) => (
                  <PaymentRow
                    key={p.paymentId}
                    p={p}
                    onNote={p.kind === 'UNKNOWN' ? undefined : () => setTarget(p)}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border bg-card shadow-sm shadow-navy/[0.03]">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 md:px-5">
              <span className="font-semibold text-navy">
                Khoản hoàn chưa rõ / chờ hoàn tay ({view.data.refunds.length})
              </span>
              <Link to="/quan-tri/hoan-tien" className="text-sm text-champagne-600 hover:text-navy">
                Mở trang Hoàn tiền
              </Link>
            </header>
            {view.data.refunds.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="Không có khoản hoàn cần xem" />
            ) : (
              <ul className="divide-y">
                {view.data.refunds.map((r) => (
                  <li
                    key={r.refundId}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm md:px-5"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-navy">{r.orderCode ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">
                        {REFUND_REASON[r.reason]} · {formatDateTime(r.createdAt)}
                        {r.lastError && <span className="text-red-600"> · {r.lastError}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <b className="tabular-nums text-navy">{formatMoney(r.amount)}</b>
                      <StatusBadge tone={REFUND_STATUS[r.status].tone}>
                        {REFUND_STATUS[r.status].label}
                      </StatusBadge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {view.data.resolved.length > 0 && (
            <section className="rounded-2xl border bg-card">
              <header className="border-b px-4 py-3 font-semibold text-navy md:px-5">
                Đã xử lý gần đây
              </header>
              <ul className="divide-y">
                {view.data.resolved.map((p) => (
                  <PaymentRow key={p.paymentId} p={p} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      <ReasonDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title={`Ghi chú xử lý ${target?.ref ?? ''}`}
        description="Ghi rõ đã kiểm tra gì (sao kê, trang merchant VNPay...) và kết quả. Thao tác được ghi nhật ký."
        reasons={[
          'Đã đối chiếu sao kê, tiền đã về đúng',
          'VNPay xác nhận giao dịch thành công',
          'Đã hoàn tiền cho người mua',
        ]}
        confirmLabel="Lưu ghi chú"
        destructive={false}
        onSubmit={(text) => note.mutateAsync({ p: target!, text })}
      />
    </div>
  );
}

function PaymentRow({ p, onNote }: { p: VnpayPaymentException; onNote?: () => void }) {
  const k = KIND[p.kind];
  const resolved = p.reconcileStatus === 'RESOLVED';
  return (
    <li className="grid gap-2 px-4 py-3.5 text-sm md:grid-cols-[minmax(0,1fr)_8rem_auto] md:items-center md:gap-4 md:px-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/quan-tri/don-hang/${p.orderId}`}
            className="font-semibold text-navy hover:underline"
          >
            {p.orderCode ?? p.orderId}
          </Link>
          <span className="font-mono text-xs text-muted-foreground">{p.ref}</span>
          {resolved ? (
            <StatusBadge tone="success">Đã xử lý</StatusBadge>
          ) : (
            <StatusBadge tone={k.tone}>{k.label}</StatusBadge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {resolved ? p.reconcileNote : k.text}
          {p.paidAt && <> · trả lúc {formatDateTime(p.paidAt)}</>}
          {p.transactionNo && <> · GD {p.transactionNo}</>}
        </div>
      </div>
      <b className="tabular-nums text-navy md:text-right">{formatMoney(p.amount)}</b>
      <div className="md:text-right">
        {onNote && !resolved && (
          <Button size="sm" variant="outline" onClick={onNote}>
            <ScanSearch className="size-4" /> Ghi chú xử lý
          </Button>
        )}
      </div>
    </li>
  );
}
