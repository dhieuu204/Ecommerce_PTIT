import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  CheckCircle2,
  ChevronLeft,
  Clock,
  CreditCard,
  Loader2,
  MapPin,
  PackageCheck,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { LoadError } from '@/components/console/empty-state';
import { ShopLogo } from '@/components/console/shop-logo';
import {
  BUYER_CANCEL_REASONS,
  CANCEL_ACTOR,
  ConfirmDialog,
  MoneyRow,
  OrderItemRow,
  OrderTimeline,
  ReasonDialog,
  RefundBadge,
  SHIPPING_SOURCE,
  ShopOrderStatusBadge,
  useCountdown,
} from '@/components/orders/order-parts';
import { PAYMENT_METHOD, ShipmentPanel } from '@/components/orders/shipment-parts';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { API, api } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { Order, ShopOrder } from '@/lib/order-types';
import { startPayment } from '@/pages/checkout/checkout';
import { ordersKey } from './orders';

/**
 * Tài khoản › Đơn mua › Chi tiết (ORD-02, ORD-05, SHIP-03): thanh toán, hủy đơn, xin hủy, theo dõi vận
 * chuyển, "Đã nhận hàng", lịch sử từng đơn con
 */
export function OrderDetailPage() {
  const { orderId = '' } = useParams();
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: [...ordersKey, 'detail', orderId],
    queryFn: () => api<Order>(`${API.market}/orders/${orderId}`),
    // Đang chờ tiền về / đang hoàn tiền: tải lại để thấy trạng thái mới
    refetchInterval: (q) =>
      q.state.data?.shopOrders.some((s) => s.refundStatus === 'PROCESSING') ? 5000 : false,
  });
  const [cancelTarget, setCancelTarget] = useState<'ORDER' | ShopOrder | null>(null);
  const [receiveTarget, setReceiveTarget] = useState<ShopOrder | null>(null);
  const [paying, setPaying] = useState(false);

  const received = useMutation({
    mutationFn: (so: ShopOrder) =>
      api<Order>(`${API.market}/orders/${orderId}/shop-orders/${so.id}/received`, {
        method: 'POST',
      }),
    onSuccess: (o) => {
      qc.setQueryData([...ordersKey, 'detail', orderId], o);
      void qc.invalidateQueries({ queryKey: [...ordersKey, 'list'] });
      toast.success('Cảm ơn bạn! Đơn hàng đã hoàn tất.');
    },
    onError: (e) => {
      toast.error(e.message);
      void detail.refetch();
    },
  });

  const cancel = useMutation({
    mutationFn: ({ target, reason }: { target: 'ORDER' | ShopOrder; reason: string }) =>
      api<Order>(
        target === 'ORDER'
          ? `${API.market}/orders/${orderId}/cancel`
          : `${API.market}/orders/${orderId}/shop-orders/${target.id}/cancel`,
        { method: 'POST', body: { reason } },
      ),
    onSuccess: (o, { target }) => {
      qc.setQueryData([...ordersKey, 'detail', orderId], o);
      void qc.invalidateQueries({ queryKey: [...ordersKey, 'list'] });
      toast.success(
        target !== 'ORDER' && target.cancelAction === 'REQUEST'
          ? 'Đã gửi yêu cầu hủy, chờ shop trả lời.'
          : 'Đã hủy đơn.',
      );
    },
    onError: (e) => toast.error(e.message),
  });

  const pay = async () => {
    setPaying(true);
    try {
      const link = await startPayment(orderId);
      window.location.assign(link.payUrl);
    } catch (e) {
      setPaying(false);
      toast.error(e instanceof Error ? e.message : 'Chưa mở được trang thanh toán.');
      void detail.refetch();
    }
  };

  if (detail.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }
  if (detail.isError) {
    return (
      <LoadError
        className="rounded-2xl border bg-card"
        message={detail.error.message}
        onRetry={() => detail.refetch()}
      />
    );
  }
  const o = detail.data;
  // COD: không có bước trả trước, đơn chờ duyệt hiện "Chờ duyệt đơn" như đơn đã trả
  const paid = o.paymentStatus !== 'UNPAID';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to="/tai-khoan/don-mua"
          className="flex items-center gap-1 text-sm text-ink/60 hover:text-navy"
        >
          <ChevronLeft className="size-4" /> Đơn mua
        </Link>
        <div className="text-sm text-ink/60">
          Mã đơn <b className="text-navy">{o.code}</b> · {formatDateTime(o.createdAt)}
        </div>
      </div>

      <StatusPanel
        order={o}
        paying={paying}
        onPay={pay}
        onCancel={() => setCancelTarget('ORDER')}
      />

      <section className="rounded-2xl border border-ivory-200 bg-card px-4 py-4 md:px-5">
        <div className="flex gap-3 text-sm">
          <MapPin className="mt-0.5 size-5 shrink-0 text-champagne-600" />
          <div>
            <div className="font-semibold text-navy">
              {o.receiver.name}{' '}
              <span className="font-normal text-ink/55">· {o.receiver.phone}</span>
            </div>
            <div className="text-ink/70">{o.receiver.address}</div>
          </div>
        </div>
      </section>

      {o.shopOrders.map((so) => (
        <ShopOrderCard
          key={so.id}
          so={so}
          paid={paid}
          cod={o.paymentMethod === 'COD'}
          onCancel={() => setCancelTarget(so)}
          onReceived={() => setReceiveTarget(so)}
        />
      ))}

      <section className="rounded-2xl border border-ivory-200 bg-card px-4 py-4 md:px-5">
        <div className="mb-1 font-semibold text-navy">Thanh toán</div>
        <MoneyRow label="Tổng tiền hàng" value={o.subtotal} />
        <MoneyRow label="Phí vận chuyển" value={o.shippingFee} />
        <MoneyRow label="Voucher của shop" value={o.shopDiscount} minus />
        <MoneyRow
          label="Voucher của sàn"
          hint={o.platformVoucherCode ?? undefined}
          value={o.platformDiscount}
          minus
        />
        <div className="my-2 border-t border-ivory-200" />
        <MoneyRow label="Tổng thanh toán" value={o.total} strong />
        <div className="mt-1 flex items-center gap-2 text-xs text-ink/55">
          {o.paymentMethod === 'COD' ? (
            <Banknote className="size-3.5" />
          ) : (
            <CreditCard className="size-3.5" />
          )}
          {PAYMENT_METHOD[o.paymentMethod]}
          {o.paidAt && <span>· đã trả lúc {formatDateTime(o.paidAt)}</span>}
        </div>
      </section>

      <ConfirmDialog
        open={receiveTarget !== null}
        onOpenChange={(open) => !open && setReceiveTarget(null)}
        title="Bạn đã nhận được hàng?"
        description={`Xác nhận đã nhận đủ hàng của ${receiveTarget?.shop.name ?? ''} và hàng không có vấn đề. Sau khi xác nhận, đơn hoàn tất và shop nhận được tiền.`}
        confirmLabel="Đã nhận hàng"
        onConfirm={() => received.mutateAsync(receiveTarget!)}
      />

      <ReasonDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title={
          cancelTarget === 'ORDER'
            ? 'Hủy đơn hàng?'
            : cancelTarget?.cancelAction === 'REQUEST'
              ? `Gửi yêu cầu hủy đơn của ${cancelTarget.shop.name}?`
              : `Hủy đơn của ${cancelTarget?.shop.name ?? ''}?`
        }
        description={
          cancelTarget === 'ORDER'
            ? 'Cả đơn (mọi shop) sẽ bị hủy, voucher được trả lại.'
            : cancelTarget?.cancelAction === 'REQUEST'
              ? 'Shop đã xác nhận đơn nên cần shop đồng ý. Mỗi đơn chỉ gửi yêu cầu hủy một lần.'
              : o.paymentMethod === 'COD'
                ? 'Đơn của các shop khác không bị ảnh hưởng.'
                : `Sàn sẽ hoàn ${formatMoney(cancelTarget?.total ?? 0)} về tài khoản thanh toán của bạn. Đơn của các shop khác không bị ảnh hưởng.`
        }
        reasons={BUYER_CANCEL_REASONS}
        confirmLabel={
          cancelTarget !== 'ORDER' && cancelTarget?.cancelAction === 'REQUEST'
            ? 'Gửi yêu cầu'
            : 'Hủy đơn'
        }
        onSubmit={(reason) => cancel.mutateAsync({ target: cancelTarget!, reason })}
      />
    </div>
  );
}

