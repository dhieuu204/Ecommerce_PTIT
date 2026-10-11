import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, ReceiptText, Search, TriangleAlert, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { Pager } from '@/components/console/pager';
import { PageHeader } from '@/components/layout/page-header';
import {
  CANCEL_ACTOR,
  MoneyRow,
  OrderItemRow,
  OrderTimeline,
  ReasonDialog,
  RefundBadge,
  ShopOrderStatusBadge,
} from '@/components/orders/order-parts';
import { ShipmentPanel } from '@/components/orders/shipment-parts';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebounced } from '@/hooks/use-debounced';
import { API, api } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { AdminOrderPayments, AdminTab, Order, ShopOrder } from '@/lib/order-types';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';
import { REFUND_STATUS } from './refunds';

const PAGE_SIZE = 20;
const TABS: Array<{ value: AdminTab; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'UNPAID', label: 'Chờ thanh toán' },
  { value: 'PROCESSING', label: 'Đang xử lý' },
  { value: 'TO_SHIP', label: 'Chờ giao hàng' },
  { value: 'SHIPPING', label: 'Đang giao' },
  { value: 'COMPLETED', label: 'Hoàn tất' },
  { value: 'INCIDENT', label: 'Sự cố GHN' },
  { value: 'CANCELLED', label: 'Đã hủy' },
];
const ordersKey = ['admin', 'orders'] as const;

