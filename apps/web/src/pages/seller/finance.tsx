import {
  IconArrowBackUp,
  IconArrowDownLeft,
  IconArrowUpRight,
  IconArrowsLeftRight,
  IconBuildingBank,
  IconCash,
  IconCashBanknote,
  IconCoin,
  IconHourglass,
  IconLock,
  IconLockOpen,
  IconReceipt,
  IconScale,
  IconShieldCheck,
  IconWallet,
} from '@tabler/icons-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { NumberInput } from '@/components/console/money-input';
import { Pager } from '@/components/console/pager';
import { PageHeader } from '@/components/layout/page-header';
import { ConfirmDialog } from '@/components/orders/order-parts';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMyShop } from '@/hooks/use-my-shop';
import { API, api } from '@/lib/api';
import type { Withdrawal, WithdrawalStatus } from '@/lib/after-sales-types';
import { formatDateTime, formatMoney, maskAccount } from '@/lib/format';
import type {
  Earning,
  EarningStatus,
  Wallet,
  WalletBucket,
  WalletTransaction,
  WalletTxType,
} from '@/lib/finance-types';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CARD } from '@/pages/checkout/checkout-parts';

const PAGE_SIZE = 20;
const walletKey = ['seller', 'wallet'] as const;

type Tone = 'pending' | 'danger' | 'success' | 'neutral' | 'info';

export const EARNING_STATUS: Record<EarningStatus, { label: string; tone: Tone }> = {
  UNPAID: { label: 'Chưa có tiền', tone: 'neutral' },
  HELD: { label: 'Đang giữ', tone: 'pending' },
  AVAILABLE: { label: 'Khả dụng', tone: 'success' },
  EXPIRED: { label: 'Hết hạn thanh toán', tone: 'neutral' },
  CANCELLED: { label: 'Đơn đã hủy', tone: 'neutral' },
  FAILED: { label: 'Giao thất bại', tone: 'danger' },
  COMPENSATED: { label: 'Đã đền sự cố', tone: 'info' },
  REFUNDED: { label: 'Trả hàng, hoàn toàn bộ', tone: 'neutral' },
};

const TX_TYPE: Record<WalletTxType, { label: string; icon: typeof IconArrowDownLeft }> = {
  HELD: { label: 'Tiền đơn hàng vào ví', icon: IconArrowDownLeft },
  RELEASED: { label: 'Chuyển sang khả dụng', icon: IconArrowsLeftRight },
  REVERSED: { label: 'Trừ lại', icon: IconArrowUpRight },
  COMPENSATION: { label: 'Đền hàng thất lạc / hư hỏng', icon: IconShieldCheck },
  RETURN_DEDUCTED: { label: 'Trừ phần hàng trả', icon: IconArrowBackUp },
  LOCKED: { label: 'Khóa tiền cho yêu cầu rút', icon: IconLock },
  UNLOCKED: { label: 'Mở khóa tiền (yêu cầu rút không thực hiện)', icon: IconLockOpen },
  WITHDRAWN: { label: 'Sàn đã chuyển khoản cho shop', icon: IconBuildingBank },
  ADJUSTMENT: { label: 'Điều chỉnh của sàn', icon: IconScale },
};

export const WITHDRAWAL_STATUS: Record<WithdrawalStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Chờ sàn duyệt', tone: 'pending' },
  APPROVED: { label: 'Đã duyệt, chờ chuyển khoản', tone: 'info' },
  PAID: { label: 'Đã chuyển khoản', tone: 'success' },
  REJECTED: { label: 'Bị từ chối', tone: 'danger' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
  FAILED: { label: 'Chuyển khoản lỗi', tone: 'danger' },
};

const BUCKET: Record<WalletBucket, string> = {
  PENDING: 'Đang giữ',
  AVAILABLE: 'Khả dụng',
  LOCKED: 'Đang khóa',
};

const EARNING_FILTERS: Array<{ value: EarningStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'HELD', label: 'Đang giữ' },
  { value: 'AVAILABLE', label: 'Khả dụng' },
  { value: 'UNPAID', label: 'Chưa có tiền' },
  { value: 'FAILED', label: 'Giao thất bại' },
  { value: 'REFUNDED', label: 'Trả hàng' },
  { value: 'CANCELLED', label: 'Đã hủy' },
];

type Tab = 'EARNINGS' | 'HISTORY' | 'WITHDRAWALS';
const TAB_PARAM: Record<Tab, string | null> = {
  EARNINGS: null,
  HISTORY: 'lich-su',
  WITHDRAWALS: 'rut-tien',
};

