import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Loader2,
  PackageCheck,
  RotateCcw,
  Scale,
  Truck,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { LoadError } from '@/components/console/empty-state';
import { ConfirmDialog } from '@/components/orders/order-parts';
import {
  ReturnImagePicker,
  ReturnStatusBadge,
  StatementBox,
  type PickedImage,
} from '@/components/returns/return-parts';
import { ActionBar, ReturnBody } from '@/components/returns/return-view';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { API, api } from '@/lib/api';
import type { ReturnRequest } from '@/lib/after-sales-types';
import { formatDateTime, formatMoney } from '@/lib/format';
import { ordersKey } from './orders';
import { returnsKey } from './returns';

/**
 * Tài khoản › Trả hàng › Chi tiết (RET-01..04, DIS-01): tình hình xử lý, hủy yêu cầu, khiếu nại khi shop từ
 * chối, tạo lại vận đơn trả, theo dõi kiện trả, tiền hoàn
 */
export function ReturnDetailPage() {
  const { returnId = '' } = useParams();
  const qc = useQueryClient();
  const key = [...returnsKey, 'detail', returnId];
  const detail = useQuery({
    queryKey: key,
    queryFn: () => api<ReturnRequest>(`${API.market}/returns/${returnId}`),
    refetchInterval: (q) =>
      q.state.data?.status === 'REFUNDING' || q.state.data?.shipment?.status === 'CREATING'
        ? 5000
        : false,
  });
  const [dialog, setDialog] = useState<null | 'CANCEL' | 'DISPUTE'>(null);

  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: object }) =>
      api<ReturnRequest>(`${API.market}/returns/${returnId}/${path}`, { method: 'POST', body }),
    onSuccess: (r, { path }) => {
      qc.setQueryData(key, r);
      void qc.invalidateQueries({ queryKey: returnsKey });
      void qc.invalidateQueries({ queryKey: ordersKey });
      toast.success(
        {
          cancel: 'Đã hủy yêu cầu trả hàng.',
          dispute: 'Đã gửi khiếu nại, quản trị viên sẽ xem xét.',
          'shipment/retry': 'Đã tạo lại vận đơn trả hàng.',
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
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
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
  const r = detail.data;
  const busy = action.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to="/tai-khoan/tra-hang"
          className="flex items-center gap-1 text-sm text-ink/60 hover:text-navy"
        >
          <ChevronLeft className="size-4" /> Trả hàng / Hoàn tiền
        </Link>
        <div className="flex items-center gap-2 text-sm text-ink/60">
          <Link to={`/tai-khoan/don-mua/${r.orderId}`} className="hover:text-navy">
            Đơn {r.shopOrderCode}
          </Link>
          <ReturnStatusBadge status={r.status} />
        </div>
      </div>

      <BuyerStatus
        ret={r}
        busy={busy}
        onCancel={() => setDialog('CANCEL')}
        onDispute={() => setDialog('DISPUTE')}
        onRetry={() => action.mutate({ path: 'shipment/retry' })}
      />

      <ReturnBody ret={r} viewer="BUYER" />

      <ConfirmDialog
        open={dialog === 'CANCEL'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Hủy yêu cầu trả hàng?"
        description="Mỗi đơn chỉ gửi yêu cầu trả hàng một lần: đã hủy thì không gửi lại được, đơn hoàn tất ngay."
        confirmLabel="Hủy yêu cầu"
        onConfirm={() => action.mutateAsync({ path: 'cancel' })}
      />
      <DisputeDialog
        open={dialog === 'DISPUTE'}
        onOpenChange={(open) => !open && setDialog(null)}
        onSubmit={(statement, images) =>
          action.mutateAsync({ path: 'dispute', body: { statement, images } })
        }
      />
    </div>
  );
}

function BuyerStatus({
  ret: r,
  busy,
  onCancel,
  onDispute,
  onRetry,
}: {
  ret: ReturnRequest;
  busy: boolean;
  onCancel: () => void;
  onDispute: () => void;
  onRetry: () => void;
}) {
  const cancelBtn = r.actions.canCancel && (
    <Button variant="outline" onClick={onCancel} disabled={busy}>
      Hủy yêu cầu
    </Button>
  );
  switch (r.status) {
    case 'REQUESTED':
      return (
        <ActionBar
          tone="info"
          icon={Clock}
          title="Đã gửi yêu cầu, chờ shop trả lời"
          text={
            <>
              Shop cần trả lời trước <b>{formatDateTime(r.deadline)}</b>; quá hạn yêu cầu được tự
              chấp nhận.
            </>
          }
          actions={cancelBtn}
        />
      );
    case 'REJECTED':
      return (
        <ActionBar
          tone="danger"
          icon={XCircle}
          title="Shop từ chối yêu cầu trả hàng"
          text={
            r.actions.canDispute ? (
              <>
                Không đồng ý? Bạn khiếu nại để quản trị viên phân xử trước{' '}
                <b>{formatDateTime(r.deadline)}</b>; quá hạn yêu cầu sẽ đóng.
              </>
            ) : (
              'Đã hết hạn khiếu nại.'
            )
          }
          actions={
            r.actions.canDispute && (
              <Button onClick={onDispute} disabled={busy}>
                <Scale className="size-4" /> Khiếu nại
              </Button>
            )
          }
        />
      );
    case 'DISPUTED':
      return (
        <ActionBar
          tone="warn"
          icon={Scale}
          title="Đang khiếu nại, chờ quản trị viên phân xử"
          text="Quản trị viên xem lời và ảnh của bạn và của shop rồi quyết định. Tiền của shop được giữ tới khi có kết quả."
        />
      );
    case 'SHIPPING_BACK': {
      const s = r.shipment?.status;
      if (s === 'CREATE_FAILED') {
        return (
          <ActionBar
            tone="danger"
            icon={AlertTriangle}
            title="GHN chưa nhận vận đơn trả hàng"
            text={r.shipment?.lastError ?? 'GHN từ chối tạo vận đơn.'}
            actions={
              <>
                {cancelBtn}
                {r.actions.canRetryShipment && (
                  <Button onClick={onRetry} disabled={busy}>
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RotateCcw className="size-4" />
                    )}
                    Tạo lại vận đơn
                  </Button>
                )}
              </>
            }
          />
        );
      }
      if (s === 'PICKED') {
        return (
          <ActionBar
            tone="info"
            icon={Truck}
            title="GHN đã lấy hàng, đang chuyển về shop"
            text="Shop kiểm hàng khi nhận được rồi sàn hoàn tiền cho bạn."
          />
        );
      }
      if (s === 'LOST') {
        return (
          <ActionBar
            tone="warn"
            icon={AlertTriangle}
            title="GHN báo kiện trả gặp sự cố"
            text="Sàn đang xác minh với GHN. Nếu xác nhận thất lạc, bạn được hoàn đủ tiền."
          />
        );
      }
      return (
        <ActionBar
          tone="info"
          icon={PackageCheck}
          title="Shop đã chấp nhận, chuẩn bị hàng để GHN tới lấy"
          text={
            <>
              Đóng gói hàng trả kèm phụ kiện. GHN tới lấy tại địa chỉ nhận hàng của đơn
              {r.deadline && (
                <>
                  {' '}
                  trước <b>{formatDateTime(r.deadline)}</b>
                </>
              )}
              ; quá hạn chưa giao được cho GHN thì yêu cầu tự hủy.
            </>
          }
          actions={cancelBtn}
        />
      );
    }
    case 'RECEIVED':
      return (
        <ActionBar
          tone="info"
          icon={PackageCheck}
          title="Hàng trả đã về shop, shop đang kiểm hàng"
          text={
            <>
              Shop kiểm xong trước <b>{formatDateTime(r.deadline)}</b>; quá hạn sàn tự hoàn tiền cho
              bạn.
            </>
          }
        />
      );
    case 'REFUNDING':
      return (
        <ActionBar
          tone="info"
          icon={Clock}
          title={`Đang hoàn ${formatMoney(r.decidedRefund ?? 0)}`}
          text={
            r.refundStatus === 'NEEDS_MANUAL'
              ? 'Sàn đang chuyển khoản cho bạn, thường trong 1–2 ngày làm việc.'
              : 'Tiền về tài khoản thanh toán VNPay trong vài ngày làm việc tùy ngân hàng.'
          }
        />
      );
    case 'REFUNDED':
      return (
        <ActionBar
          tone="success"
          icon={CheckCircle2}
          title={`Đã hoàn ${formatMoney(r.decidedRefund ?? 0)}`}
          text="Yêu cầu trả hàng đã xong."
        />
      );
    case 'CLOSED':
      return (
        <ActionBar
          tone="muted"
          icon={XCircle}
          title="Yêu cầu đã đóng, không hoàn tiền"
          text="Xem lý do ở các bước đã qua bên dưới."
        />
      );
    default:
      return <ActionBar tone="muted" icon={XCircle} title="Yêu cầu đã hủy" />;
  }
}

function DisputeDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (statement: string, images: string[]) => Promise<unknown>;
}) {
  const [statement, setStatement] = useState('');
  const [images, setImages] = useState<PickedImage[]>([]);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setStatement('');
          setImages([]);
        }
        onOpenChange(o);
      }}
      title="Khiếu nại lên quản trị viên"
      description="Trình bày vì sao bạn không đồng ý với shop. Có thể thêm ảnh (ví dụ ảnh mở hộp). Mỗi yêu cầu khiếu nại một lần."
      confirmLabel="Gửi khiếu nại"
      onConfirm={() =>
        statement.trim().length >= 20
          ? onSubmit(
              statement.trim(),
              images.map((i) => i.key),
            )
          : Promise.reject(toast.error('Lời trình bày cần ít nhất 20 ký tự.'))
      }
    >
      <StatementBox
        value={statement}
        onChange={setStatement}
        min={20}
        placeholder="Ví dụ: áo rách ngay khi mở hộp, tôi có ảnh lúc mở hộp..."
      />
      <ReturnImagePicker value={images} onChange={setImages} />
    </ConfirmDialog>
  );
}