function StatusPanel({
  order,
  paying,
  onPay,
  onCancel,
}: {
  order: Order;
  paying: boolean;
  onPay: () => void;
  onCancel: () => void;
}) {
  const left = useCountdown(order.canPay ? order.payBefore : null);
  if (order.status === 'CANCELLED') {
    return (
      <Panel tone="neutral" icon={XCircle} title="Đơn đã hủy">
        {order.shopOrders[0]?.cancelReason}
      </Panel>
    );
  }
  if (order.canPay) {
    return (
      <Panel tone="pending" icon={Clock} title="Chờ thanh toán">
        <div>
          Hoàn tất thanh toán trong <b className="tabular-nums text-navy">{left ?? '00:00'}</b>, quá
          hạn đơn sẽ tự hủy.
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={onPay} disabled={paying} className="rounded-lg">
            {paying && <Loader2 className="size-4 animate-spin" />}
            Thanh toán {formatMoney(order.total)}
          </Button>
          {order.canCancel && (
            <Button variant="outline" onClick={onCancel} className="rounded-lg">
              Hủy đơn
            </Button>
          )}
        </div>
      </Panel>
    );
  }
  if (order.paymentStatus === 'UNPAID') {
    return (
      <Panel tone="pending" icon={Clock} title="Đang chờ kết quả thanh toán">
        Hệ thống đang xác nhận với cổng thanh toán. Nếu không có tiền, đơn sẽ tự hủy.
      </Panel>
    );
  }
  const cod = order.paymentMethod === 'COD';
  if (order.checkStatus === 'PENDING') {
    return (
      <Panel
        tone="info"
        icon={ShieldCheck}
        title={
          cod
            ? 'Đặt hàng thành công, đơn đang được sàn kiểm tra'
            : 'Đã thanh toán, đơn đang được sàn kiểm tra'
        }
      >
        Đơn có giá trị lớn nên sàn kiểm tra trước khi shop xử lý (tối đa 24 giờ).
        {cod
          ? ' Không qua kiểm tra thì đơn bị hủy.'
          : ' Không qua kiểm tra thì đơn bị hủy và bạn được hoàn tiền.'}
      </Panel>
    );
  }
  if (order.status === 'COMPLETED') {
    return (
      <Panel tone="success" icon={CheckCircle2} title="Đơn hàng đã hoàn tất">
        Cảm ơn bạn đã mua sắm.
      </Panel>
    );
  }
  if (order.status === 'PARTIALLY_COMPLETED') {
    return (
      <Panel tone="neutral" icon={PackageCheck} title="Đơn đã xử lý xong">
        Một phần đơn đã giao thành công, phần còn lại không giao được hoặc đã hủy. Xem chi tiết từng
        shop bên dưới.
      </Panel>
    );
  }
  if (cod) {
    return (
      <Panel tone="info" icon={Banknote} title="Thanh toán khi nhận hàng">
        Chuẩn bị tiền mặt để trả cho nhân viên giao hàng của từng shop (số tiền ghi ở mỗi kiện bên
        dưới).
      </Panel>
    );
  }
  return (
    <Panel tone="success" icon={ShieldCheck} title="Đã thanh toán">
      Theo dõi trạng thái của từng shop bên dưới.
    </Panel>
  );
}

