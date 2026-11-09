import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconChevronRight,
  IconCircleCheck,
  IconClock,
  IconLoader2,
  IconMapPin,
  IconPackage,
  IconRefresh,
  IconTruck,
  IconUser,
  IconWallet,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { LoadError } from '@/components/console/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import {
  CANCEL_ACTOR,
  ConfirmDialog,
  DECLINE_CANCEL_REASONS,
  MoneyRow,
  OrderItemRow,
  OrderProgress,
  OrderTimeline,
  ReasonDialog,
  RefundBadge,
  SELLER_CANCEL_REASONS,
  SHIPPING_SOURCE,
  ShopOrderStatusBadge,
} from '@/components/orders/order-parts';
import { ShipmentPanel } from '@/components/orders/shipment-parts';
import { ReturnStatusBadge } from '@/components/returns/return-parts';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { API, api } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { SellerOrder } from '@/lib/order-types';
import { cn } from '@/lib/utils';
import { CARD, CardTitle, PRIMARY_BUTTON } from '@/pages/checkout/checkout-parts';
import { sellerOrdersKey } from './orders';

/** Nút chính và nút phụ của dải việc cần làm */
const PRIMARY = cn(
  PRIMARY_BUTTON,
  'inline-flex h-11 items-center justify-center gap-2 px-5 text-sm',
);
const OUTLINE =
  'h-11 rounded-lg border-ink/15 px-5 text-charcoal hover:border-navy/40 hover:bg-transparent hover:text-navy';

type Dialog = null | 'CANCEL' | 'DECLINE' | 'CONFIRM' | 'RETURN';

/**
 * Kênh người bán › Đơn hàng › Chi tiết (ORD-03, ORD-05, SHIP-02..04): xác nhận và giao cho GHN, tạo lại
 * vận đơn, hủy, trả lời yêu cầu hủy, nhận kiện hoàn (chọn dòng nhập lại kho), theo dõi vận chuyển
 */
