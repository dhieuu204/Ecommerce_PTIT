import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ExternalLink, Flag, MessageSquareText } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { Pager } from '@/components/console/pager';
import { MY_REPORTS_KEY } from '@/components/moderation/report-button';
import {
  REPORT_REASONS,
  REPORT_TARGET_LABEL,
  ReportStatusBadge,
  TargetThumb,
} from '@/components/moderation/report-parts';
import { EvidenceGallery } from '@/components/returns/return-parts';
import { Skeleton } from '@/components/ui/skeleton';
import { API, api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Report } from '@/lib/moderation-types';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 10;

/**
 * Tài khoản › Báo cáo vi phạm (MOD-01): các báo cáo sản phẩm/shop của tôi, mới nhất trước, kèm kết quả
 * và ghi chú của sàn khi đã xử lý (approval không gửi thông báo nên người báo cáo xem ở đây).
 */
export function MyViolationReportsPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const list = useQuery({
    queryKey: [...MY_REPORTS_KEY, page],
    queryFn: () =>
      api<Page<Report>>(`${API.approval}/me/reports`, { query: { page, pageSize: PAGE_SIZE } }),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-ivory-200 bg-card px-4 py-4 md:px-5">
        <h1 className="text-lg font-semibold text-navy">Báo cáo vi phạm</h1>
        <p className="mt-1 text-sm text-ink/60">
          Báo cáo sản phẩm hoặc shop bằng nút <Flag className="inline size-3.5 align-[-2px]" /> Báo
          cáo trên trang của họ. Bộ phận kiểm duyệt xử lý xong, kết quả hiện ở đây.
        </p>
      </div>

      {list.isPending ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : list.isError ? (
        <LoadError
          className="rounded-2xl border bg-card"
          message={list.error.message}
          onRetry={() => list.refetch()}
        />
      ) : list.data.items.length === 0 ? (
        <EmptyState
          className="rounded-2xl border bg-card"
          icon={Flag}
          title="Bạn chưa gửi báo cáo nào"
          text="Thấy hàng giả, lừa đảo hay thông tin sai sự thật? Hãy báo cho sàn để được xem xét."
        />
      ) : (
        <div className={cn('space-y-3 transition-opacity', list.isFetching && 'opacity-70')}>
          {list.data.items.map((r) => (
            <ReportCard key={r.id} report={r} />
          ))}
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            total={list.data.total}
            onChange={(p) => setParams({ page: String(p) })}
          />
        </div>
      )}
    </div>
  );
}

function ReportCard({ report: r }: { report: Report }) {
  const link = r.targetType === 'SHOP' ? `/shop/${r.targetId}` : `/san-pham/${r.targetId}`;
  return (
    <article className="rounded-2xl border border-ivory-200 bg-card px-4 py-4 md:px-5">
      <div className="flex gap-3">
        <TargetThumb type={r.targetType} image={r.targetImage} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs text-ink/50">{REPORT_TARGET_LABEL[r.targetType]}</div>
              <Link
                to={link}
                className="line-clamp-2 font-semibold text-navy hover:underline"
                title="Mở trang trên sàn"
              >
                {r.targetName}
                <ExternalLink className="ml-1 inline size-3 align-[-1px] text-ink/35" />
              </Link>
            </div>
            <ReportStatusBadge status={r.status} />
          </div>
          <div className="mt-1 text-xs text-ink/55">
            {REPORT_REASONS[r.reason].label} · gửi {formatDateTime(r.createdAt)}
          </div>
        </div>
      </div>
      <p className="mt-3 text-sm break-words whitespace-pre-line text-ink/75">{r.note}</p>
      {r.images.length > 0 && (
        <div className="mt-2">
          <EvidenceGallery keys={r.images} />
        </div>
      )}
      {r.status !== 'PENDING' && (
        <div
          className={cn(
            'mt-3 flex gap-2 rounded-xl px-3 py-2.5 text-sm',
            r.status === 'RESOLVED' ? 'bg-emerald-50 text-emerald-900' : 'bg-ivory text-ink/75',
          )}
        >
          <MessageSquareText className="mt-0.5 size-4 shrink-0 opacity-60" />
          <div className="min-w-0">
            <div className="font-medium">
              {r.status === 'RESOLVED'
                ? 'Sàn đã xử lý vi phạm theo báo cáo của bạn'
                : 'Sàn xem xét và chưa thấy vi phạm'}
            </div>
            {r.adminNote && <p className="mt-0.5 break-words">{r.adminNote}</p>}
            <div className="mt-0.5 text-xs opacity-70">{formatDateTime(r.handledAt)}</div>
          </div>
        </div>
      )}
    </article>
  );
}
