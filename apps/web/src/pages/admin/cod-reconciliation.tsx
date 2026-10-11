import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet, FlaskConical, Loader2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { API, api, apiBlob } from '@/lib/api';
import type {
  CodReconciliation,
  CodReconciliationDetail,
  CodReconciliationItem,
  ReconcileResult,
} from '@/lib/finance-types';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;
const MAX_MB = 5;
const key = ['admin', 'cod-reconciliations'] as const;

type Tone = 'pending' | 'danger' | 'success' | 'neutral' | 'info';

const RESULT: Record<ReconcileResult, { label: string; tone: Tone }> = {
  MATCHED: { label: 'Khớp', tone: 'success' },
  MISMATCHED: { label: 'Lệch tiền', tone: 'danger' },
  DUPLICATE: { label: 'Trùng (đã đối soát)', tone: 'neutral' },
  NOT_FOUND: { label: 'Không có trên sàn', tone: 'pending' },
  NOT_DELIVERED: { label: 'Chưa giao', tone: 'pending' },
};

/** Tải một file cần đăng nhập về máy */
async function download(path: string, fileName: string) {
  const blob = await apiBlob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Quản trị › Đối soát COD (COD-02, SHIP-05, bộ quyền FINANCE): tải file GHN chuyển tiền COD (.xlsx/.csv),
 * xem kết quả từng lần nhập. Chưa có file thật thì tải file MÔ PHỎNG rồi nhập lại.
 */
export function CodReconciliationsPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const list = useQuery({
    queryKey: [...key, page],
    queryFn: () =>
      api<Page<CodReconciliation>>(`${API.payment}/admin/cod-reconciliations`, {
        query: { page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api<CodReconciliationDetail>(`${API.payment}/admin/cod-reconciliations`, {
        method: 'POST',
        formData: form,
      });
    },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: key });
      toast.success(`Đã nhập ${r.totalRows} dòng: ${r.matched} khớp, ${r.mismatched} lệch.`);
      navigate(`/quan-tri/doi-soat-cod/${r.id}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const [downloading, setDownloading] = useState<null | 'TEMPLATE' | 'SIM'>(null);
  const get = async (kind: 'TEMPLATE' | 'SIM') => {
    setDownloading(kind);
    try {
      await (kind === 'TEMPLATE'
        ? download(`${API.payment}/admin/cod-reconciliations/template`, 'mau-doi-soat-cod.xlsx')
        : download(
            `${API.payment}/admin/cod-reconciliations/simulated-file`,
            `MO-PHONG-ghn-chuyen-tien-cod-${new Date().toISOString().slice(0, 10)}.xlsx`,
          ));
    } catch {
      toast.error('Chưa tải được file.');
    } finally {
      setDownloading(null);
    }
  };
  const pick = (f: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!f) return;
    if (!/\.(xlsx|csv)$/i.test(f.name)) {
      toast.error('Chỉ nhận file .xlsx hoặc .csv.');
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      toast.error(`File tối đa ${MAX_MB} MB.`);
      return;
    }
    upload.mutate(f);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ label: 'Tài chính' }, { label: 'Đối soát COD' }]}
        title="Đối soát COD"
        description="Đối chiếu file GHN chuyển tiền thu hộ với đơn trên sàn. Dòng khớp: tiền COD coi là đã về, tiền seller được xét chuyển khả dụng."
      />

      <section className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={upload.isPending}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pick(e.dataTransfer.files[0]);
          }}
          className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-champagne/60 bg-card px-6 py-8 text-center transition hover:border-navy hover:bg-ivory/40 disabled:opacity-60"
        >
          <span className="flex size-12 items-center justify-center rounded-2xl bg-navy text-champagne">
            {upload.isPending ? (
              <Loader2 className="size-6 animate-spin" />
            ) : (
              <Upload className="size-6" />
            )}
          </span>
          <span className="font-semibold text-navy">
            {upload.isPending ? 'Đang đối soát…' : 'Chọn hoặc kéo thả file đối soát của GHN'}
          </span>
          <span className="text-xs text-muted-foreground">
            .xlsx hoặc .csv, tối đa {MAX_MB} MB. Mỗi file chỉ nhập được một lần.
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <div className="space-y-3 rounded-2xl border bg-card p-4">
          <div className="text-sm font-semibold text-navy">File mẫu</div>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => get('TEMPLATE')}
            disabled={downloading !== null}
          >
            {downloading === 'TEMPLATE' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Tải file mẫu (các cột đọc được)
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start border-violet-200 text-violet-800 hover:bg-violet-50"
            onClick={() => get('SIM')}
            disabled={downloading !== null}
          >
            {downloading === 'SIM' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FlaskConical className="size-4" />
            )}
            Tải file MÔ PHỎNG “GHN chuyển tiền”
          </Button>
          <p className="text-xs text-muted-foreground">
            File mô phỏng gồm các đơn COD đã giao chưa đối soát, dùng để thử khi chưa có file thật
            của GHN.
          </p>
        </div>
      </section>

      <div className="rounded-2xl border bg-card shadow-sm shadow-navy/[0.03]">
        <div className="border-b px-4 py-3 font-semibold text-navy md:px-5">Các lần nhập file</div>
        {list.isPending ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : list.isError ? (
          <LoadError message={list.error.message} onRetry={() => list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={FileSpreadsheet} title="Chưa nhập file đối soát nào" />
        ) : (
          <>
            <ul className="divide-y">
              {list.data.items.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/quan-tri/doi-soat-cod/${r.id}`}
                    className="grid gap-2 px-4 py-4 transition hover:bg-ivory/50 md:grid-cols-[minmax(0,1fr)_9rem_minmax(0,20rem)] md:items-center md:gap-4 md:px-5"
                  >
                    <div className="flex min-w-0 gap-3">
                      <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                      <div className="min-w-0 text-sm">
                        <div className="truncate font-semibold text-navy">{r.fileName}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.uploadedByName} · {formatDateTime(r.createdAt)} · {r.totalRows} dòng
                        </div>
                      </div>
                    </div>
                    <div className="text-sm font-bold text-navy md:text-right">
                      {formatMoney(r.totalCod)}
                    </div>
                    <Counts r={r} />
                  </Link>
                </li>
              ))}
            </ul>
            <Pager
              className="border-t px-5 py-3"
              page={page}
              pageSize={PAGE_SIZE}
              total={list.data.total}
              onChange={(p) => setParams({ page: String(p) }, { replace: true })}
            />
          </>
        )}
      </div>
    </div>
  );
}

