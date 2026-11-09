import {
  IconArrowBackUp,
  IconCash,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconLoader2,
  IconMapPin,
  IconPackage,
  IconRosetteDiscountCheckFilled,
  IconShieldCheck,
  IconTruck,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { ChatWithShopButton } from '@/components/chat/chat-with-shop-button';
import { LoadError } from '@/components/console/empty-state';
import { ShopLogo } from '@/components/console/shop-logo';
import {
  BUYER_CANCEL_REASONS,
  CANCEL_ACTOR,
  ConfirmDialog,
  MoneyRow,
  OrderItemRow,
  OrderProgress,
  OrderTimeline,
  ReasonDialog,
  RefundBadge,
  SHIPPING_SOURCE,
  ShopOrderStatusBadge,
  useCountdown,
} from '@/components/orders/order-parts';
import { CopyCode, PAYMENT_METHOD, ShipmentPanel } from '@/components/orders/shipment-parts';
import { ReturnStatusBadge } from '@/components/returns/return-parts';
import { ReviewOrderButton } from '@/components/reviews/review-order-button';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { API, api } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { Order, ShopOrder } from '@/lib/order-types';
import { cn } from '@/lib/utils';
import { openPayUrl, startPayment } from '@/pages/checkout/checkout';
import { CARD, CardTitle, PRIMARY_BUTTON } from '@/pages/checkout/checkout-parts';
import { ordersKey } from './orders';

/** Nút viền nhạt của các thao tác phụ */
const OUTLINE =
  'rounded-lg border-ink/15 text-charcoal hover:border-navy/40 hover:bg-transparent hover:text-navy';

/**
 * Tài khoản › Đơn mua › Chi tiết (ORD-02, ORD-05, SHIP-03): thanh toán, hủy đơn, xin hủy, theo dõi vận
 * chuyển, "Đã nhận hàng", lịch sử từng đơn con. Bố cục theo các sàn lớn: trạng thái đơn trên cùng, cột trái
 * từng shop có thanh tiến trình, cột phải địa chỉ và chi tiết tiền.
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
      openPayUrl(link.payUrl);
    } catch (e) {
      setPaying(false);
      toast.error(e instanceof Error ? e.message : 'Chưa mở được trang thanh toán.');
      void detail.refetch();
    }
  };

  if (detail.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }
  if (detail.isError) {
    return (
      <LoadError className={CARD} message={detail.error.message} onRetry={() => detail.refetch()} />
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
          className="flex items-center gap-1 text-sm font-medium text-ink/60 transition hover:text-navy"
        >
          <IconChevronLeft className="size-4 [stroke-width:2]" /> Đơn mua
        </Link>
        <div className="flex flex-wrap items-center gap-x-2 text-[13px] text-ink/55">
          <span>Mã đơn</span>
          <CopyCode code={o.code} />
          <span aria-hidden className="text-ink/25">
            |
          </span>
          <span>{formatDateTime(o.createdAt)}</span>
        </div>
      </div>

      <StatusPanel
        order={o}
        paying={paying}
        onPay={pay}
        onCancel={() => setCancelTarget('ORDER')}
      />

      <div className="xl:hidden">
        <ReceiverCard order={o} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          {o.shopOrders.map((so) => (
            <ShopOrderCard
              key={so.id}
              order={o}
              so={so}
              paid={paid}
              cod={o.paymentMethod === 'COD'}
              onCancel={() => setCancelTarget(so)}
              onReceived={() => setReceiveTarget(so)}
            />
          ))}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-20">
          <div className="hidden xl:block">
            <ReceiverCard order={o} />
          </div>
          <section className={cn(CARD, 'p-5')}>
            <CardTitle>Chi tiết thanh toán</CardTitle>
            <div className="mt-3">
              <MoneyRow label="Tổng tiền hàng" value={o.subtotal} />
              <MoneyRow label="Phí vận chuyển" value={o.shippingFee} />
              {o.shopDiscount > 0 && (
                <MoneyRow label="Voucher của shop" value={o.shopDiscount} minus />
              )}
              {o.platformDiscount > 0 && (
                <MoneyRow
                  label="Voucher của sàn"
                  hint={o.platformVoucherCode ?? undefined}
                  value={o.platformDiscount}
                  minus
                />
              )}
            </div>
            <div className="mt-3 flex items-end justify-between gap-3 border-t border-dashed border-ink/15 pt-3.5">
              <span className="text-sm font-medium text-charcoal">Tổng thanh toán</span>
              <span className="text-xl leading-none font-bold tracking-tight text-navy">
                {formatMoney(o.total)}
              </span>
            </div>
            <div className="mt-3.5 flex items-center gap-2 rounded-lg bg-page px-3 py-2.5 text-xs text-ink/60">
              {o.paymentMethod === 'COD' ? (
                <IconCash className="size-4 shrink-0 text-navy [stroke-width:1.75]" />
              ) : (
                <img src="/partners/vnpay.svg" alt="" className="h-4 w-auto shrink-0" />
              )}
              <span className="min-w-0">
                {PAYMENT_METHOD[o.paymentMethod]}
                {o.paidAt && <span className="block">Đã trả lúc {formatDateTime(o.paidAt)}</span>}
              </span>
            </div>
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={receiveTarget !== null}
        onOpenChange={(open) => !open && setReceiveTarget(null)}
        title="Bạn đã nhận được hàng?"
        description={`Xác nhận đã nhận đủ hàng của ${receiveTarget?.shop.name ?? ''} và hàng không có vấn đề. Sau khi xác nhận, đơn hoàn tất, shop nhận được tiền và bạn không gửi yêu cầu trả hàng được nữa.`}
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

function ReceiverCard({ order }: { order: Order }) {
  return (
    <section className={cn(CARD, 'p-5')}>
      <CardTitle>Địa chỉ nhận hàng</CardTitle>
      <div className="mt-3 flex gap-2.5 text-sm">
        <IconMapPin className="mt-0.5 size-5 shrink-0 text-navy [stroke-width:1.75]" />
        <div className="min-w-0 leading-6">
          <span className="font-bold text-charcoal">{order.receiver.name}</span>
          <span className="mx-2 text-ink/25">|</span>
          <span className="font-medium text-charcoal">{order.receiver.phone}</span>
          <div className="text-ink/65">{order.receiver.address}</div>
        </div>
      </div>
    </section>
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
      <Panel tone="neutral" icon={IconCircleX} title="Đơn đã hủy">
        {order.shopOrders[0]?.cancelReason}
      </Panel>
    );
  }
  if (order.canPay) {
    return (
      <Panel
        tone="pending"
        icon={IconClock}
        title="Chờ thanh toán"
        action={
          <>
            {order.canCancel && (
              <Button variant="outline" onClick={onCancel} className={cn(OUTLINE, 'h-11 px-5')}>
                Hủy đơn
              </Button>
            )}
            <button
              type="button"
              onClick={onPay}
              disabled={paying}
              className={cn(
                PRIMARY_BUTTON,
                'flex h-11 flex-1 items-center justify-center gap-2 px-6 text-sm sm:flex-none',
              )}
            >
              {paying && <IconLoader2 className="size-4 animate-spin" />}
              Thanh toán {formatMoney(order.total)}
            </button>
          </>
        }
      >
        Hoàn tất thanh toán trong{' '}
        <b className="font-bold text-navy tabular-nums">{left ?? '00:00'}</b>, quá hạn đơn sẽ tự
        hủy.
      </Panel>
    );
  }
  if (order.paymentStatus === 'UNPAID') {
    return (
      <Panel tone="pending" icon={IconClock} title="Đang chờ kết quả thanh toán">
        Hệ thống đang xác nhận với cổng thanh toán. Nếu không có tiền, đơn sẽ tự hủy.
      </Panel>
    );
  }
  const cod = order.paymentMethod === 'COD';
  if (order.checkStatus === 'PENDING') {
    return (
      <Panel
        tone="info"
        icon={IconShieldCheck}
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
    return <Panel tone="success" icon={IconCircleCheck} title="Đơn hàng đã hoàn tất" />;
  }
  if (order.status === 'PARTIALLY_COMPLETED') {
    return (
      <Panel tone="neutral" icon={IconPackage} title="Đơn đã xử lý xong">
        Một phần đơn đã giao thành công, phần còn lại không giao được hoặc đã hủy. Xem chi tiết từng
        shop bên dưới.
      </Panel>
    );
  }
  if (cod) {
    return (
      <Panel tone="info" icon={IconCash} title="Thanh toán khi nhận hàng">
        Chuẩn bị tiền mặt để trả cho nhân viên giao hàng của từng shop (số tiền ghi ở mỗi kiện bên
        dưới).
      </Panel>
    );
  }
  return <Panel tone="success" icon={IconShieldCheck} title="Đã thanh toán" />;
}

function Panel({
  tone,
  icon: Icon,
  title,
  action,
  children,
}: {
  tone: 'pending' | 'success' | 'neutral' | 'info';
  icon: typeof IconClock;
  title: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const iconStyle = {
    pending: 'bg-champagne-50 text-champagne-600',
    success: 'bg-ship/10 text-ship',
    neutral: 'bg-page text-ink/50',
    info: 'bg-champagne-50 text-navy',
  }[tone];
  return (
    <section className={cn(CARD, 'flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center')}>
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <span
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-full',
            iconStyle,
          )}
        >
          <Icon className="size-6 [stroke-width:1.75]" />
        </span>
        <div className="min-w-0">
          <h1 className="text-base font-bold tracking-tight text-charcoal md:text-lg">{title}</h1>
          {children && <div className="mt-0.5 text-sm leading-relaxed text-ink/60">{children}</div>}
        </div>
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </section>
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

const NOTE = 'mb-3 rounded-lg px-3 py-2.5 text-sm leading-relaxed';

/** Câu giải thích theo trạng thái giao hàng của đơn con */
function DeliveryNote({ so, cod }: { so: ShopOrder; cod: boolean }) {
  const box = (tone: 'info' | 'warn' | 'muted', text: React.ReactNode) => (
    <p
      className={cn(
        NOTE,
        {
          info: 'bg-champagne-50 text-charcoal',
          warn: 'bg-amber-50 text-amber-800',
          muted: 'bg-page text-ink/70',
        }[tone],
      )}
    >
      {text}
    </p>
  );
  switch (so.status) {
    case 'DELIVERED':
      if (so.returnRequest) return null;
      return box(
        'info',
        <>
          Đã giao lúc {formatDateTime(so.deliveredAt)}. Kiểm tra hàng rồi bấm <b>"Đã nhận hàng"</b>;
          hàng lỗi hoặc giao sai thì bấm <b>"Trả hàng/Hoàn tiền"</b> trước{' '}
          {formatDateTime(so.completeBefore)} (lúc này đơn tự hoàn tất).
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

function ShopOrderCard({
  order,
  so,
  paid,
  cod,
  onCancel,
  onReceived,
}: {
  order: Order;
  so: ShopOrder;
  paid: boolean;
  cod: boolean;
  onCancel: () => void;
  onReceived: () => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  return (
    <section className={cn(CARD, 'overflow-hidden')}>
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-ink/[0.06] px-4 py-3 lg:px-5">
        <Link
          to={`/shop/${so.shop.id}`}
          className="group flex min-w-0 items-center gap-2.5 text-sm font-semibold text-charcoal"
        >
          <ShopLogo url={so.shop.logoUrl} className="size-7 rounded-lg ring-1 ring-ink/[0.08]" />
          <span className="truncate transition group-hover:text-navy">{so.shop.name}</span>
          <IconRosetteDiscountCheckFilled className="size-4 shrink-0 text-navy" />
        </Link>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-ink/45">{so.code}</span>
          <RefundBadge status={so.refundStatus} />
          <ShopOrderStatusBadge status={so.status} paid={paid} />
        </div>
      </header>

      <OrderProgress
        status={so.status}
        cod={cod}
        paid={paid}
        at={{
          placed: order.createdAt,
          paid: order.paidAt,
          confirmed: so.confirmedAt,
          shipped: so.history?.find((h) => h.toStatus === 'SHIPPING')?.createdAt ?? null,
          delivered: so.deliveredAt,
          completed: so.completedAt,
        }}
        className="border-b border-ink/[0.06]"
      />

      <div className="divide-y divide-ink/[0.06] px-4 lg:px-5">
        {so.items.map((it) => (
          <OrderItemRow key={it.id} item={it} />
        ))}
      </div>

      <div className="border-t border-ink/[0.06] px-4 py-4 lg:px-5">
        {so.status === 'CANCELLED' && (
          <p className={cn(NOTE, 'bg-page text-ink/70')}>
            Hủy bởi {CANCEL_ACTOR[so.cancelledBy ?? 'SYSTEM']}: {so.cancelReason}
          </p>
        )}
        {so.status === 'CANCEL_REQUESTED' && (
          <p className={cn(NOTE, 'bg-amber-50 text-amber-800')}>
            Đã gửi yêu cầu hủy ({so.cancelRequestReason}), chờ shop trả lời.
          </p>
        )}
        {so.status === 'TO_CONFIRM' && so.confirmBefore && (
          <p className="mb-3 text-xs text-ink/55">
            Shop cần xác nhận trước {formatDateTime(so.confirmBefore)}, quá hạn đơn tự hủy
            {cod ? '.' : ' và hoàn tiền.'}
          </p>
        )}
        <DeliveryNote so={so} cod={cod} />
        {so.returnRequest && (
          <Link
            to={`/tai-khoan/tra-hang/${so.returnRequest.id}`}
            className="mb-3 flex items-center gap-2 rounded-lg bg-champagne-50 px-3 py-2.5 text-sm text-charcoal ring-1 ring-transparent transition hover:ring-navy/30"
          >
            <IconArrowBackUp className="size-[1.125rem] shrink-0 text-navy [stroke-width:1.75]" />
            <span className="min-w-0 flex-1">
              Yêu cầu trả hàng {so.returnRequest.code} ·{' '}
              {so.returnRequest.decidedRefund !== null
                ? `hoàn ${formatMoney(so.returnRequest.decidedRefund)}`
                : `hoàn tối đa ${formatMoney(so.returnRequest.refundAmount)}`}
            </span>
            <ReturnStatusBadge status={so.returnRequest.status} />
            <IconChevronRight className="size-4 shrink-0 text-ink/40 [stroke-width:2]" />
          </Link>
        )}
        {so.shipment && SHIPPED.includes(so.status) && (
          <ShipmentPanel shipment={so.shipment} className="mb-4" />
        )}

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1 text-[13px] text-ink/60">
            <div className="flex flex-wrap items-center gap-x-1.5">
              <IconTruck className="size-4 text-ship [stroke-width:1.75]" />
              Vận chuyển {formatMoney(so.shippingFee)}
              {so.shippingFeeSource !== 'GHN' && (
                <span className="text-xs text-ink/45">
                  ({SHIPPING_SOURCE[so.shippingFeeSource]})
                </span>
              )}
            </div>
            {so.shopVoucherCode && (
              <div>
                Voucher {so.shopVoucherCode}:{' '}
                <span className="font-medium text-navy">-{formatMoney(so.shopDiscount)}</span>
              </div>
            )}
          </div>
          <div className="text-right">
            <span className="text-[13px] text-ink/60">
              {cod && so.codAmount > 0 ? 'Trả khi nhận hàng' : 'Thành tiền'}
            </span>
            <span className="ml-2.5 text-lg font-bold text-navy">{formatMoney(so.total)}</span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {so.history && so.history.length > 0 && (
            <button
              type="button"
              aria-expanded={showHistory}
              onClick={() => setShowHistory((v) => !v)}
              className="mr-auto flex h-8 items-center gap-1 text-[13px] font-medium text-ink/55 transition hover:text-navy"
            >
              Lịch sử đơn
              <IconChevronDown
                className={cn(
                  'size-4 [stroke-width:2] transition-transform',
                  showHistory && 'rotate-180',
                )}
              />
            </button>
          )}
          <ChatWithShopButton
            shopId={so.shop.id}
            shopOrder={{ id: so.id, code: so.code }}
            size="sm"
            className="rounded-lg"
          />
          {so.cancelAction && (
            <Button variant="outline" size="sm" onClick={onCancel} className={OUTLINE}>
              {so.cancelAction === 'REQUEST' ? 'Yêu cầu hủy' : 'Hủy đơn của shop này'}
            </Button>
          )}
          {so.canRequestReturn && (
            <Button asChild variant="outline" size="sm" className={OUTLINE}>
              <Link to={`/tai-khoan/don-mua/${order.id}/tra-hang/${so.id}`}>
                <IconArrowBackUp className="size-4 [stroke-width:1.75]" /> Trả hàng/Hoàn tiền
              </Link>
            </Button>
          )}
          <ReviewOrderButton status={so.status} />
          {so.canConfirmReceived && (
            <button
              type="button"
              onClick={onReceived}
              className={cn(PRIMARY_BUTTON, 'inline-flex h-8 items-center gap-1.5 px-3 text-sm')}
            >
              <IconPackage className="size-4 [stroke-width:1.75]" /> Đã nhận hàng
            </button>
          )}
        </div>

        {showHistory && so.history && (
          <div className="mt-3 rounded-xl bg-page px-4 py-4">
            <OrderTimeline history={so.history} paid={paid} />
          </div>
        )}
      </div>
    </section>
  );
}
