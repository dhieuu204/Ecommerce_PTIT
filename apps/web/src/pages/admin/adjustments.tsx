import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Scale, Search } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { NumberInput } from '@/components/console/money-input';
import { Pager } from '@/components/console/pager';
import { DigitsInput, inputClass } from '@/components/form-bits';
import { PageHeader } from '@/components/layout/page-header';
import { ConfirmDialog, MoneyRow, ReasonDialog } from '@/components/orders/order-parts';
import { StatementBox } from '@/components/returns/return-parts';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { API, ApiError, api } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import type { Adjustment, AdjustmentStatus, ShopOrderMoney } from '@/lib/after-sales-types';
import { BANKS } from '@/lib/banks';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;
const key = ['admin', 'adjustments'] as const;

const STATUS: Record<
  AdjustmentStatus,
  { label: string; tone: 'pending' | 'info' | 'danger' | 'success' | 'neutral' }
> = {
  PENDING: { label: 'Chờ admin khác duyệt', tone: 'pending' },
  APPROVED: { label: 'Đã duyệt, đang thực thi', tone: 'info' },
  REJECTED: { label: 'Không duyệt', tone: 'neutral' },
  EXECUTED: { label: 'Đã thực thi', tone: 'success' },
  FAILED: { label: 'Không thực thi được', tone: 'danger' },
};

/**
 * Quản trị › Điều chỉnh ví (DIS-02, bộ quyền FINANCE): ngoại lệ sau khi tiền đã ghi khả dụng hoặc đã chi.
 * Một admin lập đề nghị cho một đơn con, một admin KHÁC duyệt; payment-service thực thi tất cả hoặc không.
 */