/** Trạng thái đã qua bước shop xác nhận: có vận đơn để theo dõi */
const SHIPPED: ShopOrder['status'][] = [
  'CONFIRMED',
  'CANCEL_REQUESTED',
  'SHIPPING',
  'DELIVERED',
  'COMPLETED',
  'RETURNING',
  'RETURNED',
  'FAILED',
  'INCIDENT',
  'INCIDENT_RESOLVED',
];

/** Câu giải thích theo trạng thái giao hàng của đơn con */
function DeliveryNote({ so, cod }: { so: ShopOrder; cod: boolean }) {
  const box = (tone: 'info' | 'warn' | 'muted', text: React.ReactNode) => (
    <p
      className={
        'mb-2 rounded-lg px-3 py-2 text-sm ' +
        {
          info: 'bg-champagne-50 text-navy',
          warn: 'bg-amber-50 text-amber-800',
          muted: 'bg-ivory text-ink/70',
        }[tone]
      }
    >
      {text}
    </p>
  );
  switch (so.status) {
    case 'DELIVERED':
      return box(
        'info',
        <>
          Đã giao lúc {formatDateTime(so.deliveredAt)}. Kiểm tra hàng rồi bấm <b>"Đã nhận hàng"</b>;
          nếu không, đơn tự hoàn tất lúc {formatDateTime(so.completeBefore)}.
        </>,
      );
    case 'RETURNING':
    case 'RETURNED':
    case 'FAILED':
      return box(
        'warn',
        cod
          ? 'Giao hàng không thành công, kiện hàng được hoàn về shop. Bạn không phải trả tiền.'
          : 'Giao hàng không thành công, kiện hàng được hoàn về shop. Sàn hoàn lại tiền hàng cho bạn (phí vận chuyển không được hoàn).',
      );
    case 'INCIDENT':
      return box(
        'warn',
        'Đơn vị vận chuyển báo kiện hàng gặp sự cố. Sàn đang xác minh và sẽ báo bạn.',
      );
    case 'INCIDENT_RESOLVED':
      return box(
        'muted',
        <>
          Sàn đã xác nhận sự cố vận chuyển{so.incidentNote ? `: ${so.incidentNote}` : ''}.
          {cod ? ' Bạn không phải trả tiền.' : ' Bạn được hoàn đủ số tiền đã trả.'}
        </>,
      );
    default:
      return null;
  }
}

