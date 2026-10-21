import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  ChevronRight,
  ExternalLink,
  Flag,
  History,
  Loader2,
  PackageX,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Store,
  UserRound,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { Pager } from '@/components/console/pager';
import { PageHeader } from '@/components/layout/page-header';
import {
  decisionLabel,
  REPORT_REASONS,
  REPORT_TARGET_LABEL,
  ReportStatusBadge,
  TargetThumb,
} from '@/components/moderation/report-parts';
import { EvidenceGallery, StatementBox } from '@/components/returns/return-parts';
import { Card } from '@/components/returns/return-view';
import { StatusBadge } from '@/components/status-badge';
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
import { API, api } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import type {
  AdminReport,
  AdminReportDetail,
  ModerationDecision,
  ReportDecision,
  ReportStatus,
  ReportTarget,
} from '@/lib/moderation-types';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;
const reportsKey = ['admin', 'violation-reports'] as const;
const BASE = '/quan-tri/bao-cao-vi-pham';

const TABS: Array<[ReportStatus, string]> = [
  ['PENDING', 'Chờ xử lý'],
  ['RESOLVED', 'Đã xử lý'],
  ['DISMISSED', 'Đã bác'],
];
const TARGETS: Array<[ReportTarget | 'ALL', string]> = [
  ['ALL', 'Tất cả'],
  ['PRODUCT', 'Sản phẩm'],
  ['SHOP', 'Shop'],
];

/** Quản trị › Báo cáo vi phạm (MOD-01, bộ quyền MODERATION): chờ lâu nhất lên đầu */
export function ViolationReportsPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? 'PENDING') as ReportStatus;
  const target = (params.get('target') ?? 'ALL') as ReportTarget | 'ALL';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const list = useQuery({
    queryKey: [...reportsKey, status, target, page],
    queryFn: () =>
      api<Page<AdminReport>>(`${API.approval}/admin/reports`, {
        query: {
          status,
          targetType: target === 'ALL' ? undefined : target,
          page,
          pageSize: PAGE_SIZE,
        },
      }),
    placeholderData: keepPreviousData,
    refetchInterval: status === 'PENDING' ? 30_000 : false,
  });
  const set = (next: Record<string, string | null>) => {
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
        crumbs={[{ label: 'Kiểm duyệt' }, { label: 'Báo cáo vi phạm' }]}
        title="Báo cáo vi phạm"
        description="Người mua báo cáo sản phẩm hoặc shop. Xử lý một báo cáo thì mọi báo cáo đang chờ của cùng đối tượng được xử lý theo."
      />
      <div className="rounded-2xl border bg-card shadow-sm shadow-navy/[0.03]">
        <div className="flex flex-col gap-2 border-b px-4 pt-2 md:flex-row md:items-end md:justify-between md:px-5">
          <nav className="-mb-px flex gap-1 overflow-x-auto">
            {TABS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => set({ status: value === 'PENDING' ? null : value })}
                className={cn(
                  'shrink-0 border-b-2 px-3 py-3 text-sm whitespace-nowrap transition',
                  status === value
                    ? 'border-navy font-semibold text-navy'
                    : 'border-transparent text-muted-foreground hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="flex gap-1.5 pb-2.5" role="radiogroup" aria-label="Loại đối tượng">
            {TARGETS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={target === value}
                onClick={() => set({ target: value === 'ALL' ? null : value })}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition',
                  target === value
                    ? 'border-navy bg-navy text-white'
                    : 'border-ivory-200 bg-card text-ink/70 hover:border-champagne',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {list.isPending ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : list.isError ? (
          <LoadError message={list.error.message} onRetry={() => list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon={Flag}
            title={status === 'PENDING' ? 'Không có báo cáo chờ xử lý' : 'Chưa có báo cáo nào'}
            text={status === 'PENDING' ? 'Báo cáo mới của người mua sẽ hiện ở đây.' : undefined}
          />
        ) : (
          <>
            <ul className={cn('divide-y transition-opacity', list.isFetching && 'opacity-70')}>
              {list.data.items.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`${BASE}/${r.id}`}
                    className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-ivory/50 md:px-5"
                  >
                    <TargetThumb type={r.targetType} image={r.targetImage} className="size-12" />
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="line-clamp-1 font-semibold text-navy">{r.targetName}</span>
                        <StatusBadge tone="info">{REPORT_TARGET_LABEL[r.targetType]}</StatusBadge>
                        {r.status === 'PENDING' && r.pendingCount > 1 && (
                          <StatusBadge tone="danger">{r.pendingCount} báo cáo đang chờ</StatusBadge>
                        )}
                        {r.status !== 'PENDING' && <ReportStatusBadge status={r.status} />}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {REPORT_REASONS[r.reason].label} · {r.reporter.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.status === 'PENDING'
                          ? `Gửi ${formatDateTime(r.createdAt)}`
                          : `Xử lý bởi ${r.handledByName ?? ''} · ${formatDateTime(r.handledAt)}`}
                      </div>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-ink/35" />
                  </Link>
                </li>
              ))}
            </ul>
            <Pager
              className="border-t px-5 py-3"
              page={page}
              pageSize={PAGE_SIZE}
              total={list.data.total}
              onChange={(p) => set({ page: String(p) })}
            />
          </>
        )}
      </div>
    </div>
  );
}