export function AdjustmentsPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? 'ALL') as AdjustmentStatus | 'ALL';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const me = useCurrentUser();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [reviewing, setReviewing] = useState<Adjustment | null>(null);
  const [rejecting, setRejecting] = useState<Adjustment | null>(null);
  const list = useQuery({
    queryKey: [...key, status, page],
    queryFn: () =>
      api<Page<Adjustment>>(`${API.approval}/admin/adjustments`, {
        query: { status: status === 'ALL' ? undefined : status, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
    // Vừa duyệt: chờ payment-service báo kết quả thực thi
    refetchInterval: (q) =>
      q.state.data?.items.some((a) => a.status === 'APPROVED') ? 4000 : false,
  });
  const decide = useMutation({
    mutationFn: ({
      a,
      decision,
      reason,
    }: {
      a: Adjustment;
      decision: 'APPROVE' | 'REJECT';
      reason?: string;
    }) =>
      api<Adjustment>(`${API.approval}/admin/adjustments/${a.id}/decision`, {
        method: 'POST',
        body: { decision, reason },
      }),
    onSuccess: (_, { decision }) => {
      void qc.invalidateQueries({ queryKey: key });
      toast.success(
        decision === 'APPROVE'
          ? 'Đã duyệt, hệ thống đang thực hiện điều chỉnh.'
          : 'Đã không duyệt.',
      );
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ label: 'Tài chính' }, { label: 'Điều chỉnh ví' }]}
        title="Điều chỉnh sau giải ngân"
        description="Dùng khi phát hiện sai sót sau khi tiền đã khả dụng hoặc đã chi: cộng/trừ ví seller, hoàn thêm cho người mua bằng chuyển khoản. Không sửa lịch sử cũ; trừ ví chỉ khi số dư khả dụng còn đủ."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Lập đề nghị
          </Button>
        }
      />
      <div className="rounded-2xl border bg-card shadow-sm shadow-navy/[0.03]">
        <div className="flex flex-wrap gap-2 border-b px-4 py-3 md:px-5">
          {(['ALL', 'PENDING', 'APPROVED', 'EXECUTED', 'FAILED', 'REJECTED'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setParams(s === 'ALL' ? {} : { status: s }, { replace: true })}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition',
                status === s
                  ? 'border-navy bg-navy text-white'
                  : 'border-ivory-200 bg-card text-ink/70 hover:border-champagne',
              )}
            >
              {s === 'ALL' ? 'Tất cả' : STATUS[s].label}
            </button>
          ))}
        </div>
        {list.isPending ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-16" />
          </div>
        ) : list.isError ? (
          <LoadError message={list.error.message} onRetry={() => list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={Scale} title="Chưa có đề nghị điều chỉnh" />
        ) : (
          <>
            <ul className="divide-y">
              {list.data.items.map((a) => {
                const st = STATUS[a.status];
                const mine = a.createdById === me?.id;
                // Người mua của đơn không được duyệt (backend cũng chặn): ẩn nút, ghi rõ lý do
                const involved = a.buyer.id === me?.id;
                return (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 md:px-5">
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <b className="text-navy">{a.shopOrderCode}</b>
                        <span className="text-ink/60">{a.shop.name}</span>
                        <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                      </div>
                      <div className="text-xs text-ink/70">
                        {a.sellerChange !== 0 &&
                          `${a.sellerChange > 0 ? 'Cộng' : 'Trừ'} ví seller ${formatMoney(Math.abs(a.sellerChange))}`}
                        {a.sellerChange !== 0 && a.buyerRefund > 0 && ' · '}
                        {a.buyerRefund > 0 && `Hoàn thêm người mua ${formatMoney(a.buyerRefund)}`}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {a.reason} · lập bởi {a.createdByName} {formatDateTime(a.createdAt)}
                        {a.decidedByName &&
                          ` · ${a.status === 'REJECTED' ? 'không duyệt' : 'duyệt'} bởi ${a.decidedByName}`}
                        {a.executionNote && (
                          <span className="text-red-600"> · {a.executionNote}</span>
                        )}
                      </div>
                    </div>
                    {a.status === 'PENDING' && !mine && !involved && (
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setRejecting(a)}>
                          Không duyệt
                        </Button>
                        <Button size="sm" onClick={() => setReviewing(a)}>
                          Duyệt
                        </Button>
                      </div>
                    )}
                    {a.status === 'PENDING' && (mine || involved) && (
                      <span className="text-xs text-muted-foreground">
                        {mine
                          ? 'Chờ admin tài chính khác duyệt'
                          : 'Bạn là người mua của đơn này nên không được duyệt'}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <Pager
              className="border-t px-5 py-3"
              page={page}
              pageSize={PAGE_SIZE}
              total={list.data.total}
              onChange={(p) =>
                setParams({ ...(status !== 'ALL' ? { status } : {}), page: String(p) })
              }
            />
          </>
        )}
      </div>
      <CreateDialog open={creating} onOpenChange={setCreating} />
      <ConfirmDialog
        open={reviewing !== null}
        onOpenChange={(o) => !o && setReviewing(null)}
        title={`Duyệt điều chỉnh đơn ${reviewing?.shopOrderCode ?? ''}?`}
        description={reviewing?.reason}
        confirmLabel="Duyệt"
        onConfirm={() => decide.mutateAsync({ a: reviewing!, decision: 'APPROVE' })}
      >
        {reviewing && (
          <div className="text-sm">
            <MoneyRow
              label="Cộng/trừ ví seller"
              value={Math.abs(reviewing.sellerChange)}
              minus={reviewing.sellerChange < 0}
            />
            <MoneyRow label="Hoàn thêm cho người mua" value={reviewing.buyerRefund} />
            {reviewing.bankAccount && (
              <p className="mt-1 text-xs text-ink/60">
                Chuyển tới {reviewing.bankAccount.bankName} · {reviewing.bankAccount.accountNumber}{' '}
                · {reviewing.bankAccount.accountName}
              </p>
            )}
          </div>
        )}
      </ConfirmDialog>
      <ReasonDialog
        open={rejecting !== null}
        onOpenChange={(o) => !o && setRejecting(null)}
        title="Không duyệt đề nghị?"
        reasons={['Chưa đủ căn cứ', 'Số tiền chưa đúng']}
        confirmLabel="Không duyệt"
        onSubmit={(reason) => decide.mutateAsync({ a: rejecting!, decision: 'REJECT', reason })}
      />
    </div>
  );
}

/** Lập đề nghị: tra đơn con theo mã (xem tiền ở payment-service) rồi nhập số tiền và lý do */
function CreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [money, setMoney] = useState<ShopOrderMoney | null>(null);
  const [looking, setLooking] = useState(false);
  const [direction, setDirection] = useState<'DEBIT' | 'CREDIT'>('DEBIT');
  const [seller, setSeller] = useState<number | null>(null);
  const [refund, setRefund] = useState<number | null>(null);
  const [bank, setBank] = useState({ bankName: '', accountNumber: '', accountName: '' });
  const [reason, setReason] = useState('');
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const reset = () => {
    setCode('');
    setMoney(null);
    setSeller(null);
    setRefund(null);
    setReason('');
    setBank({ bankName: '', accountNumber: '', accountName: '' });
    setRequestKey(crypto.randomUUID());
  };
  const lookup = async () => {
    setLooking(true);
    try {
      setMoney(
        await api<ShopOrderMoney>(
          `${API.payment}/admin/shop-orders/${encodeURIComponent(code.trim())}/money`,
        ),
      );
    } catch (e) {
      setMoney(null);
      toast.error(
        e instanceof ApiError && e.status === 404
          ? 'Không tìm thấy đơn con.'
          : (e as Error).message,
      );
    } finally {
      setLooking(false);
    }
  };
  const create = useMutation({
    mutationFn: () =>
      api<Adjustment>(`${API.approval}/admin/adjustments`, {
        method: 'POST',
        idempotencyKey: requestKey,
        body: {
          shopOrderCode: money!.shopOrderCode,
          sellerChange: (seller ?? 0) * (direction === 'DEBIT' ? -1 : 1),
          buyerRefund: refund ?? 0,
          ...(refund ? { bankAccount: bank } : {}),
          reason: reason.trim(),
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key });
      toast.success('Đã lập đề nghị, chờ một admin tài chính khác duyệt.');
      reset();
    },
    onError: (e) => toast.error(e.message),
  });
  const valid =
    money &&
    ((seller ?? 0) > 0 || (refund ?? 0) > 0) &&
    reason.trim().length >= 10 &&
    (!refund ||
      (bank.bankName && /^\d{6,20}$/.test(bank.accountNumber) && bank.accountName.trim()));
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      title="Lập đề nghị điều chỉnh"
      description="Đề nghị cần một admin tài chính khác duyệt. Người mua, chủ shop của đơn không được lập hay duyệt."
      confirmLabel="Lập đề nghị"
      onConfirm={() =>
        valid ? create.mutateAsync() : Promise.reject(toast.error('Điền đủ thông tin.'))
      }
    >
      <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1 text-sm">
        <div className="flex gap-2">
          <input
            className={inputClass}
            placeholder="Mã đơn con, ví dụ 261015ABC123-1"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              // Đổi mã thì kết quả tra cứu cũ không còn đúng: bắt tra lại trước khi lập
              setMoney(null);
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={lookup}
            disabled={looking || code.trim().length < 8}
          >
            {looking ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          </Button>
        </div>
        {money && (
          <div className="rounded-lg bg-ivory px-3 py-2 text-xs text-ink/70">
            Đơn {money.shopOrderCode} ({money.paymentMethod === 'COD' ? 'COD' : 'VNPay'}) · người
            mua đã trả {formatMoney(money.buyerPaid)}, đã hoàn {formatMoney(money.refunded)} ·
            seller nhận {formatMoney(money.sellerReceives)} · ví khả dụng{' '}
            {formatMoney(money.wallet.available)}
          </div>
        )}
        <div>
          <div className="mb-1 flex gap-2">
            {(
              [
                ['DEBIT', 'Trừ ví seller'],
                ['CREDIT', 'Cộng ví seller'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setDirection(v)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs',
                  direction === v ? 'border-navy bg-navy text-white' : 'border-ivory-200',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <NumberInput
            value={seller}
            onChange={setSeller}
            suffix="đ"
            aria-label="Cộng trừ ví seller"
            placeholder="0 = không đổi ví"
          />
        </div>
        <div>
          <div className="mb-1 text-ink/70">Hoàn thêm cho người mua (chuyển khoản tay)</div>
          <NumberInput
            value={refund}
            onChange={setRefund}
            suffix="đ"
            aria-label="Hoàn thêm"
            placeholder="0 = không hoàn"
          />
        </div>
        {!!refund && (
          <div className="grid gap-2 sm:grid-cols-3">
            <select
              className={inputClass}
              value={bank.bankName}
              onChange={(e) => setBank((b) => ({ ...b, bankName: e.target.value }))}
              aria-label="Ngân hàng"
            >
              <option value="">Ngân hàng</option>
              {BANKS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <DigitsInput
              placeholder="Số tài khoản"
              value={bank.accountNumber}
              onChange={(e) => setBank((b) => ({ ...b, accountNumber: e.target.value }))}
            />
            <input
              className={cn(inputClass, 'uppercase')}
              placeholder="Tên chủ tài khoản"
              value={bank.accountName}
              onChange={(e) => setBank((b) => ({ ...b, accountName: e.target.value }))}
            />
          </div>
        )}
        <StatementBox
          value={reason}
          onChange={setReason}
          min={10}
          max={500}
          placeholder="Lý do, căn cứ điều chỉnh"
        />
      </div>
    </ConfirmDialog>
  );
}
