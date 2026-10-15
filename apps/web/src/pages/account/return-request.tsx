import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Info, Loader2, PackageX } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { QuantityStepper } from '@/components/catalog/quantity-stepper';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { DigitsInput, Field, inputClass } from '@/components/form-bits';
import {
  RETURN_REASONS,
  ReturnImagePicker,
  StatementBox,
  type PickedImage,
} from '@/components/returns/return-parts';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { API, ApiError, api } from '@/lib/api';
import type { ReturnReason, ReturnRequest } from '@/lib/after-sales-types';
import { BANKS } from '@/lib/banks';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { Order } from '@/lib/order-types';
import { cn } from '@/lib/utils';
import { ordersKey } from './orders';
import { returnsKey } from './returns';

/**
 * Tài khoản › Đơn mua › Trả hàng/Hoàn tiền (RET-01): chọn món và số lượng, lý do (chỉ lỗi hàng/shop), mô tả,
 * 1–6 ảnh bằng chứng; đơn COD nhập thêm tài khoản nhận tiền hoàn
 */
export function ReturnRequestPage() {
  const { orderId = '', shopOrderId = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const order = useQuery({
    queryKey: [...ordersKey, 'detail', orderId],
    queryFn: () => api<Order>(`${API.market}/orders/${orderId}`),
  });
  // Mỗi lần mở trang một mã chống gửi lặp: bấm hai lần không tạo hai yêu cầu
  const [requestKey] = useState(() => crypto.randomUUID());
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<ReturnReason | null>(null);
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<PickedImage[]>([]);
  const [bank, setBank] = useState({ bankName: '', accountNumber: '', accountName: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = useMutation({
    mutationFn: () =>
      api<ReturnRequest>(`${API.market}/orders/${orderId}/shop-orders/${shopOrderId}/returns`, {
        method: 'POST',
        idempotencyKey: requestKey,
        body: {
          items: Object.entries(qty)
            .filter(([, n]) => n > 0)
            .map(([orderItemId, quantity]) => ({ orderItemId, quantity })),
          reason,
          description: description.trim(),
          images: images.map((i) => i.key),
          ...(order.data?.paymentMethod === 'COD' ? { bankAccount: bank } : {}),
        },
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ordersKey });
      void qc.invalidateQueries({ queryKey: returnsKey });
      toast.success('Đã gửi yêu cầu trả hàng, chờ shop trả lời.');
      navigate(`/tai-khoan/tra-hang/${r.id}`, { replace: true });
    },
    onError: (e) => {
      if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
      toast.error(e.message);
    },
  });

  if (order.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }
  if (order.isError) {
    return (
      <LoadError
        className="rounded-2xl border bg-card"
        message={order.error.message}
        onRetry={() => order.refetch()}
      />
    );
  }
  const o = order.data;
  const so = o.shopOrders.find((s) => s.id === shopOrderId);
  const back = (
    <Link
      to={`/tai-khoan/don-mua/${orderId}`}
      className="flex items-center gap-1 text-sm text-ink/60 hover:text-navy"
    >
      <ChevronLeft className="size-4" /> Quay lại đơn {o.code}
    </Link>
  );
  if (!so || !so.canRequestReturn) {
    return (
      <div className="space-y-4">
        {back}
        <EmptyState
          className="rounded-2xl border bg-card"
          icon={PackageX}
          title="Đơn này không gửi yêu cầu trả hàng được"
          text="Chỉ gửi được khi đơn đã giao, còn trong hạn và chưa có yêu cầu nào (mỗi đơn của shop gửi một lần)."
        />
      </div>
    );
  }

  const cod = o.paymentMethod === 'COD';
  const picked = Object.values(qty).filter((n) => n > 0).length;
  const valid =
    picked > 0 &&
    reason !== null &&
    description.trim().length >= 20 &&
    images.length > 0 &&
    (!cod || (bank.bankName && /^\d{6,20}$/.test(bank.accountNumber) && bank.accountName.trim()));

  return (
    <div className="space-y-4">
      {back}
      <section className="rounded-2xl border border-ivory-200 bg-card px-4 py-4 md:px-5">
        <h1 className="text-lg font-semibold text-navy">Yêu cầu trả hàng / hoàn tiền</h1>
        <p className="mt-1 text-sm text-ink/65">
          Đơn {so.code} của <b>{so.shop.name}</b> · hạn gửi yêu cầu{' '}
          {formatDateTime(so.completeBefore)}
        </p>
        <div className="mt-3 flex gap-2 rounded-xl bg-champagne-50 px-3 py-2.5 text-xs text-navy">
          <Info className="mt-0.5 size-4 shrink-0 text-champagne-600" />
          <div>
            Sàn hoàn đúng số bạn đã trả cho món trả (sau voucher), không gồm phí vận chuyển. Shop
            chấp nhận thì GHN tới lấy hàng tận nhà, bạn không trả phí gửi trả. Tiền được hoàn sau
            khi shop nhận lại hàng. Mỗi đơn chỉ gửi yêu cầu một lần.
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-ivory-200 bg-card px-4 py-4 md:px-5">
        <div className="mb-1 font-semibold text-navy">1. Chọn món muốn trả</div>
        {errors.items && <p className="mb-1 text-xs text-destructive">{errors.items}</p>}
        <div className="divide-y divide-ivory-200">
          {so.items.map((it) => {
            const n = qty[it.id] ?? 0;
            return (
              <div key={it.id} className="flex flex-wrap items-center gap-3 py-3">
                <Checkbox
                  checked={n > 0}
                  onCheckedChange={(v) =>
                    setQty((q) => ({ ...q, [it.id]: v === true ? it.quantity : 0 }))
                  }
                  aria-label={`Chọn ${it.productName}`}
                />
                <div className="size-14 shrink-0 overflow-hidden rounded-xl border border-ivory-200 bg-white p-1">
                  {it.image && <img src={it.image} alt="" className="size-full object-contain" />}
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <div className="line-clamp-2 font-medium text-ink">{it.productName}</div>
                  <div className="text-xs text-ink/55">
                    {it.variantName && `${it.variantName} · `}
                    {formatMoney(it.price)} × {it.quantity}
                  </div>
                </div>
                {n > 0 && it.quantity > 1 && (
                  <QuantityStepper
                    size="sm"
                    value={n}
                    max={it.quantity}
                    onChange={(v) => setQty((q) => ({ ...q, [it.id]: v }))}
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-ivory-200 bg-card px-4 py-4 md:px-5">
        <div className="mb-2 font-semibold text-navy">2. Lý do trả hàng</div>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Lý do">
          {(Object.keys(RETURN_REASONS) as ReturnReason[]).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={reason === r}
              onClick={() => setReason(r)}
              className={cn(
                'rounded-xl border px-3 py-2.5 text-left text-sm transition',
                reason === r
                  ? 'border-navy bg-navy text-white'
                  : 'border-ivory-200 bg-card text-ink hover:border-champagne',
              )}
            >
              {RETURN_REASONS[r]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink/50">
          Sàn chỉ nhận trả hàng vì lỗi của hàng hoặc của shop, không nhận đổi ý.
        </p>
        <div className="mt-4 mb-1 text-sm font-medium text-ink">Mô tả vấn đề</div>
        <StatementBox
          value={description}
          onChange={setDescription}
          min={20}
          placeholder="Ví dụ: áo bị rách đường may ở vai, mở hộp đã thấy..."
        />
        {errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
      </section>

      <section className="rounded-2xl border border-ivory-200 bg-card px-4 py-4 md:px-5">
        <div className="mb-1 font-semibold text-navy">3. Ảnh bằng chứng</div>
        <p className="mb-3 text-xs text-ink/55">
          1–6 ảnh JPG, PNG hoặc WebP, mỗi ảnh tối đa 5 MB. Chỉ bạn, shop và quản trị viên hỗ trợ xem
          được.
        </p>
        <ReturnImagePicker value={images} onChange={setImages} disabled={submit.isPending} />
        {errors.images && <p className="mt-1 text-xs text-destructive">{errors.images}</p>}
      </section>

      {cod && (
        <section className="rounded-2xl border border-ivory-200 bg-card px-4 py-4 md:px-5">
          <div className="mb-1 font-semibold text-navy">4. Tài khoản nhận tiền hoàn</div>
          <p className="mb-3 text-xs text-ink/55">
            Đơn trả khi nhận hàng (COD) nên sàn chuyển khoản tiền hoàn vào tài khoản này.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="bankName" label="Ngân hàng" error={errors['bankAccount.bankName']}>
              <select
                id="bankName"
                className={inputClass}
                value={bank.bankName}
                onChange={(e) => setBank((b) => ({ ...b, bankName: e.target.value }))}
              >
                <option value="">Chọn ngân hàng</option>
                {BANKS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              id="accountNumber"
              label="Số tài khoản"
              error={errors['bankAccount.accountNumber'] ?? errors.bankAccount}
            >
              <DigitsInput
                id="accountNumber"
                maxLength={20}
                value={bank.accountNumber}
                onChange={(e) => setBank((b) => ({ ...b, accountNumber: e.target.value }))}
              />
            </Field>
            <Field
              id="accountName"
              label="Tên chủ tài khoản"
              error={errors['bankAccount.accountName']}
            >
              <input
                id="accountName"
                className={cn(inputClass, 'uppercase')}
                maxLength={100}
                value={bank.accountName}
                onChange={(e) => setBank((b) => ({ ...b, accountName: e.target.value }))}
              />
            </Field>
          </div>
        </section>
      )}

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline" className="rounded-lg">
          <Link to={`/tai-khoan/don-mua/${orderId}`}>Quay lại</Link>
        </Button>
        <Button
          className="rounded-lg"
          disabled={!valid || submit.isPending}
          onClick={() => {
            setErrors({});
            submit.mutate();
          }}
        >
          {submit.isPending && <Loader2 className="size-4 animate-spin" />}
          Gửi yêu cầu
        </Button>
      </div>
    </div>
  );
}