function Panel({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: 'pending' | 'success' | 'neutral' | 'info';
  icon: typeof Clock;
  title: string;
  children?: React.ReactNode;
}) {
  const styles = {
    pending: 'border-amber-200 bg-amber-50 text-amber-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    neutral: 'border-ivory-200 bg-ivory text-ink/80',
    info: 'border-champagne/50 bg-champagne-50 text-navy',
  }[tone];
  return (
    <section className={`flex gap-3 rounded-2xl border px-4 py-4 md:px-5 ${styles}`}>
      <Icon className="mt-0.5 size-6 shrink-0" />
      <div className="min-w-0 text-sm">
        <div className="text-base font-semibold">{title}</div>
        {children && <div className="mt-1 opacity-90">{children}</div>}
      </div>
    </section>
  );
}

function ShopOrderCard({
  so,
  paid,
  cod,
  onCancel,
  onReceived,
}: {
  so: ShopOrder;
  paid: boolean;
  cod: boolean;
  onCancel: () => void;
  onReceived: () => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  return (
    <section className="overflow-hidden rounded-2xl border border-ivory-200 bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ivory-200 bg-ivory/50 px-4 py-3 md:px-5">
        <Link
          to={`/shop/${so.shop.id}`}
          className="flex min-w-0 items-center gap-2 font-semibold text-navy hover:underline"
        >
          <ShopLogo url={so.shop.logoUrl} className="size-7 rounded-lg border" />
          <span className="truncate">{so.shop.name}</span>
        </Link>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-ink/50">{so.code}</span>
          <RefundBadge status={so.refundStatus} />
          <ShopOrderStatusBadge status={so.status} paid={paid} />
        </div>
      </header>
      <div className="divide-y divide-ivory-200 px-4 md:px-5">
        {so.items.map((it) => (
          <OrderItemRow key={it.id} item={it} />
        ))}
      </div>
      <div className="border-t border-ivory-200 px-4 py-3 md:px-5">
        {so.status === 'CANCELLED' && (
          <p className="mb-2 rounded-lg bg-ivory px-3 py-2 text-sm text-ink/70">
            Hủy bởi {CANCEL_ACTOR[so.cancelledBy ?? 'SYSTEM']}: {so.cancelReason}
          </p>
        )}
        {so.status === 'CANCEL_REQUESTED' && (
          <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Đã gửi yêu cầu hủy ({so.cancelRequestReason}), chờ shop trả lời.
          </p>
        )}
        {so.status === 'TO_CONFIRM' && so.confirmBefore && (
          <p className="mb-2 text-xs text-ink/55">
            Shop cần xác nhận trước {formatDateTime(so.confirmBefore)}, quá hạn đơn tự hủy
            {cod ? '.' : ' và hoàn tiền.'}
          </p>
        )}
        <DeliveryNote so={so} cod={cod} />
        {so.shipment && SHIPPED.includes(so.status) && (
          <ShipmentPanel shipment={so.shipment} className="mb-3" />
        )}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-0.5 text-xs text-ink/55">
            <div>
              Vận chuyển: {formatMoney(so.shippingFee)} · {SHIPPING_SOURCE[so.shippingFeeSource]}
            </div>
            {so.shopVoucherCode && (
              <div>
                Voucher shop {so.shopVoucherCode}: −{formatMoney(so.shopDiscount)}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs text-ink/55">
              {cod && so.codAmount > 0 ? 'Trả khi nhận hàng' : 'Thành tiền'}
            </div>
            <div className="text-lg font-bold text-navy">{formatMoney(so.total)}</div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {so.history && so.history.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory((v) => !v)}
              className="text-ink/60"
            >
              {showHistory ? 'Ẩn lịch sử' : 'Xem lịch sử'}
            </Button>
          )}
          {so.cancelAction && (
            <Button variant="outline" size="sm" onClick={onCancel} className="rounded-lg">
              {so.cancelAction === 'REQUEST' ? 'Yêu cầu hủy' : 'Hủy đơn của shop này'}
            </Button>
          )}
          {so.canConfirmReceived && (
            <Button size="sm" onClick={onReceived} className="rounded-lg">
              <PackageCheck className="size-4" /> Đã nhận hàng
            </Button>
          )}
        </div>
        {showHistory && so.history && (
          <div className="mt-3 rounded-xl bg-ivory/50 px-4 py-4">
            <OrderTimeline history={so.history} paid={paid} />
          </div>
        )}
      </div>
    </section>
  );
}