function Counts({ r }: { r: CodReconciliation }) {
  const parts: Array<[ReconcileResult, number]> = [
    ['MATCHED', r.matched],
    ['MISMATCHED', r.mismatched],
    ['DUPLICATE', r.duplicated],
    ['NOT_FOUND', r.notFound],
    ['NOT_DELIVERED', r.notDelivered],
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {parts
        .filter(([, n]) => n > 0)
        .map(([k, n]) => (
          <StatusBadge key={k} tone={RESULT[k].tone}>
            {RESULT[k].label}: {n}
          </StatusBadge>
        ))}
    </div>
  );
}

/** Chi tiết một lần đối soát: từng dòng, chênh lệch tiền COD và phí ship, xử lý dòng lệch */
export function CodReconciliationDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<ReconcileResult | 'ALL'>('ALL');
  const [target, setTarget] = useState<CodReconciliationItem | null>(null);
  const detail = useQuery({
    queryKey: [...key, 'detail', id],
    queryFn: () => api<CodReconciliationDetail>(`${API.payment}/admin/cod-reconciliations/${id}`),
  });

  if (detail.isPending) return <Skeleton className="mx-auto h-96 max-w-6xl rounded-2xl" />;
  if (detail.isError) {
    return <LoadError message={detail.error.message} onRetry={() => detail.refetch()} />;
  }
  const r = detail.data;
  const items = filter === 'ALL' ? r.items : r.items.filter((i) => i.result === filter);
  const shipDiff = r.items.reduce((a, i) => a + (i.shippingDifference ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ label: 'Đối soát COD', to: '/quan-tri/doi-soat-cod' }, { label: r.fileName }]}
        title={r.fileName}
        description={`${r.uploadedByName} nhập lúc ${formatDateTime(r.createdAt)} · ${r.totalRows} dòng`}
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Tổng tiền COD theo file" value={formatMoney(r.totalCod)} />
        <Stat
          label="Dòng cần xử lý"
          value={String(
            r.items.filter((i) => i.result === 'MISMATCHED' && i.resolution !== 'ACCEPTED').length,
          )}
          tone={r.mismatched > 0 ? 'warn' : undefined}
        />
        <Stat
          label="Chênh lệch phí ship (sàn thu − GHN tính)"
          value={`${shipDiff > 0 ? '+' : ''}${formatMoney(shipDiff)}`}
          tone={shipDiff < 0 ? 'warn' : undefined}
          hint={shipDiff < 0 ? 'Sàn chịu phần chênh' : undefined}
        />
      </div>

      <div className="rounded-2xl border bg-card shadow-sm shadow-navy/[0.03]">
        <div className="flex flex-wrap gap-2 border-b px-4 py-3 md:px-5">
          {(['ALL', ...Object.keys(RESULT)] as Array<ReconcileResult | 'ALL'>).map((k) => {
            const n = k === 'ALL' ? r.items.length : r.items.filter((i) => i.result === k).length;
            if (k !== 'ALL' && n === 0) return null;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition',
                  filter === k
                    ? 'border-navy bg-navy text-white'
                    : 'border-ivory-200 bg-card text-ink/70 hover:border-champagne',
                )}
              >
                {k === 'ALL' ? 'Tất cả' : RESULT[k].label} ({n})
              </button>
            );
          })}
        </div>
        <div className="hidden grid-cols-[3rem_minmax(0,1fr)_9rem_9rem_10rem_9rem] gap-3 border-b bg-ivory/40 px-5 py-2.5 text-xs font-medium text-muted-foreground lg:grid">
          <span>Dòng</span>
          <span>Vận đơn / đơn</span>
          <span className="text-right">COD theo GHN</span>
          <span className="text-right">COD theo sàn</span>
          <span className="text-right">Phí ship (thu / GHN)</span>
          <span>Kết quả</span>
        </div>
        <ul className="divide-y">
          {items.map((i) => (
            <ItemRow key={i.id} item={i} onResolve={() => setTarget(i)} />
          ))}
        </ul>
      </div>
      <ResolveDialog
        item={target}
        onClose={() => setTarget(null)}
        onDone={(item) => {
          qc.setQueryData<CodReconciliationDetail>([...key, 'detail', id], (old) =>
            old ? { ...old, items: old.items.map((x) => (x.id === item.id ? item : x)) } : old,
          );
        }}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: 'warn';
  hint?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border bg-card px-4 py-3',
        tone === 'warn' && 'border-amber-200 bg-amber-50',
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-navy">{value}</div>
      {hint && <div className="text-xs text-amber-800">{hint}</div>}
    </div>
  );
}

