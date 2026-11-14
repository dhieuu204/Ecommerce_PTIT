import { IconReceipt } from '@tabler/icons-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { Pager } from '@/components/console/pager';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useMyAffiliate } from '@/hooks/use-my-affiliate';
import type { Commission } from '@/lib/affiliate-types';
import { API, api } from '@/lib/api';
import type { Wallet } from '@/lib/finance-types';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CARD } from '@/pages/checkout/checkout-parts';
import {
  Balances,
  EARNING_STATUS,
  HistoryList,
  ListSkeleton,
  WithdrawalsList,
  WithdrawDialog,
  type Payee,
  type WalletScope,
} from '@/pages/seller/finance';
import { AFFILIATE_WALLET_KEY } from './overview';

const PAGE_SIZE = 20;

const SCOPE: WalletScope = {
  base: `${API.payment}/affiliates/me`,
  queryKey: AFFILIATE_WALLET_KEY,
  orderHref: null,
  who: 'bạn',
};

type Tab = 'COMMISSIONS' | 'HISTORY' | 'WITHDRAWALS';
const TAB_PARAM: Record<Tab, string | null> = {
  COMMISSIONS: null,
  HISTORY: 'lich-su',
  WITHDRAWALS: 'rut-tien',
};

/**
 * Khu Cộng tác viên › Ví và rút tiền (P7, AFF-05): cùng giao diện ví 3 ngăn của shop. Hoa hồng đi cùng
 * nhịp tiền của shop: đang giữ khi đơn có tiền, khả dụng khi đơn hoàn tất.
 */
export function AffiliateWalletPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab =
    params.get('tab') === 'lich-su'
      ? 'HISTORY'
      : params.get('tab') === 'rut-tien'
        ? 'WITHDRAWALS'
        : 'COMMISSIONS';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [withdrawing, setWithdrawing] = useState(false);
  const me = useMyAffiliate();
  const suspended = me.data?.status === 'SUSPENDED';
  const wallet = useQuery({
    queryKey: [...AFFILIATE_WALLET_KEY, 'balance'],
    queryFn: () => api<Wallet>(`${API.payment}/affiliates/me/wallet`),
  });
  const payee: Payee = {
    account: me.data?.affiliate?.bankAccount,
    loading: me.isPending,
    source: 'theo hồ sơ cộng tác viên',
    change: (
      <>
        Đổi tài khoản ở{' '}
        <Link to="/cong-tac-vien/ho-so" className="text-navy underline">
          Hồ sơ cộng tác viên
        </Link>{' '}
        (không cần duyệt lại).
      </>
    ),
  };
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
      <PageHeader crumbs={[{ label: 'Tài chính' }]} title="Ví và rút tiền" />
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
          blockedReason={suspended ? 'Tài khoản đang bị khóa nên chưa rút được' : undefined}
          onWithdraw={() => setWithdrawing(true)}
          onOpenWithdrawals={() => update({ tab: 'rut-tien' })}
        />
      )}

      <div className={cn(CARD, 'overflow-hidden')}>
        <nav
          className="flex gap-1 overflow-x-auto border-b border-ink/[0.06] px-2 [scrollbar-width:none] md:px-3 [&::-webkit-scrollbar]:hidden"
          aria-label="Mục"
        >
          {(
            [
              ['COMMISSIONS', 'Hoa hồng theo đơn'],
              ['HISTORY', 'Lịch sử ví'],
              ['WITHDRAWALS', 'Rút tiền'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => update({ tab: TAB_PARAM[value] })}
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
        {tab === 'COMMISSIONS' ? (
          <CommissionsList page={page} onPage={(p) => update({ page: String(p) })} />
        ) : tab === 'HISTORY' ? (
          <HistoryList scope={SCOPE} page={page} onPage={(p) => update({ page: String(p) })} />
        ) : (
          <WithdrawalsList scope={SCOPE} page={page} onPage={(p) => update({ page: String(p) })} />
        )}
      </div>

      {wallet.data && !suspended && (
        <WithdrawDialog
          scope={SCOPE}
          payee={payee}
          open={withdrawing}
          onOpenChange={setWithdrawing}
          wallet={wallet.data}
          onDone={() => update({ tab: 'rut-tien' })}
        />
      )}
    </div>
  );
}

function CommissionsList({ page, onPage }: { page: number; onPage: (p: number) => void }) {
  const list = useQuery({
    queryKey: [...AFFILIATE_WALLET_KEY, 'commissions', page],
    queryFn: () =>
      api<Page<Commission>>(`${API.payment}/affiliates/me/commissions`, {
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
        icon={IconReceipt}
        title="Chưa có hoa hồng nào"
        text="Hoa hồng của mỗi đơn qua link hiện ở đây khi người mua thanh toán hoặc nhận hàng COD."
      />
    );
  }
  return (
    <>
      <div className="hidden grid-cols-[minmax(0,1fr)_8rem_8rem_12rem] gap-4 border-b border-ink/[0.06] px-5 py-2.5 text-[13px] text-ink/55 lg:grid">
        <span>Đơn</span>
        <span className="text-right">Hoa hồng lúc đặt</span>
        <span className="text-right">Bạn nhận</span>
        <span>Trạng thái</span>
      </div>
      <ul className="divide-y divide-ink/[0.06]">
        {list.data.items.map((c) => {
          const s = EARNING_STATUS[c.status];
          return (
            <li
              key={c.shopOrderId}
              className="grid gap-2 px-4 py-3.5 md:px-5 lg:grid-cols-[minmax(0,1fr)_8rem_8rem_12rem] lg:items-center lg:gap-4"
            >
              <div className="min-w-0 text-sm">
                <div className="font-semibold text-charcoal">{c.shopOrderCode}</div>
                <div className="text-xs text-muted-foreground">{formatDateTime(c.createdAt)}</div>
              </div>
              <div className="flex justify-between text-sm lg:block lg:text-right">
                <span className="text-xs text-muted-foreground lg:hidden">Hoa hồng lúc đặt</span>
                <span className="tabular-nums">{formatMoney(c.commission)}</span>
              </div>
              <div className="flex justify-between text-sm lg:block lg:text-right">
                <span className="text-xs text-muted-foreground lg:hidden">Bạn nhận</span>
                <span className="font-bold text-navy tabular-nums">{formatMoney(c.receives)}</span>
                {c.returnCommissionReversed > 0 && (
                  <span className="block text-xs text-champagne-600">
                    đã trừ trả hàng {formatMoney(c.returnCommissionReversed)}
                  </span>
                )}
              </div>
              <div className="flex flex-col items-start gap-0.5">
                <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                {c.waitingFor && (
                  <span className="text-xs text-muted-foreground">{c.waitingFor}</span>
                )}
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
