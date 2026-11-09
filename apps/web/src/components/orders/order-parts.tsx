import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconCircleCheck,
  IconCircleX,
  IconClipboardCheck,
  IconClock,
  IconCreditCard,
  IconHomeCheck,
  IconLoader2,
  IconPackage,
  IconPhotoOff,
  IconReceipt,
  IconTruck,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime, formatMoney } from '@/lib/format';
import type {
  CancelActor,
  OrderHistoryRow,
  OrderItem,
  RefundStatus,
  ShippingFeeSource,
  ShopOrderStatus,
} from '@/lib/order-types';
import { cn } from '@/lib/utils';

type Tone = 'pending' | 'danger' | 'success' | 'neutral' | 'info';

/** Tên trạng thái đơn con. PENDING tùy đơn đã trả chưa: "Chờ thanh toán" / "Chờ duyệt đơn" */
export function shopOrderStatusLabel(status: ShopOrderStatus, paid: boolean): string {
  switch (status) {
    case 'PENDING':
      return paid ? 'Chờ duyệt đơn' : 'Chờ thanh toán';
    case 'TO_CONFIRM':
      return 'Chờ shop xác nhận';
    case 'CONFIRMED':
      return 'Chờ giao hàng';
    case 'CANCEL_REQUESTED':
      return 'Đang xin hủy';
    case 'CANCELLED':
      return 'Đã hủy';
    case 'SHIPPING':
      return 'Đang giao';
    case 'DELIVERED':
      return 'Đã giao';
    case 'COMPLETED':
      return 'Hoàn tất';
    case 'RETURNING':
      return 'Giao không thành công, đang hoàn hàng';
    case 'RETURNED':
      return 'Đã hoàn hàng về shop';
    case 'FAILED':
      return 'Giao không thành công';
    case 'INCIDENT':
      return 'Sự cố vận chuyển';
    case 'INCIDENT_RESOLVED':
      return 'Đã xử lý sự cố';
  }
}

const STATUS_TONE: Record<ShopOrderStatus, Tone> = {
  PENDING: 'pending',
  TO_CONFIRM: 'info',
  CONFIRMED: 'info',
  CANCEL_REQUESTED: 'pending',
  CANCELLED: 'neutral',
  SHIPPING: 'info',
  DELIVERED: 'success',
  COMPLETED: 'success',
  RETURNING: 'danger',
  RETURNED: 'pending',
  FAILED: 'neutral',
  INCIDENT: 'danger',
  INCIDENT_RESOLVED: 'neutral',
};

export function ShopOrderStatusBadge({
  status,
  paid,
  className,
}: {
  status: ShopOrderStatus;
  paid: boolean;
  className?: string;
}) {
  return (
    <StatusBadge tone={STATUS_TONE[status]} className={className}>
      {shopOrderStatusLabel(status, paid)}
    </StatusBadge>
  );
}

const REFUND: Record<Exclude<RefundStatus, 'NONE'>, { label: string; tone: Tone }> = {
  PROCESSING: { label: 'Đang hoàn tiền', tone: 'pending' },
  NEEDS_MANUAL: { label: 'Sàn đang hoàn tiền thủ công', tone: 'pending' },
  SUCCEEDED: { label: 'Đã hoàn tiền', tone: 'success' },
  MANUAL_DONE: { label: 'Đã hoàn tiền (chuyển khoản)', tone: 'success' },
};

export function RefundBadge({ status }: { status: RefundStatus }) {
  if (status === 'NONE') return null;
  const r = REFUND[status];
  return <StatusBadge tone={r.tone}>{r.label}</StatusBadge>;
}

export const CANCEL_ACTOR: Record<CancelActor, string> = {
  BUYER: 'Người mua',
  SELLER: 'Shop',
  ADMIN: 'Quản trị viên',
  SYSTEM: 'Hệ thống',
};

/** Nhãn nguồn phí ship (SHIP-01) */
export const SHIPPING_SOURCE: Record<ShippingFeeSource, string> = {
  GHN: 'Theo giá GHN',
  FALLBACK: 'Phí dự phòng (GHN tạm lỗi)',
  FIXED: 'Phí cố định (chưa nối GHN)',
};

/** Đếm ngược tới một thời điểm: "12:05"; hết giờ thì null */
export function useCountdown(iso: string | null | undefined): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [iso]);
  if (!iso) return null;
  const left = Math.floor((new Date(iso).getTime() - now) / 1000);
  if (left <= 0) return null;
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Số bước sau "Đặt hàng/Thanh toán" đã qua theo trạng thái; không có = đơn đi chệch luồng giao bình thường */
const PROGRESS: Partial<Record<ShopOrderStatus, number>> = {
  PENDING: 0,
  TO_CONFIRM: 0,
  CONFIRMED: 1,
  CANCEL_REQUESTED: 1,
  SHIPPING: 2,
  DELIVERED: 3,
  COMPLETED: 4,
};

