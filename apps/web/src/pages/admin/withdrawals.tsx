import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageIcon, Landmark, Loader2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { Pager } from '@/components/console/pager';
import { inputClass } from '@/components/form-bits';
import { PageHeader } from '@/components/layout/page-header';
import { ConfirmDialog, MoneyRow, ReasonDialog } from '@/components/orders/order-parts';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { API, api, apiBlob } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import type {
  AdminWallet,
  AdminWithdrawalPage,
  Withdrawal,
  WithdrawalApproval,
  WithdrawalStatus,
} from '@/lib/after-sales-types';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';
import { WITHDRAWAL_STATUS } from '@/pages/seller/finance';

const PAGE_SIZE = 20;
const key = ['admin', 'withdrawals'] as const;
type Tab = 'APPROVE' | 'PAY' | 'HISTORY';

const TX_LABEL: Record<string, string> = {
  HELD: 'Tiền đơn vào ví',
  RELEASED: 'Đang giữ → khả dụng',
  REVERSED: 'Trừ lại',
  COMPENSATION: 'Đền sự cố',
  RETURN_DEDUCTED: 'Trừ do trả hàng',
  LOCKED: 'Khóa cho yêu cầu rút',
  UNLOCKED: 'Mở khóa',
  WITHDRAWN: 'Đã chi',
  ADJUSTMENT: 'Điều chỉnh',
};

/**
 * Quản trị › Rút tiền (FIN-05, FIN-06, bộ quyền FINANCE): duyệt yêu cầu (approval-service), chuyển khoản và
 * nhập chứng từ (payment-service), lịch sử chi trả kèm tổng tiền để đối soát
 */
