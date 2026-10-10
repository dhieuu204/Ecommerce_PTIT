import {
  CheckCircle2,
  Circle,
  CircleX,
  Clock,
  ImageOff,
  Loader2,
  PackageCheck,
  Truck,
} from 'lucide-react';
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
  }
}

const STATUS_TONE: Record<ShopOrderStatus, Tone> = {
  PENDING: 'pending',
  TO_CONFIRM: 'info',
  CONFIRMED: 'success',
  CANCEL_REQUESTED: 'pending',
  CANCELLED: 'neutral',
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

/** Một dòng hàng trong đơn: ảnh, tên, phân loại, giá × số lượng */
export function OrderItemRow({ item, link = true }: { item: OrderItem; link?: boolean }) {
  const name = (
    <span className="line-clamp-2 text-sm font-medium leading-5 text-ink">{item.productName}</span>
  );
  return (
    <div className="flex gap-3 py-3">
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-ivory-200 bg-card p-1 md:size-[72px]">
        {item.image ? (
          <img src={item.image} alt={item.productName} className="size-full object-contain" />
        ) : (
          <ImageOff className="size-5 text-ink/25" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {link ? (
          <Link to={`/san-pham/${item.productId}`} className="hover:text-navy">
            {name}
          </Link>
        ) : (
          name
        )}
        {item.variantName && (
          <div className="mt-0.5 text-xs text-ink/55">Phân loại: {item.variantName}</div>
        )}
        <div className="mt-0.5 text-xs text-ink/55">x{item.quantity}</div>
      </div>
      <div className="shrink-0 text-right text-sm">
        {item.originalPrice && item.originalPrice > item.price && (
          <div className="text-xs text-ink/40 line-through">{formatMoney(item.originalPrice)}</div>
        )}
        <div className="font-semibold text-navy">{formatMoney(item.price)}</div>
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
      <div className="min-w-0 text-ink/65">
        {label}
        {hint && <div className="text-xs text-ink/45">{hint}</div>}
      </div>
      <div
        className={cn(
          'shrink-0 tabular-nums',
          strong ? 'text-lg font-bold text-navy' : 'text-ink',
          minus && value > 0 && 'text-champagne-600',
        )}
      >
        {minus && value > 0 ? '−' : ''}
        {formatMoney(value)}
      </div>
    </div>
  );
}

const HISTORY_ICON: Record<ShopOrderStatus, typeof Circle> = {
  PENDING: Clock,
  TO_CONFIRM: PackageCheck,
  CONFIRMED: Truck,
  CANCEL_REQUESTED: CircleX,
  CANCELLED: CircleX,
};

/** Lịch sử trạng thái của một đơn con (mới nhất trên cùng) */
export function OrderTimeline({ history, paid }: { history: OrderHistoryRow[]; paid: boolean }) {
  const rows = [...history].reverse();
  return (
    <ol className="space-y-0">
      {rows.map((h, i) => {
        const Icon =
          i === 0
            ? h.toStatus === 'CANCELLED'
              ? CircleX
              : CheckCircle2
            : HISTORY_ICON[h.toStatus];
        return (
          <li key={`${h.createdAt}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
            {i < rows.length - 1 && (
              <span className="absolute top-6 bottom-0 left-[11px] w-px bg-ivory-200" aria-hidden />
            )}
            <Icon
              className={cn(
                'relative mt-0.5 size-6 shrink-0 rounded-full bg-card p-0.5',
                i === 0
                  ? h.toStatus === 'CANCELLED'
                    ? 'text-red-500'
                    : 'text-emerald-600'
                  : 'text-ink/35',
              )}
            />
            <div className="min-w-0 text-sm">
              <div className={cn('font-medium', i === 0 ? 'text-navy' : 'text-ink/70')}>
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
          <DialogTitle className="text-navy">{title}</DialogTitle>
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
                'rounded-full border px-3 py-1.5 text-sm transition',
                picked === r
                  ? 'border-navy bg-navy text-white'
                  : 'border-ivory-200 bg-card text-ink hover:border-champagne',
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
            {pending && <Loader2 className="size-4 animate-spin" />}
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