function ItemRow({ item: i, onResolve }: { item: CodReconciliationItem; onResolve: () => void }) {
  const res = RESULT[i.result];
  const open = i.result === 'MISMATCHED' && i.resolution !== 'ACCEPTED';
  return (
    <li className="grid gap-2 px-4 py-3.5 text-sm md:px-5 lg:grid-cols-[3rem_minmax(0,1fr)_9rem_9rem_10rem_9rem] lg:items-center lg:gap-3">
      <span className="text-xs text-muted-foreground">#{i.rowNumber}</span>
      <div className="min-w-0">
        <div className="font-mono font-semibold text-navy">{i.ghnCode}</div>
        <div className="text-xs text-muted-foreground">{i.shopOrderCode ?? '—'}</div>
      </div>
      <Money label="COD theo GHN" value={formatMoney(i.codAmount)} />
      <Money
        label="COD theo sàn"
        value={i.expectedCod === null ? '—' : formatMoney(i.expectedCod)}
        sub={
          i.codDifference ? (
            <span className="text-red-600">
              {i.codDifference > 0 ? '+' : ''}
              {formatMoney(i.codDifference)}
            </span>
          ) : null
        }
      />
      <Money
        label="Phí ship (thu / GHN)"
        value={
          i.buyerShippingFee === null
            ? formatMoney(i.shipFee + i.returnFee)
            : `${formatMoney(i.buyerShippingFee)} / ${formatMoney(i.shipFee + i.returnFee)}`
        }
        sub={
          i.shippingDifference !== null && i.shippingDifference < 0 ? (
            <span className="text-amber-700">sàn chịu {formatMoney(-i.shippingDifference)}</span>
          ) : null
        }
      />
      <div className="flex flex-col items-start gap-1">
        <StatusBadge tone={i.resolution === 'ACCEPTED' ? 'success' : res.tone}>
          {i.resolution === 'ACCEPTED' ? 'Đã chấp nhận' : res.label}
        </StatusBadge>
        {i.note && <span className="text-xs break-words text-muted-foreground">{i.note}</span>}
        {open && (
          <Button size="sm" variant="outline" className="h-7" onClick={onResolve}>
            Xử lý
          </Button>
        )}
      </div>
    </li>
  );
}

