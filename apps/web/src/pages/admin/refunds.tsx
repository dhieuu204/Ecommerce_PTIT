import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HandCoins, ImageIcon, Loader2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { Pager } from '@/components/console/pager';
import { PageHeader } from '@/components/layout/page-header';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { API, api, apiBlob } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { AdminRefund, AdminRefundStatus } from '@/lib/order-types';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';

type Tone = 'pending' | 'danger' | 'success' | 'neutral' | 'info';

export const REFUND_STATUS: Record<AdminRefundStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Chờ gửi lệnh', tone: 'info' },
  FAILED: { label: 'Lỗi, chờ thử lại', tone: 'pending' },
  UNKNOWN: { label: 'Chưa rõ, đang tra cứu', tone: 'pending' },
  NEEDS_MANUAL: { label: 'Cần hoàn tay', tone: 'danger' },
  SUCCEEDED: { label: 'Đã hoàn', tone: 'success' },
  MANUAL_DONE: { label: 'Đã hoàn tay', tone: 'success' },
};

const REASON: Record<AdminRefund['reason'], string> = {
  CANCELLED: 'Hủy đơn con',
  LATE_PAYMENT: 'Tiền về sau khi đơn hết hạn/hủy',
  DUPLICATE_PAYMENT: 'Trả trùng',
};

const TABS: Array<{ value: AdminRefundStatus | 'ALL'; label: string }> = [
  { value: 'NEEDS_MANUAL', label: 'Cần hoàn tay' },
  { value: 'ALL', label: 'Tất cả' },
  { value: 'FAILED', label: 'Đang thử lại' },
  { value: 'UNKNOWN', label: 'Chưa rõ' },
  { value: 'SUCCEEDED', label: 'Đã hoàn' },
  { value: 'MANUAL_DONE', label: 'Đã hoàn tay' },
];
const PAGE_SIZE = 20;
const refundsKey = ['admin', 'refunds'] as const;

/**
 * Quản trị › Hoàn tiền (REF-01, bộ quyền FINANCE). Hệ thống tự gửi lệnh hoàn và thử lại; khoản lỗi đủ số
 * lần thì admin chuyển khoản tay cho người mua, nhập mã giao dịch và ảnh biên lai.
 */
