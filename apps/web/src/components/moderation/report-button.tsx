import { useQueryClient } from '@tanstack/react-query';
import { Flag, Loader2, ShieldCheck } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { StatementBox } from '@/components/returns/return-parts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMyShop } from '@/hooks/use-my-shop';
import { API, api, ApiError } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { newIdempotencyKey } from '@/lib/form';
import type { Report, ReportReason, ReportTarget } from '@/lib/moderation-types';
import { cn } from '@/lib/utils';
import {
  REPORT_MAX_IMAGES,
  REPORT_REASONS,
  ReportImagePicker,
  type PickedReportImage,
} from './report-parts';

export const MY_REPORTS_KEY = ['my-reports'] as const;

const NOTE_MIN = 10;
const NOTE_MAX = 1000;

/**
 * Nút "Báo cáo" nhỏ (cờ) trên trang sản phẩm và trang shop (MOD-01). Chưa đăng nhập thì chuyển sang đăng
 * nhập rồi quay lại; hàng/shop của chính mình thì không hiện.
 */
export function ReportButton({
  targetType,
  targetId,
  shopId,
  className,
}: {
  targetType: ReportTarget;
  targetId: string;
  /** Shop của đối tượng: trùng shop của mình thì ẩn nút */
  shopId: string;
  className?: string;
}) {
  const user = useCurrentUser();
  const myShop = useMyShop();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  if (user && myShop.data?.shop?.id === shopId) return null;

  const onClick = () => {
    if (!user) {
      const returnTo = location.pathname + location.search;
      navigate(`/dang-nhap?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-ink/45 transition hover:bg-ivory-200 hover:text-ink/75',
          className,
        )}
        title={targetType === 'SHOP' ? 'Báo cáo shop vi phạm' : 'Báo cáo sản phẩm vi phạm'}
      >
        <Flag className="size-3.5" />
        Báo cáo
      </button>
      {user && (
        <ReportDialog
          open={open}
          onOpenChange={setOpen}
          targetType={targetType}
          targetId={targetId}
        />
      )}
    </>
  );
}

function ReportDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: ReportTarget;
  targetId: string;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [images, setImages] = useState<PickedReportImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // Một mã chống gửi lặp cho mỗi lần mở hộp thoại: bấm Gửi hai lần không tạo hai báo cáo
  const keyRef = useRef(newIdempotencyKey());
  const what = targetType === 'SHOP' ? 'shop' : 'sản phẩm';

  const reset = () => {
    setReason(null);
    setNote('');
    setImages([]);
    setError(null);
    setDone(false);
    keyRef.current = newIdempotencyKey();
  };
  const change = (next: boolean) => {
    if (busy) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const valid = !!reason && note.trim().length >= NOTE_MIN;

  async function submit() {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await api<Report>(`${API.approval}/reports`, {
        method: 'POST',
        idempotencyKey: keyRef.current,
        body: {
          targetType,
          targetId,
          reason,
          note: note.trim(),
          images: images.map((i) => i.key),
        },
      });
      void queryClient.invalidateQueries({ queryKey: MY_REPORTS_KEY });
      setDone(true);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'ALREADY_REPORTED') {
        toast.info('Bạn đã báo cáo, đang chờ xử lý.');
        reset();
        onOpenChange(false);
        return;
      }
      if (e instanceof ApiError && Object.keys(e.fields).length) {
        setError(Object.values(e.fields)[0] ?? e.message);
      } else {
        setError(e instanceof Error ? e.message : 'Có lỗi xảy ra, bạn thử lại.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-xl">
        {done ? (
          <div className="flex flex-col items-center px-2 py-4 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-champagne-50 text-champagne-600 ring-8 ring-champagne-50/50">
              <ShieldCheck className="size-6" />
            </span>
            <DialogTitle className="mt-4 text-navy">Đã gửi báo cáo</DialogTitle>
            <DialogDescription className="mt-1 max-w-sm">
              Cảm ơn bạn. Bộ phận kiểm duyệt của sàn sẽ xem xét và xử lý. Bạn theo dõi kết quả ở
              trang Báo cáo vi phạm của tôi.
            </DialogDescription>
            <div className="mt-5 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button variant="outline" className="rounded-full" onClick={() => change(false)}>
                Đóng
              </Button>
              <Button asChild className="rounded-full">
                <Link to="/tai-khoan/bao-cao-vi-pham" onClick={() => change(false)}>
                  Xem báo cáo của tôi
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader className="text-left">
              <DialogTitle className="flex items-center gap-2 text-navy">
                <Flag className="size-4 text-champagne-600" />
                Báo cáo {what} vi phạm
              </DialogTitle>
              <DialogDescription>
                Báo cáo được gửi tới bộ phận kiểm duyệt của sàn, shop không biết ai đã báo cáo.
              </DialogDescription>
            </DialogHeader>

            <div>
              <div className="mb-2 text-sm font-medium text-ink">
                Lý do<span className="text-destructive">*</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Lý do">
                {(Object.keys(REPORT_REASONS) as ReportReason[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={reason === r}
                    onClick={() => setReason(r)}
                    className={cn(
                      'rounded-xl border px-3 py-2.5 text-left text-sm transition',
                      reason === r
                        ? 'border-navy bg-navy/[0.04]'
                        : 'border-ivory-200 hover:border-champagne',
                    )}
                  >
                    <div className="font-medium text-navy">{REPORT_REASONS[r].label}</div>
                    <div className="text-xs text-ink/55">{REPORT_REASONS[r].hint}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="report-note" className="mb-2 block text-sm font-medium text-ink">
                Mô tả vi phạm<span className="text-destructive">*</span>
              </label>
              <StatementBox
                id="report-note"
                value={note}
                onChange={setNote}
                min={NOTE_MIN}
                max={NOTE_MAX}
                placeholder={
                  targetType === 'SHOP'
                    ? 'Ví dụ: shop nhắn tin đề nghị chuyển khoản ngoài sàn để được giảm giá...'
                    : 'Ví dụ: logo in lệch, tem chống hàng giả không quét được...'
                }
              />
            </div>

            <div>
              <div className="mb-2 text-sm font-medium text-ink">
                Ảnh bằng chứng{' '}
                <span className="font-normal text-ink/50">
                  (không bắt buộc, tối đa {REPORT_MAX_IMAGES} ảnh)
                </span>
              </div>
              <ReportImagePicker value={images} onChange={setImages} disabled={busy} />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}

            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                disabled={busy}
                onClick={() => change(false)}
              >
                Hủy
              </Button>
              <Button
                type="button"
                className="rounded-full px-6"
                disabled={!valid || busy}
                onClick={() => void submit()}
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                Gửi báo cáo
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