/**
 * Kênh người bán › Tài chính (FIN-01, FIN-02, FIN-04): số dư ví 3 ngăn, tiền từng đơn kèm lý do chưa khả
 * dụng, lịch sử biến động, rút tiền (khóa tiền, chờ sàn duyệt và chuyển khoản)
 */
export function SellerFinancePage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab =
    params.get('tab') === 'lich-su'
      ? 'HISTORY'
      : params.get('tab') === 'rut-tien'
        ? 'WITHDRAWALS'
        : 'EARNINGS';
  const [withdrawing, setWithdrawing] = useState(false);
  const status = (params.get('status') ?? 'ALL') as EarningStatus | 'ALL';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const wallet = useQuery({
    queryKey: [...walletKey, 'balance'],
    queryFn: () => api<Wallet>(`${API.payment}/shops/me/wallet`),
  });

  const update = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if (!('page' in next)) p.delete('page');
    setParams(p, { replace: true });
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader crumbs={[{ label: 'Tài chính' }]} title="Tài chính" />

      {wallet.isPending ? (
        <div className="mb-4 grid gap-4 md:grid-cols-2">
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
        </div>
      ) : wallet.isError ? (
        <LoadError
          className={cn(CARD, 'mb-4')}
          message={wallet.error.message}
          onRetry={() => wallet.refetch()}
        />
      ) : (
        <Balances
          wallet={wallet.data}
          onWithdraw={() => setWithdrawing(true)}
          onOpenWithdrawals={() => update({ tab: 'rut-tien', status: null })}
        />
      )}

      <FlowSteps />

      <div className={cn(CARD, 'overflow-hidden')}>
        <nav
          className="flex gap-1 overflow-x-auto border-b border-ink/[0.06] px-2 [scrollbar-width:none] md:px-3 [&::-webkit-scrollbar]:hidden"
          aria-label="Mục"
        >
          {(
            [
              ['EARNINGS', 'Tiền theo đơn'],
              ['HISTORY', 'Lịch sử ví'],
              ['WITHDRAWALS', 'Rút tiền'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => update({ tab: TAB_PARAM[value], status: null })}
              className={cn(
                '-mb-px shrink-0 border-b-2 px-3 py-3.5 text-sm whitespace-nowrap transition',
                tab === value
                  ? 'border-navy font-semibold text-navy'
                  : 'border-transparent text-ink/60 hover:text-navy',
              )}
            >
              {label}
            </button>
          ))}
        </nav>
        {tab === 'EARNINGS' ? (
          <EarningsList
            status={status}
            page={page}
            onStatus={(s) => update({ status: s === 'ALL' ? null : s })}
            onPage={(p) => update({ page: String(p) })}
          />
        ) : tab === 'HISTORY' ? (
          <HistoryList page={page} onPage={(p) => update({ page: String(p) })} />
        ) : (
          <WithdrawalsList page={page} onPage={(p) => update({ page: String(p) })} />
        )}
      </div>

      {wallet.data && (
        <WithdrawDialog
          open={withdrawing}
          onOpenChange={setWithdrawing}
          wallet={wallet.data}
          onDone={() => update({ tab: 'rut-tien', status: null })}
        />
      )}
    </div>
  );
}

