import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, Loader2, ShoppingBag, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { LoadError } from '@/components/console/empty-state';
import { useCountdown } from '@/components/orders/order-parts';
import { Button } from '@/components/ui/button';
import { API, api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type { Order, OrderPayment } from '@/lib/order-types';
import { cn } from '@/lib/utils';
import { startPayment } from './checkout';

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
      window.location.assign(link.payUrl);
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
      <Frame mock={mock}>
        <Hero
          tone="success"
          icon={CheckCircle2}
          title="Thanh toán thành công"
          text={`Đơn ${s.orderCode} · ${formatMoney(s.amount)}`}
        />
        <p className="mt-4 text-center text-sm text-ink/65">
          {checking
            ? 'Đơn có giá trị lớn đang được sàn kiểm tra. Sau khi qua kiểm tra, shop sẽ xác nhận đơn.'
            : 'Shop sẽ xác nhận đơn của bạn trong thời gian sớm nhất.'}
        </p>
        <Actions orderId={s.orderId} />
      </Frame>
    );
  }
  if (s.status === 'EXPIRED' || s.status === 'CANCELLED') {
    return (
      <Frame mock={mock}>
        <Hero
          tone="danger"
          icon={XCircle}
          title={s.status === 'EXPIRED' ? 'Đơn đã hết hạn thanh toán' : 'Đơn đã bị hủy'}
          text={`Đơn ${s.orderCode}. Nếu tài khoản đã bị trừ tiền, sàn sẽ tự hoàn lại.`}
        />
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
        icon={XCircle}
        title="Thanh toán chưa thành công"
        text={`Đơn ${s.orderCode} · ${formatMoney(s.amount)} · đã thử ${s.attempts}/${s.maxAttempts} lần`}
      />
      <RetryBox payment={s} retrying={retrying} onRetry={retry} />
      <Actions orderId={s.orderId} />
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
  return (
    <div className="mt-5 rounded-2xl bg-ivory/70 px-4 py-4 text-center text-sm">
      {canRetry ? (
        <>
          <div className="flex items-center justify-center gap-1.5 text-ink/65">
            <Clock className="size-4" /> Còn <b className="text-navy tabular-nums">{left}</b> để
            thanh toán
          </div>
          <Button className="mt-3 h-11 rounded-xl px-8" onClick={onRetry} disabled={retrying}>
            {retrying && <Loader2 className="size-4 animate-spin" />}
            Thanh toán lại
          </Button>
        </>
      ) : (
        <span className="text-ink/65">
          Đơn đã hết lượt hoặc hết hạn thanh toán và sẽ tự hủy. Bạn có thể đặt lại từ giỏ hàng.
        </span>
      )}
    </div>
  );
}

function Frame({ children, mock }: { children: React.ReactNode; mock?: boolean }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-10 md:py-16">
      <div className="rounded-3xl border border-ivory-200 bg-card px-5 py-8 shadow-sm md:px-10">
        {mock && (
          <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-center text-xs font-semibold tracking-wide text-amber-800">
            MÔ PHỎNG · cổng thanh toán giả, không có tiền thật
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function Hero({
  tone,
  icon: Icon,
  title,
  text,
}: {
  tone: 'success' | 'danger';
  icon: typeof CheckCircle2;
  title: string;
  text: string;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <span
        className={cn(
          'flex size-20 items-center justify-center rounded-full ring-[10px]',
          tone === 'success'
            ? 'bg-emerald-50 text-emerald-600 ring-emerald-50/60'
            : 'bg-red-50 text-red-600 ring-red-50/60',
        )}
      >
        <Icon className="size-10" strokeWidth={1.6} />
      </span>
      <h1 className="mt-6 text-xl font-bold text-navy md:text-2xl">{title}</h1>
      <p className="mt-1.5 text-sm text-ink/60">{text}</p>
    </div>
  );
}

function Pending({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <Loader2 className="size-10 animate-spin text-champagne-600" />
      <p className="mt-5 max-w-sm text-sm text-ink/70">{text}</p>
    </div>
  );
}

function Actions({ orderId }: { orderId?: string }) {
  return (
    <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
      <Button asChild variant="outline" className="h-11 rounded-xl">
        <Link to={orderId ? `/tai-khoan/don-mua/${orderId}` : '/tai-khoan/don-mua'}>
          Xem đơn hàng
        </Link>
      </Button>
      <Button asChild className="h-11 rounded-xl">
        <Link to="/">
          <ShoppingBag className="size-4" />
          Tiếp tục mua sắm
        </Link>
      </Button>
    </div>
  );
}
