import {
  IconCircleCheckFilled,
  IconCircleXFilled,
  IconClock,
  IconLoader2,
  IconPhotoOff,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useProductSearch } from '@/components/catalog/browse-query';
import { LoadError } from '@/components/console/empty-state';
import { ProductRow, SectionTitle } from '@/components/home/home-sections';
import { useCountdown } from '@/components/orders/order-parts';
import { API, api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type { Order, OrderPayment } from '@/lib/order-types';
import { cn } from '@/lib/utils';
import { openPayUrl, startPayment } from './checkout';
import { CARD, PRIMARY_BUTTON } from './checkout-parts';

/** Số ảnh sản phẩm tối đa hiện trong biên nhận */
const MAX_THUMBS = 5;

/**
 * Trang buyer quay về sau cổng thanh toán (PAY-02). Không tự coi là đã trả: gửi tham số cổng cho
 * payment-service kiểm chữ ký + tra cứu, rồi đọc trạng thái thật của đơn.
 */
export function PaymentResultPage() {
  const [params] = useSearchParams();
  const all = Object.fromEntries(params.entries());
  const ref = params.get('vnp_TxnRef');
  const orderIdParam = params.get('orderId');

  // 1. Gửi tham số cổng về payment-service (một lần)
  const confirm = useQuery({
    queryKey: ['payment-return', ref],
    queryFn: () =>
      api<OrderPayment>(`${API.payment}/payments/return`, {
        method: 'POST',
        body: { params: all },
      }),
    enabled: !!ref,
    staleTime: Infinity,
    retry: false,
  });
  const orderId = confirm.data?.orderId ?? orderIdParam;

  // 2. Đọc trạng thái thanh toán; còn chờ thì hỏi lại mỗi 2 giây
  const status = useQuery({
    queryKey: ['order-payment', orderId],
    queryFn: () => api<OrderPayment>(`${API.payment}/orders/${orderId}/payment`),
    enabled: !!orderId && (!ref || confirm.isSuccess),
    initialData: confirm.data,
    refetchInterval: (q) =>
      q.state.data?.status === 'UNPAID' && waiting(q.state.data) ? 2000 : false,
  });
  // Đơn bên marketplace: biết đã qua kiểm tra chưa (tin "đã trả" tới marketplace qua sự kiện)
  const order = useQuery({
    queryKey: ['orders', 'detail', orderId],
    queryFn: () => api<Order>(`${API.market}/orders/${orderId}`),
    enabled: !!orderId,
    refetchInterval: (q) =>
      status.data?.status === 'PAID' && q.state.data?.paymentStatus !== 'PAID' ? 1500 : false,
  });

  const [retrying, setRetrying] = useState(false);
  const retry = async () => {
    if (!orderId) return;
    setRetrying(true);
    try {
      const link = await startPayment(orderId);
      openPayUrl(link.payUrl);
    } catch (e) {
      setRetrying(false);
      toast.error(e instanceof Error ? e.message : 'Chưa mở được trang thanh toán.');
    }
  };

  if (!ref && !orderIdParam) {
    return (
      <Frame>
        <LoadError message="Thiếu thông tin giao dịch. Bạn xem trạng thái trong Đơn mua." />
        <Actions />
      </Frame>
    );
  }
  if (confirm.isError) {
    return (
      <Frame>
        <LoadError message={confirm.error.message} />
        <Actions />
      </Frame>
    );
  }

  const s = status.data;
  if (!s) {
    return (
      <Frame>
        <Pending text="Đang xác nhận kết quả với cổng thanh toán…" />
      </Frame>
    );
  }

  const mock = s.gateway === 'MOCK';
  if (s.status === 'PAID') {
    const checking = order.data?.checkStatus === 'PENDING';
    return (
      <>
        <Frame mock={mock}>
          <Hero
            tone="success"
            title="Thanh toán thành công"
            text={
              checking
                ? 'Đơn giá trị lớn đang được sàn kiểm tra. Sau khi qua kiểm tra, shop sẽ xác nhận đơn.'
                : 'Shop sẽ xác nhận và chuẩn bị hàng cho bạn.'
            }
          />
          <Receipt payment={s} order={order.data} />
          <Actions orderId={s.orderId} />
        </Frame>
        <Suggestions />
      </>
    );
  }
  if (s.status === 'EXPIRED' || s.status === 'CANCELLED') {
    return (
      <Frame mock={mock}>
        <Hero
          tone="danger"
          title={s.status === 'EXPIRED' ? 'Đơn đã hết hạn thanh toán' : 'Đơn đã bị hủy'}
          text="Nếu tài khoản đã bị trừ tiền, sàn sẽ tự hoàn lại."
        />
        <Receipt payment={s} order={order.data} />
        <Actions orderId={s.orderId} />
      </Frame>
    );
  }
  if (waiting(s)) {
    return (
      <Frame mock={mock}>
        <Pending
          text={
            s.lastAttempt?.status === 'UNKNOWN'
              ? 'Cổng thanh toán chưa trả kết quả rõ ràng, hệ thống đang tra cứu. Bạn không cần thanh toán lại.'
              : 'Đang xác nhận kết quả với cổng thanh toán…'
          }
        />
        <Actions orderId={s.orderId} />
      </Frame>
    );
  }
  return (
    <Frame mock={mock}>
      <Hero
        tone="danger"
        title="Thanh toán chưa thành công"
        text={`Đã thử ${s.attempts}/${s.maxAttempts} lần. Tiền chưa bị trừ thì bạn có thể thanh toán lại.`}
      />
      <Receipt payment={s} order={order.data} />
      <RetryBox payment={s} retrying={retrying} onRetry={retry} />
      <Actions orderId={s.orderId} secondaryOnly />
    </Frame>
  );
}

/** Lần gần nhất còn chờ hoặc chưa rõ kết quả */
const waiting = (s: OrderPayment) =>
  s.lastAttempt?.status === 'PENDING' || s.lastAttempt?.status === 'UNKNOWN';

function RetryBox({
  payment,
  retrying,
  onRetry,
}: {
  payment: OrderPayment;
  retrying: boolean;
  onRetry: () => void;
}) {
  const left = useCountdown(payment.payBefore);
  const canRetry = payment.attempts < payment.maxAttempts && left;
  if (!canRetry) {
    return (
      <p className="mt-4 text-center text-sm text-ink/60">
        Đơn đã hết lượt hoặc hết hạn thanh toán và sẽ tự hủy. Bạn có thể đặt lại từ giỏ hàng.
      </p>
    );
  }
  return (
    <div className="mt-5 flex flex-col items-center">
      <div className="flex items-center gap-1.5 text-sm text-ink/60">
        <IconClock className="size-4 [stroke-width:1.75]" />
        Còn <b className="font-bold text-navy tabular-nums">{left}</b> để thanh toán
      </div>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className={cn(
          PRIMARY_BUTTON,
          'mt-3 flex h-12 w-full max-w-xs items-center justify-center gap-2 text-[15px]',
        )}
      >
        {retrying && <IconLoader2 className="size-5 animate-spin" />}
        Thanh toán lại
      </button>
    </div>
  );
}

function Frame({ children, mock }: { children: React.ReactNode; mock?: boolean }) {
  return (
    <div className="mx-auto max-w-xl px-4 pt-8 pb-10 md:pt-12">
      <div className={cn(CARD, 'rounded-3xl px-5 py-8 md:px-10')}>
        {mock && (
          <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-center text-xs font-semibold tracking-wide text-amber-800">
            MÔ PHỎNG · cổng thanh toán giả, không có tiền thật
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function Hero({ tone, title, text }: { tone: 'success' | 'danger'; title: string; text: string }) {
  const Icon = tone === 'success' ? IconCircleCheckFilled : IconCircleXFilled;
  return (
    <div className="flex flex-col items-center text-center">
      <Icon className={cn('size-[4.5rem]', tone === 'success' ? 'text-ship' : 'text-red-500')} />
      <h1 className="mt-4 text-xl font-bold tracking-tight text-charcoal md:text-2xl">{title}</h1>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink/60">{text}</p>
    </div>
  );
}

/** Biên nhận: mã đơn, số tiền, phương thức, nơi nhận và ảnh các sản phẩm trong đơn */
function Receipt({ payment, order }: { payment: OrderPayment; order: Order | undefined }) {
  const items = order?.shopOrders.flatMap((so) => so.items) ?? [];
  const more = items.length - MAX_THUMBS;
  return (
    <div className="mt-6 rounded-xl bg-page px-4 py-4 text-sm">
      <dl className="space-y-2.5">
        <div className="flex justify-between gap-4">
          <dt className="text-ink/60">Mã đơn hàng</dt>
          <dd className="font-semibold text-charcoal">{payment.orderCode}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-ink/60">Phương thức</dt>
          <dd className="font-medium text-charcoal">
            {payment.gateway === 'MOCK' ? (
              'Cổng mô phỏng'
            ) : (
              <img src="/partners/vnpay.svg" alt="VNPay" className="h-5 w-auto" />
            )}
          </dd>
        </div>
        {order && (
          <div className="flex justify-between gap-4">
            <dt className="shrink-0 text-ink/60">Giao đến</dt>
            <dd className="text-right leading-5 text-charcoal">
              <span className="font-medium">
                {order.receiver.name} · {order.receiver.phone}
              </span>
              <span className="block text-ink/60">{order.receiver.address}</span>
            </dd>
          </div>
        )}
      </dl>
      {items.length > 0 && (
        <div className="mt-3.5 flex items-center gap-2 border-t border-dashed border-ink/15 pt-3.5">
          {items.slice(0, MAX_THUMBS).map((it) => (
            <span
              key={it.id}
              title={it.productName}
              className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-card p-1 ring-1 ring-ink/[0.08]"
            >
              {it.image ? (
                <img src={it.image} alt={it.productName} className="size-full object-contain" />
              ) : (
                <IconPhotoOff className="size-4 text-ink/25" />
              )}
            </span>
          ))}
          {more > 0 && <span className="text-xs font-medium text-ink/55">+{more}</span>}
        </div>
      )}
      <div className="mt-3.5 flex items-end justify-between gap-4 border-t border-dashed border-ink/15 pt-3.5">
        <span className="font-medium text-charcoal">Số tiền</span>
        <span className="text-xl leading-none font-bold tracking-tight text-navy">
          {formatMoney(payment.amount)}
        </span>
      </div>
    </div>
  );
}

function Pending({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <IconLoader2 className="size-10 animate-spin text-navy [stroke-width:1.5]" />
      <p className="mt-5 max-w-sm text-sm leading-relaxed text-ink/65">{text}</p>
    </div>
  );
}

const SECONDARY =
  'inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-ink/15 text-sm font-semibold text-charcoal transition hover:border-navy/40 hover:text-navy';

function Actions({ orderId, secondaryOnly }: { orderId?: string; secondaryOnly?: boolean }) {
  const orderLink = orderId ? `/tai-khoan/don-mua/${orderId}` : '/tai-khoan/don-mua';
  return (
    <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
      <Link to="/" className={SECONDARY}>
        Tiếp tục mua sắm
      </Link>
      <Link
        to={orderLink}
        className={
          secondaryOnly
            ? SECONDARY
            : cn(PRIMARY_BUTTON, 'inline-flex h-11 flex-1 items-center justify-center text-sm')
        }
      >
        Xem đơn hàng
      </Link>
    </div>
  );
}

/** Gợi ý sau khi thanh toán xong: hàng bán chạy */
function Suggestions() {
  const q = useProductSearch({ sort: 'best_selling', pageSize: 10 });
  if (q.isError || (q.data && q.data.items.length === 0)) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 pb-12">
      <SectionTitle title="Có thể bạn cũng thích" more="/tim-kiem?sort=best_selling" />
      <ProductRow items={q.data?.items ?? []} loading={q.isPending} rows={1} />
    </section>
  );
}
