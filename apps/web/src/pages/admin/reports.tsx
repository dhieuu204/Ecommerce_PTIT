import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChartNoAxesCombined, Wallet } from 'lucide-react';
import { LoadError } from '@/components/console/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { AdminFinanceView } from '@/components/reports/finance-view';
import { OperationsView } from '@/components/reports/operations-view';
import { RangePicker, ReportSkeleton, ReportTabs } from '@/components/reports/report-parts';
import { useReportParams } from '@/components/reports/use-report-params';
import { API, api } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import type { AdminFinanceReport, AdminOperationsReport } from '@/lib/report-types';

type Tab = 'van-hanh' | 'tai-chinh';

/**
 * Quản trị › Báo cáo của cả sàn: vận hành (bộ quyền Hệ thống hoặc Tài chính), tài chính (chỉ Tài chính:
 * tab ẩn với admin không có bộ này). Máy chủ vẫn tự kiểm quyền.
 */
export function AdminReportsPage() {
  const perms = useCurrentUser()?.permissions ?? [];
  const canFinance = perms.includes('FINANCE');
  const canModerate = perms.includes('MODERATION');
  const tabs: Tab[] = canFinance ? ['van-hanh', 'tai-chinh'] : ['van-hanh'];
  const r = useReportParams<Tab>(tabs);
  const range = { from: r.from, to: r.to };

  const operations = useQuery({
    queryKey: ['admin', 'reports', 'operations', range],
    queryFn: () =>
      api<AdminOperationsReport>(`${API.market}/admin/reports/operations`, { query: range }),
    enabled: r.tab === 'van-hanh' && !r.rangeError,
    placeholderData: keepPreviousData,
  });
  const finance = useQuery({
    queryKey: ['admin', 'reports', 'finance', range],
    queryFn: () =>
      api<AdminFinanceReport>(`${API.payment}/admin/reports/finance`, { query: range }),
    enabled: r.tab === 'tai-chinh' && canFinance && !r.rangeError,
    placeholderData: keepPreviousData,
  });
  const q = r.tab === 'van-hanh' ? operations : finance;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ label: 'Báo cáo' }]}
        title="Báo cáo của sàn"
        description="Vận hành và tài chính của toàn sàn theo khoảng ngày, giờ Việt Nam."
      />
      <ReportTabs
        tabs={[
          { value: 'van-hanh' as const, label: 'Vận hành', icon: ChartNoAxesCombined },
          ...(canFinance
            ? [{ value: 'tai-chinh' as const, label: 'Tài chính', icon: Wallet }]
            : []),
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
        <ReportSkeleton tiles={r.tab === 'van-hanh' ? 4 : 8} />
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
              admin
              data={operations.data}
              shopLink={canModerate ? (s) => `/quan-tri/shop/${s.shopId}` : undefined}
            />
          ) : finance.data ? (
            <AdminFinanceView data={finance.data} />
          ) : null}
        </div>
      )}
    </div>
  );
}