export function RefundsPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? 'NEEDS_MANUAL') as AdminRefundStatus | 'ALL';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const list = useQuery({
    queryKey: [...refundsKey, status, page],
    queryFn: () =>
      api<Page<AdminRefund>>(`${API.payment}/admin/refunds`, {
        query: { status: status === 'ALL' ? undefined : status, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });
  const [manual, setManual] = useState<AdminRefund | null>(null);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ label: 'Tài chính' }, { label: 'Hoàn tiền' }]}
        title="Hoàn tiền"
        description="Lệnh hoàn tự gửi qua cổng và thử lại theo lịch. Chỉ khoản ở mục Cần hoàn tay mới phải xử lý: chuyển khoản cho người mua rồi nhập chứng từ."
      />
      <div className="rounded-2xl border bg-card shadow-sm shadow-navy/[0.03]">
        <nav className="-mb-px flex gap-1 overflow-x-auto border-b px-4 pt-2 md:px-5">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() =>
                setParams(t.value === 'NEEDS_MANUAL' ? {} : { status: t.value }, { replace: true })
              }
              className={cn(
                'shrink-0 border-b-2 px-3 py-3 text-sm whitespace-nowrap transition',
                status === t.value
                  ? 'border-navy font-semibold text-navy'
                  : 'border-transparent text-muted-foreground hover:text-ink',
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
        {list.isPending ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : list.isError ? (
          <LoadError message={list.error.message} onRetry={() => list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon={HandCoins}
            title={
              status === 'NEEDS_MANUAL'
                ? 'Không có khoản nào cần hoàn tay'
                : 'Chưa có khoản hoàn nào'
            }
          />
        ) : (
          <>
            <div className="divide-y">
              {list.data.items.map((r) => {
                const s = REFUND_STATUS[r.status];
                return (
                  <div
                    key={r.id}
                    className="grid gap-2 px-4 py-4 md:grid-cols-[minmax(0,1fr)_8rem_11rem_8rem] md:items-center md:gap-4 md:px-5"
                  >
                    <div className="min-w-0 text-sm">
                      <Link
                        to={`/quan-tri/don-hang/${r.orderId}`}
                        className="font-semibold text-navy hover:underline"
                      >
                        {r.shopOrderCode ?? r.orderCode ?? r.orderId}
                      </Link>
                      <div className="text-muted-foreground">
                        {REASON[r.reason]} · {r.gateway === 'MOCK' ? 'MÔ PHỎNG' : 'VNPay'}{' '}
                        {r.paymentRef}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Tạo {formatDateTime(r.createdAt)} · đã thử {r.tries} lần
                        {r.lastError && <span className="text-red-600"> · {r.lastError}</span>}
                        {r.transferCode && <> · Mã GD {r.transferCode}</>}
                      </div>
                    </div>
                    <div className="text-sm font-bold text-navy md:text-right">
                      {formatMoney(r.amount)}
                    </div>
                    <div>
                      <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                    </div>
                    <div className="md:text-right">
                      {r.status === 'NEEDS_MANUAL' ? (
                        <Button size="sm" onClick={() => setManual(r)}>
                          Hoàn tay
                        </Button>
                      ) : r.hasReceipt ? (
                        <ReceiptLink id={r.id} />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            <Pager
              className="border-t px-5 py-3"
              page={page}
              pageSize={PAGE_SIZE}
              total={list.data.total}
              onChange={(p) =>
                setParams({ ...(status !== 'NEEDS_MANUAL' ? { status } : {}), page: String(p) })
              }
            />
          </>
        )}
      </div>
      <ManualDialog refund={manual} onClose={() => setManual(null)} />
    </div>
  );
}

/** Mở ảnh biên lai (API cần đăng nhập nên tải về rồi mở bằng đường dẫn tạm) */
function ReceiptLink({ id }: { id: string }) {
  const [loading, setLoading] = useState(false);
  const open = async () => {
    setLoading(true);
    try {
      const blob = await apiBlob(`${API.payment}/admin/refunds/${id}/receipt`);
      window.open(URL.createObjectURL(blob), '_blank', 'noopener');
    } catch {
      toast.error('Chưa mở được biên lai.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <Button variant="ghost" size="sm" onClick={open} disabled={loading}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
      Biên lai
    </Button>
  );
}

function ManualDialog({ refund, onClose }: { refund: AdminRefund | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [transferCode, setTransferCode] = useState('');
  const [note, setNote] = useState('');
  const [receipt, setReceipt] = useState<{ key: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const reset = () => {
    setTransferCode('');
    setNote('');
    setReceipt(null);
  };

  const upload = async (f: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', f);
      const r = await api<{ key: string }>(`${API.payment}/admin/uploads/refund-receipt`, {
        method: 'POST',
        formData: form,
      });
      setReceipt({ key: r.key, name: f.name });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Chưa tải được ảnh.');
    } finally {
      setUploading(false);
    }
  };

  const save = useMutation({
    mutationFn: () =>
      api<AdminRefund>(`${API.payment}/admin/refunds/${refund!.id}/manual`, {
        method: 'POST',
        body: {
          transferCode: transferCode.trim(),
          receiptKey: receipt!.key,
          note: note.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success('Đã ghi nhận hoàn tay.');
      void qc.invalidateQueries({ queryKey: refundsKey });
      reset();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog
      open={!!refund}
      onOpenChange={(o) => {
        if (!o && !save.isPending) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-navy">
            Hoàn tay {refund && formatMoney(refund.amount)}
          </DialogTitle>
          <DialogDescription>
            Chuyển khoản cho người mua của đơn {refund?.shopOrderCode ?? refund?.orderCode} trước,
            rồi nhập mã giao dịch và ảnh biên lai. Thao tác được ghi nhật ký.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="transfer-code">Mã giao dịch chuyển khoản</Label>
            <Input
              id="transfer-code"
              value={transferCode}
              onChange={(e) => setTransferCode(e.target.value)}
              maxLength={60}
              placeholder="Ví dụ FT26101100012345"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ảnh biên lai</Label>
            <input
              ref={file}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = '';
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={() => file.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {receipt ? receipt.name : 'Chọn ảnh (JPG, PNG, WebP; tối đa 5 MB)'}
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="manual-note">Ghi chú (không bắt buộc)</Label>
            <Textarea
              id="manual-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="Chuyển vào tài khoản nào, ai chuyển…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Hủy
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={transferCode.trim().length < 3 || !receipt || save.isPending}
          >
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            Xác nhận đã hoàn
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
