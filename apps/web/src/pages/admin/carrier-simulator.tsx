import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CircleX,
  FlaskConical,
  Loader2,
  PackageCheck,
  PackageX,
  RefreshCw,
  Truck,
  Undo2,
} from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { ShipmentStatusBadge, SimulatedChip } from '@/components/orders/shipment-parts';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { API, ApiError, api } from '@/lib/api';
import type { SimulatorEvent, SimulatorRow } from '@/lib/finance-types';
import { formatDateTime, formatMoney } from '@/lib/format';

const key = ['admin', 'carrier-simulator'] as const;

const EVENT: Record<
  SimulatorEvent,
  { label: string; icon: typeof Truck; variant: 'default' | 'outline' | 'destructive' }
> = {
  PICKED: { label: 'Đã lấy hàng', icon: Truck, variant: 'default' },
  DELIVERED: { label: 'Đã giao', icon: PackageCheck, variant: 'default' },
  DELIVERY_FAILED: { label: 'Giao thất bại', icon: CircleX, variant: 'outline' },
  RETURN: { label: 'Hoàn hàng', icon: Undo2, variant: 'outline' },
  RETURNED: { label: 'Đã hoàn về shop', icon: Undo2, variant: 'default' },
  LOST: { label: 'Thất lạc / hư hỏng', icon: PackageX, variant: 'destructive' },
};

/**
 * Quản trị › GHN mô phỏng (SHIP-03, bộ quyền SUPPORT). Khi chưa có GHN_TOKEN, admin bấm các mốc giao hàng
 * thay cho GHN; mỗi lần bấm đi đúng đường xử lý như tin GHN thật báo về (webhook).
 */
export function CarrierSimulatorPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: key,
    queryFn: () => api<SimulatorRow[]>(`${API.market}/admin/carrier-simulator`),
    refetchInterval: 15_000,
    retry: false,
  });
  const step = useMutation({
    mutationFn: ({ row, event }: { row: SimulatorRow; event: SimulatorEvent }) =>
      api<SimulatorRow | null>(`${API.market}/admin/carrier-simulator/${row.id}/events`, {
        method: 'POST',
        body: { event },
      }),
    onSuccess: (_r, { row, event }) => {
      toast.success(`${row.ghnCode}: ${EVENT[event].label}`);
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => {
      toast.error(e.message);
      void qc.invalidateQueries({ queryKey: key });
    },
  });
  const realGhn = list.error instanceof ApiError && list.error.status === 404;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ label: 'Hỗ trợ' }, { label: 'GHN mô phỏng' }]}
        title={
          <span className="flex flex-wrap items-center gap-2">
            GHN mô phỏng <SimulatedChip />
          </span>
        }
        description="Chưa nối GHN thật: bấm các mốc giao hàng thay cho GHN. Tin bấm ở đây đi đúng đường xử lý như tin GHN báo về."
        actions={
          <Button variant="outline" onClick={() => list.refetch()} disabled={list.isFetching}>
            <RefreshCw className={list.isFetching ? 'size-4 animate-spin' : 'size-4'} /> Tải lại
          </Button>
        }
      />
      <div className="mb-4 flex gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
        <FlaskConical className="mt-0.5 size-5 shrink-0" />
        <p>
          Giao thất bại đủ số lần cấu hình (mặc định 3) thì vận đơn tự chuyển sang hoàn hàng. Vận
          đơn đã giao, đã hoàn về hoặc đã hủy không còn hiện ở đây.
        </p>
      </div>
      <div className="rounded-2xl border bg-card shadow-sm shadow-navy/[0.03]">
        {list.isPending ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : realGhn ? (
          <EmptyState
            icon={Truck}
            title="Đang dùng GHN thật"
            text="Sàn đã có GHN_TOKEN nên trạng thái vận đơn do GHN báo về, không có bảng mô phỏng."
          />
        ) : list.isError ? (
          <LoadError message={list.error.message} onRetry={() => list.refetch()} />
        ) : list.data.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="Không có vận đơn đang chạy"
            text="Vận đơn hiện ở đây sau khi seller bấm “Xác nhận và giao cho GHN”."
          />
        ) : (
          <ul className="divide-y">
            {list.data.map((r) => (
              <li
                key={r.id}
                className="grid gap-3 px-4 py-4 md:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-center"
              >
                <div className="min-w-0 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold text-navy">{r.ghnCode}</span>
                    <ShipmentStatusBadge status={r.status} />
                    {r.failedAttempts > 0 && (
                      <span className="text-xs text-amber-700">
                        thất bại {r.failedAttempts} lần
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-ink/70">
                    {r.shopName} → <span className="font-medium text-ink">{r.receiverName}</span>,{' '}
                    {r.address}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Đơn{' '}
                    <Link
                      to={`/quan-tri/don-hang?q=${encodeURIComponent(r.shopOrderCode)}`}
                      className="text-navy hover:underline"
                    >
                      {r.shopOrderCode}
                    </Link>{' '}
                    · tạo {formatDateTime(r.createdAt)}
                    {r.codAmount > 0 && <> · thu hộ {formatMoney(r.codAmount)}</>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {r.actions.map((ev) => {
                    const e = EVENT[ev];
                    const busy =
                      step.isPending &&
                      step.variables?.row.id === r.id &&
                      step.variables.event === ev;
                    return (
                      <Button
                        key={ev}
                        size="sm"
                        variant={e.variant}
                        disabled={step.isPending}
                        onClick={() => step.mutate({ row: r, event: ev })}
                      >
                        {busy ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <e.icon className="size-4" />
                        )}
                        {e.label}
                      </Button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