/** Quản trị › Đơn hàng (ORD-02, SHIP-04, bộ quyền SUPPORT): tra cứu theo mã đơn, xác nhận sự cố GHN */
export function AdminOrdersPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') ?? 'ALL') as AdminTab;
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
  useEffect(() => {
    if (debounced !== q) update({ q: debounced || null });
  }, [debounced]);

  const list = useQuery({
    queryKey: [...ordersKey, { tab, q, page }],
    queryFn: () =>
      api<Page<Order>>(`${API.market}/admin/orders`, {
        query: { tab, q, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ label: 'Hỗ trợ' }, { label: 'Đơn hàng' }]}
        title="Đơn hàng"
        description="Tra cứu đơn của mọi người mua. Hủy đơn khi được người mua/shop nhờ (bắt buộc ghi lý do)."
      />
      <div className="rounded-2xl border bg-card shadow-sm shadow-navy/[0.03]">
        <div className="flex flex-col gap-3 border-b px-4 pt-2 md:flex-row md:items-end md:justify-between md:px-5">
          <nav className="-mb-px flex gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => update({ tab: t.value === 'ALL' ? null : t.value })}
                className={cn(
                  'shrink-0 border-b-2 px-3 py-3 text-sm whitespace-nowrap transition',
                  tab === t.value
                    ? 'border-navy font-semibold text-navy'
                    : 'border-transparent text-muted-foreground hover:text-ink',
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="relative pb-3 md:w-72 md:pb-2.5">
            <Search className="pointer-events-none absolute top-[18px] left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Mã đơn tổng hoặc đơn con…"
              className="h-9 rounded-full bg-white pr-8 pl-9"
            />
            {search && (
              <button
                type="button"
                className="absolute top-[18px] right-2.5 -translate-y-1/2 text-muted-foreground"
                onClick={() => setSearch('')}
                aria-label="Xóa tìm kiếm"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
        {list.isPending ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : list.isError ? (
          <LoadError message={list.error.message} onRetry={() => list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={ReceiptText} title="Không có đơn nào" />
        ) : (
          <>
            <div className="divide-y">
              {list.data.items.map((o) => (
                <Link
                  key={o.id}
                  to={`/quan-tri/don-hang/${o.id}`}
                  className="grid gap-2 px-4 py-4 transition hover:bg-ivory/50 md:grid-cols-[minmax(0,1fr)_9rem_minmax(0,14rem)_1.5rem] md:items-center md:gap-4 md:px-5"
                >
                  <div className="min-w-0 text-sm">
                    <div className="font-semibold text-navy">{o.code}</div>
                    <div className="truncate text-muted-foreground">
                      {o.buyer?.name} · {formatDateTime(o.createdAt)}
                    </div>
                  </div>
                  <div className="text-sm font-bold text-navy md:text-right">
                    {formatMoney(o.total)}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {o.paymentStatus === 'UNPAID' && o.status !== 'CANCELLED' && (
                      <StatusBadge tone="pending">Chưa trả</StatusBadge>
                    )}
                    {o.shopOrders.map((so) => (
                      <ShopOrderStatusBadge
                        key={so.id}
                        status={so.status}
                        paid={o.paymentStatus !== 'UNPAID'}
                      />
                    ))}
                  </div>
                  <ChevronRight className="hidden size-4 text-ink/30 md:block" />
                </Link>
              ))}
            </div>
            <Pager
              className="border-t px-5 py-3"
              page={page}
              pageSize={PAGE_SIZE}
              total={list.data.total}
              onChange={(p) => update({ page: String(p) })}
            />
          </>
        )}
      </div>
    </div>
  );
}

const PAYMENT_STATUS = {
  PENDING: 'Đang chờ',
  SUCCEEDED: 'Thành công',
  FAILED: 'Thất bại',
  UNKNOWN: 'Chưa rõ',
} as const;

/** Chi tiết đơn cho admin: đơn con, lịch sử, thanh toán và hoàn tiền (payment-service) */
export function AdminOrderDetailPage() {
  const { orderId = '' } = useParams();
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: [...ordersKey, 'detail', orderId],
    queryFn: () => api<Order>(`${API.market}/admin/orders/${orderId}`),
  });
  const payments = useQuery({
    queryKey: [...ordersKey, 'payments', orderId],
    queryFn: () => api<AdminOrderPayments>(`${API.payment}/admin/orders/${orderId}/payments`),
    retry: false,
  });
  const [target, setTarget] = useState<ShopOrder | null>(null);
  const [incidentTarget, setIncidentTarget] = useState<ShopOrder | null>(null);
  const incident = useMutation({
    mutationFn: ({ so, note }: { so: ShopOrder; note: string }) =>
      api<Order>(`${API.market}/admin/orders/${orderId}/shop-orders/${so.id}/incident`, {
        method: 'POST',
        body: { note },
      }),
    onSuccess: (o) => {
      qc.setQueryData([...ordersKey, 'detail', orderId], o);
      void qc.invalidateQueries({ queryKey: ordersKey });
      void payments.refetch();
      toast.success('Đã xác nhận sự cố. Người mua được hoàn tiền, seller được đền vào ví.');
    },
    onError: (e) => toast.error(e.message),
  });
  const cancel = useMutation({
    mutationFn: ({ so, reason }: { so: ShopOrder; reason: string }) =>
      api<Order>(`${API.market}/admin/orders/${orderId}/shop-orders/${so.id}/cancel`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess: (o) => {
      qc.setQueryData([...ordersKey, 'detail', orderId], o);
      void qc.invalidateQueries({ queryKey: ordersKey });
      toast.success('Đã hủy.');
    },
    onError: (e) => toast.error(e.message),
  });

  if (detail.isPending) return <Skeleton className="mx-auto h-96 max-w-5xl rounded-2xl" />;
  if (detail.isError) {
    return <LoadError message={detail.error.message} onRetry={() => detail.refetch()} />;
  }
  const o = detail.data;
  const paid = o.paymentStatus !== 'UNPAID';

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        crumbs={[{ label: 'Đơn hàng', to: '/quan-tri/don-hang' }, { label: o.code }]}
        title={`Đơn ${o.code}`}
        description={`${o.buyer?.name} (${o.buyer?.email}) · ${formatDateTime(o.createdAt)}`}
        actions={
          o.paymentStatus === 'COD' ? (
            <StatusBadge tone="info">Thanh toán khi nhận hàng (COD)</StatusBadge>
          ) : (
            <StatusBadge tone={paid ? 'success' : 'pending'}>
              {paid ? 'Đã thanh toán' : 'Chưa thanh toán'}
            </StatusBadge>
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {o.shopOrders.map((so) => (
            <section key={so.id} className="rounded-2xl border bg-card px-4 py-4 md:px-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-navy">
                  {so.shop.name}{' '}
                  <span className="text-xs font-normal text-muted-foreground">{so.code}</span>
                </div>
                <div className="flex gap-1.5">
                  <RefundBadge status={so.refundStatus} />
                  <ShopOrderStatusBadge status={so.status} paid={paid} />
                </div>
              </div>
              <div className="divide-y">
                {so.items.map((it) => (
                  <OrderItemRow key={it.id} item={it} />
                ))}
              </div>
              {so.status === 'CANCELLED' && (
                <p className="mt-2 rounded-lg bg-ivory px-3 py-2 text-sm text-ink/70">
                  Hủy bởi {CANCEL_ACTOR[so.cancelledBy ?? 'SYSTEM']}: {so.cancelReason}
                </p>
              )}
              {so.status === 'INCIDENT' && (
                <div className="mt-2 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900 sm:flex-row sm:items-center">
                  <TriangleAlert className="hidden size-5 shrink-0 sm:block" />
                  <span className="min-w-0 flex-1">
                    GHN báo kiện hàng thất lạc / hư hỏng. Xác minh với GHN rồi xác nhận: người mua
                    trả trước được hoàn tiền, seller được đền tiền hàng.
                  </span>
                  <Button size="sm" onClick={() => setIncidentTarget(so)}>
                    Xác nhận sự cố
                  </Button>
                </div>
              )}
              {so.status === 'INCIDENT_RESOLVED' && so.incidentNote && (
                <p className="mt-2 rounded-lg bg-ivory px-3 py-2 text-sm text-ink/70">
                  Đã xác nhận sự cố: {so.incidentNote}
                </p>
              )}
              {so.shipment && <ShipmentPanel shipment={so.shipment} forSeller className="mt-3" />}
              {so.history && (
                <details className="mt-3 rounded-xl bg-ivory/50 px-4 py-3">
                  <summary className="cursor-pointer text-sm font-medium text-navy">
                    Lịch sử
                  </summary>
                  <div className="mt-3">
                    <OrderTimeline history={so.history} paid={paid} />
                  </div>
                </details>
              )}
              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Buyer trả: <b className="text-navy">{formatMoney(so.total)}</b>
                </span>
                {ADMIN_CANCELLABLE.includes(so.status) && (
                  <Button variant="outline" size="sm" onClick={() => setTarget(so)}>
                    {paid ? 'Hủy đơn con' : 'Hủy cả đơn'}
                  </Button>
                )}
              </div>
            </section>
          ))}
        </div>
        <div className="space-y-4">
          <section className="rounded-2xl border bg-card px-4 py-4 text-sm md:px-5">
            <div className="mb-1 font-semibold text-navy">Người nhận</div>
            <div>
              {o.receiver.name} · {o.receiver.phone}
            </div>
            <div className="text-muted-foreground">{o.receiver.address}</div>
          </section>
          <section className="rounded-2xl border bg-card px-4 py-4 md:px-5">
            <MoneyRow label="Tiền hàng" value={o.subtotal} />
            <MoneyRow label="Phí vận chuyển" value={o.shippingFee} />
            <MoneyRow label="Voucher shop" value={o.shopDiscount} minus />
            <MoneyRow
              label="Voucher sàn"
              hint={o.platformVoucherCode ?? undefined}
              value={o.platformDiscount}
              minus
            />
            <div className="my-2 border-t" />
            <MoneyRow label="Tổng" value={o.total} strong />
          </section>
          <section className="rounded-2xl border bg-card px-4 py-4 text-sm md:px-5">
            <div className="mb-2 font-semibold text-navy">Thanh toán và hoàn tiền</div>
            {payments.isPending ? (
              <Skeleton className="h-20 rounded-xl" />
            ) : payments.isError ? (
              <p className="text-muted-foreground">{payments.error.message}</p>
            ) : (
              <div className="space-y-3">
                {payments.data.payments.length === 0 && (
                  <p className="text-muted-foreground">Chưa có lần thanh toán nào.</p>
                )}
                {payments.data.payments.map((p) => (
                  <div key={p.id} className="rounded-lg bg-ivory/60 px-3 py-2">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">
                        Lần {p.attempt} · {p.gateway === 'MOCK' ? 'MÔ PHỎNG' : 'VNPay'}
                      </span>
                      <span>{PAYMENT_STATUS[p.status]}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.ref} · {formatMoney(p.amount)}
                      {p.transactionNo && ` · GD ${p.transactionNo}`}
                      {p.status === 'SUCCEEDED' &&
                        !p.applied &&
                        ' · trả muộn/trùng, đã tạo khoản hoàn'}
                    </div>
                  </div>
                ))}
                {payments.data.earnings.length > 0 && (
                  <div className="border-t pt-2">
                    <div className="mb-1 text-xs font-medium text-muted-foreground">
                      Phân bổ từng đơn con
                    </div>
                    {payments.data.earnings.map((e) => (
                      <div key={e.shopOrderId} className="flex justify-between gap-2 text-xs">
                        <span>{e.shopOrderCode}</span>
                        <span className="text-right">
                          buyer {formatMoney(e.buyerPaid)} · phí sàn {formatMoney(e.platformFee)} ·
                          shop {formatMoney(e.sellerAmount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {payments.data.refunds.map((r) => (
                  <div key={r.id} className="flex justify-between gap-2 border-t pt-2 text-xs">
                    <span>Hoàn {formatMoney(r.amount)}</span>
                    <span>{REFUND_STATUS[r.status].label}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
      <ReasonDialog
        open={!!target}
        onOpenChange={(open) => !open && setTarget(null)}
        title={paid ? `Hủy đơn con ${target?.code ?? ''}?` : 'Hủy cả đơn?'}
        description={
          o.paymentStatus === 'COD'
            ? 'Đơn con bị hủy, vận đơn GHN (nếu có) được hủy, hàng cộng lại kho. Thao tác được ghi nhật ký.'
            : paid
              ? 'Người mua được hoàn tiền của đơn con này. Thao tác được ghi nhật ký.'
              : 'Đơn chưa thanh toán nên hủy cả đơn tổng. Thao tác được ghi nhật ký.'
        }
        reasons={[
          'Người mua nhờ hủy qua tổng đài',
          'Shop báo không giao được',
          'Đơn có dấu hiệu bất thường',
        ]}
        confirmLabel="Hủy đơn"
        onSubmit={(reason) => cancel.mutateAsync({ so: target!, reason })}
      />
      <ReasonDialog
        open={!!incidentTarget}
        onOpenChange={(open) => !open && setIncidentTarget(null)}
        title={`Xác nhận sự cố đơn ${incidentTarget?.code ?? ''}?`}
        description="Ghi rõ kết quả xác minh với GHN. Tiền tự xử lý theo quy định; thao tác được ghi nhật ký."
        reasons={['GHN xác nhận thất lạc hàng', 'GHN xác nhận hàng bị hư hỏng']}
        confirmLabel="Xác nhận sự cố"
        destructive={false}
        onSubmit={(note) => incident.mutateAsync({ so: incidentTarget!, note })}
      />
    </div>
  );
}

/** Trạng thái admin còn hủy được (trước khi GHN lấy hàng) */
const ADMIN_CANCELLABLE: ShopOrder['status'][] = [
  'PENDING',
  'TO_CONFIRM',
  'CONFIRMED',
  'CANCEL_REQUESTED',
];