function Money({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 lg:block lg:text-right">
      <span className="text-xs text-muted-foreground lg:hidden">{label}</span>
      <span className="tabular-nums">
        {value}
        {sub && <span className="block text-xs">{sub}</span>}
      </span>
    </div>
  );
}

function ResolveDialog({
  item,
  onClose,
  onDone,
}: {
  item: CodReconciliationItem | null;
  onClose: () => void;
  onDone: (item: CodReconciliationItem) => void;
}) {
  const [note, setNote] = useState('');
  const [accept, setAccept] = useState(true);
  const save = useMutation({
    mutationFn: () =>
      api<CodReconciliationItem>(
        `${API.payment}/admin/cod-reconciliations/items/${item!.id}/resolve`,
        { method: 'POST', body: { accept, note: note.trim() } },
      ),
    onSuccess: (r) => {
      onDone(r);
      toast.success(accept ? 'Đã chấp nhận số của GHN.' : 'Đã ghi chú.');
      setNote('');
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-navy">Xử lý dòng lệch {item?.ghnCode}</DialogTitle>
          <DialogDescription>
            GHN chuyển {formatMoney(item?.codAmount ?? 0)}, sàn cần{' '}
            {formatMoney(item?.expectedCod ?? 0)}. Thao tác được ghi nhật ký.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2" role="radiogroup">
          {[
            [
              true,
              'Chấp nhận số của GHN',
              'Coi tiền đã về; tiền seller được xét chuyển khả dụng (sàn chịu phần lệch).',
            ],
            [
              false,
              'Chỉ ghi chú, để lại',
              'Chưa coi là tiền đã về, xử lý tiếp sau khi làm rõ với GHN.',
            ],
          ].map(([v, t, d]) => (
            <button
              key={String(v)}
              type="button"
              role="radio"
              aria-checked={accept === v}
              onClick={() => setAccept(v as boolean)}
              className={cn(
                'rounded-xl border px-3 py-2.5 text-left text-sm transition',
                accept === v
                  ? 'border-navy ring-1 ring-navy'
                  : 'border-ivory-200 hover:border-champagne',
              )}
            >
              <div className="font-medium text-ink">{t as string}</div>
              <div className="text-xs text-muted-foreground">{d as string}</div>
            </button>
          ))}
        </div>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="Ghi chú xử lý (bắt buộc)"
          className="min-h-20"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Quay lại
          </Button>
          <Button onClick={() => save.mutate()} disabled={note.trim().length < 3 || save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
