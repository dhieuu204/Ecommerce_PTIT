import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, FlaskConical, Loader2, MailX, XCircle } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { LoadError } from '@/components/console/empty-state';
import { useCountdown } from '@/components/orders/order-parts';
import { Skeleton } from '@/components/ui/skeleton';
import { API, api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

interface MockInfo {
  ref: string;
  orderCode: string;
  amount: number;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
  payBefore: string;
}

type Result = 'SUCCESS' | 'FAILED' | 'PAID_NO_NOTICE';

const CHOICES: Array<{
  result: Result;
  icon: typeof CheckCircle2;
  title: string;
  text: string;
  className: string;
}> = [
  {
    result: 'SUCCESS',
    icon: CheckCircle2,
    title: 'Thanh toán thành công',
    text: 'Như VNPay báo kết quả (IPN) về sàn ngay.',
    className: 'border-emerald-300 hover:bg-emerald-50 text-emerald-700',
  },
  {
    result: 'FAILED',
    icon: XCircle,
    title: 'Thanh toán thất bại',
    text: 'Thẻ bị từ chối hoặc bạn bấm hủy. Được thử lại lần mới.',
    className: 'border-red-300 hover:bg-red-50 text-red-700',
  },
  {
    result: 'PAID_NO_NOTICE',
    icon: MailX,
    title: 'Trả tiền nhưng mất tin báo',
    text: 'Ngân hàng đã trừ tiền nhưng IPN không tới; sàn phải tra cứu mới biết.',
    className: 'border-amber-300 hover:bg-amber-50 text-amber-800',
  },
];

/**
 * Cổng thanh toán MÔ PHỎNG (khi payment-service chưa có khóa VNPay). Không có tiền thật; dùng để thử các
 * tình huống thành công, thất bại, mất tin báo mà không cần tài khoản VNPay.
 */
export function MockGatewayPage() {
  const [params] = useSearchParams();
  const ref = params.get('ref') ?? '';
  const navigate = useNavigate();
  const info = useQuery({
    queryKey: ['mock-gateway', ref],
    queryFn: () => api<MockInfo>(`${API.payment}/mock-gateway/payments/${encodeURIComponent(ref)}`),
    enabled: !!ref,
  });
  const complete = useMutation({
    mutationFn: (result: Result) =>
      api<{ returnUrl: string }>(
        `${API.payment}/mock-gateway/payments/${encodeURIComponent(ref)}`,
        {
          method: 'POST',
          body: { result },
        },
      ),
    onSuccess: (r) => navigate(r.returnUrl, { replace: true }),
    onError: (e) => toast.error(e.message),
  });
  const left = useCountdown(info.data?.payBefore);

  return (
    <div className="min-h-[70vh] bg-[radial-gradient(circle_at_top,rgba(200,169,107,0.15),transparent_60%)] px-4 py-10 md:py-16">
      <div className="mx-auto max-w-lg">
        <div className="mb-4 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 px-4 py-3 text-center text-sm font-bold tracking-wide text-amber-800">
          <FlaskConical className="size-5" />
          CỔNG THANH TOÁN MÔ PHỎNG · KHÔNG CÓ TIỀN THẬT
        </div>
        <div className="overflow-hidden rounded-3xl border border-ivory-200 bg-card shadow-sm">
          <div className="bg-navy px-6 py-5 text-white">
            <div className="text-xs uppercase tracking-widest text-champagne">
              Sàn TMĐT · Thanh toán
            </div>
            {info.data ? (
              <>
                <div className="mt-2 text-3xl font-bold">{formatMoney(info.data.amount)}</div>
                <div className="mt-1 text-sm text-white/70">
                  Đơn {info.data.orderCode} · Mã giao dịch {info.data.ref}
                </div>
              </>
            ) : (
              <Skeleton className="mt-2 h-9 w-48 bg-white/20" />
            )}
          </div>
          <div className="px-5 py-5 md:px-6">
            {!ref || info.isError ? (
              <LoadError message={info.error?.message ?? 'Thiếu mã giao dịch.'} />
            ) : info.data && info.data.status !== 'PENDING' ? (
              <p className="py-6 text-center text-sm text-ink/65">
                Lần thanh toán này đã có kết quả. Bạn quay lại Đơn mua để xem.
              </p>
            ) : (
              <>
                {left && (
                  <div className="mb-4 flex items-center justify-center gap-1.5 text-sm text-ink/60">
                    <Clock className="size-4" /> Hết hạn sau{' '}
                    <b className="tabular-nums text-navy">{left}</b>
                  </div>
                )}
                <div className="space-y-2.5">
                  {CHOICES.map((c) => (
                    <button
                      key={c.result}
                      type="button"
                      disabled={complete.isPending || !info.data}
                      onClick={() => complete.mutate(c.result)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3.5 text-left transition disabled:opacity-50',
                        c.className,
                      )}
                    >
                      {complete.isPending && complete.variables === c.result ? (
                        <Loader2 className="size-6 shrink-0 animate-spin" />
                      ) : (
                        <c.icon className="size-6 shrink-0" />
                      )}
                      <span className="min-w-0">
                        <span className="block font-semibold">{c.title}</span>
                        <span className="block text-xs text-ink/60">{c.text}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-ink/50">
          Điền VNPAY_TMN_CODE và VNPAY_HASH_SECRET vào services/payment-service/.env để dùng VNPay
          sandbox thật.
        </p>
      </div>
    </div>
  );
}
