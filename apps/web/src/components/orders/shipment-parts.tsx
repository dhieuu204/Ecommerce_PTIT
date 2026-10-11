import { Check, Copy, FlaskConical, Truck } from 'lucide-react';
import { useState } from 'react';
import { StatusBadge } from '@/components/status-badge';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { PaymentMethod, Shipment, ShipmentStatus } from '@/lib/order-types';
import { cn } from '@/lib/utils';

type Tone = 'pending' | 'danger' | 'success' | 'neutral' | 'info';

/** Trạng thái GHN báo về → câu tiếng Việt cho hành trình đơn */
const GHN_STATUS: Record<string, string> = {
  ready_to_pick: 'Đã tạo vận đơn, chờ GHN lấy hàng',
  picking: 'Nhân viên GHN đang đến lấy hàng',
  money_collect_picking: 'Nhân viên GHN đang đến lấy hàng',
  picked: 'GHN đã lấy hàng',
  storing: 'Hàng đã nhập kho GHN',
  transporting: 'Đang luân chuyển giữa các kho',
  sorting: 'Đang phân loại tại kho',
  delivering: 'Nhân viên GHN đang giao hàng',
  money_collect_delivering: 'Nhân viên GHN đang giao hàng',
  delivery_fail: 'Giao hàng không thành công',
  delivered: 'Giao hàng thành công',
  waiting_to_return: 'Chờ hoàn hàng về shop',
  return: 'Đang hoàn hàng về shop',
  return_transporting: 'Đang hoàn hàng về shop',
  return_sorting: 'Đang hoàn hàng về shop',
  returning: 'Đang hoàn hàng về shop',
  returned: 'Đã hoàn hàng về shop',
  cancel: 'Vận đơn đã hủy',
  lost: 'Hàng bị thất lạc',
  damage: 'Hàng bị hư hỏng',
  exception: 'Vận đơn gặp sự cố',
  return_fail: 'Hoàn hàng không thành công',
};

export function ghnStatusLabel(s: string): string {
  return GHN_STATUS[s.toLowerCase()] ?? s;
}

export const SHIPMENT_STATUS: Record<ShipmentStatus, { label: string; tone: Tone }> = {
  CREATING: { label: 'Đang tạo vận đơn', tone: 'pending' },
  UNKNOWN: { label: 'Đang kiểm tra với GHN', tone: 'pending' },
  CREATE_FAILED: { label: 'Tạo vận đơn lỗi', tone: 'danger' },
  READY_TO_PICK: { label: 'Chờ GHN lấy hàng', tone: 'info' },
  PICKED: { label: 'Đang giao', tone: 'info' },
  DELIVERED: { label: 'Đã giao', tone: 'success' },
  RETURNING: { label: 'Đang hoàn hàng', tone: 'danger' },
  RETURNED: { label: 'Đã hoàn về shop', tone: 'neutral' },
  CANCELLING: { label: 'Đang hủy vận đơn', tone: 'pending' },
  CANCELLED: { label: 'Đã hủy vận đơn', tone: 'neutral' },
  LOST: { label: 'Thất lạc / hư hỏng', tone: 'danger' },
};

export function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  const s = SHIPMENT_STATUS[status];
  return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>;
}

/** Nhãn "MÔ PHỎNG" cho phần chưa nối GHN/VNPay thật */
export function SimulatedChip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-violet-700 uppercase ring-1 ring-violet-200 ring-inset',
        className,
      )}
      title="Chưa nối hệ thống thật, dữ liệu do sàn mô phỏng"
    >
      <FlaskConical className="size-3" /> Mô phỏng
    </span>
  );
}

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
  VNPAY: 'VNPay',
  COD: 'Thanh toán khi nhận hàng (COD)',
};

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(code).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1 rounded-md px-1 font-mono text-sm font-semibold text-navy hover:bg-ivory"
      aria-label={`Sao chép mã vận đơn ${code}`}
    >
      {code}
      {copied ? (
        <Check className="size-3.5 text-emerald-600" />
      ) : (
        <Copy className="size-3.5 text-ink/40" />
      )}
    </button>
  );
}

/**
 * Khối vận chuyển của một đơn con: mã vận đơn GHN, trạng thái, số lần giao thất bại, hành trình.
 * `forSeller` hiện thêm phí GHN và lỗi tạo vận đơn.
 */
export function ShipmentPanel({
  shipment,
  forSeller = false,
  className,
}: {
  shipment: Shipment;
  forSeller?: boolean;
  className?: string;
}) {
  const tracking = shipment.tracking ?? [];
  return (
    <div className={cn('rounded-xl border border-ivory-200 bg-ivory/40 px-4 py-3', className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-navy">
          <Truck className="size-4 text-champagne-600" /> Giao Hàng Nhanh
        </span>
        {shipment.ghnCode ? (
          <CopyCode code={shipment.ghnCode} />
        ) : (
          <span className="text-sm text-ink/50">Chưa có mã vận đơn</span>
        )}
        <ShipmentStatusBadge status={shipment.status} />
        {shipment.simulated && <SimulatedChip />}
      </div>
      {(shipment.failedAttempts > 0 || (forSeller && shipment.fee !== null)) && (
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink/60">
          {shipment.failedAttempts > 0 && (
            <span className="text-amber-700">
              Giao không thành công {shipment.failedAttempts} lần
            </span>
          )}
          {forSeller && shipment.fee !== null && (
            <span>Phí GHN tính: {formatMoney(shipment.fee)} (sàn chịu)</span>
          )}
        </div>
      )}
      {forSeller && shipment.lastError && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {shipment.lastError}
        </p>
      )}
      {tracking.length > 0 && (
        <ol className="mt-3 space-y-0">
          {tracking.map((t, i) => (
            <li key={`${t.happenedAt}-${i}`} className="relative flex gap-3 pb-3 last:pb-0">
              {i < tracking.length - 1 && (
                <span
                  className="absolute top-3.5 bottom-0 left-[5px] w-px bg-ivory-200"
                  aria-hidden
                />
              )}
              <span
                className={cn(
                  'relative mt-1.5 size-[11px] shrink-0 rounded-full ring-2 ring-card',
                  i === 0 ? 'bg-emerald-500' : 'bg-ink/20',
                )}
              />
              <div className="min-w-0 text-sm">
                <div className={cn(i === 0 ? 'font-medium text-navy' : 'text-ink/70')}>
                  {ghnStatusLabel(t.ghnStatus)}
                </div>
                {t.note && <div className="break-words text-xs text-ink/55">{t.note}</div>}
                <div className="text-xs text-ink/45">{formatDateTime(t.happenedAt)}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