export function WithdrawalsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') ?? 'APPROVE') as Tab;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const setTab = (t: Tab) => setParams(t === 'APPROVE' ? {} : { tab: t }, { replace: true });
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ label: 'Tài chính' }, { label: 'Rút tiền' }]}
        title="Rút tiền của seller"
        description="Mọi yêu cầu rút đều cần duyệt. Sau khi duyệt, chuyển khoản ngoài hệ thống rồi nhập mã giao dịch và ảnh biên lai; chỉ khi đó tiền mới ghi là đã chi. Chủ shop không tự duyệt, không tự chi cho shop mình."
      />
      <div className="rounded-2xl border bg-card shadow-sm shadow-navy/[0.03]">
        <nav className="-mb-px flex gap-1 overflow-x-auto border-b px-4 pt-2 md:px-5">
          {(
            [
              ['APPROVE', 'Chờ duyệt'],
              ['PAY', 'Chờ chuyển khoản'],
              ['HISTORY', 'Lịch sử chi trả'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                'shrink-0 border-b-2 px-3 py-3 text-sm whitespace-nowrap transition',
                tab === value
                  ? 'border-navy font-semibold text-navy'
                  : 'border-transparent text-muted-foreground hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </nav>
        {tab === 'APPROVE' ? (
          <ApprovalList page={page} onPage={(p) => setParams({ page: String(p) })} />
        ) : (
          <PayoutList mode={tab} page={page} onPage={(p) => setParams({ tab, page: String(p) })} />
        )}
      </div>
    </div>
  );
}

// ----- duyệt (approval-service) -----

function ApprovalList({ page, onPage }: { page: number; onPage: (p: number) => void }) {
  const qc = useQueryClient();
  const me = useCurrentUser();
  const [open, setOpen] = useState<WithdrawalApproval | null>(null);
  const [rejecting, setRejecting] = useState<WithdrawalApproval | null>(null);
  const list = useQuery({
    queryKey: [...key, 'approvals', page],
    queryFn: () =>
      api<Page<WithdrawalApproval>>(`${API.approval}/admin/withdrawal-approvals`, {
        query: { status: 'PENDING', page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  const decide = useMutation({
    mutationFn: ({
      a,
      decision,
      reason,
    }: {
      a: WithdrawalApproval;
      decision: 'APPROVE' | 'REJECT';
      reason?: string;
    }) =>
      api<WithdrawalApproval>(`${API.approval}/admin/withdrawal-approvals/${a.id}/decision`, {
        method: 'POST',
        body: { decision, reason },
      }),
    onSuccess: (_, { decision }) => {
      void qc.invalidateQueries({ queryKey: key });
      setOpen(null);
      toast.success(
        decision === 'APPROVE'
          ? 'Đã duyệt. Yêu cầu sang tab Chờ chuyển khoản sau vài giây.'
          : 'Đã từ chối, tiền được mở khóa cho seller.',
      );
    },
    onError: (e) => toast.error(e.message),
  });
  if (list.isPending) return <ListSkeleton />;
  if (list.isError)
    return <LoadError message={list.error.message} onRetry={() => list.refetch()} />;
  if (list.data.items.length === 0) {
    return <EmptyState icon={Landmark} title="Không có yêu cầu rút chờ duyệt" />;
  }
  return (
    <>
      <ul className="divide-y">
        {list.data.items.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 md:px-5">
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-semibold text-navy">
                {a.shop.name} · {formatMoney(a.amount)}
              </div>
              <div className="text-xs text-muted-foreground">
                Chủ shop {a.owner.name} · {a.bankAccount.bankName}{' '}
                {a.bankAccount.accountNumberMasked} · gửi {formatDateTime(a.requestedAt)}
              </div>
            </div>
            {a.owner.id === me?.id ? (
              <span className="text-xs text-muted-foreground">
                Shop của bạn: nhờ admin tài chính khác duyệt
              </span>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setOpen(a)}>
                Xem nguồn tiền và duyệt
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Pager
        className="border-t px-5 py-3"
        page={page}
        pageSize={PAGE_SIZE}
        total={list.data.total}
        onChange={onPage}
      />
      {open && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setOpen(null)}
          title={`Duyệt rút ${formatMoney(open.amount)} của ${open.shop.name}?`}
          description="Kiểm tra nguồn tiền (các khoản đã vào ngăn khả dụng) trước khi duyệt."
          confirmLabel="Duyệt"
          onConfirm={() => decide.mutateAsync({ a: open, decision: 'APPROVE' })}
        >
          <WalletSource shopId={open.shop.id} />
          <div className="rounded-lg bg-ivory px-3 py-2 text-xs text-ink/70">
            Tài khoản nhận: {open.bankAccount.bankName} · {open.bankAccount.accountNumberMasked} ·{' '}
            {open.bankAccount.accountName}
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setRejecting(open);
              setOpen(null);
            }}
          >
            Từ chối yêu cầu
          </Button>
        </ConfirmDialog>
      )}
      <ReasonDialog
        open={rejecting !== null}
        onOpenChange={(o) => !o && setRejecting(null)}
        title="Từ chối yêu cầu rút?"
        description="Tiền được mở khóa, trở lại ngăn khả dụng của seller."
        reasons={['Cần đối soát thêm các đơn gần đây', 'Tài khoản nhận chưa khớp tên chủ shop']}
        confirmLabel="Từ chối"
        onSubmit={(reason) => decide.mutateAsync({ a: rejecting!, decision: 'REJECT', reason })}
      />
    </>
  );
}

/** Nguồn tiền của shop: số dư 3 ngăn và các biến động ví gần nhất (payment-service) */
function WalletSource({ shopId }: { shopId: string }) {
  const q = useQuery({
    queryKey: [...key, 'wallet', shopId],
    queryFn: () => api<AdminWallet>(`${API.payment}/admin/shops/${shopId}/wallet`),
  });
  if (q.isPending) return <Skeleton className="h-32 rounded-xl" />;
  if (q.isError) return <p className="text-sm text-destructive">{q.error.message}</p>;
  const w = q.data;
  return (
    <div className="space-y-2 text-sm">
      <div className="grid grid-cols-3 gap-2 text-center">
        {(
          [
            ['Đang giữ', w.pending],
            ['Khả dụng', w.available],
            ['Đang khóa', w.locked],
          ] as const
        ).map(([label, v]) => (
          <div key={label} className="rounded-lg bg-ivory px-2 py-1.5">
            <div className="text-xs text-ink/55">{label}</div>
            <div className="font-semibold tabular-nums text-navy">{formatMoney(v)}</div>
          </div>
        ))}
      </div>
      <ul className="max-h-48 divide-y overflow-y-auto rounded-lg border">
        {w.recentTransactions.map((t) => (
          <li key={t.id} className="flex justify-between gap-2 px-3 py-1.5 text-xs">
            <span className="min-w-0 truncate">
              {TX_LABEL[t.type] ?? t.type}
              {t.shopOrderCode && <span className="text-ink/50"> · {t.shopOrderCode}</span>}
            </span>
            <span className="shrink-0 tabular-nums">{formatMoney(t.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ----- chi trả (payment-service) -----

function PayoutList({
  mode,
  page,
  onPage,
}: {
  mode: 'PAY' | 'HISTORY';
  page: number;
  onPage: (p: number) => void;
}) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<WithdrawalStatus | 'ALL'>('ALL');
  const [paying, setPaying] = useState<Withdrawal | null>(null);
  const [failing, setFailing] = useState<Withdrawal | null>(null);
  const filter = mode === 'PAY' ? 'APPROVED' : status === 'ALL' ? undefined : status;
  const list = useQuery({
    queryKey: [...key, 'payouts', mode, filter, page],
    queryFn: () =>
      api<AdminWithdrawalPage>(`${API.payment}/admin/withdrawals`, {
        query: { status: filter, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });
  const failed = useMutation({
    mutationFn: ({ w, reason }: { w: Withdrawal; reason: string }) =>
      api(`${API.payment}/admin/withdrawals/${w.id}/failed`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key });
      toast.success('Đã ghi chuyển khoản lỗi, tiền được mở khóa cho seller.');
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      {mode === 'HISTORY' && (
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 md:px-5">
          {(['ALL', 'PENDING', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED', 'FAILED'] as const).map(
            (s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition',
                  status === s
                    ? 'border-navy bg-navy text-white'
                    : 'border-ivory-200 bg-card text-ink/70 hover:border-champagne',
                )}
              >
                {s === 'ALL' ? 'Tất cả' : WITHDRAWAL_STATUS[s].label}
              </button>
            ),
          )}
          {list.data && (
            <span className="ml-auto text-sm text-ink/70">
              Tổng: <b className="text-navy">{formatMoney(list.data.totalAmount)}</b> (
              {list.data.total} yêu cầu)
            </span>
          )}
        </div>
      )}
      {list.isPending ? (
        <ListSkeleton />
      ) : list.isError ? (
        <LoadError message={list.error.message} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title={mode === 'PAY' ? 'Không có yêu cầu chờ chuyển khoản' : 'Chưa có yêu cầu rút nào'}
        />
      ) : (
        <>
          <ul className="divide-y">
            {list.data.items.map((w) => {
              const st = WITHDRAWAL_STATUS[w.status];
              return (
                <li key={w.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 md:px-5">
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-navy">
                        {w.shopName} · {formatMoney(w.amount)}
                      </b>
                      <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                    </div>
                    <div className="text-xs text-ink/70">
                      Chuyển tới: {w.bankAccount.bankName} · <b>{w.bankAccount.accountNumber}</b> ·{' '}
                      {w.bankAccount.accountName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Gửi {formatDateTime(w.createdAt)}
                      {w.decidedByName &&
                        ` · ${w.status === 'REJECTED' ? 'từ chối' : 'duyệt'} bởi ${w.decidedByName}`}
                      {w.paidAt &&
                        ` · chi lúc ${formatDateTime(w.paidAt)} bởi ${w.paidByName}, mã GD ${w.transferCode}`}
                      {w.reason && ` · ${w.reason}`}
                    </div>
                  </div>
                  {w.status === 'APPROVED' && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setFailing(w)}>
                        Chuyển lỗi
                      </Button>
                      <Button size="sm" onClick={() => setPaying(w)}>
                        Đã chuyển khoản
                      </Button>
                    </div>
                  )}
                  {w.hasReceipt && <ReceiptLink id={w.id} />}
                </li>
              );
            })}
          </ul>
          <Pager
            className="border-t px-5 py-3"
            page={page}
            pageSize={PAGE_SIZE}
            total={list.data.total}
            onChange={onPage}
          />
        </>
      )}
      <PaidDialog withdrawal={paying} onClose={() => setPaying(null)} />
      <ReasonDialog
        open={failing !== null}
        onOpenChange={(o) => !o && setFailing(null)}
        title="Chuyển khoản không thành công?"
        description="Tiền được mở khóa đúng một lần, trở lại ngăn khả dụng; seller gửi yêu cầu mới."
        reasons={['Ngân hàng trả lại vì sai tên tài khoản', 'Tài khoản nhận bị khóa']}
        confirmLabel="Ghi chuyển lỗi"
        onSubmit={(reason) => failed.mutateAsync({ w: failing!, reason })}
      />
    </>
  );
}

/** Nhập mã giao dịch + ảnh biên lai sau khi đã chuyển khoản cho seller */
function PaidDialog({
  withdrawal: w,
  onClose,
}: {
  withdrawal: Withdrawal | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [transferCode, setTransferCode] = useState('');
  const [receipt, setReceipt] = useState<{ key: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const paid = useMutation({
    mutationFn: () =>
      api(`${API.payment}/admin/withdrawals/${w!.id}/paid`, {
        method: 'POST',
        body: { transferCode: transferCode.trim(), receiptKey: receipt!.key },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key });
      toast.success('Đã ghi đã chi cho seller.');
    },
    onError: (e) => toast.error(e.message),
  });
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await api<{ key: string }>(`${API.payment}/admin/uploads/payout-receipt`, {
        method: 'POST',
        formData: form,
      });
      setReceipt({ key: r.key, name: file.name });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Chưa tải được ảnh.');
    } finally {
      setUploading(false);
    }
  };
  return (
    <ConfirmDialog
      open={w !== null}
      onOpenChange={(o) => {
        if (!o) {
          setTransferCode('');
          setReceipt(null);
          onClose();
        }
      }}
      title={`Ghi đã chuyển ${formatMoney(w?.amount ?? 0)} cho ${w?.shopName ?? ''}`}
      description="Chỉ ghi sau khi đã chuyển khoản thành công. Không chắc kết quả thì kiểm tra sao kê trước, không chuyển lại."
      confirmLabel="Ghi đã chi"
      onConfirm={() =>
        transferCode.trim().length >= 3 && receipt
          ? paid.mutateAsync()
          : Promise.reject(toast.error('Nhập mã giao dịch và tải ảnh biên lai.'))
      }
    >
      {w && (
        <div className="space-y-3 text-sm">
          <MoneyRow label="Số tiền" value={w.amount} strong />
          <div className="rounded-lg bg-ivory px-3 py-2 text-xs">
            {w.bankAccount.bankName} · <b>{w.bankAccount.accountNumber}</b> ·{' '}
            {w.bankAccount.accountName}
          </div>
          <input
            className={inputClass}
            placeholder="Mã giao dịch chuyển khoản"
            value={transferCode}
            maxLength={60}
            onChange={(e) => setTransferCode(e.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => input.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            {receipt ? receipt.name : 'Chọn ảnh biên lai (JPG, PNG, WebP; tối đa 5 MB)'}
          </Button>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </div>
      )}
    </ConfirmDialog>
  );
}

function ReceiptLink({ id }: { id: string }) {
  const [loading, setLoading] = useState(false);
  const open = async () => {
    setLoading(true);
    try {
      const blob = await apiBlob(`${API.payment}/admin/withdrawals/${id}/receipt`);
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

function ListSkeleton() {
  return (
    <div className="space-y-3 p-5">
      <Skeleton className="h-14" />
      <Skeleton className="h-14" />
    </div>
  );
}
