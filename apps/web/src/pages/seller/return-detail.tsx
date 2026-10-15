import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  PackageCheck,
  Scale,
  Truck,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { toast } from 'sonner';
import { LoadError } from '@/components/console/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { ConfirmDialog } from '@/components/orders/order-parts';
import {
  ReturnImagePicker,
  ReturnStatusBadge,
  StatementBox,
  type PickedImage,
} from '@/components/returns/return-parts';
import { ActionBar, ReturnBody } from '@/components/returns/return-view';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { API, api } from '@/lib/api';
import type { ReturnRequest } from '@/lib/after-sales-types';
import { formatDateTime, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { sellerOrdersKey } from './orders';
import { sellerReturnsKey } from './returns';

type Dialog = null | 'ACCEPT' | 'REJECT' | 'INSPECT';

/**
 * Kênh người bán › Trả hàng › Chi tiết (RET-02, RET-03): chấp nhận (gửi hàng về hoặc hoàn tiền ngay), từ
 * chối có lý do, kiểm hàng trả (chọn dòng nhập lại kho; hàng không đúng thì khiếu nại)
 */
export function SellerReturnDetailPage() {
  const { returnId = '' } = useParams();
  const qc = useQueryClient();
  const key = [...sellerReturnsKey, 'detail', returnId];
  const detail = useQuery({
    queryKey: key,
    queryFn: () => api<ReturnRequest>(`${API.market}/shops/me/returns/${returnId}`),
    refetchInterval: (q) => (q.state.data?.shipment?.status === 'CREATING' ? 5000 : false),
  });
  const [dialog, setDialog] = useState<Dialog>(null);

  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body: object }) =>
      api<ReturnRequest>(`${API.market}/shops/me/returns/${returnId}/${path}`, {
        method: 'POST',
        body,
      }),
    onSuccess: (r, { path }) => {
      qc.setQueryData(key, r);
      void qc.invalidateQueries({ queryKey: sellerReturnsKey });
      void qc.invalidateQueries({ queryKey: sellerOrdersKey });
      toast.success(
        path === 'accept'
          ? r.status === 'REFUNDING'
            ? 'Đã chấp nhận, sàn hoàn tiền cho người mua.'
            : 'Đã chấp nhận, GHN sẽ lấy hàng trả ở nhà người mua.'
          : path === 'reject'
            ? 'Đã từ chối yêu cầu.'
            : r.status === 'DISPUTED'
              ? 'Đã gửi khiếu nại, quản trị viên sẽ phân xử.'
              : 'Đã xác nhận hàng trả, sàn hoàn tiền cho người mua.',
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
        <Skeleton className="h-96 rounded-2xl" />
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
  const r = detail.data;
  const busy = action.isPending;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        crumbs={[{ label: 'Trả hàng', to: '/kenh-nguoi-ban/tra-hang' }, { label: r.code }]}
        title={`Yêu cầu ${r.code}`}
        description={`Đơn ${r.shopOrderCode} · người mua ${r.buyer?.name ?? ''} · gửi ${formatDateTime(r.createdAt)}`}
        actions={<ReturnStatusBadge status={r.status} className="text-sm" />}
      />

      <SellerStatus
        ret={r}
        busy={busy}
        onAccept={() => setDialog('ACCEPT')}
        onReject={() => setDialog('REJECT')}
        onInspect={() => setDialog('INSPECT')}
      />

      <ReturnBody ret={r} viewer="SELLER" />

      <AcceptDialog
        open={dialog === 'ACCEPT'}
        onOpenChange={(o) => !o && setDialog(null)}
        ret={r}
        onSubmit={(refundWithoutReturn) =>
          action.mutateAsync({ path: 'accept', body: { refundWithoutReturn } })
        }
      />
      <RejectDialog
        open={dialog === 'REJECT'}
        onOpenChange={(o) => !o && setDialog(null)}
        onSubmit={(reason, images) =>
          action.mutateAsync({ path: 'reject', body: { reason, images } })
        }
      />
      <InspectDialog
        open={dialog === 'INSPECT'}
        onOpenChange={(o) => !o && setDialog(null)}
        ret={r}
        onSubmit={(body) => action.mutateAsync({ path: 'inspect', body })}
      />
    </div>
  );
}

