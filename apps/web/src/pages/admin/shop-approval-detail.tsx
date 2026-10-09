import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Check,
  CheckCircle2,
  FileText,
  Landmark,
  Loader2,
  Mail,
  MapPin,
  Phone,
  ShieldAlert,
  Store,
  UserRound,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { LoadError } from '@/components/console/empty-state';
import { SectionCard } from '@/components/console/form-field';
import { ShopLogo } from '@/components/console/shop-logo';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import type { ShopApprovalDetail, ShopApprovalVersion } from '@/lib/admin-types';
import { API, api, ApiError } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { formatDateTime, maskAccount } from '@/lib/format';
import { showApiError } from '@/lib/form';
import type { BankAccount } from '@/lib/types';
import { cn } from '@/lib/utils';
import { APPROVAL_STATUS, ApprovalStatusBadge, ApprovalTypeBadge, waited } from './labels';
import { approvalsKey } from './shop-approvals';

/** Lý do thường gặp: bấm để điền sẵn vào ô lý do, admin sửa tiếp được */
const QUICK_REASONS = [
  'Logo không rõ hoặc không phù hợp',
  'Sai tên chủ tài khoản',
  'Thiếu thông tin mô tả shop',
  'Địa chỉ lấy hàng chưa rõ ràng',
  'Tên shop không phù hợp',
];
const REASON_MAX = 500;

const detailKey = (id: string) => [...approvalsKey, 'detail', id] as const;

/**
 * Quản trị › Duyệt shop › Chi tiết hồ sơ (SHP-02, docs/so-do/13 mục K).
 * Admin là chủ shop thì không được tự duyệt (backend trả 403 SELF_APPROVAL_FORBIDDEN).
 */
