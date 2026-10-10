import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, Loader2, MapPin, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { toast } from 'sonner';
import { LoadError } from '@/components/console/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import {
  CANCEL_ACTOR,
  DECLINE_CANCEL_REASONS,
  MoneyRow,
  OrderItemRow,
  OrderTimeline,
  ReasonDialog,
  RefundBadge,
  SELLER_CANCEL_REASONS,
  SHIPPING_SOURCE,
  ShopOrderStatusBadge,
} from '@/components/orders/order-parts';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { API, api } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { SellerOrder } from '@/lib/order-types';
import { sellerOrdersKey } from './orders';

/** Kênh người bán › Đơn hàng › Chi tiết (ORD-03, ORD-05): xác nhận, hủy, trả lời yêu cầu hủy */
export function SellerOrderDetailPage() {
  const { shopOrderId = '' } = useParams();
  const qc = useQueryClient();
  const key = [...sellerOrdersKey, 'detail', shopOrderId];
  const detail = useQuery({
    queryKey: key,
    queryFn: () => api<SellerOrder>(`${API.market}/shops/me/orders/${shopOrderId}`),
  });
  const [dialog, setDialog] = useState<null | 'CANCEL' | 'DECLINE'>(null);

  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: object }) =>
      api<SellerOrder>(`${API.market}/shops/me/orders/${shopOrderId}/${path}`, {
        method: 'POST',
        body,
      }),
    onSuccess: (o, { path }) => {
      qc.setQueryData(key, o);
      void qc.invalidateQueries({ queryKey: sellerOrdersKey, exact: false });
      toast.success(
        {
          confirm: 'Đã xác nhận đơn.',
          cancel: 'Đã hủy đơn, người mua sẽ được hoàn tiền.',
          'cancel-request/accept': 'Đã đồng ý hủy, người mua sẽ được hoàn tiền.',
          'cancel-request/decline': 'Đã từ chối yêu cầu hủy.',
        }[path] ?? 'Đã cập nhật.',
      );
    },
    onError: (e) => {
      toast.error(e.message);
      void detail.refetch();
    },
  });

  if (detail.isPending) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }
  if (detail.isError) {
    return (
      <LoadError
        className="mx-auto max-w-5xl rounded-2xl border bg-card"
        message={detail.error.message}
        onRetry={() => detail.refetch()}
      />
    );
  }
  const o = detail.data;
  const paid = o.paymentStatus === 'PAID';
  const busy = action.isPending;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        crumbs={[{ label: 'Đơn hàng', to: '/kenh-nguoi-ban/don-hang' }, { label: o.code }]}
        title={`Đơn ${o.code}`}
        description={`Đặt lúc ${formatDateTime(o.createdAt)} · thuộc đơn tổng ${o.orderCode}`}
        actions={<ShopOrderStatusBadge status={o.status} paid={paid} className="text-sm" />}
      />

      <ActionBar
        order={o}
        busy={busy}
        onConfirm={() => action.mutate({ path: 'confirm' })}
        onCancel={() => setDialog('CANCEL')}
        onAccept={() => action.mutate({ path: 'cancel-request/accept' })}
        onDecline={() => setDialog('DECLINE')}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className="rounded-2xl border bg-card px-4 md:px-5">
            <div className="border-b py-3 font-semibold text-navy">
              Sản phẩm ({o.items.reduce((a, i) => a + i.quantity, 0)})
            </div>
            <div className="divide-y">
              {o.items.map((it) => (
                <OrderItemRow key={it.id} item={it} />
              ))}
            </div>
          </section>
          {o.history && (
            <section className="rounded-2xl border bg-card px-4 py-4 md:px-5">
              <div className="mb-3 font-semibold text-navy">Lịch sử đơn</div>
              <OrderTimeline history={o.history} paid={paid} />
            </section>
          )}
        </div>
        <div className="space-y-4">
          <section className="rounded-2xl border bg-card px-4 py-4 text-sm md:px-5">
            <div className="mb-2 font-semibold text-navy">Người nhận</div>
            <div className="flex gap-2">
              <UserRound className="mt-0.5 size-4 shrink-0 text-champagne-600" />
              <span>
                {o.receiver.name} · {o.receiver.phone}
              </span>
            </div>
            <div className="mt-1 flex gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-champagne-600" />
              <span className="text-ink/70">{o.receiver.address}</span>
            </div>
          </section>
          <section className="rounded-2xl border bg-card px-4 py-4 md:px-5">
            <div className="mb-1 flex items-center justify-between font-semibold text-navy">
              Tiền của shop <RefundBadge status={o.refundStatus} />
            </div>
            <MoneyRow label="Tiền hàng" value={o.subtotal} />
            <MoneyRow
              label="Voucher của shop"
              hint={o.shopVoucherCode ?? undefined}
              value={o.shopDiscount}
              minus
            />
            <MoneyRow
              label="Phí sàn"
              hint={
                o.platformFeeRate !== null
                  ? `${o.platformFeeRate / 100}% tiền hàng sau voucher shop`
                  : 'Tính khi người mua thanh toán'
              }
              value={o.platformFee ?? 0}
              minus
            />
            <div className="my-2 border-t" />
            {o.sellerAmount !== null ? (
              <MoneyRow label="Dự kiến nhận" value={o.sellerAmount} strong />
            ) : (
              <p className="text-sm text-muted-foreground">Chưa thanh toán.</p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Phí vận chuyển {formatMoney(o.shippingFee)} ({SHIPPING_SOURCE[o.shippingFeeSource]})
              và voucher của sàn không tính vào tiền của shop. Tiền vào ví khi đơn hoàn tất (giai
              đoạn sau).
            </p>
          </section>
        </div>
      </div>

      <ReasonDialog
        open={dialog === 'CANCEL'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Hủy đơn này?"
        description="Người mua được hoàn đủ tiền của đơn này, hàng được cộng lại vào tồn kho."
        reasons={SELLER_CANCEL_REASONS}
        confirmLabel="Hủy đơn"
        onSubmit={(reason) => action.mutateAsync({ path: 'cancel', body: { reason } })}
      />
      <ReasonDialog
        open={dialog === 'DECLINE'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Từ chối yêu cầu hủy?"
        description="Đơn quay lại Chờ giao hàng. Người mua không gửi yêu cầu hủy lần nữa được."
        reasons={DECLINE_CANCEL_REASONS}
        confirmLabel="Từ chối yêu cầu"
        destructive={false}
        onSubmit={(reason) =>
          action.mutateAsync({ path: 'cancel-request/decline', body: { reason } })
        }
      />
    </div>
  );
}

function ActionBar({
  order: o,
  busy,
  onConfirm,
  onCancel,
  onAccept,
  onDecline,
}: {
  order: SellerOrder;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const box =
    'mb-4 flex flex-col gap-3 rounded-2xl border px-4 py-4 sm:flex-row sm:items-center md:px-5';
  if (o.status === 'TO_CONFIRM') {
    return (
      <div className={`${box} border-champagne/50 bg-champagne-50`}>
        <Clock className="hidden size-6 shrink-0 text-champagne-600 sm:block" />
        <div className="min-w-0 flex-1 text-sm text-navy">
          <div className="font-semibold">Người mua đã thanh toán, chờ bạn xác nhận</div>
          {o.confirmBefore && (
            <div className="text-ink/70">
              Hạn xác nhận: <b>{formatDateTime(o.confirmBefore)}</b>. Quá hạn đơn tự hủy và hoàn
              tiền.
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Hủy đơn
          </Button>
          <Button onClick={onConfirm} disabled={busy}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            Xác nhận đơn
          </Button>
        </div>
      </div>
    );
  }
  if (o.status === 'CANCEL_REQUESTED') {
    return (
      <div className={`${box} border-amber-200 bg-amber-50`}>
        <AlertTriangle className="hidden size-6 shrink-0 text-amber-600 sm:block" />
        <div className="min-w-0 flex-1 text-sm text-amber-900">
          <div className="font-semibold">Người mua xin hủy đơn</div>
          <div>Lý do: {o.cancelRequestReason}</div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onDecline} disabled={busy}>
            Từ chối
          </Button>
          <Button onClick={onAccept} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Đồng ý hủy
          </Button>
        </div>
      </div>
    );
  }
  if (o.status === 'CONFIRMED') {
    return (
      <div className={`${box} border-emerald-200 bg-emerald-50`}>
        <CheckCircle2 className="hidden size-6 shrink-0 text-emerald-600 sm:block" />
        <div className="min-w-0 flex-1 text-sm text-emerald-900">
          <div className="font-semibold">Đã xác nhận, chờ giao hàng</div>
          <div>Tạo vận đơn và bàn giao cho đơn vị vận chuyển có ở giai đoạn sau.</div>
        </div>
        <Button variant="outline" onClick={onCancel} disabled={busy}>
          Hủy đơn
        </Button>
      </div>
    );
  }
  if (o.status === 'CANCELLED') {
    return (
      <div className={`${box} bg-ivory`}>
        <div className="min-w-0 flex-1 text-sm text-ink/75">
          <div className="font-semibold text-ink">
            Đã hủy bởi {CANCEL_ACTOR[o.cancelledBy ?? 'SYSTEM']}
            {o.cancelledAt && ` lúc ${formatDateTime(o.cancelledAt)}`}
          </div>
          <div>Lý do: {o.cancelReason}</div>
        </div>
      </div>
    );
  }
  return (
    <div className={`${box} bg-ivory`}>
      <Clock className="hidden size-6 shrink-0 text-ink/40 sm:block" />
      <div className="text-sm text-ink/75">
        {o.paymentStatus === 'PAID'
          ? 'Người mua đã thanh toán, đơn đang được sàn kiểm tra. Bạn chưa cần làm gì.'
          : 'Người mua chưa thanh toán. Bạn chưa cần làm gì, đơn chưa trả sẽ tự hủy khi hết hạn.'}
      </div>
    </div>
  );
}