/**
 * Thanh tiến trình của một đơn con (người mua và người bán dùng chung). Đơn đã hủy, hoàn hàng, sự cố thì không
 * hiện vì đã có ghi chú riêng. Ô đặc là bước đã qua, ô viền cam là bước đang chờ tới.
 */
export function OrderProgress({
  status,
  cod,
  paid,
  at,
  className,
}: {
  status: ShopOrderStatus;
  cod: boolean;
  paid: boolean;
  at: {
    placed: string | null;
    paid: string | null;
    confirmed: string | null;
    shipped: string | null;
    delivered: string | null;
    completed: string | null;
  };
  className?: string;
}) {
  const passed = PROGRESS[status];
  if (passed === undefined) return null;
  const steps = [
    { label: 'Đặt hàng', icon: IconReceipt, at: at.placed },
    ...(cod ? [] : [{ label: 'Thanh toán', icon: IconCreditCard, at: at.paid }]),
    { label: 'Shop xác nhận', icon: IconClipboardCheck, at: at.confirmed },
    { label: 'Đang giao', icon: IconTruck, at: at.shipped },
    { label: 'Đã giao', icon: IconHomeCheck, at: at.delivered },
    { label: 'Hoàn tất', icon: IconCircleCheck, at: at.completed },
  ];
  const done = (cod || !paid ? 1 : 2) + passed;
  return (
    <ol className={cn('flex px-2 py-4 sm:px-4', className)}>
      {steps.map((s, i) => {
        const isDone = i < done;
        const isNow = i === done;
        return (
          <li key={s.label} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  'absolute top-[15px] right-1/2 h-0.5 w-full',
                  isDone ? 'bg-navy' : 'bg-ink/10',
                )}
              />
            )}
            <span
              className={cn(
                'relative flex size-8 items-center justify-center rounded-full',
                isDone && 'bg-navy text-white',
                isNow && 'bg-champagne-50 text-navy ring-2 ring-navy',
                !isDone && !isNow && 'bg-page text-ink/35',
              )}
            >
              <s.icon className="size-[1.125rem] [stroke-width:1.75]" />
            </span>
            <span
              className={cn(
                'mt-1.5 px-0.5 text-[11px] leading-tight sm:text-xs',
                isDone || isNow ? 'font-semibold text-charcoal' : 'text-ink/45',
              )}
            >
              {s.label}
            </span>
            {isDone && s.at && (
              <span className="mt-0.5 hidden text-[11px] leading-tight text-ink/45 sm:block">
                {formatDateTime(s.at)}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Một dòng hàng trong đơn: ảnh, tên, phân loại, giá × số lượng */
export function OrderItemRow({ item, link = true }: { item: OrderItem; link?: boolean }) {
  const name = (
    <span className="line-clamp-2 text-sm leading-5 font-medium text-charcoal transition hover:text-navy">
      {item.productName}
    </span>
  );
  return (
    <div className="flex gap-3 py-4">
      <div className="flex size-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-card p-1.5 ring-1 ring-ink/[0.08]">
        {item.image ? (
          <img src={item.image} alt={item.productName} className="size-full object-contain" />
        ) : (
          <IconPhotoOff className="size-5 text-ink/25" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {link ? <Link to={`/san-pham/${item.productId}`}>{name}</Link> : name}
        {item.variantName && <div className="mt-1 text-xs text-ink/55">{item.variantName}</div>}
        <div className="mt-1 text-xs text-ink/55">Số lượng: {item.quantity}</div>
      </div>
      <div className="shrink-0 text-right text-sm">
        {item.originalPrice && item.originalPrice > item.price && (
          <div className="text-xs text-ink/40 line-through">{formatMoney(item.originalPrice)}</div>
        )}
        <div className="font-bold text-navy">{formatMoney(item.price)}</div>
      </div>
    </div>
  );
}

/** Một dòng tiền: "Phí vận chuyển ........ 30.000đ" */
export function MoneyRow({
  label,
  value,
  minus,
  hint,
  strong,
  className,
}: {
  label: React.ReactNode;
  value: number;
  minus?: boolean;
  hint?: React.ReactNode;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-1 text-sm', className)}>
      <div className="min-w-0 text-ink/60">
        {label}
        {hint && <div className="text-xs text-ink/45">{hint}</div>}
      </div>
      <div
        className={cn(
          'shrink-0 tabular-nums',
          strong ? 'text-lg font-bold text-navy' : 'font-medium text-charcoal',
          minus && value > 0 && 'text-navy',
        )}
      >
        {minus && value > 0 ? '-' : ''}
        {formatMoney(value)}
      </div>
    </div>
  );
}

const HISTORY_ICON: Record<ShopOrderStatus, typeof IconClock> = {
  PENDING: IconClock,
  TO_CONFIRM: IconPackage,
  CONFIRMED: IconPackage,
  CANCEL_REQUESTED: IconCircleX,
  CANCELLED: IconCircleX,
  SHIPPING: IconTruck,
  DELIVERED: IconPackage,
  COMPLETED: IconCircleCheck,
  RETURNING: IconArrowBackUp,
  RETURNED: IconArrowBackUp,
  FAILED: IconCircleX,
  INCIDENT: IconAlertTriangle,
  INCIDENT_RESOLVED: IconAlertTriangle,
};

/** Trạng thái kết thúc không thành công: tô đỏ ở mốc mới nhất */
const BAD_END: ShopOrderStatus[] = ['CANCELLED', 'FAILED', 'INCIDENT', 'RETURNING'];

/** Lịch sử trạng thái của một đơn con (mới nhất trên cùng) */
export function OrderTimeline({ history, paid }: { history: OrderHistoryRow[]; paid: boolean }) {
  const rows = [...history].reverse();
  return (
    <ol className="space-y-0">
      {rows.map((h, i) => {
        const bad = BAD_END.includes(h.toStatus);
        const Icon =
          i === 0 ? (bad ? HISTORY_ICON[h.toStatus] : IconCircleCheck) : HISTORY_ICON[h.toStatus];
        return (
          <li key={`${h.createdAt}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
            {i < rows.length - 1 && (
              <span className="absolute top-6 bottom-0 left-[11px] w-px bg-ink/10" aria-hidden />
            )}
            <Icon
              className={cn(
                'relative mt-0.5 size-6 shrink-0 rounded-full p-0.5 [stroke-width:1.75]',
                i === 0 ? (bad ? 'text-red-500' : 'text-ship') : 'text-ink/35',
              )}
            />
            <div className="min-w-0 text-sm">
              <div className={cn('font-medium', i === 0 ? 'text-charcoal' : 'text-ink/70')}>
                {shopOrderStatusLabel(h.toStatus, paid || h.toStatus !== 'PENDING')}
              </div>
              {h.note && <div className="break-words text-ink/60">{h.note}</div>}
              <div className="text-xs text-ink/45">
                {formatDateTime(h.createdAt)} · {h.actorName ?? CANCEL_ACTOR[h.actorType]}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Hộp nhập lý do (hủy đơn, từ chối yêu cầu hủy...): chọn lý do có sẵn hoặc tự ghi. `onSubmit` trả Promise:
 * xong thì hộp tự đóng.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  reasons,
  confirmLabel,
  destructive = true,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  reasons: string[];
  confirmLabel: string;
  destructive?: boolean;
  onSubmit: (reason: string) => Promise<unknown>;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (open) {
      setPicked(null);
      setOther('');
    }
  }, [open]);
  const isOther = picked === 'Khác';
  const reason = isOther ? other.trim() : (picked ?? '');
  const valid = reason.length >= 3;

  const submit = async () => {
    if (!valid) return;
    setPending(true);
    try {
      await onSubmit(reason);
      onOpenChange(false);
    } catch {
      // người gọi tự báo lỗi (toast); giữ hộp mở để thử lại
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-charcoal">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Lý do">
          {[...reasons, 'Khác'].map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={picked === r}
              onClick={() => setPicked(r)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-sm transition',
                picked === r
                  ? 'border-navy bg-champagne-50 font-medium text-navy'
                  : 'border-ink/15 bg-card text-ink hover:border-navy/40',
              )}
            >
              {r}
            </button>
          ))}
        </div>
        {isOther && (
          <Textarea
            autoFocus
            value={other}
            onChange={(e) => setOther(e.target.value)}
            maxLength={500}
            placeholder="Nhập lý do (ít nhất 3 ký tự)"
            className="min-h-24"
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Quay lại
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={submit}
            disabled={!valid || pending}
          >
            {pending && <IconLoader2 className="size-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const BUYER_CANCEL_REASONS = [
  'Muốn đổi địa chỉ nhận hàng',
  'Muốn đổi sản phẩm hoặc phân loại',
  'Tìm thấy chỗ khác giá tốt hơn',
  'Đổi ý, không muốn mua nữa',
];

export const SELLER_CANCEL_REASONS = [
  'Hết hàng',
  'Sai giá sản phẩm',
  'Không liên lạc được người mua',
];

export const DECLINE_CANCEL_REASONS = [
  'Đơn đã đóng gói, chuẩn bị giao',
  'Đã liên hệ, người mua đồng ý nhận',
];

/** Hộp xác nhận một bước (Đã nhận hàng, Xác nhận đơn...). `onConfirm` xong thì hộp tự đóng */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<unknown>;
  children?: React.ReactNode;
}) {
  const [pending, setPending] = useState(false);
  const submit = async () => {
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // người gọi tự báo lỗi (toast); giữ hộp mở để thử lại
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-charcoal">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Quay lại
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <IconLoader2 className="size-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
