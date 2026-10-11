import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Banknote,
  CircleDollarSign,
  Hourglass,
  Lock,
  ReceiptText,
  ShieldCheck,
  Wallet as WalletIcon,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { Pager } from '@/components/console/pager';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { API, api } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/format';
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
};

const TX_TYPE: Record<WalletTxType, { label: string; icon: typeof ArrowDownLeft }> = {
  HELD: { label: 'Tiền đơn hàng vào ví', icon: ArrowDownLeft },
  RELEASED: { label: 'Chuyển sang khả dụng', icon: ArrowRightLeft },
  REVERSED: { label: 'Trừ lại', icon: ArrowUpRight },
  COMPENSATION: { label: 'Đền hàng thất lạc / hư hỏng', icon: ShieldCheck },
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
  { value: 'CANCELLED', label: 'Đã hủy' },
];

/**
 * Kênh người bán › Tài chính (FIN-01, FIN-02): số dư ví 3 ngăn, tiền từng đơn kèm lý do chưa khả dụng,
 * lịch sử biến động. Rút tiền có ở giai đoạn sau nên chưa có nút.
 */
export function SellerFinancePage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'lich-su' ? 'HISTORY' : 'EARNINGS';
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
      <PageHeader
        crumbs={[{ label: 'Tài chính' }]}
        title="Tài chính"
        description="Tiền của shop sau phí sàn. Tiền vào ngăn Đang giữ, sang Khả dụng khi đơn hoàn tất và sàn đã nhận được tiền."
      />

      {wallet.isPending ? (
        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
        </div>
      ) : wallet.isError ? (
        <LoadError
          className="mb-6 rounded-2xl border bg-card"
          message={wallet.error.message}
          onRetry={() => wallet.refetch()}
        />
      ) : (
        <Balances wallet={wallet.data} />
      )}

      <FlowSteps />

      <div className="rounded-2xl border bg-card shadow-sm shadow-navy/[0.03]">
        <nav className="flex gap-1 overflow-x-auto border-b px-4 pt-2 md:px-5" aria-label="Mục">
          {(
            [
              ['EARNINGS', 'Tiền theo đơn'],
              ['HISTORY', 'Lịch sử ví'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => update({ tab: value === 'HISTORY' ? 'lich-su' : null, status: null })}
              className={cn(
                '-mb-px shrink-0 border-b-2 px-3 py-3 text-sm whitespace-nowrap transition',
                tab === value
                  ? 'border-navy font-semibold text-navy'
                  : 'border-transparent text-muted-foreground hover:text-ink',
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
        ) : (
          <HistoryList page={page} onPage={(p) => update({ page: String(p) })} />
        )}
      </div>
    </div>
  );
}

function Balances({ wallet: w }: { wallet: Wallet }) {
  return (
    <div className={cn('mb-6 grid gap-4', w.locked > 0 ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
      <div className="relative overflow-hidden rounded-2xl bg-navy p-5 text-white shadow-lg shadow-navy/20">
        <div
          className="absolute -top-10 -right-10 size-36 rounded-full bg-champagne/15"
          aria-hidden
        />
        <div className="relative flex items-center gap-2 text-sm text-white/75">
          <WalletIcon className="size-4 text-champagne" /> Khả dụng
        </div>
        <div className="relative mt-2 text-3xl font-bold tabular-nums text-champagne">
          {formatMoney(w.available)}
        </div>
        <p className="relative mt-2 text-xs text-white/65">
          Đơn đã hoàn tất và sàn đã nhận được tiền.
        </p>
      </div>
      <div className="rounded-2xl border border-champagne/50 bg-card p-5">
        <div className="flex items-center gap-2 text-sm text-ink/65">
          <Hourglass className="size-4 text-champagne-600" /> Đang giữ
        </div>
        <div className="mt-2 text-3xl font-bold tabular-nums text-navy">
          {formatMoney(w.pending)}
        </div>
        <dl className="mt-2 space-y-0.5 text-xs text-ink/60">
          <div className="flex justify-between gap-3">
            <dt>Chờ đơn hoàn tất</dt>
            <dd className="tabular-nums">{formatMoney(w.pendingWaitingCompletion)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Chờ đối soát tiền COD với GHN</dt>
            <dd className="tabular-nums">{formatMoney(w.pendingWaitingCod)}</dd>
          </div>
        </dl>
      </div>
      {w.locked > 0 && (
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2 text-sm text-ink/65">
            <Lock className="size-4 text-ink/45" /> Đang khóa
          </div>
          <div className="mt-2 text-3xl font-bold tabular-nums text-ink">
            {formatMoney(w.locked)}
          </div>
        </div>
      )}
    </div>
  );
}

/** Ba bước tiền đi: dễ hiểu cho seller mới */
function FlowSteps() {
  const steps = [
    {
      icon: Banknote,
      title: 'Có tiền',
      text: 'Trả trước: người mua đã thanh toán. COD: GHN đã giao hàng.',
    },
    {
      icon: Hourglass,
      title: 'Đang giữ',
      text: 'Chờ đơn hoàn tất: người mua bấm Đã nhận hàng, hoặc hết hạn thì tự hoàn tất.',
    },
    {
      icon: CircleDollarSign,
      title: 'Khả dụng',
      text: 'Đơn hoàn tất và tiền đã về sàn (COD: sau khi đối soát với GHN).',
    },
  ];
  return (
    <ol className="mb-6 grid gap-2 rounded-2xl border border-ivory-200 bg-ivory/50 p-3 sm:grid-cols-3">
      {steps.map((s, i) => (
        <li key={s.title} className="flex gap-3 rounded-xl bg-card px-3 py-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-champagne-50 text-champagne-600">
            <s.icon className="size-4" />
          </span>
          <div className="min-w-0 text-xs">
            <div className="text-sm font-semibold text-navy">
              {i + 1}. {s.title}
            </div>
            <div className="text-ink/60">{s.text}</div>
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
      <div className="flex flex-wrap gap-2 border-b px-4 py-3 md:px-5" role="radiogroup">
        {EARNING_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={status === f.value}
            onClick={() => onStatus(f.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition',
              status === f.value
                ? 'border-navy bg-navy text-white'
                : 'border-ivory-200 bg-card text-ink/70 hover:border-champagne',
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
          icon={ReceiptText}
          title="Chưa có khoản tiền nào"
          text="Tiền của mỗi đơn hiện ở đây khi người mua đặt hàng."
        />
      ) : (
        <>
          <div className="hidden grid-cols-[minmax(0,1fr)_8rem_7rem_8rem_11rem] gap-4 border-b bg-ivory/40 px-5 py-2.5 text-xs font-medium text-muted-foreground lg:grid">
            <span>Đơn</span>
            <span className="text-right">Tiền hàng</span>
            <span className="text-right">Phí sàn</span>
            <span className="text-right">Shop nhận</span>
            <span>Trạng thái</span>
          </div>
          <div className="divide-y">
            {list.data.items.map((e) => (
              <EarningRow key={e.shopOrderId} e={e} />
            ))}
          </div>
          <Pager
            className="border-t px-5 py-3"
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
          className="font-semibold text-navy hover:underline"
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
        value={`−${formatMoney(e.platformFee)}`}
        className="text-ink/60"
      />
      <Cell
        label="Shop nhận"
        value={formatMoney(e.sellerAmount)}
        className="font-semibold text-navy"
      />
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
        icon={WalletIcon}
        title="Ví chưa có biến động"
        text="Mỗi lần tiền vào, chuyển ngăn hay bị trừ lại đều ghi một dòng ở đây."
      />
    );
  }
  return (
    <>
      <ul className="divide-y">
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
                    ? 'bg-red-50 text-red-600'
                    : into
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-champagne-50 text-champagne-600',
                )}
              >
                <type.icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-medium text-ink">{type.label}</div>
                <div className="text-xs text-muted-foreground">
                  {t.fromBucket ? BUCKET[t.fromBucket] : 'Ngoài ví'} →{' '}
                  {t.toBucket ? BUCKET[t.toBucket] : 'Ra khỏi ví'}
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
                  out ? 'text-red-600' : into ? 'text-emerald-700' : 'text-navy',
                )}
              >
                {out ? '−' : into ? '+' : ''}
                {formatMoney(t.amount)}
              </div>
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
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y">
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
