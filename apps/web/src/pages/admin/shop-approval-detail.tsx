import {
  IconArrowLeft,
  IconArrowRight,
  IconBan,
  IconBuildingBank,
  IconBuildingStore,
  IconCheck,
  IconCircleCheck,
  IconFileText,
  IconLoader2,
  IconMail,
  IconMapPin,
  IconPhone,
  IconShieldExclamation,
  IconUser,
  IconX,
} from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { CARD, CardTitle, PRIMARY_BUTTON } from '@/pages/checkout/checkout-parts';
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
        <div className={CARD}>
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
              <IconArrowLeft /> Danh sách
            </Link>
          </Button>
        }
      />
      <div className="-mt-2 mb-4 flex flex-wrap items-center gap-2">
        <ApprovalTypeBadge type={a.type} />
        <span className="rounded-md bg-card px-2 py-0.5 text-xs font-medium text-charcoal">
          Phiên bản {a.version}
        </span>
        <ApprovalStatusBadge status={a.status} />
        <span className="text-xs text-ink/55">
          Nộp lúc {formatDateTime(a.submittedAt)}
          {a.status === 'PENDING' && <> · đã chờ {waited(a.submittedAt)}</>}
        </span>
      </div>

      {a.status === 'PENDING' && isOwner && <SelfBanner />}

      {a.status === 'REPLACED' && latest && latest.id !== a.id && (
        <div
          className={cn(CARD, 'mb-4 flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center')}
        >
          <IconFileText className="size-5 shrink-0 text-ink/45" />
          <div className="flex-1">
            Shop đã nộp phiên bản mới hơn (v{latest.version}), bản này không duyệt được nữa.
          </div>
          <Button asChild size="sm" variant="outline" className="rounded-lg">
            <Link to={`/quan-tri/duyet-shop/${latest.id}`}>
              Xem bản v{latest.version} <IconArrowRight />
            </Link>
          </Button>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          {a.type === 'CHANGE' && a.change && <ChangeTable a={a} />}
          <FullProfile a={a} />
          {a.status === 'PENDING' && (
            <DecisionBar a={a} isOwner={isOwner} onSelfBlocked={() => setSelfBlocked(true)} />
          )}
          {a.status !== 'PENDING' && a.status !== 'REPLACED' && <DecisionResult a={a} />}
        </div>
        <aside className="space-y-4 lg:sticky lg:top-20">
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
            className="grid gap-2 rounded-xl border border-ink/10 p-3 md:grid-cols-[1fr_auto_1fr] md:items-stretch md:gap-3"
          >
            <div className="text-sm font-semibold text-charcoal md:col-span-3">{r.label}</div>
            <div className="rounded-lg bg-page px-3 py-2 text-sm text-ink/60">
              <div className="text-[11px] font-medium tracking-wide uppercase">Hiện tại</div>
              <div className="break-words">{r.old}</div>
            </div>
            <IconArrowRight className="hidden size-4 self-center text-navy md:block" />
            <div className="rounded-lg bg-champagne-50 px-3 py-2 text-sm text-charcoal ring-1 ring-navy/20 ring-inset">
              <div className="text-[11px] font-medium tracking-wide text-navy uppercase">
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
  const rows: Array<{ icon: typeof IconBuildingStore; label: string; value: React.ReactNode }> = [
    {
      icon: IconBuildingStore,
      label: 'Tên shop',
      value: <span className="font-semibold">{d.name}</span>,
    },
    {
      icon: IconFileText,
      label: 'Mô tả',
      value: <span className="whitespace-pre-line">{d.description || '—'}</span>,
    },
    { icon: IconPhone, label: 'SĐT shop', value: d.phone || '—' },
    {
      icon: IconMapPin,
      label: 'Lấy hàng',
      value: `${p.street}, ${p.wardName}, ${p.districtName}, ${p.provinceName}`,
    },
    {
      icon: IconBuildingBank,
      label: 'Ngân hàng',
      value: (
        <>
          {d.bankAccount.bankName} ·{' '}
          <span className="font-medium tabular-nums">{d.bankAccount.accountNumber}</span> ·{' '}
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
              <ShopLogo url={d.logoUrl} className="size-32 rounded-xl ring-1 ring-ink/[0.08]" />
            </a>
          ) : (
            <ShopLogo
              url={null}
              className="size-32 rounded-xl border border-dashed border-ink/20"
            />
          )}
          <span className="text-xs text-muted-foreground">
            {d.logoUrl ? 'Bấm để xem ảnh gốc' : 'Chưa có logo'}
          </span>
        </div>
        <dl className="min-w-0 flex-1 divide-y divide-ink/[0.06]">
          {rows.map(({ icon: Icon, label, value }) => (
            <div key={label} className="grid gap-1 py-2.5 first:pt-0 sm:grid-cols-[130px_1fr]">
              <dt className="flex items-center gap-2 text-sm text-ink/55">
                <Icon className="size-4 text-navy" /> {label}
              </dt>
              <dd className="text-sm break-words text-charcoal">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="mt-4 rounded-lg bg-page px-3 py-2.5 text-xs text-ink/55">
        Số tài khoản hiện đầy đủ ở đây để admin đối chiếu tên chủ tài khoản với tên shop / chủ shop.
      </p>
    </SectionCard>
  );
}

function OwnerCard({ a }: { a: ShopApprovalDetail }) {
  return (
    <section className={cn(CARD, 'p-5')}>
      <CardTitle>Chủ shop</CardTitle>
      <div className="mt-4 space-y-2.5 text-sm">
        <div className="flex items-center gap-2.5">
          <IconUser className="size-4 text-navy" />
          <span className="font-medium text-charcoal">{a.ownerName}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <IconMail className="size-4 text-navy" />
          <span className="truncate text-ink/60">{a.ownerEmail}</span>
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
    <section className={cn(CARD, 'p-5')}>
      <CardTitle>Lịch sử phiên bản</CardTitle>
      <ol className="relative mt-4 space-y-1 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-ink/10">
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
                  current ? 'bg-champagne-50' : 'hover:bg-page',
                )}
              >
                <div className="text-sm font-medium text-charcoal">
                  v{v.version} · {v.type === 'REGISTER' ? 'Mở shop' : 'Đổi thông tin'}
                  {current && <span className="ml-1.5 text-xs text-navy">(đang xem)</span>}
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
    <div className={cn(CARD, 'flex items-center gap-3.5 px-5 py-4')}>
      <span
        className={cn(
          'flex size-12 shrink-0 items-center justify-center rounded-full',
          approved ? 'bg-ship/10 text-ship' : 'bg-red-50 text-red-500',
        )}
      >
        {approved ? <IconCircleCheck className="size-6" /> : <IconBan className="size-6" />}
      </span>
      <div className="min-w-0 text-sm">
        <div className="text-base font-bold tracking-tight text-charcoal">
          {approved ? 'Đã duyệt' : 'Đã từ chối'}
          {a.decidedByName && <> bởi {a.decidedByName}</>}
        </div>
        <div className="text-xs text-ink/55">{formatDateTime(a.decidedAt)}</div>
        {a.reason && (
          <p className="mt-1 text-ink/70">
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
    <div className="mb-4 flex gap-3 rounded-2xl bg-red-50 p-4 text-sm text-red-900 ring-1 ring-red-200">
      <IconShieldExclamation className="mt-0.5 size-5 shrink-0 text-red-600" />
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
      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-3 border-t border-black/[0.06] bg-card/95 p-3 shadow-[0_-8px_24px_-12px_rgba(15,26,61,0.25)] backdrop-blur md:static md:justify-end md:rounded-2xl md:border-0 md:bg-card md:p-4 md:shadow-[0_1px_2px_rgba(15,26,61,0.04)]">
        <span className="mr-auto hidden self-center text-sm text-ink/55 md:block">
          Duyệt hay từ chối đều được ghi nhật ký (ai, lúc nào, lý do).
        </span>
        <Button
          variant="outline"
          size="lg"
          className="h-11 flex-1 rounded-lg border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 md:flex-none md:px-8"
          onClick={() => open('REJECT')}
        >
          <IconX /> Từ chối
        </Button>
        <button
          type="button"
          className={cn(
            PRIMARY_BUTTON,
            'inline-flex h-11 flex-1 items-center justify-center gap-2 text-sm md:flex-none md:px-10',
          )}
          onClick={() => open('APPROVE')}
        >
          <IconCheck className="size-4 [stroke-width:2.5]" /> Duyệt
        </button>
      </div>

      <Dialog open={!!mode} onOpenChange={(o) => !o && !busy && setMode(null)}>
        <DialogContent className="rounded-2xl sm:max-w-lg">
          <DialogHeader className="text-left">
            <DialogTitle className={mode === 'REJECT' ? 'text-red-600' : 'text-charcoal'}>
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
              className="rounded-lg bg-card focus-visible:border-navy/50"
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
                      className="rounded-lg border border-ink/15 bg-card px-2.5 py-1 text-xs text-ink/70 transition hover:border-navy/40 hover:text-navy"
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
              {busy && <IconLoader2 className="animate-spin" />}
              {mode === 'REJECT' ? 'IconXác nhận từ chối' : 'IconXác nhận duyệt'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