function Balances({
  wallet: w,
  onWithdraw,
  onOpenWithdrawals,
}: {
  wallet: Wallet;
  onWithdraw: () => void;
  onOpenWithdrawals: () => void;
}) {
  const canWithdraw = !w.openWithdrawal && w.available >= w.withdrawMin;
  return (
    <div className={cn('mb-4 grid gap-4', w.locked > 0 ? 'lg:grid-cols-3' : 'md:grid-cols-2')}>
      <div className="flex flex-col justify-between rounded-2xl bg-gradient-to-br from-header-from to-header-to p-5 text-white">
        <div>
          <div className="flex items-center gap-2 text-sm text-white/85">
            <IconWallet className="size-[1.125rem] [stroke-width:1.75]" /> Số dư khả dụng
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight tabular-nums">
            {formatMoney(w.available)}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
          {w.openWithdrawal ? (
            <button
              type="button"
              onClick={onOpenWithdrawals}
              className="text-left text-sm font-medium text-white underline-offset-2 hover:underline"
            >
              Đang có yêu cầu rút {formatMoney(w.openWithdrawal.amount)} (
              {WITHDRAWAL_STATUS[w.openWithdrawal.status].label.toLowerCase()})
            </button>
          ) : (
            <button
              type="button"
              onClick={onWithdraw}
              disabled={!canWithdraw}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-card px-5 text-sm font-bold text-navy transition hover:bg-champagne-50 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              <IconCashBanknote className="size-[1.125rem] [stroke-width:1.75]" /> Rút tiền
            </button>
          )}
          {!w.openWithdrawal && !canWithdraw && (
            <span className="text-xs text-white/85">
              Rút tối thiểu {formatMoney(w.withdrawMin)} mỗi lần
            </span>
          )}
        </div>
      </div>
      <div className={cn(CARD, 'p-5')}>
        <div className="flex items-center gap-2 text-sm text-ink/60">
          <IconHourglass className="size-[1.125rem] text-navy [stroke-width:1.75]" /> Đang giữ
        </div>
        <div className="mt-2 text-3xl font-bold tracking-tight text-charcoal tabular-nums">
          {formatMoney(w.pending)}
        </div>
        <dl className="mt-3 space-y-1 border-t border-dashed border-ink/15 pt-3 text-xs text-ink/60">
          <div className="flex justify-between gap-3">
            <dt>Chờ đơn hoàn tất</dt>
            <dd className="font-medium text-charcoal tabular-nums">
              {formatMoney(w.pendingWaitingCompletion)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Chờ đối soát tiền COD với GHN</dt>
            <dd className="font-medium text-charcoal tabular-nums">
              {formatMoney(w.pendingWaitingCod)}
            </dd>
          </div>
          {w.pendingWaitingReturn > 0 && (
            <div className="flex justify-between gap-3">
              <dt>Chờ xử lý yêu cầu trả hàng</dt>
              <dd className="font-medium text-charcoal tabular-nums">
                {formatMoney(w.pendingWaitingReturn)}
              </dd>
            </div>
          )}
        </dl>
      </div>
      {w.locked > 0 && (
        <div className={cn(CARD, 'p-5')}>
          <div className="flex items-center gap-2 text-sm text-ink/60">
            <IconLock className="size-[1.125rem] text-ink/45 [stroke-width:1.75]" /> Đang khóa
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-charcoal tabular-nums">
            {formatMoney(w.locked)}
          </div>
          <p className="mt-3 border-t border-dashed border-ink/15 pt-3 text-xs text-ink/60">
            Tiền của yêu cầu rút đang chờ sàn xử lý.
          </p>
        </div>
      )}
    </div>
  );
}

/** Bốn chặng của tiền: dễ hiểu cho seller mới */
function FlowSteps() {
  const steps = [
    {
      icon: IconCash,
      title: 'Có tiền',
      text: 'Trả trước: người mua đã thanh toán. COD: GHN đã giao hàng.',
    },
    {
      icon: IconHourglass,
      title: 'Đang giữ',
      text: 'Chờ đơn hoàn tất: người mua bấm Đã nhận hàng, hoặc hết hạn thì tự hoàn tất.',
    },
    {
      icon: IconCoin,
      title: 'Khả dụng',
      text: 'Đơn hoàn tất, không còn yêu cầu trả hàng, tiền đã về sàn (COD: sau đối soát GHN).',
    },
    {
      icon: IconBuildingBank,
      title: 'Rút tiền',
      text: 'Gửi yêu cầu (tiền bị khóa), sàn duyệt rồi chuyển khoản kèm biên lai.',
    },
  ];
  return (
    <ol className={cn(CARD, 'mb-4 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0 lg:py-4')}>
      {steps.map((s, i) => (
        <li
          key={s.title}
          className="flex gap-3 lg:border-l lg:border-ink/[0.06] lg:px-4 lg:first:border-l-0 lg:first:pl-1 lg:last:pr-1"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-champagne-50 text-navy">
            <s.icon className="size-[1.125rem] [stroke-width:1.75]" />
          </span>
          <div className="min-w-0 text-xs">
            <div className="text-sm font-semibold text-charcoal">
              {i + 1}. {s.title}
            </div>
            <div className="mt-0.5 leading-relaxed text-ink/55">{s.text}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function EarningsList({
  status,
  page,
  onStatus,
  onPage,
}: {
  status: EarningStatus | 'ALL';
  page: number;
  onStatus: (s: EarningStatus | 'ALL') => void;
  onPage: (p: number) => void;
}) {
  const list = useQuery({
    queryKey: [...walletKey, 'earnings', status, page],
    queryFn: () =>
      api<Page<Earning>>(`${API.payment}/shops/me/earnings`, {
        query: { status: status === 'ALL' ? undefined : status, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <div
        className="flex flex-wrap gap-2 border-b border-ink/[0.06] px-4 py-3 md:px-5"
        role="radiogroup"
      >
        {EARNING_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={status === f.value}
            onClick={() => onStatus(f.value)}
            className={cn(
              'rounded-lg border px-3 py-1 text-xs transition',
              status === f.value
                ? 'border-navy bg-champagne-50 font-semibold text-navy'
                : 'border-ink/15 bg-card text-ink/70 hover:border-navy/40 hover:text-navy',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      {list.isPending ? (
        <ListSkeleton />
      ) : list.isError ? (
        <LoadError message={list.error.message} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState
          icon={IconReceipt}
          title="Chưa có khoản tiền nào"
          text="Tiền của mỗi đơn hiện ở đây khi người mua đặt hàng."
        />
      ) : (
        <>
          <div className="hidden grid-cols-[minmax(0,1fr)_8rem_7rem_8rem_11rem] gap-4 border-b border-ink/[0.06] px-5 py-2.5 text-[13px] text-ink/55 lg:grid">
            <span>Đơn</span>
            <span className="text-right">Tiền hàng</span>
            <span className="text-right">Phí sàn</span>
            <span className="text-right">Shop nhận</span>
            <span>Trạng thái</span>
          </div>
          <div className="divide-y divide-ink/[0.06]">
            {list.data.items.map((e) => (
              <EarningRow key={e.shopOrderId} e={e} />
            ))}
          </div>
          <Pager
            className="border-t border-ink/[0.06] px-5 py-3"
            page={page}
            pageSize={PAGE_SIZE}
            total={list.data.total}
            onChange={onPage}
          />
        </>
      )}
    </>
  );
}

function EarningRow({ e }: { e: Earning }) {
  const s = EARNING_STATUS[e.status];
  return (
    <div className="grid gap-2 px-4 py-3.5 md:px-5 lg:grid-cols-[minmax(0,1fr)_8rem_7rem_8rem_11rem] lg:items-center lg:gap-4">
      <div className="min-w-0 text-sm">
        <Link
          to={`/kenh-nguoi-ban/don-hang/${e.shopOrderId}`}
          className="font-semibold text-charcoal transition hover:text-navy"
        >
          {e.shopOrderCode}
        </Link>
        <div className="text-xs text-muted-foreground">
          {e.paymentMethod === 'COD' ? 'COD' : 'VNPay'} · {formatDateTime(e.createdAt)}
        </div>
      </div>
      <Cell label="Tiền hàng" value={formatMoney(e.subtotal - e.shopDiscount)} />
      <Cell
        label={`Phí sàn (${e.platformFeeRate / 100}%)`}
        value={`-${formatMoney(e.platformFee)}`}
        className="text-ink/60"
      />
      <div className="flex justify-between text-sm lg:block lg:text-right">
        <span className="text-xs text-muted-foreground lg:hidden">Shop nhận</span>
        <span className="font-bold text-navy tabular-nums">{formatMoney(e.sellerReceives)}</span>
        {e.returnDeduction > 0 && (
          <span className="block text-xs text-champagne-600">
            đã trừ trả hàng {formatMoney(e.returnDeduction)}
          </span>
        )}
      </div>
      <div className="flex flex-col items-start gap-0.5">
        <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
        {e.waitingFor && <span className="text-xs text-muted-foreground">{e.waitingFor}</span>}
        {e.releasedAt && (
          <span className="text-xs text-muted-foreground">{formatDateTime(e.releasedAt)}</span>
        )}
      </div>
    </div>
  );
}

function Cell({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex justify-between text-sm lg:block lg:text-right">
      <span className="text-xs text-muted-foreground lg:hidden">{label}</span>
      <span className={cn('tabular-nums', className)}>{value}</span>
    </div>
  );
}

function HistoryList({ page, onPage }: { page: number; onPage: (p: number) => void }) {
  const list = useQuery({
    queryKey: [...walletKey, 'transactions', page],
    queryFn: () =>
      api<Page<WalletTransaction>>(`${API.payment}/shops/me/wallet/transactions`, {
        query: { page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });
  if (list.isPending) return <ListSkeleton />;
  if (list.isError)
    return <LoadError message={list.error.message} onRetry={() => list.refetch()} />;
  if (list.data.items.length === 0) {
    return (
      <EmptyState
        icon={IconWallet}
        title="Ví chưa có biến động"
        text="Mỗi lần tiền vào, chuyển ngăn hay bị trừ lại đều ghi một dòng ở đây."
      />
    );
  }
  return (
    <>
      <ul className="divide-y divide-ink/[0.06]">
        {list.data.items.map((t) => {
          const type = TX_TYPE[t.type];
          const into = t.toBucket && !t.fromBucket;
          const out = t.fromBucket && !t.toBucket;
          return (
            <li key={t.id} className="flex gap-3 px-4 py-3.5 md:px-5">
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-full',
                  out
                    ? 'bg-red-50 text-red-500'
                    : into
                      ? 'bg-ship/10 text-ship'
                      : 'bg-champagne-50 text-navy',
                )}
              >
                <type.icon className="size-[1.125rem] [stroke-width:1.75]" />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-medium text-charcoal">{type.label}</div>
                <div className="text-xs text-muted-foreground">
                  {t.fromBucket ? BUCKET[t.fromBucket] : 'Ngoài ví'} →{' '}
                  {t.toBucket ? BUCKET[t.toBucket] : 'Ra khỏi ví'}
                  {t.type === 'ADJUSTMENT' && t.note && <> · {t.note}</>}
                  {t.shopOrderCode && (
                    <>
                      {' · '}
                      <Link
                        to={`/kenh-nguoi-ban/don-hang/${t.shopOrderId}`}
                        className="text-navy hover:underline"
                      >
                        {t.shopOrderCode}
                      </Link>
                    </>
                  )}
                </div>
                <div className="text-xs text-ink/45">{formatDateTime(t.createdAt)}</div>
              </div>
              <div
                className={cn(
                  'shrink-0 text-right text-sm font-semibold tabular-nums',
                  out ? 'text-red-500' : into ? 'text-ship' : 'text-charcoal',
                )}
              >
                {out ? '-' : into ? '+' : ''}
                {formatMoney(t.amount)}
              </div>
            </li>
          );
        })}
      </ul>
      <Pager
        className="border-t border-ink/[0.06] px-5 py-3"
        page={page}
        pageSize={PAGE_SIZE}
        total={list.data.total}
        onChange={onPage}
      />
    </>
  );
}

/** Lịch sử yêu cầu rút: trạng thái, tài khoản nhận, mã giao dịch; hủy được khi sàn chưa duyệt */
function WithdrawalsList({ page, onPage }: { page: number; onPage: (p: number) => void }) {
  const qc = useQueryClient();
  const [cancelling, setCancelling] = useState<Withdrawal | null>(null);
  const list = useQuery({
    queryKey: [...walletKey, 'withdrawals', page],
    queryFn: () =>
      api<Page<Withdrawal>>(`${API.payment}/shops/me/withdrawals`, {
        query: { page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });
  const cancel = useMutation({
    mutationFn: (w: Withdrawal) =>
      api<Withdrawal>(`${API.payment}/shops/me/withdrawals/${w.id}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: walletKey });
      toast.success('Đã hủy yêu cầu rút, tiền trở lại ngăn khả dụng.');
    },
    onError: (e) => {
      toast.error(e.message);
      void qc.invalidateQueries({ queryKey: walletKey });
    },
  });
  if (list.isPending) return <ListSkeleton />;
  if (list.isError)
    return <LoadError message={list.error.message} onRetry={() => list.refetch()} />;
  if (list.data.items.length === 0) {
    return (
      <EmptyState
        icon={IconBuildingBank}
        title="Chưa có yêu cầu rút tiền"
        text="Bấm Rút tiền ở ô Khả dụng. Mỗi lúc một yêu cầu, sàn duyệt rồi chuyển khoản."
      />
    );
  }
  return (
    <>
      <ul className="divide-y divide-ink/[0.06]">
        {list.data.items.map((w) => {
          const st = WITHDRAWAL_STATUS[w.status];
          return (
            <li key={w.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 md:px-5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-champagne-50 text-navy">
                <IconBuildingBank className="size-[1.125rem] [stroke-width:1.75]" />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="tabular-nums text-navy">{formatMoney(w.amount)}</b>
                  <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {w.bankAccount.bankName} · {w.bankAccount.accountNumber} ·{' '}
                  {w.bankAccount.accountName} · gửi {formatDateTime(w.createdAt)}
                </div>
                {w.reason && <div className="text-xs text-red-700">Lý do: {w.reason}</div>}
                {w.status === 'PAID' && (
                  <div className="text-xs text-ship">
                    Đã chuyển lúc {formatDateTime(w.paidAt)} · mã giao dịch {w.transferCode}
                  </div>
                )}
              </div>
              {w.canCancel && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCancelling(w)}
                  className="rounded-lg border-ink/15 text-charcoal hover:border-navy/40 hover:bg-transparent hover:text-navy"
                >
                  Hủy yêu cầu
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <Pager
        className="border-t border-ink/[0.06] px-5 py-3"
        page={page}
        pageSize={PAGE_SIZE}
        total={list.data.total}
        onChange={onPage}
      />
      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(o) => !o && setCancelling(null)}
        title="Hủy yêu cầu rút tiền?"
        description={`${formatMoney(cancelling?.amount ?? 0)} được mở khóa, trở lại ngăn khả dụng.`}
        confirmLabel="Hủy yêu cầu"
        onConfirm={() => cancel.mutateAsync(cancelling!)}
      />
    </>
  );
}

/** Rút tiền (FIN-04): số tiền từ mức tối thiểu tới toàn bộ số khả dụng, về tài khoản trong hồ sơ shop */
function WithdrawDialog({
  open,
  onOpenChange,
  wallet,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallet: Wallet;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const shop = useMyShop();
  const [amount, setAmount] = useState<number | null>(wallet.available);
  // Mỗi lần mở hộp một mã chống gửi lặp
  const [key, setKey] = useState(() => crypto.randomUUID());
  const bank = shop.data?.shop?.bankAccount;
  const tooSmall = (amount ?? 0) < wallet.withdrawMin;
  const tooBig = (amount ?? 0) > wallet.available;
  const submit = useMutation({
    mutationFn: () =>
      api<Withdrawal>(`${API.payment}/shops/me/withdrawals`, {
        method: 'POST',
        idempotencyKey: key,
        body: { amount },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: walletKey });
      toast.success('Đã gửi yêu cầu rút tiền, chờ sàn duyệt.');
      onDone();
    },
    onError: (e) => {
      toast.error(e.message);
      void qc.invalidateQueries({ queryKey: walletKey });
    },
  });
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setAmount(wallet.available);
          setKey(crypto.randomUUID());
        }
        onOpenChange(o);
      }}
      title="Rút tiền về tài khoản ngân hàng"
      description="Số tiền được khóa ngay, sàn duyệt rồi chuyển khoản kèm biên lai. Không thu phí rút."
      confirmLabel="Gửi yêu cầu rút"
      onConfirm={() =>
        tooSmall || tooBig || !bank
          ? Promise.reject(toast.error('Số tiền hoặc tài khoản chưa hợp lệ.'))
          : submit.mutateAsync()
      }
    >
      <div className="space-y-3 text-sm">
        <div>
          <div className="mb-1 flex justify-between text-ink/70">
            <span>Số tiền rút</span>
            <button
              type="button"
              className="text-xs text-navy underline-offset-2 hover:underline"
              onClick={() => setAmount(wallet.available)}
            >
              Rút hết {formatMoney(wallet.available)}
            </button>
          </div>
          <NumberInput value={amount} onChange={setAmount} suffix="đ" aria-label="Số tiền rút" />
          <p
            className={cn('mt-1 text-xs', tooSmall || tooBig ? 'text-destructive' : 'text-ink/50')}
          >
            {tooBig
              ? `Vượt số dư khả dụng ${formatMoney(wallet.available)}.`
              : `Tối thiểu ${formatMoney(wallet.withdrawMin)}, tối đa ${formatMoney(wallet.available)}.`}
          </p>
        </div>
        <div className="rounded-lg bg-page px-3 py-2.5 text-xs leading-relaxed text-ink/70">
          <div className="font-medium text-charcoal">Tài khoản nhận (theo hồ sơ shop)</div>
          {bank
            ? `${bank.bankName} · ${maskAccount(bank.accountNumber)} · ${bank.accountName}`
            : shop.isPending
              ? 'Đang tải...'
              : 'Shop chưa có tài khoản ngân hàng.'}
          <div className="mt-0.5">
            Đổi tài khoản ở{' '}
            <Link to="/kenh-nguoi-ban/ho-so-shop" className="text-navy underline">
              Hồ sơ shop
            </Link>{' '}
            (cần sàn duyệt lại).
          </div>
        </div>
      </div>
    </ConfirmDialog>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-ink/[0.06]">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex gap-4 px-5 py-4">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}