/** Chi tiết báo cáo: bằng chứng, báo cáo khác của cùng đối tượng, lịch sử xử lý, xử lý / khôi phục */
export function ViolationReportDetailPage() {
  const { reportId = '' } = useParams();
  const me = useCurrentUser();
  const key = [...reportsKey, 'detail', reportId];
  const detail = useQuery({
    queryKey: key,
    queryFn: () => api<AdminReportDetail>(`${API.approval}/admin/reports/${reportId}`),
  });
  const [dialog, setDialog] = useState<'resolve' | 'restore' | null>(null);

  if (detail.isPending) return <Skeleton className="mx-auto h-96 max-w-5xl rounded-2xl" />;
  if (detail.isError) {
    return (
      <LoadError
        className="mx-auto max-w-5xl rounded-2xl border bg-card"
        message={detail.error.message}
        onRetry={() => detail.refetch()}
      />
    );
  }
  const r = detail.data;
  const isOwner = r.ownerId === me?.id;
  const isProduct = r.targetType === 'PRODUCT';

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        crumbs={[
          { label: 'Báo cáo vi phạm', to: BASE },
          { label: REPORT_TARGET_LABEL[r.targetType] },
        ]}
        title={r.targetName}
        description={`${REPORT_TARGET_LABEL[r.targetType]} · ${REPORT_REASONS[r.reason].label} · gửi ${formatDateTime(r.createdAt)}`}
        actions={
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link to={`/quan-tri/shop/${r.shopId}`}>
              <Store /> Xem shop
            </Link>
          </Button>
        }
      />

      {/* Trạng thái hiện tại của đối tượng và việc cần làm */}
      <section className="flex flex-col gap-3 rounded-2xl border border-ivory-200 bg-card px-4 py-4 sm:flex-row sm:items-center md:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <TargetThumb type={r.targetType} image={r.targetImage} />
          <div className="min-w-0 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <ReportStatusBadge status={r.status} />
              {r.removed && <StatusBadge tone="danger">Sản phẩm đang bị gỡ</StatusBadge>}
              {r.suspended && <StatusBadge tone="danger">Shop đang bị đình chỉ</StatusBadge>}
              {r.pendingCount > 0 && (
                <StatusBadge tone="pending">{r.pendingCount} báo cáo đang chờ</StatusBadge>
              )}
            </div>
            {isProduct && !r.removed && (
              <Link
                to={`/san-pham/${r.targetId}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-ink/55 hover:text-navy"
              >
                Xem sản phẩm trên sàn <ExternalLink className="size-3" />
              </Link>
            )}
          </div>
        </div>
        {isOwner ? (
          <p className="text-xs text-ink/60 sm:max-w-64 sm:text-right">
            Bạn là chủ shop của đối tượng này nên không được tự xử lý. Nhờ một admin Kiểm duyệt
            khác.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {isProduct && r.removed && (
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => setDialog('restore')}
              >
                <RotateCcw /> Khôi phục sản phẩm
              </Button>
            )}
            {r.status === 'PENDING' && (
              <Button className="rounded-full px-5" onClick={() => setDialog('resolve')}>
                <ShieldAlert /> Xử lý báo cáo
              </Button>
            )}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <Card title={`Người báo cáo: ${r.reporter.name}`} icon={UserRound}>
            <div className="text-sm font-medium text-ink">{REPORT_REASONS[r.reason].label}</div>
            <p className="mt-1 text-sm break-words whitespace-pre-line text-ink/75">{r.note}</p>
            <div className="mt-2">
              <EvidenceGallery keys={r.images} empty="Không gửi kèm ảnh." />
            </div>
            {r.status !== 'PENDING' && (
              <div className="mt-3 border-t border-ivory-200 pt-3 text-sm">
                <div className="font-medium text-ink">
                  {r.status === 'RESOLVED' ? 'Đã xử lý' : 'Đã bác'} · {r.handledByName} ·{' '}
                  <span className="font-normal text-ink/55">{formatDateTime(r.handledAt)}</span>
                </div>
                {r.adminNote && <p className="mt-0.5 text-ink/70">{r.adminNote}</p>}
              </div>
            )}
          </Card>

          <Card title={`Báo cáo khác về ${isProduct ? 'sản phẩm' : 'shop'} này`} icon={Users}>
            {r.others.length === 0 ? (
              <p className="text-sm text-ink/55">Chưa có báo cáo nào khác.</p>
            ) : (
              <ul className="divide-y divide-ivory-200">
                {r.others.map((o) => (
                  <li key={o.id}>
                    <Link
                      to={`${BASE}/${o.id}`}
                      className="flex items-start gap-3 py-2.5 text-sm transition hover:bg-ivory/50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-ink">{o.reporter.name}</span>
                          <span className="text-xs text-ink/50">
                            {REPORT_REASONS[o.reason].label} · {formatDateTime(o.createdAt)}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-ink/65">{o.note}</p>
                      </div>
                      <ReportStatusBadge status={o.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card title="Lịch sử xử lý" icon={History} className="lg:self-start">
          <DecisionTimeline items={r.history} />
        </Card>
      </div>

      {dialog === 'resolve' && (
        <ResolveDialog report={r} onClose={() => setDialog(null)} queryKey={key} />
      )}
      {dialog === 'restore' && (
        <RestoreDialog report={r} onClose={() => setDialog(null)} queryKey={key} />
      )}
    </div>
  );
}

function DecisionTimeline({ items }: { items: ModerationDecision[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-ink/55">Chưa từng bị gỡ hoặc đình chỉ.</p>;
  }
  return (
    <ol>
      {items.map((h, i) => {
        const bad = h.action !== 'RESTORE';
        return (
          <li key={h.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < items.length - 1 && (
              <span className="absolute top-5 bottom-0 left-[7px] w-px bg-ivory-200" aria-hidden />
            )}
            <span
              className={cn(
                'relative mt-1 size-[15px] shrink-0 rounded-full border-2 bg-card',
                bad ? 'border-red-400' : 'border-emerald-500',
              )}
            />
            <div className="min-w-0 text-sm">
              <div className={cn('font-medium', bad ? 'text-red-700' : 'text-emerald-700')}>
                {decisionLabel(h)}
              </div>
              <div className="text-xs text-ink/50">{h.targetName}</div>
              <p className="break-words text-ink/70">{h.reason}</p>
              <div className="text-xs text-ink/45">
                {formatDateTime(h.createdAt)} · {h.decidedByName}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ResolveDialog({
  report: r,
  onClose,
  queryKey,
}: {
  report: AdminReportDetail;
  onClose: () => void;
  queryKey: readonly unknown[];
}) {
  const qc = useQueryClient();
  const [decision, setDecision] = useState<ReportDecision | null>(null);
  const [reason, setReason] = useState('');
  const resolve = useMutation({
    mutationFn: () =>
      api<AdminReportDetail>(`${API.approval}/admin/reports/${r.id}/resolve`, {
        method: 'POST',
        body: { decision, reason: reason.trim() },
      }),
    onSuccess: (d) => {
      qc.setQueryData(queryKey, d);
      void qc.invalidateQueries({ queryKey: reportsKey });
      toast.success(
        decision === 'DISMISS'
          ? 'Đã bác báo cáo.'
          : decision === 'REMOVE_PRODUCT'
            ? 'Đã xử lý: sản phẩm được gỡ khỏi sàn, seller nhận thông báo kèm lý do.'
            : 'Đã xử lý: shop bị đình chỉ, hàng của shop ẩn khỏi sàn.',
      );
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const others = r.pendingCount > 1 ? ` (và ${r.pendingCount - 1} báo cáo khác đang chờ)` : '';
  const options: Array<{ value: ReportDecision; title: string; text: string; icon: typeof Ban }> = [
    ...(r.targetType === 'PRODUCT'
      ? [
          {
            value: 'REMOVE_PRODUCT' as const,
            title: 'Gỡ sản phẩm',
            icon: PackageX,
            text: r.removed
              ? 'Sản phẩm đã bị gỡ từ trước: chỉ đánh dấu báo cáo đã xử lý.'
              : 'Sản phẩm biến mất khỏi sàn; seller sửa được nhưng không tự bật bán lại.',
          },
        ]
      : []),
    {
      value: 'SUSPEND_SHOP',
      title: 'Đình chỉ shop',
      icon: Ban,
      text: r.suspended
        ? 'Shop đang bị đình chỉ: chỉ đánh dấu báo cáo đã xử lý.'
        : 'Mọi hàng của shop ẩn khỏi sàn, đơn chưa giao bị hủy và hoàn tiền.',
    },
    {
      value: 'DISMISS',
      title: 'Bác báo cáo',
      icon: ShieldCheck,
      text: 'Không thấy vi phạm, không có biện pháp nào.',
    },
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && !resolve.isPending && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-xl">
        <DialogHeader className="text-left">
          <DialogTitle className="text-navy">Xử lý báo cáo</DialogTitle>
          <DialogDescription>
            Áp cho báo cáo này{others}. Lý do được ghi nhật ký; seller đọc khi bị gỡ/đình chỉ, người
            báo cáo đọc ở trang của họ.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2" role="radiogroup" aria-label="Biện pháp">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={decision === o.value}
              onClick={() => setDecision(o.value)}
              className={cn(
                'flex gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition',
                decision === o.value
                  ? 'border-navy bg-navy/[0.04]'
                  : 'border-ivory-200 hover:border-champagne',
              )}
            >
              <o.icon
                className={cn(
                  'mt-0.5 size-4 shrink-0',
                  o.value === 'DISMISS' ? 'text-emerald-600' : 'text-red-600',
                )}
              />
              <span>
                <span className="block font-medium text-navy">{o.title}</span>
                <span className="block text-xs text-ink/60">{o.text}</span>
              </span>
            </button>
          ))}
        </div>
        <div>
          <div className="mb-1 text-sm font-medium text-ink">
            Lý do<span className="text-destructive">*</span>
          </div>
          <StatementBox
            value={reason}
            onChange={setReason}
            min={5}
            max={500}
            placeholder="Ví dụ: ảnh cho thấy tem nhãn giả, shop không chứng minh được nguồn gốc..."
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            className="rounded-full"
            onClick={onClose}
            disabled={resolve.isPending}
          >
            Hủy
          </Button>
          <Button
            className="rounded-full px-6"
            variant={decision && decision !== 'DISMISS' ? 'destructive' : 'default'}
            disabled={!decision || reason.trim().length < 5 || resolve.isPending}
            onClick={() => resolve.mutate()}
          >
            {resolve.isPending && <Loader2 className="size-4 animate-spin" />}
            Xác nhận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RestoreDialog({
  report: r,
  onClose,
  queryKey,
}: {
  report: AdminReportDetail;
  onClose: () => void;
  queryKey: readonly unknown[];
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const restore = useMutation({
    mutationFn: () =>
      api(`${API.approval}/admin/products/${r.targetId}/restore`, {
        method: 'POST',
        body: { reason: reason.trim() },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey });
      void qc.invalidateQueries({ queryKey: reportsKey });
      toast.success('Đã khôi phục: sản phẩm về trạng thái ẩn, seller tự bật bán lại.');
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && !restore.isPending && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle className="text-navy">Khôi phục sản phẩm</DialogTitle>
          <DialogDescription>
            "{r.targetName}" về trạng thái ẩn; seller kiểm tra rồi tự bật bán lại. Seller nhận thông
            báo.
          </DialogDescription>
        </DialogHeader>
        <div>
          <div className="mb-1 text-sm font-medium text-ink">
            Lý do<span className="text-destructive">*</span>
          </div>
          <StatementBox
            value={reason}
            onChange={setReason}
            min={5}
            max={500}
            placeholder="Ví dụ: shop đã gửi hóa đơn nhập hàng chính hãng..."
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            className="rounded-full"
            onClick={onClose}
            disabled={restore.isPending}
          >
            Hủy
          </Button>
          <Button
            className="rounded-full px-6"
            disabled={reason.trim().length < 5 || restore.isPending}
            onClick={() => restore.mutate()}
          >
            {restore.isPending && <Loader2 className="size-4 animate-spin" />}
            Khôi phục
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
