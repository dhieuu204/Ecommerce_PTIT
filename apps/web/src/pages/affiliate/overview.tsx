import {
  IconClick,
  IconCoin,
  IconCopy,
  IconPackage,
  IconShoppingBag,
  IconWallet,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { copyText } from '@/components/affiliate/affiliate-link-button';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { CHART_COLORS, DailyChart, type ChartSeries } from '@/components/reports/daily-chart';
import {
  RangePicker,
  ReportSection,
  ReportSkeleton,
  StatTile,
} from '@/components/reports/report-parts';
import { formatCount } from '@/components/reports/report-format';
import { useReportParams } from '@/components/reports/use-report-params';
import { useMyAffiliate } from '@/hooks/use-my-affiliate';
import type { AffiliateStats } from '@/lib/affiliate-types';
import { API, api } from '@/lib/api';
import type { Wallet } from '@/lib/finance-types';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CARD } from '@/pages/checkout/checkout-parts';

export const AFFILIATE_WALLET_KEY = ['affiliate', 'wallet'] as const;

const SERIES: Array<ChartSeries<'commission' | 'clicks'>> = [
  { key: 'commission', label: 'Hoa hồng', kind: 'bar', color: CHART_COLORS.navy, unit: 'money' },
  {
    key: 'clicks',
    label: 'Lượt bấm',
    kind: 'line',
    color: CHART_COLORS.champagne,
    unit: 'count',
    axis: 'right',
  },
];

/** Khu Cộng tác viên › Tổng quan (P7, AFF-06): mã CTV, số dư, lượt bấm, đơn, hoa hồng theo ngày */
export function AffiliateOverviewPage() {
  const me = useMyAffiliate();
  const r = useReportParams(['all'] as const);
  const stats = useQuery({
    queryKey: ['affiliate', 'stats', r.from, r.to],
    queryFn: () =>
      api<AffiliateStats>(`${API.market}/affiliates/me/stats`, {
        query: { from: r.from, to: r.to },
      }),
    enabled: !r.rangeError,
  });
  const wallet = useQuery({
    queryKey: [...AFFILIATE_WALLET_KEY, 'balance'],
    queryFn: () => api<Wallet>(`${API.payment}/affiliates/me/wallet`),
  });
  const code = me.data?.affiliate?.code;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader crumbs={[{ label: 'Tổng quan' }]} title="Hiệu quả tiếp thị" />

      <div className="mb-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className={cn(CARD, 'flex flex-col justify-between p-5')}>
          <div className="text-sm text-ink/60">Mã cộng tác viên</div>
          <div className="mt-1 flex items-center gap-3">
            <span className="font-mono text-2xl font-bold tracking-[0.2em] text-charcoal">
              {code ?? '—'}
            </span>
            {code && (
              <button
                type="button"
                aria-label="Sao chép mã"
                onClick={async () => (await copyText(code)) && toast.success('Đã sao chép mã.')}
                className="flex size-9 items-center justify-center rounded-full text-ink/55 transition hover:bg-champagne-50 hover:text-navy"
              >
                <IconCopy className="size-[1.125rem]" />
              </button>
            )}
          </div>
          <p className="mt-3 text-xs text-ink/55">
            Mã nằm sẵn trong mọi link bạn lấy ở trang{' '}
            <Link
              to="/cong-tac-vien/san-pham"
              className="text-navy underline-offset-2 hover:underline"
            >
              Sản phẩm có hoa hồng
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-col justify-between rounded-2xl bg-gradient-to-br from-header-from to-header-to p-5 text-white">
          <div className="flex items-center gap-2 text-sm text-white/85">
            <IconWallet className="size-[1.125rem] [stroke-width:1.75]" /> Hoa hồng khả dụng
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight tabular-nums">
            {wallet.data ? formatMoney(wallet.data.available) : '—'}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-white/85">
            <span>Đang giữ {wallet.data ? formatMoney(wallet.data.pending) : '—'}</span>
            <Link
              to="/cong-tac-vien/vi"
              className="inline-flex h-9 items-center rounded-lg bg-card px-4 text-sm font-bold text-navy transition hover:bg-champagne-50"
            >
              Ví và rút tiền
            </Link>
          </div>
        </div>
      </div>

      <RangePicker
        from={r.from}
        to={r.to}
        today={r.today}
        preset={r.preset}
        error={r.rangeError}
        onPreset={r.setPreset}
        onRange={r.setRange}
      />

      {stats.isPending ? (
        <ReportSkeleton tiles={3} />
      ) : stats.isError ? (
        <LoadError className={CARD} message={stats.error.message} onRetry={() => stats.refetch()} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatTile
              icon={IconCoin}
              label="Hoa hồng dự kiến"
              value={formatMoney(stats.data.commission)}
              hint="Của đơn chưa hủy, chưa trừ phần trả hàng"
              className="col-span-2 lg:col-span-1"
            />
            <StatTile
              icon={IconClick}
              label="Lượt bấm link"
              value={formatCount(stats.data.clicks)}
            />
            <StatTile
              icon={IconShoppingBag}
              label="Đơn qua link"
              value={formatCount(stats.data.orders)}
              hint={
                stats.data.clicks > 0
                  ? `Tỉ lệ ra đơn ${((stats.data.orders / stats.data.clicks) * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`
                  : undefined
              }
            />
          </div>
          <ReportSection
            title="Theo ngày"
            description="Hoa hồng tính theo ngày đặt đơn, giờ Việt Nam."
          >
            <DailyChart
              data={stats.data.daily}
              series={SERIES}
              emptyText="Chưa có lượt bấm hay đơn nào trong khoảng ngày này."
            />
          </ReportSection>
          <ReportSection title="Sản phẩm mang về nhiều hoa hồng nhất" bodyClassName="p-0">
            {stats.data.topProducts.length === 0 ? (
              <EmptyState
                icon={IconPackage}
                title="Chưa có sản phẩm nào"
                text="Sản phẩm bán được qua link của bạn sẽ hiện ở đây."
              />
            ) : (
              <ol className="divide-y divide-ink/[0.06]">
                {stats.data.topProducts.map((p, i) => (
                  <li key={p.productId} className="flex items-center gap-3 px-4 py-3 md:px-5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-champagne-50 text-xs font-bold text-navy">
                      {i + 1}
                    </span>
                    <Link
                      to={`/san-pham/${p.productId}`}
                      className="min-w-0 flex-1 truncate text-sm font-medium text-charcoal hover:text-navy"
                    >
                      {p.name}
                    </Link>
                    <span className="hidden shrink-0 text-xs text-ink/55 sm:inline">
                      {p.quantity} sản phẩm
                    </span>
                    <span className="shrink-0 text-right sm:w-28 text-sm font-semibold text-navy tabular-nums">
                      {formatMoney(p.commission)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </ReportSection>
        </div>
      )}
    </div>
  );
}
