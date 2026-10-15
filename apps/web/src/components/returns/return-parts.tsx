import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ImageOff, ImagePlus, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CANCEL_ACTOR } from '@/components/orders/order-parts';
import { StatusBadge } from '@/components/status-badge';
import { API, api, apiBlob } from '@/lib/api';
import type {
  ReturnHistoryEntry,
  ReturnItem,
  ReturnReason,
  ReturnStatus,
} from '@/lib/after-sales-types';
import { formatDateTime, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

type Tone = 'pending' | 'danger' | 'success' | 'neutral' | 'info';

/** Lý do trả hàng: chỉ lỗi hàng hoặc lỗi shop (quyết định P5 số 1) */
export const RETURN_REASONS: Record<ReturnReason, string> = {
  DEFECTIVE: 'Hàng lỗi, không hoạt động',
  DAMAGED: 'Hàng bị hư hỏng, bể vỡ',
  WRONG_ITEM: 'Giao sai mẫu, màu, size',
  MISSING: 'Thiếu hàng, thiếu phụ kiện',
  NOT_AS_DESCRIBED: 'Không đúng mô tả',
  COUNTERFEIT: 'Hàng giả, hàng nhái',
};

export const RETURN_STATUS: Record<ReturnStatus, { label: string; tone: Tone }> = {
  REQUESTED: { label: 'Chờ shop trả lời', tone: 'pending' },
  REJECTED: { label: 'Shop từ chối', tone: 'danger' },
  DISPUTED: { label: 'Đang khiếu nại', tone: 'pending' },
  SHIPPING_BACK: { label: 'Đang gửi hàng về shop', tone: 'info' },
  RECEIVED: { label: 'Shop đang kiểm hàng', tone: 'info' },
  REFUNDING: { label: 'Đang hoàn tiền', tone: 'pending' },
  REFUNDED: { label: 'Đã hoàn tiền', tone: 'success' },
  CLOSED: { label: 'Đã đóng, không hoàn tiền', tone: 'neutral' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
};

/** Trạng thái còn đang xử lý (chưa có kết quả) */
export const OPEN_RETURN: ReturnStatus[] = [
  'REQUESTED',
  'REJECTED',
  'DISPUTED',
  'SHIPPING_BACK',
  'RECEIVED',
];

export function ReturnStatusBadge({
  status,
  className,
}: {
  status: ReturnStatus;
  className?: string;
}) {
  const s = RETURN_STATUS[status];
  return (
    <StatusBadge tone={s.tone} className={className}>
      {s.label}
    </StatusBadge>
  );
}

/**
 * Ảnh bằng chứng trong bucket riêng tư: tải bằng vé đăng nhập (người mua, chủ shop của yêu cầu, admin hỗ
 * trợ) rồi hiện từ bộ nhớ; bấm để mở cỡ lớn ở thẻ mới.
 */
export function EvidenceImage({ imageKey, className }: { imageKey: string; className?: string }) {
  const q = useQuery({
    queryKey: ['return-image', imageKey],
    queryFn: async () => URL.createObjectURL(await apiBlob(`${API.market}/${imageKey}`)),
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: false,
  });
  const box = cn(
    'flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-ivory-200 bg-ivory',
    className,
  );
  if (q.isPending) return <div className={cn(box, 'animate-pulse')} />;
  if (q.isError) {
    return (
      <div className={box} title="Không tải được ảnh">
        <ImageOff className="size-5 text-ink/30" />
      </div>
    );
  }
  return (
    <button
      type="button"
      className={cn(box, 'transition hover:ring-2 hover:ring-champagne/60')}
      onClick={() => window.open(q.data, '_blank', 'noopener')}
      title="Xem ảnh lớn"
    >
      <img src={q.data} alt="Ảnh bằng chứng" className="size-full object-cover" />
    </button>
  );
}

export function EvidenceGallery({ keys, empty }: { keys: string[]; empty?: string }) {
  if (keys.length === 0) {
    return empty ? <p className="text-xs text-muted-foreground">{empty}</p> : null;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {keys.map((k) => (
        <EvidenceImage key={k} imageKey={k} />
      ))}
    </div>
  );
}

export interface PickedImage {
  key: string;
  /** Ảnh xem trước tạo từ file trên máy */
  preview: string;
}

/**
 * Chọn và tải ảnh bằng chứng (JPG/PNG/WebP, tối đa 5 MB mỗi ảnh) lên bucket riêng tư; trả danh sách mã ảnh
 * để gửi kèm yêu cầu. Mỗi ảnh tải ngay khi chọn.
 */
export function ReturnImagePicker({
  value,
  onChange,
  max = 6,
  disabled,
}: {
  value: PickedImage[];
  onChange: (next: PickedImage[]) => void;
  max?: number;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const latest = useRef(value);
  latest.current = value;
  useEffect(
    () => () => latest.current.forEach((i) => URL.revokeObjectURL(i.preview)),
    // chỉ dọn khi gỡ ô chọn ảnh
    [],
  );

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = max - latest.current.length;
    const list = [...files].slice(0, room);
    if (files.length > room) toast.warning(`Tối đa ${max} ảnh.`);
    setUploading((n) => n + list.length);
    for (const file of list) {
      try {
        const form = new FormData();
        form.append('file', file);
        const { key } = await api<{ key: string }>(`${API.market}/uploads/return-image`, {
          method: 'POST',
          formData: form,
        });
        const next = [...latest.current, { key, preview: URL.createObjectURL(file) }];
        latest.current = next;
        onChange(next);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Chưa tải được ảnh.');
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (input.current) input.current.value = '';
  };

  const remove = (key: string) => {
    const gone = value.find((i) => i.key === key);
    if (gone) URL.revokeObjectURL(gone.preview);
    onChange(value.filter((i) => i.key !== key));
  };

  return (
    <div className="flex flex-wrap gap-2">
      {value.map((img) => (
        <div
          key={img.key}
          className="relative size-20 overflow-hidden rounded-xl border border-ivory-200"
        >
          <img src={img.preview} alt="" className="size-full object-cover" />
          <button
            type="button"
            onClick={() => remove(img.key)}
            disabled={disabled}
            className="absolute top-1 right-1 rounded-full bg-black/55 p-0.5 text-white hover:bg-black/75"
            aria-label="Bỏ ảnh"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      {Array.from({ length: uploading }, (_, i) => (
        <div
          key={`up-${i}`}
          className="flex size-20 items-center justify-center rounded-xl border border-dashed border-champagne"
        >
          <Loader2 className="size-5 animate-spin text-champagne-600" />
        </div>
      ))}
      {value.length + uploading < max && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
          className="flex size-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-champagne text-xs text-champagne-600 transition hover:bg-champagne-50 disabled:opacity-50"
        >
          <ImagePlus className="size-5" />
          Thêm ảnh
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => void pick(e.target.files)}
      />
    </div>
  );
}

/** Các món trả: ảnh, tên, phân loại, số trả / số đã mua, tiền hoàn của món */
export function ReturnItemsList({
  items,
  showRestock,
}: {
  items: ReturnItem[];
  showRestock?: boolean;
}) {
  return (
    <div className="divide-y divide-ivory-200">
      {items.map((it) => (
        <div key={it.orderItemId} className="flex gap-3 py-3">
          <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-ivory-200 bg-card p-1">
            {it.image ? (
              <img src={it.image} alt={it.productName} className="size-full object-contain" />
            ) : (
              <ImageOff className="size-5 text-ink/25" />
            )}
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <div className="line-clamp-2 font-medium text-ink">{it.productName}</div>
            {it.variantName && (
              <div className="text-xs text-ink/55">Phân loại: {it.variantName}</div>
            )}
            <div className="text-xs text-ink/55">
              Trả {it.quantity}/{it.purchasedQuantity} · giá {formatMoney(it.price)}
              {showRestock && it.restocked && (
                <span className="ml-1 inline-flex items-center gap-0.5 text-emerald-700">
                  · <CheckCircle2 className="size-3" /> đã nhập lại kho
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right text-sm">
            <div className="text-xs text-ink/50">Hoàn tối đa</div>
            <div className="font-semibold text-navy">{formatMoney(it.refundAmount)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Các bước đã qua của yêu cầu (mới nhất trên cùng) */
export function ReturnTimeline({ history }: { history: ReturnHistoryEntry[] }) {
  const rows = [...history].reverse();
  return (
    <ol className="space-y-0">
      {rows.map((h, i) => (
        <li key={`${h.at}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
          {i < rows.length - 1 && (
            <span className="absolute top-5 bottom-0 left-[7px] w-px bg-ivory-200" aria-hidden />
          )}
          <span
            className={cn(
              'relative mt-1 size-[15px] shrink-0 rounded-full border-2 bg-card',
              i === 0 ? 'border-navy' : 'border-ivory-200',
            )}
          />
          <div className="min-w-0 text-sm">
            <div className={cn('font-medium', i === 0 ? 'text-navy' : 'text-ink/70')}>
              {RETURN_STATUS[h.status].label}
            </div>
            {h.note && <div className="break-words text-ink/60">{h.note}</div>}
            <div className="text-xs text-ink/45">
              {formatDateTime(h.at)} · {h.actorName ?? CANCEL_ACTOR[h.actorType]}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Ô nhập lời trình bày nhiều dòng có đếm ký tự */
export function StatementBox({
  value,
  onChange,
  min,
  max = 1000,
  placeholder,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  min: number;
  max?: number;
  placeholder: string;
  id?: string;
}) {
  const len = value.trim().length;
  return (
    <div>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={max}
        placeholder={placeholder}
        className="min-h-28 w-full rounded-lg border border-input bg-white px-3 py-2 text-sm text-ink outline-none focus:border-champagne focus:ring-[3px] focus:ring-champagne/30"
      />
      <div className={cn('text-right text-xs', len < min ? 'text-ink/45' : 'text-emerald-700')}>
        {len < min ? `Ít nhất ${min} ký tự (đang có ${len})` : `${len}/${max}`}
      </div>
    </div>
  );
}