function SellerStatus({
  ret: r,
  busy,
  onAccept,
  onReject,
  onInspect,
}: {
  ret: ReturnRequest;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
  onInspect: () => void;
}) {
  switch (r.status) {
    case 'REQUESTED':
      return (
        <ActionBar
          tone="info"
          icon={Clock}
          title="Người mua yêu cầu trả hàng, chờ bạn trả lời"
          text={
            <>
              Trả lời trước <b>{formatDateTime(r.deadline)}</b>; quá hạn yêu cầu được tự chấp nhận.
              Người mua có thể khiếu nại nếu bạn từ chối.
            </>
          }
          actions={
            r.actions.canRespond && (
              <>
                <Button variant="outline" onClick={onReject} disabled={busy}>
                  Từ chối
                </Button>
                <Button onClick={onAccept} disabled={busy}>
                  Chấp nhận
                </Button>
              </>
            )
          }
        />
      );
    case 'REJECTED':
      return (
        <ActionBar
          tone="muted"
          icon={XCircle}
          title="Bạn đã từ chối yêu cầu"
          text={<>Người mua còn khiếu nại được tới {formatDateTime(r.deadline)}.</>}
        />
      );
    case 'DISPUTED':
      return (
        <ActionBar
          tone="warn"
          icon={Scale}
          title="Đang khiếu nại, chờ quản trị viên phân xử"
          text="Tiền của đơn này được giữ tới khi có kết quả."
        />
      );
    case 'SHIPPING_BACK':
      return (
        <ActionBar
          tone="info"
          icon={Truck}
          title={
            r.shipment?.status === 'PICKED'
              ? 'GHN đang chuyển hàng trả về shop'
              : 'Chờ GHN lấy hàng ở nhà người mua'
          }
          text="Khi hàng về tới shop, bạn kiểm hàng rồi xác nhận."
        />
      );
    case 'RECEIVED':
      return (
        <ActionBar
          tone="warn"
          icon={PackageCheck}
          title="Hàng trả đã về shop, mời bạn kiểm hàng"
          text={
            <>
              Kiểm xong trước <b>{formatDateTime(r.deadline)}</b>; quá hạn sàn tự hoàn tiền cho
              người mua và hàng <b>không</b> được nhập lại kho.
            </>
          }
          actions={
            r.actions.canInspect && (
              <Button onClick={onInspect} disabled={busy}>
                <PackageCheck className="size-4" /> Kiểm hàng
              </Button>
            )
          }
        />
      );
    case 'REFUNDING':
    case 'REFUNDED':
      return (
        <ActionBar
          tone="success"
          icon={CheckCircle2}
          title={`Người mua được hoàn ${formatMoney(r.decidedRefund ?? 0)}`}
          text={
            r.platformCovers
              ? 'Kiện trả bị thất lạc: sàn chịu khoản hoàn, tiền của shop không bị trừ.'
              : 'Tiền của đơn trong ví shop được trừ tương ứng (phí sàn tính lại trên phần còn lại).'
          }
        />
      );
    case 'CLOSED':
      return (
        <ActionBar tone="muted" icon={CheckCircle2} title="Yêu cầu đã đóng, không hoàn tiền" />
      );
    default:
      return <ActionBar tone="muted" icon={AlertTriangle} title="Người mua đã hủy yêu cầu" />;
  }
}

function AcceptDialog({
  open,
  onOpenChange,
  ret,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ret: ReturnRequest;
  onSubmit: (refundWithoutReturn: boolean) => Promise<unknown>;
}) {
  const [noReturn, setNoReturn] = useState(false);
  useEffect(() => {
    if (open) setNoReturn(ret.reason === 'MISSING');
  }, [open, ret.reason]);
  const option = (value: boolean, title: string, text: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={noReturn === value}
      onClick={() => setNoReturn(value)}
      className={cn(
        'w-full rounded-xl border px-3 py-2.5 text-left text-sm transition',
        noReturn === value
          ? 'border-navy bg-navy/[0.04]'
          : 'border-ivory-200 hover:border-champagne',
      )}
    >
      <div className="font-medium text-navy">{title}</div>
      <div className="text-xs text-ink/60">{text}</div>
    </button>
  );
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Chấp nhận yêu cầu trả hàng"
      description={`Người mua được hoàn tối đa ${formatMoney(ret.refundAmount)}.`}
      confirmLabel="Chấp nhận"
      onConfirm={() => onSubmit(noReturn)}
    >
      <div className="space-y-2" role="radiogroup">
        {option(
          false,
          'Nhận lại hàng rồi hoàn tiền',
          'Sàn tạo vận đơn GHN lấy hàng ở nhà người mua (sàn trả phí). Bạn kiểm hàng khi nhận được.',
        )}
        {option(
          true,
          'Hoàn tiền ngay, không cần gửi trả',
          'Phù hợp khi thiếu hàng hoặc hàng giá trị thấp. Sàn hoàn tiền ngay cho người mua.',
        )}
      </div>
    </ConfirmDialog>
  );
}

function RejectDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string, images: string[]) => Promise<unknown>;
}) {
  const [reason, setReason] = useState('');
  const [images, setImages] = useState<PickedImage[]>([]);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setReason('');
          setImages([]);
        }
        onOpenChange(o);
      }}
      title="Từ chối yêu cầu trả hàng"
      description="Ghi rõ lý do (người mua và quản trị viên sẽ đọc nếu có khiếu nại). Có thể thêm ảnh chứng minh."
      confirmLabel="Từ chối"
      onConfirm={() =>
        reason.trim().length >= 10
          ? onSubmit(
              reason.trim(),
              images.map((i) => i.key),
            )
          : Promise.reject(toast.error('Lý do cần ít nhất 10 ký tự.'))
      }
    >
      <StatementBox
        value={reason}
        onChange={setReason}
        min={10}
        placeholder="Ví dụ: ảnh không cho thấy lỗi, hàng đã được kiểm trước khi gửi..."
      />
      <ReturnImagePicker value={images} onChange={setImages} />
    </ConfirmDialog>
  );
}

function InspectDialog({
  open,
  onOpenChange,
  ret,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ret: ReturnRequest;
  onSubmit: (body: {
    result: 'OK' | 'PROBLEM';
    restockItemIds: string[];
    note?: string;
    images?: string[];
  }) => Promise<unknown>;
}) {
  const [result, setResult] = useState<'OK' | 'PROBLEM'>('OK');
  const [restock, setRestock] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [images, setImages] = useState<PickedImage[]>([]);
  useEffect(() => {
    if (open) {
      setResult('OK');
      setRestock(ret.items.map((i) => i.orderItemId));
      setNote('');
      setImages([]);
    }
  }, [open, ret.items]);
  const problem = result === 'PROBLEM';
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Kiểm hàng trả"
      description="Chọn kết quả kiểm hàng và các dòng còn bán được để nhập lại kho (độc lập với hoàn tiền)."
      confirmLabel={problem ? 'Gửi khiếu nại' : 'Hàng đúng, hoàn tiền'}
      onConfirm={() => {
        if (problem && (note.trim().length < 10 || images.length === 0)) {
          return Promise.reject(toast.error('Mô tả ít nhất 10 ký tự và kèm ít nhất 1 ảnh.'));
        }
        return onSubmit({
          result,
          restockItemIds: restock,
          ...(problem ? { note: note.trim(), images: images.map((i) => i.key) } : {}),
        });
      }}
    >
      <div className="grid grid-cols-2 gap-2" role="radiogroup">
        {(
          [
            ['OK', 'Hàng đúng như yêu cầu'],
            ['PROBLEM', 'Hàng trả về không đúng'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={result === value}
            onClick={() => setResult(value)}
            className={cn(
              'rounded-xl border px-3 py-2 text-sm transition',
              result === value
                ? 'border-navy bg-navy text-white'
                : 'border-ivory-200 hover:border-champagne',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="max-h-52 space-y-2 overflow-y-auto">
        {ret.items.map((it) => {
          const on = restock.includes(it.orderItemId);
          return (
            <label
              key={it.orderItemId}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition',
                on ? 'border-navy/40 bg-navy/[0.03]' : 'border-ivory-200',
              )}
            >
              <Checkbox
                checked={on}
                onCheckedChange={(v) =>
                  setRestock((p) =>
                    v === true
                      ? [...new Set([...p, it.orderItemId])]
                      : p.filter((x) => x !== it.orderItemId),
                  )
                }
              />
              <div className="min-w-0 flex-1 text-sm">
                <div className="truncate font-medium text-ink">{it.productName}</div>
                <div className="text-xs text-ink/55">
                  {it.variantName && `${it.variantName} · `}nhập lại {it.quantity}
                </div>
              </div>
            </label>
          );
        })}
      </div>
      {problem && (
        <>
          <StatementBox
            value={note}
            onChange={setNote}
            min={10}
            placeholder="Ví dụ: hàng gửi về không phải hàng shop đã bán, đã qua sử dụng, thiếu phụ kiện..."
          />
          <ReturnImagePicker value={images} onChange={setImages} />
          <p className="text-xs text-ink/55">
            Quản trị viên sẽ phân xử: hoàn toàn bộ, hoàn một phần hoặc không hoàn.
          </p>
        </>
      )}
    </ConfirmDialog>
  );
}
