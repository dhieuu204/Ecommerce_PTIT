import { ImagePlus, Loader2, PackageX, Store, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/status-badge';
import { API, api } from '@/lib/api';
import type {
  ModerationDecision,
  ReportReason,
  ReportStatus,
  ReportTarget,
} from '@/lib/moderation-types';
import { cn } from '@/lib/utils';

/** Số ảnh bằng chứng tối đa của một báo cáo (khớp REPORT_MAX_IMAGES của approval/marketplace) */
export const REPORT_MAX_IMAGES = 5;

/** Lý do báo cáo (quyết định P6 mục 2 số 12) */
export const REPORT_REASONS: Record<ReportReason, { label: string; hint: string }> = {
  COUNTERFEIT: { label: 'Hàng giả, hàng nhái', hint: 'Giả nhãn hiệu, nhái thương hiệu' },
  PROHIBITED: { label: 'Hàng cấm', hint: 'Hàng pháp luật cấm hoặc sàn không cho bán' },
  SCAM: { label: 'Lừa đảo', hint: 'Lấy tiền không giao, dụ chuyển khoản ngoài sàn' },
  WRONG_INFO: { label: 'Thông tin sai sự thật', hint: 'Mô tả, xuất xứ, công dụng không đúng' },
  OFFENSIVE: { label: 'Nội dung phản cảm', hint: 'Hình ảnh, lời lẽ khiếm nhã, xúc phạm' },
  OTHER: { label: 'Lý do khác', hint: 'Vi phạm khác, bạn mô tả rõ bên dưới' },
};

export const REPORT_TARGET_LABEL: Record<ReportTarget, string> = {
  PRODUCT: 'Sản phẩm',
  SHOP: 'Shop',
};

const STATUS: Record<ReportStatus, { label: string; tone: 'pending' | 'success' | 'neutral' }> = {
  PENDING: { label: 'Đang chờ xử lý', tone: 'pending' },
  RESOLVED: { label: 'Đã xử lý vi phạm', tone: 'success' },
  DISMISSED: { label: 'Không vi phạm', tone: 'neutral' },
};

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  const s = STATUS[status];
  return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>;
}

/** Tên biện pháp trong lịch sử xử lý */
export function decisionLabel(d: Pick<ModerationDecision, 'targetType' | 'action'>): string {
  if (d.targetType === 'PRODUCT')
    return d.action === 'REMOVE' ? 'Gỡ sản phẩm' : 'Khôi phục sản phẩm';
  return d.action === 'SUSPEND' ? 'Đình chỉ shop' : 'Khôi phục shop';
}

/** Ảnh nhỏ của đối tượng bị báo cáo (ảnh sản phẩm hoặc logo shop) */
export function TargetThumb({
  type,
  image,
  className,
}: {
  type: ReportTarget;
  image: string | null;
  className?: string;
}) {
  const Icon = type === 'SHOP' ? Store : PackageX;
  return (
    <span
      className={cn(
        'flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-ivory-200 bg-white',
        className,
      )}
    >
      {image ? (
        <img src={image} alt="" loading="lazy" className="size-full object-contain p-0.5" />
      ) : (
        <Icon className="size-5 text-ink/30" />
      )}
    </span>
  );
}

export interface PickedReportImage {
  key: string;
  /** Ảnh xem trước tạo từ file trên máy */
  preview: string;
}

/**
 * Chọn và tải ảnh bằng chứng báo cáo (JPG/PNG/WebP) lên bucket riêng tư của marketplace; mỗi ảnh tải ngay
 * khi chọn, trả khóa ảnh để gửi kèm báo cáo.
 */
export function ReportImagePicker({
  value,
  onChange,
  disabled,
}: {
  value: PickedReportImage[];
  onChange: (next: PickedReportImage[]) => void;
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
    const room = REPORT_MAX_IMAGES - latest.current.length;
    const list = [...files].slice(0, room);
    if (files.length > room) toast.warning(`Tối đa ${REPORT_MAX_IMAGES} ảnh.`);
    setUploading((n) => n + list.length);
    for (const file of list) {
      try {
        const form = new FormData();
        form.append('file', file);
        const { key } = await api<{ key: string }>(`${API.market}/uploads/report-image`, {
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
          className="relative size-16 overflow-hidden rounded-xl border border-ivory-200 sm:size-20"
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
          className="flex size-16 items-center justify-center rounded-xl border border-dashed border-champagne sm:size-20"
        >
          <Loader2 className="size-5 animate-spin text-champagne-600" />
        </div>
      ))}
      {value.length + uploading < REPORT_MAX_IMAGES && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
          className="flex size-16 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-champagne text-[11px] text-champagne-600 transition hover:bg-champagne-50 disabled:opacity-50 sm:size-20 sm:text-xs"
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
