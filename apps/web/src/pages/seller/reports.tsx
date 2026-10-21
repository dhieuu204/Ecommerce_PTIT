import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChartNoAxesCombined, Wallet } from 'lucide-react';
import { LoadError } from '@/components/console/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { SellerFinanceView } from '@/components/reports/finance-view';
import { OperationsView } from '@/components/reports/operations-view';
import { RangePicker, ReportSkeleton, ReportTabs } from '@/components/reports/report-parts';
import { useReportParams } from '@/components/reports/use-report-params';
import { API, api } from '@/lib/api';
import type { SellerFinanceReport, ShopOperationsReport } from '@/lib/report-types';

const TABS = ['van-hanh', 'tai-chinh'] as const;
type Tab = (typeof TABS)[number];

/** Kênh người bán › Báo cáo (RPT-01 vận hành, RPT-02 tài chính) của shop mình */
export function SellerReportsPage() {
  const r = useReportParams<Tab>(TABS);
  const range = { from: r.from, to: r.to };

  const operations = useQuery({
    queryKey: ['seller', 'reports', 'operations', range],
    queryFn: () =>
      api<ShopOperationsReport>(`${API.market}/shops/me/reports/operations`, { query: range }),
    enabled: r.tab === 'van-hanh' && !r.rangeError,
    placeholderData: keepPreviousData,
  });
  const finance = useQuery({
    queryKey: ['seller', 'reports', 'finance', range],
    queryFn: () =>
      api<SellerFinanceReport>(`${API.payment}/shops/me/reports/finance`, { query: range }),
    enabled: r.tab === 'tai-chinh' && !r.rangeError,
    placeholderData: keepPreviousData,
  });
  const q = r.tab === 'van-hanh' ? operations : finance;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ label: 'Báo cáo' }]}
        title="Báo cáo"
        description="Số liệu bán hàng và tiền của shop theo khoảng ngày, giờ Việt Nam."
      />
      <ReportTabs
        tabs={[
          { value: 'van-hanh', label: 'Vận hành', icon: ChartNoAxesCombined },
          { value: 'tai-chinh', label: 'Tài chính', icon: Wallet },
        ]}
        value={r.tab}
        onChange={r.setTab}
      />
      <RangePicker
        from={r.from}
        to={r.to}
        today={r.today}
        preset={r.preset}
        error={r.rangeError}
        onPreset={r.setPreset}
        onRange={r.setRange}
      />
      {r.rangeError ? null : q.isPending ? (
        <ReportSkeleton tiles={r.tab === 'van-hanh' ? 4 : 6} />
      ) : q.isError ? (
        <LoadError
          className="rounded-2xl border bg-card"
          message={q.error.message}
          onRetry={() => q.refetch()}
        />
      ) : (
        <div
          className={q.isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity'}
        >
          {r.tab === 'van-hanh' && operations.data ? (
            <OperationsView
              data={operations.data}
              productLink={(p) => `/kenh-nguoi-ban/san-pham/${p.productId}`}
            />
          ) : finance.data ? (
            <SellerFinanceView data={finance.data} />
          ) : null}
        </div>
      )}
    </div>
  );
}
