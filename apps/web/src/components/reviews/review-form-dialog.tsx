import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, ImagePlus, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
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
import { API, ApiError, api } from '@/lib/api';
import { REVIEW_LIMITS, type MyReview, type PendingReviewItem } from '@/lib/engagement-types';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { publicReviewsKey } from './review-list';
import { StarInput } from './stars';

/** Khóa TanStack Query của trang "Đánh giá của tôi" */
export const myReviewsKey = ['me', 'reviews'] as const;

/** Số ngày còn lại tới hạn (làm tròn lên); 0 khi đã quá hạn */
export function daysLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

/** Câu báo hạn: "Còn 5 ngày (đến 30/10/2026)" */
export function deadlineText(iso: string): string {
  const d = daysLeft(iso);
  return d > 0 ? `Còn ${d} ngày (đến ${formatDate(iso)})` : 'Đã hết hạn';
}

export type ReviewTarget =
  { mode: 'create'; item: PendingReviewItem } | { mode: 'edit'; review: MyReview };

/**
 * Hộp thoại viết hoặc sửa đánh giá (ENG-01): chọn sao, nội dung (được để trống), tối đa 5 ảnh, báo còn mấy
 * ngày. Sửa chỉ được một lần nên có câu nhắc trước khi gửi.
 */
export function ReviewFormDialog({
  target,
  onClose,
}: {
  target: ReviewTarget | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setError(null);
    if (target.mode === 'edit') {
      setRating(target.review.rating);
      setContent(target.review.content);
      setImages(target.review.images);
    } else {
      setRating(5);
      setContent('');
      setImages([]);
    }
  }, [target]);

  const save = useMutation({
    mutationFn: () => {
      const body = { rating, content: content.trim(), images };
      return target?.mode === 'edit'
        ? api<MyReview>(`${API.market}/me/reviews/${target.review.id}`, { method: 'PUT', body })
        : api<MyReview>(`${API.market}/me/reviews`, {
            method: 'POST',
            body: { ...body, orderItemId: target!.item.orderItemId },
          });
    },
    onSuccess: () => {
      toast.success(target?.mode === 'edit' ? 'Đã sửa đánh giá.' : 'Cảm ơn bạn đã đánh giá!');
      void qc.invalidateQueries({ queryKey: myReviewsKey });
      void qc.invalidateQueries({ queryKey: publicReviewsKey });
      onClose();
    },
    onError: (e) => {
      const msg =
        e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'Chưa gửi được.';
      setError(msg);
      // Hết lượt hoặc hết hạn: danh sách đã cũ, tải lại
      if (e instanceof ApiError && e.status === 409) {
        void qc.invalidateQueries({ queryKey: myReviewsKey });
      }
    },
  });

  const info =
    target?.mode === 'edit'
      ? {
          name: target.review.productName,
          variant: target.review.variantName,
          image: target.review.image,
          deadline: target.review.editBefore,
        }
      : target
        ? {
            name: target.item.productName,
            variant: target.item.variantName,
            image: target.item.image,
            deadline: target.item.reviewBefore,
          }
        : null;
  const [uploading, setUploading] = useState(0);
  const busy = save.isPending || uploading > 0;

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-navy">
            {target?.mode === 'edit' ? 'Sửa đánh giá' : 'Đánh giá sản phẩm'}
          </DialogTitle>
          <DialogDescription>
            {target?.mode === 'edit'
              ? 'Mỗi đánh giá chỉ sửa được một lần. Sau khi lưu, bạn không sửa thêm được nữa.'
              : 'Chia sẻ cảm nhận để giúp người mua khác. Đánh giá hiện ngay trên trang sản phẩm.'}
          </DialogDescription>
        </DialogHeader>

        {info && (
          <div className="flex items-center gap-3 rounded-xl bg-ivory px-3 py-2.5">
            <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ivory-200 bg-card p-0.5">
              {info.image && <img src={info.image} alt="" className="size-full object-contain" />}
            </span>
            <div className="min-w-0 text-sm">
              <div className="line-clamp-2 font-medium text-ink">{info.name}</div>
              {info.variant && <div className="text-xs text-ink/55">Phân loại: {info.variant}</div>}
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-sm font-medium text-ink">Chất lượng sản phẩm</div>
            <StarInput value={rating} onChange={setRating} disabled={save.isPending} />
          </div>
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="font-medium text-ink">Nhận xét</span>
              <span
                className={cn(
                  'text-xs',
                  content.length > REVIEW_LIMITS.contentMax ? 'text-destructive' : 'text-ink/45',
                )}
              >
                {content.length}/{REVIEW_LIMITS.contentMax}
              </span>
            </div>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              maxLength={REVIEW_LIMITS.contentMax}
              placeholder="Sản phẩm dùng thế nào, có đúng mô tả không, đóng gói ra sao... (không bắt buộc)"
              disabled={save.isPending}
            />
          </div>
          <div>
            <div className="mb-1.5 text-sm font-medium text-ink">
              Hình ảnh{' '}
              <span className="font-normal text-ink/45">
                (tối đa {REVIEW_LIMITS.maxImages} ảnh, mỗi ảnh ≤ {REVIEW_LIMITS.imageMaxMb} MB)
              </span>
            </div>
            <ReviewImagePicker
              value={images}
              onChange={setImages}
              onUploading={setUploading}
              disabled={save.isPending}
            />
          </div>
          {info && (
            <p className="flex items-center gap-1.5 text-xs text-ink/60">
              <CalendarClock className="size-3.5 text-champagne-600" />
              {target?.mode === 'edit' ? 'Hạn sửa: ' : 'Hạn đánh giá: '}
              {deadlineText(info.deadline)}
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Để sau
          </Button>
          <Button onClick={() => save.mutate()} disabled={busy || !rating}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            {target?.mode === 'edit' ? 'Lưu thay đổi' : 'Gửi đánh giá'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Chọn và tải ảnh đánh giá lên bucket công khai (POST /uploads/review-image); trả danh sách đường dẫn */
function ReviewImagePicker({
  value,
  onChange,
  onUploading,
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  onUploading: (n: number) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const latest = useRef(value);
  latest.current = value;
  const max = REVIEW_LIMITS.maxImages;

  const changeUploading = (delta: number) => setUploading((n) => n + delta);
  useEffect(() => onUploading(uploading), [uploading, onUploading]);

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = max - latest.current.length;
    const list = [...files].slice(0, room);
    if (files.length > room) toast.warning(`Tối đa ${max} ảnh.`);
    changeUploading(list.length);
    for (const file of list) {
      try {
        if (file.size > REVIEW_LIMITS.imageMaxMb * 1024 * 1024) {
          throw new Error(`Ảnh "${file.name}" lớn hơn ${REVIEW_LIMITS.imageMaxMb} MB.`);
        }
        const form = new FormData();
        form.append('file', file);
        const { url } = await api<{ url: string }>(`${API.market}/uploads/review-image`, {
          method: 'POST',
          formData: form,
        });
        const next = [...latest.current, url];
        latest.current = next;
        onChange(next);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Chưa tải được ảnh.');
      } finally {
        changeUploading(-1);
      }
    }
    if (input.current) input.current.value = '';
  };

  return (
    <div className="flex flex-wrap gap-2">
      {value.map((url) => (
        <div
          key={url}
          className="relative size-20 overflow-hidden rounded-xl border border-ivory-200"
        >
          <img src={url} alt="" className="size-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(value.filter((u) => u !== url))}
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
