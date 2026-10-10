import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Loader2, Pencil, Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LoadError } from '@/components/console/empty-state';
import { PageHeader } from '@/components/layout/page-header';
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
import { API, ApiError, api } from '@/lib/api';
import { hasAnyPermission, useCurrentUser } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import type { SettingRow } from '@/lib/order-types';

/** Mỗi service tự giữ con số của mình (ADM-01): trang gọi từng service */
const SOURCES = [
  {
    key: 'market',
    prefix: API.market,
    title: 'Đơn hàng và vận chuyển',
    note: 'marketplace-service',
  },
  { key: 'payment', prefix: API.payment, title: 'Thanh toán và phí sàn', note: 'payment-service' },
  { key: 'approval', prefix: API.approval, title: 'Kiểm tra đơn', note: 'approval-service' },
] as const;

type Source = (typeof SOURCES)[number];

/** Hiển thị giá trị theo đơn vị: tiền có dấu chấm, phí sàn % × 100 thành "5,00%" */
function showValue(s: Pick<SettingRow, 'unit' | 'value'>, value = s.value): string {
  if (s.unit === '% × 100')
    return `${(value / 100).toLocaleString('vi-VN', { minimumFractionDigits: 2 })}%`;
  if (s.unit === 'đồng') return `${value.toLocaleString('vi-VN')}đ`;
  return `${value.toLocaleString('vi-VN')} ${s.unit}`;
}

/**
 * Quản trị › Cấu hình chính sách (ADM-01). Bộ quyền SYSTEM sửa, FINANCE xem. Mỗi lần sửa tạo phiên bản
 * mới có hiệu lực ngay, ghi nhật ký; đơn đã đặt giữ con số lúc đặt.
 */
export function SettingsPage() {
  const user = useCurrentUser();
  const canEdit = hasAnyPermission(user?.permissions ?? [], ['SYSTEM']);
  const [editing, setEditing] = useState<{ source: Source; row: SettingRow } | null>(null);
  const [history, setHistory] = useState<{ source: Source; row: SettingRow } | null>(null);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        crumbs={[{ label: 'Hệ thống' }, { label: 'Cấu hình chính sách' }]}
        title="Cấu hình chính sách"
        description={
          canEdit
            ? 'Sửa một con số tạo phiên bản mới có hiệu lực ngay (bắt buộc ghi lý do). Đơn đã đặt vẫn dùng con số lúc đặt.'
            : 'Bạn chỉ xem được. Bộ quyền Hệ thống mới sửa được.'
        }
      />
      <div className="space-y-5">
        {SOURCES.map((source) => (
          <SourceSection
            key={source.key}
            source={source}
            canEdit={canEdit}
            onEdit={(row) => setEditing({ source, row })}
            onHistory={(row) => setHistory({ source, row })}
          />
        ))}
      </div>
      <EditDialog target={editing} onClose={() => setEditing(null)} />
      <HistoryDialog target={history} onClose={() => setHistory(null)} />
    </div>
  );
}