export function SellerOrderDetailPage() {
  const { shopOrderId = '' } = useParams();
  const qc = useQueryClient();
  const key = [...sellerOrdersKey, 'detail', shopOrderId];
  const detail = useQuery({
    queryKey: key,
    queryFn: () => api<SellerOrder>(`${API.market}/shops/me/orders/${shopOrderId}`),
    // Vận đơn đang tạo/đang kiểm tra với GHN: tải lại để thấy kết quả
    refetchInterval: (q) =>
      ['CREATING', 'UNKNOWN', 'CANCELLING'].includes(q.state.data?.shipment?.status ?? '')
        ? 5000
        : false,
  });
  const [dialog, setDialog] = useState<Dialog>(null);

  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: object }) =>
      api<SellerOrder>(`${API.market}/shops/me/orders/${shopOrderId}/${path}`, {
        method: 'POST',
        body,
      }),
    onSuccess: (o, { path }) => {
      qc.setQueryData(key, o);
      void qc.invalidateQueries({ queryKey: sellerOrdersKey, exact: false });
      const shipmentFailed =
        o.shipment?.status === 'CREATE_FAILED' || o.shipment?.status === 'UNKNOWN';
      if ((path === 'confirm' || path === 'shipment/retry') && shipmentFailed) {
        toast.warning(
          o.shipment?.status === 'UNKNOWN'
            ? 'Đã xác nhận đơn. GHN chưa trả lời, hệ thống đang kiểm tra vận đơn.'
            : 'Đã xác nhận đơn nhưng GHN chưa nhận vận đơn. Bạn kiểm tra lỗi rồi tạo lại.',
        );
        return;
      }
      const cod = o.paymentMethod === 'COD';
      toast.success(
        {
          confirm: 'Đã xác nhận đơn và tạo vận đơn GHN.',
          'shipment/retry': 'Đã tạo lại vận đơn GHN.',
          cancel: cod ? 'Đã hủy đơn.' : 'Đã hủy đơn, người mua sẽ được hoàn tiền.',
          'cancel-request/accept': cod
            ? 'Đã đồng ý hủy đơn.'
            : 'Đã đồng ý hủy, người mua sẽ được hoàn tiền.',
          'cancel-request/decline': 'Đã từ chối yêu cầu hủy.',
          'return-received': 'Đã xác nhận nhận hàng hoàn.',
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
        className={cn(CARD, 'mx-auto max-w-5xl')}
        message={detail.error.message}
        onRetry={() => detail.refetch()}
      />
    );
  }
  const o = detail.data;
  const paid = o.paymentStatus !== 'UNPAID';
  const cod = o.paymentMethod === 'COD';
  const busy = action.isPending;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        crumbs={[{ label: 'Đơn hàng', to: '/kenh-nguoi-ban/don-hang' }, { label: o.code }]}
        title={`Đơn ${o.code}`}
        description={`Đặt lúc ${formatDateTime(o.createdAt)} · thuộc đơn tổng ${o.orderCode}`}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            {cod && (
              <span className="rounded-md bg-champagne-50 px-2 py-0.5 text-xs font-semibold text-champagne-600">
                COD
              </span>
            )}
            <ShopOrderStatusBadge status={o.status} paid={paid} className="text-sm" />
          </div>
        }
      />

      <ActionBar
        order={o}
        busy={busy}
        onConfirm={() => setDialog('CONFIRM')}
        onRetry={() => action.mutate({ path: 'shipment/retry' })}
        onCancel={() => setDialog('CANCEL')}
        onAccept={() => action.mutate({ path: 'cancel-request/accept' })}
        onDecline={() => setDialog('DECLINE')}
        onReturnReceived={() => setDialog('RETURN')}
      />

      {o.returnRequest && (
        <Link
          to={`/kenh-nguoi-ban/tra-hang/${o.returnRequest.id}`}
          className="mb-4 flex items-center gap-3 rounded-2xl bg-champagne-50 px-4 py-3 text-sm text-charcoal ring-1 ring-champagne/40 transition hover:ring-navy/30 md:px-5"
        >
          <IconArrowBackUp className="size-5 shrink-0 text-navy [stroke-width:1.75]" />
          <span className="min-w-0 flex-1">
            Người mua yêu cầu trả hàng <b>{o.returnRequest.code}</b> (hoàn tối đa{' '}
            {formatMoney(o.returnRequest.refundAmount)})
          </span>
          <ReturnStatusBadge status={o.returnRequest.status} />
          <IconChevronRight className="size-4 shrink-0 text-ink/40 [stroke-width:2]" />
        </Link>
      )}

      <OrderProgress
        status={o.status}
        cod={cod}
        paid={paid}
        at={{
          placed: o.createdAt,
          paid: o.paidAt,
          confirmed: o.confirmedAt,
          shipped: o.pickedAt,
          delivered: o.deliveredAt,
          completed: o.completedAt,
        }}
        className={cn(CARD, 'mb-4')}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <section className={cn(CARD, 'px-4 pt-4 lg:px-5')}>
            <CardTitle>Sản phẩm ({o.items.reduce((a, i) => a + i.quantity, 0)})</CardTitle>
            <div className="divide-y divide-ink/[0.06]">
              {o.items.map((it) => (
                <OrderItemRow key={it.id} item={it} />
              ))}
            </div>
          </section>
          {o.shipment && (
            <section className={cn(CARD, 'px-4 py-4 lg:px-5')}>
              <CardTitle>Vận chuyển</CardTitle>
              <ShipmentPanel shipment={o.shipment} forSeller className="mt-3" />
            </section>
          )}
          {o.history && (
            <section className={cn(CARD, 'px-4 py-4 lg:px-5')}>
              <CardTitle>Lịch sử đơn</CardTitle>
              <div className="mt-3">
                <OrderTimeline history={o.history} paid={paid} />
              </div>
            </section>
          )}
        </div>
        <aside className="space-y-4 lg:sticky lg:top-20">
          <section className={cn(CARD, 'p-5 text-sm')}>
            <CardTitle>Người nhận</CardTitle>
            <div className="mt-3 flex gap-2.5">
              <IconUser className="mt-0.5 size-[1.125rem] shrink-0 text-navy [stroke-width:1.75]" />
              <span className="font-medium text-charcoal">
                {o.receiver.name} · {o.receiver.phone}
              </span>
            </div>
            <div className="mt-1.5 flex gap-2.5">
              <IconMapPin className="mt-0.5 size-[1.125rem] shrink-0 text-navy [stroke-width:1.75]" />
              <span className="leading-6 text-ink/65">{o.receiver.address}</span>
            </div>
          </section>
          <section className={cn(CARD, 'p-5')}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <CardTitle>Tiền của shop</CardTitle>
              <RefundBadge status={o.refundStatus} />
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
                  : 'Tính khi sàn ghi nhận đơn'
              }
              value={o.platformFee ?? 0}
              minus
            />
            <div className="my-2.5 border-t border-dashed border-ink/15" />
            {o.sellerAmount !== null ? (
              <MoneyRow label="Dự kiến nhận" value={o.sellerAmount} strong />
            ) : (
              <p className="text-sm text-ink/55">Chưa thanh toán.</p>
            )}
            {cod && o.codAmount > 0 && (
              <div className="mt-2 flex items-center justify-between rounded-lg bg-champagne-50 px-3 py-2 text-sm">
                <span className="text-ink/65">GHN thu hộ người mua</span>
                <b className="text-navy">{formatMoney(o.codAmount)}</b>
              </div>
            )}
            <p className="mt-3 text-xs leading-relaxed text-ink/50">
              Phí vận chuyển {formatMoney(o.shippingFee)} ({SHIPPING_SOURCE[o.shippingFeeSource]})
              và voucher của sàn không tính vào tiền của shop. Tiền vào ngăn <b>đang giữ</b> khi{' '}
              {cod ? 'GHN giao xong' : 'người mua đã trả'}, sang <b>khả dụng</b> khi đơn hoàn tất
              {cod ? ' và sàn đã đối soát tiền COD với GHN' : ''}.
            </p>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="mt-3 w-full rounded-lg border-ink/15 text-charcoal hover:border-navy/40 hover:bg-transparent hover:text-navy"
            >
              <Link to="/kenh-nguoi-ban/tai-chinh">
                <IconWallet className="size-4 [stroke-width:1.75]" /> Xem ví của shop
              </Link>
            </Button>
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={dialog === 'CONFIRM'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Xác nhận và giao cho GHN?"
        description={
          <>
            Hệ thống tạo vận đơn GHN ngay
            {cod ? ` (GHN thu hộ ${formatMoney(o.codAmount)} của người mua)` : ''}. Bạn đóng gói và
            chờ GHN đến lấy
            {o.handoverBefore ? ` trước ${formatDateTime(o.handoverBefore)}` : ''}; quá hạn đơn tự
            hủy.
          </>
        }
        confirmLabel="Xác nhận và giao cho GHN"
        onConfirm={() => action.mutateAsync({ path: 'confirm' })}
      />
      <ReturnReceivedDialog
        open={dialog === 'RETURN'}
        onOpenChange={(open) => !open && setDialog(null)}
        order={o}
        onSubmit={(restockItemIds) =>
          action.mutateAsync({ path: 'return-received', body: { restockItemIds } })
        }
      />
      <ReasonDialog
        open={dialog === 'CANCEL'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Hủy đơn này?"
        description={
          (cod ? '' : 'Người mua được hoàn đủ tiền của đơn này. ') +
          'Hàng được cộng lại vào tồn kho' +
          (o.shipment?.ghnCode ? ', vận đơn GHN được hủy.' : '.')
        }
        reasons={SELLER_CANCEL_REASONS}
        confirmLabel="Hủy đơn"
        onSubmit={(reason) => action.mutateAsync({ path: 'cancel', body: { reason } })}
      />
      <ReasonDialog
        open={dialog === 'DECLINE'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Từ chối yêu cầu hủy?"
        description="Đơn quay lại Chờ lấy hàng. Người mua không gửi yêu cầu hủy lần nữa được."
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

/** Dải trên cùng: trạng thái hiện tại và việc seller cần làm */
function ActionBar({
  order: o,
  busy,
  onConfirm,
  onRetry,
  onCancel,
  onAccept,
  onDecline,
  onReturnReceived,
}: {
  order: SellerOrder;
  busy: boolean;
  onConfirm: () => void;
  onRetry: () => void;
  onCancel: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onReturnReceived: () => void;
}) {
  const cod = o.paymentMethod === 'COD';
  const bar = (
    tone: 'info' | 'warn' | 'danger' | 'success' | 'muted',
    Icon: typeof IconClock,
    title: React.ReactNode,
    text?: React.ReactNode,
    actions?: React.ReactNode,
  ) => (
    <div className={cn(CARD, 'mb-4 flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center')}>
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <span
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-full',
            {
              info: 'bg-champagne-50 text-navy',
              warn: 'bg-amber-50 text-amber-600',
              danger: 'bg-red-50 text-red-500',
              success: 'bg-ship/10 text-ship',
              muted: 'bg-page text-ink/50',
            }[tone],
          )}
        >
          <Icon className="size-6 [stroke-width:1.75]" />
        </span>
        <div className="min-w-0 text-sm">
          <div className="text-base font-bold tracking-tight text-charcoal">{title}</div>
          {text && <div className="mt-0.5 leading-relaxed text-ink/60">{text}</div>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
  const cancelBtn = (
    <Button variant="outline" onClick={onCancel} disabled={busy} className={OUTLINE}>
      Hủy đơn
    </Button>
  );

  switch (o.status) {
    case 'TO_CONFIRM':
      return bar(
        'info',
        IconClock,
        cod
          ? 'Người mua đặt hàng COD, chờ bạn xác nhận'
          : 'Người mua đã thanh toán, chờ bạn xác nhận',
        <>
          {o.confirmBefore && (
            <>
              Hạn xác nhận: <b>{formatDateTime(o.confirmBefore)}</b>.{' '}
            </>
          )}
          {o.handoverBefore && (
            <>
              Bàn giao cho GHN trước <b>{formatDateTime(o.handoverBefore)}</b>.{' '}
            </>
          )}
          Quá hạn đơn tự hủy.
        </>,
        <>
          {cancelBtn}
          <button type="button" onClick={onConfirm} disabled={busy} className={PRIMARY}>
            {busy ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconTruck className="size-4" />
            )}
            Xác nhận và giao cho GHN
          </button>
        </>,
      );
    case 'CANCEL_REQUESTED':
      return bar(
        'warn',
        IconAlertTriangle,
        'Người mua xin hủy đơn',
        <>
          Lý do: {o.cancelRequestReason}. Nếu GHN lấy hàng trước khi bạn trả lời, yêu cầu hủy hết
          hiệu lực.
        </>,
        <>
          <Button variant="outline" onClick={onDecline} disabled={busy} className={OUTLINE}>
            Từ chối
          </Button>
          <button type="button" onClick={onAccept} disabled={busy} className={PRIMARY}>
            {busy && <IconLoader2 className="size-4 animate-spin" />}
            Đồng ý hủy
          </button>
        </>,
      );
    case 'CONFIRMED': {
      const s = o.shipment?.status;
      if (s === 'CREATE_FAILED') {
        return bar(
          'danger',
          IconAlertTriangle,
          'GHN chưa nhận vận đơn',
          <>
            {o.shipment?.lastError ?? 'GHN từ chối tạo vận đơn.'} Kiểm tra địa chỉ lấy hàng trong{' '}
            <Link to="/kenh-nguoi-ban/ho-so-shop" className="font-semibold underline">
              Hồ sơ shop
            </Link>{' '}
            rồi tạo lại.
          </>,
          <>
            {cancelBtn}
            <button type="button" onClick={onRetry} disabled={busy} className={PRIMARY}>
              {busy ? (
                <IconLoader2 className="size-4 animate-spin" />
              ) : (
                <IconRefresh className="size-4" />
              )}
              Tạo lại vận đơn
            </button>
          </>,
        );
      }
      if (s === 'CREATING' || s === 'UNKNOWN') {
        return bar(
          'warn',
          IconClock,
          'Đang tạo vận đơn với GHN',
          'GHN chưa trả lời, hệ thống tự kiểm tra lại sau ít phút. Bạn không cần bấm lại.',
          cancelBtn,
        );
      }
      return bar(
        'success',
        IconPackage,
        'Đã tạo vận đơn, chờ GHN đến lấy hàng',
        <>
          Đóng gói kiện hàng
          {o.handoverBefore && (
            <>
              {' '}
              và bàn giao trước <b>{formatDateTime(o.handoverBefore)}</b>
            </>
          )}
          ; quá hạn đơn tự hủy.
        </>,
        cancelBtn,
      );
    }
    case 'SHIPPING':
      return bar(
        'info',
        IconTruck,
        'GHN đang giao hàng',
        `Đã lấy hàng lúc ${formatDateTime(o.pickedAt)}.`,
      );
    case 'DELIVERED':
      return bar(
        'success',
        IconPackage,
        'Đã giao hàng thành công',
        <>
          Giao lúc {formatDateTime(o.deliveredAt)}. Đơn tự hoàn tất lúc{' '}
          <b>{formatDateTime(o.completeBefore)}</b> nếu người mua chưa bấm "Đã nhận hàng".
        </>,
      );
    case 'COMPLETED':
      return bar(
        'success',
        IconCircleCheck,
        'Đơn đã hoàn tất',
        cod
          ? 'Tiền chuyển sang khả dụng sau khi sàn đối soát tiền COD với GHN.'
          : 'Tiền của đơn đã chuyển sang khả dụng trong ví.',
      );
    case 'RETURNING':
      return bar(
        'warn',
        IconArrowBackUp,
        'Giao không thành công, GHN đang hoàn hàng về shop',
        cod
          ? 'Người mua không phải trả tiền. Khi nhận lại kiện hàng, bạn xác nhận để nhập lại kho.'
          : 'Người mua được hoàn tiền hàng. Khi nhận lại kiện hàng, bạn xác nhận để nhập lại kho.',
      );
    case 'RETURNED':
      return bar(
        'warn',
        IconArrowBackUp,
        'GHN đã hoàn kiện hàng về shop',
        <>
          Kiểm tra hàng rồi xác nhận trước <b>{formatDateTime(o.returnCloseBefore)}</b>. Quá hạn đơn
          tự đóng và hàng <b>không</b> được cộng lại kho.
        </>,
        <button type="button" onClick={onReturnReceived} disabled={busy} className={PRIMARY}>
          <IconPackage className="size-4" /> Đã nhận hàng hoàn
        </button>,
      );
    case 'FAILED':
      return bar('muted', IconArrowBackUp, 'Đơn đã đóng: giao hàng không thành công');
    case 'INCIDENT':
      return bar(
        'danger',
        IconAlertTriangle,
        'GHN báo kiện hàng gặp sự cố (thất lạc / hư hỏng)',
        'Sàn đang xác minh với GHN. Nếu xác nhận sự cố, bạn được đền tiền hàng vào ví.',
      );
    case 'INCIDENT_RESOLVED':
      return bar(
        'muted',
        IconCircleCheck,
        'Sàn đã xác nhận sự cố vận chuyển',
        <>
          {o.incidentNote}
          {o.sellerAmount !== null &&
            ` Bạn được đền ${formatMoney(o.sellerAmount)} vào ngăn khả dụng.`}
        </>,
      );
    case 'CANCELLED':
      return bar(
        'muted',
        IconAlertTriangle,
        <>
          Đã hủy bởi {CANCEL_ACTOR[o.cancelledBy ?? 'SYSTEM']}
          {o.cancelledAt && ` lúc ${formatDateTime(o.cancelledAt)}`}
        </>,
        `Lý do: ${o.cancelReason ?? ''}`,
      );
    default:
      return bar(
        'muted',
        IconClock,
        o.paymentStatus === 'UNPAID' ? 'Người mua chưa thanh toán' : 'Đơn đang được sàn kiểm tra',
        o.paymentStatus === 'UNPAID'
          ? 'Bạn chưa cần làm gì, đơn chưa trả sẽ tự hủy khi hết hạn.'
          : 'Bạn chưa cần làm gì, đơn sẽ sang Chờ xác nhận khi qua kiểm tra.',
      );
  }
}

/** Shop xác nhận đã nhận kiện hoàn và chọn dòng hàng nhập lại kho (mặc định chọn hết) */
function ReturnReceivedDialog({
  open,
  onOpenChange,
  order,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: SellerOrder;
  onSubmit: (restockItemIds: string[]) => Promise<unknown>;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    if (open) setPicked(order.items.map((i) => i.id));
  }, [open, order.items]);
  const toggle = (id: string, on: boolean) =>
    setPicked((p) => (on ? [...new Set([...p, id])] : p.filter((x) => x !== id)));
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Xác nhận đã nhận hàng hoàn"
      description="Chọn các dòng hàng còn bán được để cộng lại vào tồn kho. Bỏ chọn món bị hỏng, thiếu."
      confirmLabel={`Xác nhận (nhập lại ${picked.length}/${order.items.length} dòng)`}
      onConfirm={() => onSubmit(picked)}
    >
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {order.items.map((it) => {
          const on = picked.includes(it.id);
          return (
            <label
              key={it.id}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition',
                on ? 'border-navy bg-champagne-50' : 'border-ink/15',
              )}
            >
              <Checkbox checked={on} onCheckedChange={(v) => toggle(it.id, v === true)} />
              <div className="size-10 shrink-0 overflow-hidden rounded-lg border bg-white p-0.5">
                {it.image && <img src={it.image} alt="" className="size-full object-contain" />}
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <div className="truncate font-medium text-ink">{it.productName}</div>
                <div className="text-xs text-ink/55">
                  {it.variantName && `${it.variantName} · `}x{it.quantity}
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </ConfirmDialog>
  );
}
