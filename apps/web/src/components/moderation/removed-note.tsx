import { ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Lý do sản phẩm bị gỡ, dòng nhỏ dưới nhãn "Bị gỡ" ở danh sách sản phẩm của seller (MOD-01) */
export function RemovedReasonLine({
  reason,
  className,
}: {
  reason: string | null;
  className?: string;
}) {
  if (!reason) return null;
  return (
    <div
      className={cn('mt-1 line-clamp-2 max-w-56 text-[11px] leading-4 text-red-700', className)}
      title={reason}
    >
      Lý do: {reason}
    </div>
  );
}

/** Khung báo sản phẩm bị gỡ ở trang sửa sản phẩm: lý do và việc seller làm được */
export function RemovedBanner({ reason }: { reason: string | null }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-3.5 text-sm">
      <ShieldAlert className="mt-0.5 size-5 shrink-0 text-red-600" />
      <div className="min-w-0">
        <div className="font-semibold text-red-800">Sản phẩm đã bị sàn gỡ do vi phạm</div>
        {reason && <p className="mt-0.5 break-words text-red-800/90">Lý do: {reason}</p>}
        <p className="mt-1 text-xs text-red-800/70">
          Sản phẩm không hiện trên sàn. Bạn vẫn sửa được nội dung, nhưng không tự bật bán lại được;
          khi sàn khôi phục, sản phẩm về trạng thái ẩn để bạn kiểm tra rồi bật bán.
        </p>
      </div>
    </div>
  );
}