function SourceSection({
  source,
  canEdit,
  onEdit,
  onHistory,
}: {
  source: Source;
  canEdit: boolean;
  onEdit: (row: SettingRow) => void;
  onHistory: (row: SettingRow) => void;
}) {
  const list = useQuery({
    queryKey: ['admin', 'settings', source.key],
    queryFn: () => api<SettingRow[]>(`${source.prefix}/admin/settings`),
  });
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm shadow-navy/[0.03]">
      <header className="flex items-center gap-3 border-b bg-ivory/50 px-4 py-3 md:px-5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-navy text-champagne">
          <Settings2 className="size-4" />
        </span>
        <div>
          <div className="font-semibold text-navy">{source.title}</div>
          <div className="text-xs text-muted-foreground">{source.note}</div>
        </div>
      </header>
      {list.isPending ? (
        <div className="space-y-3 p-5">
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
        </div>
      ) : list.isError ? (
        <LoadError message={list.error.message} onRetry={() => list.refetch()} />
      ) : (
        <div className="divide-y">
          {list.data.map((row) => (
            <div
              key={row.key}
              className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 md:px-5"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink">{row.label}</div>
                {row.description && (
                  <div className="text-xs text-muted-foreground">{row.description}</div>
                )}
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {row.version === 0
                    ? 'Mặc định (chưa sửa lần nào)'
                    : `Phiên bản ${row.version} · ${row.createdByName} · ${formatDateTime(row.effectiveFrom)}`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="min-w-28 text-right text-lg font-bold text-navy tabular-nums">
                  {showValue(row)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onHistory(row)}
                  aria-label="Lịch sử"
                >
                  <History className="size-4" />
                </Button>
                {canEdit && (
                  <Button variant="outline" size="sm" onClick={() => onEdit(row)}>
                    <Pencil className="size-3.5" /> Sửa
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function EditDialog({
  target,
  onClose,
}: {
  target: { source: Source; row: SettingRow } | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (target) {
      setValue(String(target.row.value));
      setReason('');
      setError(null);
    }
  }, [target]);

  const save = useMutation({
    mutationFn: () =>
      api<SettingRow>(`${target!.source.prefix}/admin/settings/${target!.row.key}`, {
        method: 'PUT',
        body: { value: Number(value), reason: reason.trim() },
      }),
    onSuccess: () => {
      toast.success('Đã lưu phiên bản mới.');
      void qc.invalidateQueries({ queryKey: ['admin', 'settings', target!.source.key] });
      onClose();
    },
    onError: (e) =>
      setError(
        e instanceof ApiError ? (e.fields.value ?? e.fields.reason ?? e.message) : e.message,
      ),
  });

  const row = target?.row;
  const n = Number(value);
  const valid =
    row && Number.isInteger(n) && n >= row.min && n <= row.max && reason.trim().length >= 5;

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-navy">{row?.label}</DialogTitle>
          <DialogDescription>
            Đang dùng: <b>{row && showValue(row)}</b>. Giới hạn {row?.min.toLocaleString('vi-VN')}–
            {row?.max.toLocaleString('vi-VN')} ({row?.unit}).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="setting-value">Giá trị mới ({row?.unit})</Label>
            <Input
              id="setting-value"
              inputMode="numeric"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ''))}
            />
            {row && Number.isInteger(n) && value !== '' && (
              <div className="text-xs text-muted-foreground">= {showValue(row, n)}</div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="setting-reason">Lý do (ghi vào nhật ký)</Label>
            <Textarea
              id="setting-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              placeholder="Ví dụ: Rút hạn thanh toán để demo hết hạn"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Hủy
          </Button>
          <Button onClick={() => save.mutate()} disabled={!valid || save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            Lưu phiên bản mới
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({
  target,
  onClose,
}: {
  target: { source: Source; row: SettingRow } | null;
  onClose: () => void;
}) {
  const hist = useQuery({
    queryKey: ['admin', 'settings', target?.source.key, 'history', target?.row.key],
    queryFn: () =>
      api<SettingRow[]>(`${target!.source.prefix}/admin/settings/${target!.row.key}/history`),
    enabled: !!target,
  });
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-navy">Lịch sử: {target?.row.label}</DialogTitle>
        </DialogHeader>
        {hist.isPending ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : hist.isError ? (
          <p className="text-sm text-red-600">{hist.error.message}</p>
        ) : (
          <ol className="space-y-2">
            {hist.data.map((h) => (
              <li key={h.version} className="rounded-xl border px-3 py-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">
                    {h.version === 0 ? 'Mặc định' : `Phiên bản ${h.version}`}
                  </span>
                  <span className="font-bold text-navy">
                    {target && showValue(target.row, h.value)}
                  </span>
                </div>
                {h.version > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {h.createdByName} · {formatDateTime(h.effectiveFrom)}
                    {h.reason && <> · {h.reason}</>}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
