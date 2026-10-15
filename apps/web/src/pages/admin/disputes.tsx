import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Loader2, Scale, Store, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { NumberInput } from '@/components/console/money-input';
import { Pager } from '@/components/console/pager';
import { PageHeader } from '@/components/layout/page-header';
import { MoneyRow } from '@/components/orders/order-parts';
import { EvidenceGallery, RETURN_REASONS, StatementBox } from '@/components/returns/return-parts';
import { Card } from '@/components/returns/return-view';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { API, api } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import type { Dispute } from '@/lib/after-sales-types';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;
const disputesKey = ['admin', 'disputes'] as const;

const STAGE: Record<Dispute['stage'], string> = {
  REQUEST_REJECTED: 'Shop từ chối, người mua khiếu nại',
  GOODS_PROBLEM: 'Shop báo hàng trả về không đúng',
};

const DECISION: Record<NonNullable<Dispute['decision']>, string> = {
  ACCEPT_RETURN: 'Chấp nhận trả hàng',
  REFUND: 'Hoàn tiền',
  REJECT: 'Không hoàn',
};

/** Quản trị › Tranh chấp (DIS-01, bộ quyền SUPPORT): quá hạn phân xử lên đầu */
export function DisputesPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? 'PENDING') as Dispute['status'];
  const page = Math.max(1, Number(params.get('page')) || 1);
  const list = useQuery({
    queryKey: [...disputesKey, status, page],
    queryFn: () =>
      api<Page<Dispute>>(`${API.approval}/admin/disputes`, {
        query: { status, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
    refetchInterval: status === 'PENDING' ? 30_000 : false,
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ label: 'Hỗ trợ' }, { label: 'Tranh chấp' }]}
        title="Tranh chấp trả hàng"
        description="Xem lời và ảnh của hai bên rồi quyết. Hạn phân xử chỉ để nhắc: không bao giờ tự quyết, tiền của shop được giữ tới khi có quyết định."
      />
      <div className="rounded-2xl border bg-card shadow-sm shadow-navy/[0.03]">
        <nav className="-mb-px flex gap-1 overflow-x-auto border-b px-4 pt-2 md:px-5">
          {(
            [
              ['PENDING', 'Chờ phân xử'],
              ['RESOLVED', 'Đã phân xử'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() =>
                setParams(value === 'PENDING' ? {} : { status: value }, { replace: true })
              }
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
        {list.isPending ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : list.isError ? (
          <LoadError message={list.error.message} onRetry={() => list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon={Scale}
            title={
              status === 'PENDING' ? 'Không có tranh chấp chờ phân xử' : 'Chưa có tranh chấp nào'
            }
          />
        ) : (
          <>
            <ul className="divide-y">
              {list.data.items.map((d) => (
                <li key={d.id}>
                  <Link
                    to={`/quan-tri/tranh-chap/${d.id}`}
                    className="flex flex-wrap items-center gap-3 px-4 py-3.5 transition hover:bg-ivory/50 md:px-5"
                  >
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-navy">{d.returnCode}</span>
                        {d.overdue && <StatusBadge tone="danger">Quá hạn phân xử</StatusBadge>}
                        {d.decision && (
                          <StatusBadge tone="neutral">
                            {DECISION[d.decision]}
                            {d.refundAmount ? ` ${formatMoney(d.refundAmount)}` : ''}
                          </StatusBadge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {STAGE[d.stage]} · {d.shop.name} · {d.buyer.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {d.status === 'PENDING'
                          ? `Mở ${formatDateTime(d.createdAt)} · hạn ${formatDateTime(d.deadline)}`
                          : `Quyết bởi ${d.decidedByName} · ${formatDateTime(d.decidedAt)}`}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="text-xs text-muted-foreground">Hoàn tối đa</div>
                      <div className="font-semibold text-navy">{formatMoney(d.maxRefund)}</div>
                    </div>
                    <ChevronRight className="size-4 text-ink/35" />
                  </Link>
                </li>
              ))}
            </ul>
            <Pager
              className="border-t px-5 py-3"
              page={page}
              pageSize={PAGE_SIZE}
              total={list.data.total}
              onChange={(p) =>
                setParams({ ...(status !== 'PENDING' ? { status } : {}), page: String(p) })
              }
            />
          </>
        )}
      </div>
    </div>
  );
}

type Choice = 'ACCEPT_RETURN' | 'REFUND_FULL' | 'REFUND_PART' | 'REJECT';

/** Hồ sơ tranh chấp: lời và ảnh hai bên, món trả, quyết định (hoàn toàn bộ/một phần, chấp nhận trả, không hoàn) */
export function DisputeDetailPage() {
  const { disputeId = '' } = useParams();
  const qc = useQueryClient();
  const me = useCurrentUser();
  const key = [...disputesKey, 'detail', disputeId];
  const detail = useQuery({
    queryKey: key,
    queryFn: () => api<Dispute>(`${API.approval}/admin/disputes/${disputeId}`),
  });
  const [choice, setChoice] = useState<Choice | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const decide = useMutation({
    mutationFn: (d: Dispute) =>
      api<Dispute>(`${API.approval}/admin/disputes/${disputeId}/decision`, {
        method: 'POST',
        body: {
          decision:
            choice === 'ACCEPT_RETURN'
              ? 'ACCEPT_RETURN'
              : choice === 'REJECT'
                ? 'REJECT'
                : 'REFUND',
          refundAmount:
            choice === 'REFUND_FULL' ? d.maxRefund : choice === 'REFUND_PART' ? amount : undefined,
          note: note.trim(),
        },
      }),
    onSuccess: (d) => {
      qc.setQueryData(key, d);
      void qc.invalidateQueries({ queryKey: disputesKey });
      toast.success('Đã phân xử, kết quả gửi tới yêu cầu trả hàng.');
    },
    onError: (e) => toast.error(e.message),
  });

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
  const d = detail.data;
  const r = d.returnData!;
  const options: Array<[Choice, string, string]> = [
    ...(d.stage === 'REQUEST_REJECTED'
      ? ([
          [
            'ACCEPT_RETURN',
            'Chấp nhận trả hàng',
            'Người mua gửi hàng về qua GHN, shop kiểm hàng rồi sàn hoàn tiền như thường.',
          ],
        ] as Array<[Choice, string, string]>)
      : []),
    [
      'REFUND_FULL',
      `Hoàn toàn bộ ${formatMoney(d.maxRefund)}`,
      d.stage === 'REQUEST_REJECTED' ? 'Hoàn ngay, không cần gửi hàng về.' : 'Hàng đã về shop.',
    ],
    ['REFUND_PART', 'Hoàn một phần', 'Nhập số tiền; shop bị trừ theo tỉ lệ.'],
    ['REJECT', 'Không hoàn tiền', 'Yêu cầu đóng, đơn hoàn tất.'],
  ];
  const valid =
    choice !== null &&
    note.trim().length >= 10 &&
    (choice !== 'REFUND_PART' || (!!amount && amount >= 1 && amount < d.maxRefund));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        crumbs={[{ label: 'Tranh chấp', to: '/quan-tri/tranh-chap' }, { label: d.returnCode }]}
        title={`Tranh chấp ${d.returnCode}`}
        description={`${STAGE[d.stage]} · đơn ${d.shopOrderCode} · ${r.paymentMethod === 'COD' ? 'COD' : 'VNPay'}`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to={`/quan-tri/tra-hang/${d.returnId}`}>Xem yêu cầu trả hàng</Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Người mua: ${d.buyer.name}`} icon={UserRound}>
          <div className="text-sm font-medium text-ink">{RETURN_REASONS[r.reason]}</div>
          <p className="mt-1 text-sm whitespace-pre-line text-ink/70">{r.description}</p>
          <div className="mt-2">
            <EvidenceGallery keys={r.images} />
          </div>
          {d.stage === 'REQUEST_REJECTED' && d.buyerStatement && (
            <div className="mt-3 border-t border-ivory-200 pt-3">
              <div className="text-sm font-medium text-ink">Lời khiếu nại</div>
              <p className="mt-1 text-sm whitespace-pre-line text-ink/70">
                {d.buyerStatement.text}
              </p>
              <div className="mt-2">
                <EvidenceGallery keys={d.buyerStatement.images} />
              </div>
            </div>
          )}
        </Card>
        <Card title={`Shop: ${d.shop.name}`} icon={Store}>
          <div className="text-sm font-medium text-ink">
            {d.stage === 'REQUEST_REJECTED' ? 'Lý do từ chối' : 'Kết quả kiểm hàng'}
          </div>
          <p className="mt-1 text-sm whitespace-pre-line text-ink/70">
            {d.sellerStatement?.text || 'Không có lời trình bày.'}
          </p>
          <div className="mt-2">
            <EvidenceGallery keys={d.sellerStatement?.images ?? []} />
          </div>
        </Card>
      </div>

      <Card title="Món trả">
        <div className="divide-y divide-ivory-200 text-sm">
          {r.items.map((it, i) => (
            <div key={i} className="flex justify-between gap-3 py-2">
              <span className="min-w-0">
                {it.name}
                {it.variant && <span className="text-ink/55"> · {it.variant}</span>}
                <span className="text-ink/55">
                  {' '}
                  · {formatMoney(it.price)} × {it.quantity}
                </span>
              </span>
              <span className="shrink-0 font-medium text-navy">{formatMoney(it.refundAmount)}</span>
            </div>
          ))}
        </div>
        <MoneyRow label="Hoàn tối đa" value={d.maxRefund} strong className="mt-1" />
      </Card>

      {d.status === 'RESOLVED' ? (
        <Card title="Quyết định" icon={Scale}>
          <div className="text-sm">
            <b className="text-navy">
              {DECISION[d.decision!]}
              {d.refundAmount ? ` ${formatMoney(d.refundAmount)}` : ''}
            </b>{' '}
            · {d.decidedByName} · {formatDateTime(d.decidedAt)}
          </div>
          <p className="mt-1 text-sm text-ink/70">{d.decisionNote}</p>
        </Card>
      ) : d.shop.ownerId === me?.id || d.buyer.id === me?.id ? (
        <Card title="Phân xử" icon={Scale}>
          <p className="text-sm text-ink/70">
            Bạn là chủ shop hoặc người mua của đơn này nên không được tự phân xử. Nhờ một admin Hỗ
            trợ khác xử lý.
          </p>
        </Card>
      ) : (
        <Card title="Phân xử" icon={Scale}>
          {d.overdue && (
            <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              Đã quá hạn phân xử ({formatDateTime(d.deadline)}). Hệ thống không tự quyết, mời bạn xử
              lý.
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
            {options.map(([value, title, text]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={choice === value}
                onClick={() => setChoice(value)}
                className={cn(
                  'rounded-xl border px-3 py-2.5 text-left text-sm transition',
                  choice === value
                    ? 'border-navy bg-navy/[0.04]'
                    : 'border-ivory-200 hover:border-champagne',
                )}
              >
                <div className="font-medium text-navy">{title}</div>
                <div className="text-xs text-ink/60">{text}</div>
              </button>
            ))}
          </div>
          {choice === 'REFUND_PART' && (
            <div className="mt-3 max-w-xs">
              <NumberInput
                value={amount}
                onChange={setAmount}
                suffix="đ"
                aria-label="Số tiền hoàn"
                placeholder={`Nhỏ hơn ${formatMoney(d.maxRefund)}`}
              />
            </div>
          )}
          <div className="mt-3 mb-1 text-sm font-medium text-ink">
            Lời giải thích (hai bên sẽ đọc)
          </div>
          <StatementBox
            value={note}
            onChange={setNote}
            min={10}
            max={500}
            placeholder="Ví dụ: ảnh mở hộp cho thấy áo rách từ trước khi giao..."
          />
          <div className="mt-3 flex justify-end">
            <Button disabled={!valid || decide.isPending} onClick={() => decide.mutate(d)}>
              {decide.isPending && <Loader2 className="size-4 animate-spin" />}
              Gửi quyết định
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