export function ShopApprovalDetailPage() {
  const { approvalId = '' } = useParams();
  const user = useCurrentUser();
  const query = useQuery({
    queryKey: detailKey(approvalId),
    queryFn: () => api<ShopApprovalDetail>(`${API.approval}/admin/shop-approvals/${approvalId}`),
  });
  const [selfBlocked, setSelfBlocked] = useState(false);

  const crumbs = [
    { label: 'Kiểm duyệt' },
    { label: 'Duyệt shop', to: '/quan-tri/duyet-shop' },
    { label: query.data?.shopName ?? 'Chi tiết hồ sơ' },
  ];

  if (query.isPending) return <DetailSkeleton />;
  if (query.isError) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader crumbs={crumbs} title="Chi tiết hồ sơ" />
        <div className="rounded-2xl border bg-card">
          <LoadError message={query.error.message} onRetry={() => void query.refetch()} />
        </div>
      </div>
    );
  }
  const a = query.data;
  const isOwner = selfBlocked || (!!user && a.ownerId === user.id);
  const latest = a.history[0];

  return (
    <div className="mx-auto max-w-6xl pb-24 md:pb-0">
      <PageHeader
        crumbs={crumbs}
        title={a.shopName}
        actions={
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <Link to="/quan-tri/duyet-shop">
              <ArrowLeft /> Danh sách
            </Link>
          </Button>
        }
      />
      <div className="-mt-3 mb-6 flex flex-wrap items-center gap-2">
        <ApprovalTypeBadge type={a.type} />
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-ink">
          Phiên bản {a.version}
        </span>
        <ApprovalStatusBadge status={a.status} />
        <span className="text-xs text-muted-foreground">
          Nộp lúc {formatDateTime(a.submittedAt)}
          {a.status === 'PENDING' && <> · đã chờ {waited(a.submittedAt)}</>}
        </span>
      </div>

      {a.status === 'PENDING' && isOwner && <SelfBanner />}

      {a.status === 'REPLACED' && latest && latest.id !== a.id && (
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border bg-muted/60 p-4 text-sm sm:flex-row sm:items-center">
          <FileText className="size-5 shrink-0 text-muted-foreground" />
          <div className="flex-1">
            Shop đã nộp phiên bản mới hơn (v{latest.version}), bản này không duyệt được nữa.
          </div>
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <Link to={`/quan-tri/duyet-shop/${latest.id}`}>
              Xem bản v{latest.version} <ArrowRight />
            </Link>
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          {a.type === 'CHANGE' && a.change && <ChangeTable a={a} />}
          <FullProfile a={a} />
          {a.status === 'PENDING' && (
            <DecisionBar a={a} isOwner={isOwner} onSelfBlocked={() => setSelfBlocked(true)} />
          )}
          {a.status !== 'PENDING' && a.status !== 'REPLACED' && <DecisionResult a={a} />}
        </div>
        <aside className="space-y-6">
          <OwnerCard a={a} />
          <History items={a.history} currentId={a.id} />
        </aside>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-8 w-72" />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

/** Ngân hàng · số tài khoản · chủ tài khoản; mỗi phần không bị ngắt giữa chừng khi xuống dòng */
function BankLine({ b, masked }: { b: BankAccount; masked: boolean }) {
  return (
    <span className="flex flex-wrap gap-x-1.5">
      <span className="whitespace-nowrap">{b.bankName}</span>·
      <span className="whitespace-nowrap tabular-nums">
        {masked ? maskAccount(b.accountNumber) : b.accountNumber}
      </span>
      ·<span className="whitespace-nowrap">{b.accountName}</span>
    </span>
  );
}

/** Bảng "Phần muốn đổi": hiện tại → muốn đổi thành */
function ChangeTable({ a }: { a: ShopApprovalDetail }) {
  const change = a.change!;
  const rows = [
    change.fields.includes('name') && {
      label: 'Tên shop',
      old: change.old.name ?? '—',
      next: a.data.name,
    },
    change.fields.includes('bankAccount') && {
      label: 'Tài khoản ngân hàng',
      old: change.old.bankAccount ? <BankLine b={change.old.bankAccount} masked /> : '—',
      next: <BankLine b={a.data.bankAccount} masked={false} />,
    },
  ].filter(Boolean) as Array<{ label: string; old: React.ReactNode; next: React.ReactNode }>;

  return (
    <SectionCard
      title="Phần muốn đổi"
      description="So sánh thông tin shop đang dùng với giá trị mới."
    >
      <div className="space-y-3">
        {rows.map((r) => (
          <div
            key={r.label}
            className="grid gap-2 rounded-xl border p-3 md:grid-cols-[1fr_auto_1fr] md:items-stretch md:gap-3"
          >
            <div className="text-sm font-semibold text-ink md:col-span-3">{r.label}</div>
            <div className="rounded-lg bg-muted/70 px-3 py-2 text-sm text-muted-foreground">
              <div className="text-[11px] font-medium tracking-wide uppercase">Hiện tại</div>
              <div className="break-words">{r.old}</div>
            </div>
            <ArrowRight className="hidden size-4 self-center text-champagne-600 md:block" />
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200 ring-inset">
              <div className="text-[11px] font-medium tracking-wide text-emerald-700 uppercase">
                Muốn đổi thành
              </div>
              <div className="font-medium break-words">{r.next}</div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

/** Hồ sơ đầy đủ (bản chụp lúc nộp) */
function FullProfile({ a }: { a: ShopApprovalDetail }) {
  const d = a.data;
  const p = d.pickupAddress;
  const rows: Array<{ icon: typeof Store; label: string; value: React.ReactNode }> = [
    { icon: Store, label: 'Tên shop', value: <span className="font-semibold">{d.name}</span> },
    {
      icon: FileText,
      label: 'Mô tả',
      value: <span className="whitespace-pre-line">{d.description || '—'}</span>,
    },
    { icon: Phone, label: 'SĐT shop', value: d.phone || '—' },
    {
      icon: MapPin,
      label: 'Lấy hàng',
      value: `${p.street}, ${p.wardName}, ${p.districtName}, ${p.provinceName}`,
    },
    {
      icon: Landmark,
      label: 'Ngân hàng',
      value: (
        <>
          {d.bankAccount.bankName} ·{' '}
          <span className="font-mono tracking-wide">{d.bankAccount.accountNumber}</span> ·{' '}
          <span className="font-medium">{d.bankAccount.accountName}</span>
        </>
      ),
    },
  ];
  return (
    <SectionCard
      title="Hồ sơ đầy đủ"
      description={
        a.type === 'CHANGE' ? 'Thông tin shop sau khi đổi (bản chụp lúc nộp).' : 'Bản chụp lúc nộp.'
      }
    >
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="flex flex-col items-center gap-2">
          {d.logoUrl ? (
            <a href={d.logoUrl} target="_blank" rel="noreferrer" title="Mở ảnh gốc">
              <ShopLogo url={d.logoUrl} className="size-32 border border-champagne/40 shadow-sm" />
            </a>
          ) : (
            <ShopLogo url={null} className="size-32 border border-dashed" />
          )}
          <span className="text-xs text-muted-foreground">
            {d.logoUrl ? 'Bấm để xem ảnh gốc' : 'Chưa có logo'}
          </span>
        </div>
        <dl className="min-w-0 flex-1 divide-y">
          {rows.map(({ icon: Icon, label, value }) => (
            <div key={label} className="grid gap-1 py-2.5 first:pt-0 sm:grid-cols-[130px_1fr]">
              <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon className="size-4 text-champagne-600" /> {label}
              </dt>
              <dd className="text-sm break-words text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="mt-4 rounded-lg bg-ivory px-3 py-2 text-xs text-muted-foreground">
        Số tài khoản hiện đầy đủ ở đây để admin đối chiếu tên chủ tài khoản với tên shop / chủ shop.
      </p>
    </SectionCard>
  );
}

function OwnerCard({ a }: { a: ShopApprovalDetail }) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm shadow-navy/[0.03]">
      <h2 className="flex items-center gap-2 font-semibold text-navy">
        <span className="h-4 w-1 rounded-full bg-champagne" aria-hidden />
        Chủ shop
      </h2>
      <div className="mt-4 space-y-2.5 text-sm">
        <div className="flex items-center gap-2.5">
          <UserRound className="size-4 text-champagne-600" />
          <span className="font-medium text-ink">{a.ownerName}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <Mail className="size-4 text-champagne-600" />
          <span className="truncate text-muted-foreground">{a.ownerEmail}</span>
        </div>
        <div className="text-xs text-muted-foreground">Nộp lúc {formatDateTime(a.submittedAt)}</div>
      </div>
    </section>
  );
}

const DOT: Record<ShopApprovalVersion['status'], string> = {
  PENDING: 'bg-amber-500 ring-amber-100',
  APPROVED: 'bg-emerald-500 ring-emerald-100',
  REJECTED: 'bg-red-500 ring-red-100',
  REPLACED: 'bg-gray-400 ring-gray-100',
};

/** Lịch sử phiên bản của shop, mới nhất trước */
function History({ items, currentId }: { items: ShopApprovalVersion[]; currentId: string }) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm shadow-navy/[0.03]">
      <h2 className="flex items-center gap-2 font-semibold text-navy">
        <span className="h-4 w-1 rounded-full bg-champagne" aria-hidden />
        Lịch sử phiên bản
      </h2>
      <ol className="relative mt-4 space-y-1 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-border">
        {items.map((v) => {
          const current = v.id === currentId;
          return (
            <li key={v.id} className="relative pl-6">
              <span
                className={cn(
                  'absolute top-3 left-0 size-[11px] rounded-full ring-4',
                  DOT[v.status],
                )}
              />
              <Link
                to={`/quan-tri/duyet-shop/${v.id}`}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'block rounded-lg px-2.5 py-2 transition',
                  current ? 'bg-champagne-50' : 'hover:bg-ivory',
                )}
              >
                <div className="text-sm font-medium text-ink">
                  v{v.version} · {v.type === 'REGISTER' ? 'Mở shop' : 'Đổi thông tin'}
                  {current && <span className="ml-1.5 text-xs text-champagne-600">(đang xem)</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {APPROVAL_STATUS[v.status].label} · {formatDateTime(v.decidedAt ?? v.submittedAt)}
                </div>
                {v.reason && v.status === 'REJECTED' && (
                  <div className="mt-0.5 text-xs text-red-700 italic">"{v.reason}"</div>
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Kết quả đã quyết: ai, lúc nào, lý do */
function DecisionResult({ a }: { a: ShopApprovalDetail }) {
  const approved = a.status === 'APPROVED';
  return (
    <div
      className={cn(
        'flex gap-3 rounded-2xl border p-4 md:p-5',
        approved ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50',
      )}
    >
      {approved ? (
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
      ) : (
        <Ban className="mt-0.5 size-5 shrink-0 text-red-600" />
      )}
      <div className="text-sm">
        <div className={cn('font-semibold', approved ? 'text-emerald-900' : 'text-red-900')}>
          {approved ? 'Đã duyệt' : 'Đã từ chối'}
          {a.decidedByName && <> bởi {a.decidedByName}</>}
        </div>
        <div className="text-xs text-muted-foreground">{formatDateTime(a.decidedAt)}</div>
        {a.reason && (
          <p className={cn('mt-2', approved ? 'text-emerald-900' : 'text-red-900')}>
            <span className="font-medium">{approved ? 'Ghi chú' : 'Lý do'}:</span> {a.reason}
          </p>
        )}
      </div>
    </div>
  );
}

/** Admin đang xem hồ sơ shop của chính mình: không có nút quyết định */
function SelfBanner() {
  return (
    <div className="mb-6 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
      <ShieldAlert className="mt-0.5 size-5 shrink-0 text-red-600" />
      <div>
        <div className="font-semibold">Bạn là chủ shop này</div>
        Bạn không thể tự duyệt hoặc từ chối hồ sơ shop của chính mình. Hãy nhờ một admin kiểm duyệt
        khác xử lý.
      </div>
    </div>
  );
}

/** Nút Từ chối / Duyệt (điện thoại: dính đáy màn hình) và hai cửa sổ xác nhận */
function DecisionBar({
  a,
  isOwner,
  onSelfBlocked,
}: {
  a: ShopApprovalDetail;
  isOwner: boolean;
  onSelfBlocked: () => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isOwner) return null;

  const open = (m: 'APPROVE' | 'REJECT') => {
    setMode(m);
    setReason('');
    setError(null);
  };

  async function submit() {
    const text = reason.trim();
    if (mode === 'REJECT' && !text) {
      setError('Vui lòng nhập lý do từ chối.');
      return;
    }
    if (text.length > REASON_MAX) {
      setError(`Lý do tối đa ${REASON_MAX} ký tự.`);
      return;
    }
    setBusy(true);
    try {
      const result = await api<ShopApprovalDetail>(
        `${API.approval}/admin/shop-approvals/${a.id}/decision`,
        { method: 'POST', body: { decision: mode, ...(text ? { reason: text } : {}) } },
      );
      queryClient.setQueryData(detailKey(a.id), result);
      void queryClient.invalidateQueries({ queryKey: approvalsKey });
      toast.success(mode === 'APPROVE' ? 'Đã duyệt hồ sơ.' : 'Đã từ chối hồ sơ.');
      setMode(null);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'SELF_APPROVAL_FORBIDDEN') {
          toast.error(e.message);
          setMode(null);
          onSelfBlocked();
          return;
        }
        if (e.code === 'ALREADY_DECIDED' || e.code === 'APPLICATION_REPLACED') {
          toast.error(e.message);
          setMode(null);
          void queryClient.invalidateQueries({ queryKey: approvalsKey });
          return;
        }
        if (e.fields.reason) {
          setError(e.fields.reason);
          return;
        }
      }
      showApiError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-3 border-t bg-white/95 p-3 shadow-[0_-4px_16px_rgba(23,37,84,0.08)] backdrop-blur md:static md:justify-end md:rounded-2xl md:border md:p-4 md:shadow-sm">
        <span className="mr-auto hidden self-center text-sm text-muted-foreground md:block">
          Duyệt hay từ chối đều được ghi nhật ký (ai, lúc nào, lý do).
        </span>
        <Button
          variant="outline"
          size="lg"
          className="flex-1 rounded-full border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800 md:flex-none md:px-8"
          onClick={() => open('REJECT')}
        >
          <X /> Từ chối
        </Button>
        <Button
          size="lg"
          className="flex-1 rounded-full md:flex-none md:px-10"
          onClick={() => open('APPROVE')}
        >
          <Check /> Duyệt
        </Button>
      </div>

      <Dialog open={!!mode} onOpenChange={(o) => !o && !busy && setMode(null)}>
        <DialogContent className="rounded-2xl sm:max-w-lg">
          <DialogHeader className="text-left">
            <DialogTitle className={mode === 'REJECT' ? 'text-red-700' : 'text-navy'}>
              {mode === 'REJECT' ? 'Từ chối hồ sơ' : 'Duyệt hồ sơ'} "{a.shopName}" (v{a.version})
            </DialogTitle>
            <DialogDescription>
              {mode === 'REJECT'
                ? 'Seller sẽ đọc lý do này để sửa và nộp lại. Viết rõ cần sửa gì.'
                : a.type === 'REGISTER'
                  ? 'Shop sẽ chuyển sang "Đang hoạt động" và seller vào được Kênh người bán.'
                  : 'Thông tin mới sẽ thay thông tin đang dùng của shop.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label htmlFor="decision-reason" className="text-sm font-medium text-ink">
              {mode === 'REJECT' ? (
                <>
                  Lý do từ chối<span className="text-destructive">*</span>
                </>
              ) : (
                'Ghi chú (không bắt buộc)'
              )}
            </label>
            <Textarea
              id="decision-reason"
              rows={4}
              autoFocus
              value={reason}
              aria-invalid={!!error}
              placeholder={mode === 'REJECT' ? 'Ví dụ: Logo không rõ tên shop…' : ''}
              className="rounded-lg bg-white focus-visible:border-champagne"
              onChange={(e) => {
                setReason(e.target.value);
                setError(null);
              }}
            />
            <div className="flex justify-between gap-3 text-xs">
              <span className="text-destructive">{error}</span>
              <span
                className={cn(
                  'text-muted-foreground',
                  reason.length > REASON_MAX && 'text-destructive',
                )}
              >
                {reason.length}/{REASON_MAX}
              </span>
            </div>
            {mode === 'REJECT' && (
              <div>
                <div className="mb-1.5 text-xs text-muted-foreground">Lý do thường gặp:</div>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        setReason((cur) => (cur.trim() ? `${cur.trim()}. ${r}` : r));
                        setError(null);
                      }}
                      className="rounded-full border border-champagne/50 bg-champagne-50/60 px-2.5 py-1 text-xs text-navy transition hover:border-champagne hover:bg-champagne-50"
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setMode(null)}>
              Hủy
            </Button>
            <Button
              disabled={busy}
              onClick={() => void submit()}
              className={cn('min-w-40', mode === 'REJECT' && 'bg-red-600 hover:bg-red-700')}
            >
              {busy && <Loader2 className="animate-spin" />}
              {mode === 'REJECT' ? 'Xác nhận từ chối' : 'Xác nhận duyệt'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
