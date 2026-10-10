import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Info, Loader2, Pencil, Plus, TicketPercent, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { Pager } from '@/components/console/pager';
import { PageHeader } from '@/components/layout/page-header';
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
import { api, API, ApiError } from '@/lib/api';
import type { Voucher, VoucherState } from '@/lib/catalog-types';
import { formatDateTime } from '@/lib/format';
import { showApiError } from '@/lib/form';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';
import { VoucherFormDialog } from './voucher-form-dialog';
import { VoucherTicket, type VoucherKind } from './voucher-ticket';
import { discountText } from './voucher-utils';

const PAGE_SIZE = 10;
type Tab = VoucherState | 'ALL';
const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'RUNNING', label: 'Đang diễn ra' },
  { value: 'UPCOMING', label: 'Sắp diễn ra' },
  { value: 'ENDED', label: 'Đã kết thúc' },
  { value: 'ALL', label: 'Tất cả' },
];

const CONFIG: Record<
  VoucherKind,
  {
    path: string;
    crumbs: Array<{ label: string; to?: string }>;
    title: string;
    description: string;
    note: string;
  }
> = {
  shop: {
    path: `${API.market}/shops/me/vouchers`,
    crumbs: [{ label: 'Marketing' }, { label: 'Voucher của shop' }],
    title: 'Voucher của shop',
    description: 'Mã giảm giá riêng của shop, shop chịu phần tiền giảm.',
    note: 'Voucher được áp vào đơn từ giai đoạn đặt hàng (P3). Voucher đang diễn ra và còn lượt đã hiện trên trang shop và trang sản phẩm của bạn.',
  },
  platform: {
    path: `${API.market}/admin/vouchers`,
    crumbs: [{ label: 'Tài chính' }, { label: 'Voucher sàn' }],
    title: 'Voucher sàn',
    description: 'Mã giảm giá dùng cho đơn của mọi shop. Mọi thay đổi đều ghi nhật ký.',
    note: 'Voucher sàn do sàn chịu chi phí. Voucher được áp vào đơn từ giai đoạn đặt hàng (P3).',
  },
};

type Confirm = { action: 'end' | 'delete'; voucher: Voucher } | null;

/**
 * Trang quản lý voucher (VCH-01) dùng chung cho Kênh người bán (voucher shop) và Quản trị
 * (voucher sàn, bộ quyền FINANCE): tab theo trạng thái, vé voucher, tạo/sửa, kết thúc, xóa.
 */
export function VoucherManager({ kind }: { kind: VoucherKind }) {
  const cfg = CONFIG[kind];
  const listKey = ['vouchers', kind] as const;
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('state') ?? 'RUNNING') as Tab;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [form, setForm] = useState<{ open: boolean; voucher: Voucher | null }>({
    open: false,
    voucher: null,
  });
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);

  const setTab = (t: Tab) => {
    const p = new URLSearchParams(params);
    if (t === 'RUNNING') p.delete('state');
    else p.set('state', t);
    p.delete('page');
    setParams(p, { replace: true });
  };

  const list = useQuery({
    queryKey: [...listKey, { tab, page }],
    queryFn: () =>
      api<Page<Voucher>>(cfg.path, {
        query: { state: tab === 'ALL' ? undefined : tab, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });
  // Số voucher mỗi tab
  const counts = useQuery({
    queryKey: [...listKey, 'counts'],
    queryFn: async () => {
      const count = (state?: VoucherState) =>
        api<Page<Voucher>>(cfg.path, { query: { state, page: 1, pageSize: 1 } }).then(
          (r) => r.total,
        );
      const [RUNNING, UPCOMING, ENDED, ALL] = await Promise.all([
        count('RUNNING'),
        count('UPCOMING'),
        count('ENDED'),
        count(),
      ]);
      return { RUNNING, UPCOMING, ENDED, ALL } as Record<Tab, number>;
    },
  });

  async function runConfirm() {
    if (!confirm) return;
    const { action, voucher } = confirm;
    setBusy(true);
    try {
      if (action === 'end') {
        await api(`${cfg.path}/${voucher.id}/end`, { method: 'POST' });
        toast.success(`Đã kết thúc voucher ${voucher.code}.`);
      } else {
        await api(`${cfg.path}/${voucher.id}`, { method: 'DELETE' });
        toast.success(`Đã xóa voucher ${voucher.code}.`);
      }
      setConfirm(null);
    } catch (e) {
      if (
        e instanceof ApiError &&
        ['VOUCHER_ENDED', 'VOUCHER_STARTED', 'NOT_FOUND'].includes(e.code)
      ) {
        // Voucher vừa đổi trạng thái hoặc đã bị xóa ở nơi khác
        toast.error(e.message);
        setConfirm(null);
      } else {
        showApiError(e);
      }
    } finally {
      setBusy(false);
      void queryClient.invalidateQueries({ queryKey: listKey });
    }
  }

  const rows = list.data?.items ?? [];
  const openCreate = () => setForm({ open: true, voucher: null });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={cfg.crumbs}
        title={cfg.title}
        description={cfg.description}
        actions={
          <Button className="h-10 rounded-full px-5" onClick={openCreate}>
            <Plus /> Tạo voucher
          </Button>
        }
      />

      <div className="mb-4 flex gap-2.5 rounded-xl border border-champagne/40 bg-champagne-50/60 px-4 py-3 text-sm text-navy">
        <Info className="mt-0.5 size-4 shrink-0 text-champagne-600" />
        <p>{cfg.note}</p>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm shadow-navy/[0.03]">
        <nav
          className="-mb-px flex gap-1 overflow-x-auto border-b px-4 pt-2 md:px-5"
          aria-label="Trạng thái voucher"
        >
          {TABS.map((t) => {
            const active = tab === t.value;
            const n = counts.data?.[t.value];
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setTab(t.value)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm whitespace-nowrap transition',
                  active
                    ? 'border-navy font-semibold text-navy'
                    : 'border-transparent text-muted-foreground hover:text-ink',
                )}
              >
                {t.label}
                {n !== undefined && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums',
                      active ? 'bg-navy text-white' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {list.isPending ? (
          <div className="space-y-3 bg-ivory p-3 md:p-4">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-2xl bg-white" />
            ))}
          </div>
        ) : list.isError ? (
          <LoadError message={list.error.message} onRetry={() => void list.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={TicketPercent}
            title={
              tab === 'ALL'
                ? 'Chưa có voucher nào'
                : `Không có voucher ${TABS.find((t) => t.value === tab)!.label.toLowerCase()}`
            }
            text={
              tab === 'ENDED'
                ? 'Voucher hết hạn hoặc được kết thúc sớm sẽ hiện ở đây.'
                : 'Tạo voucher giảm số tiền hoặc giảm theo % (có mức giảm tối đa).'
            }
            action={
              tab !== 'ENDED' && (
                <Button className="rounded-full px-5" onClick={openCreate}>
                  <Plus /> Tạo voucher
                </Button>
              )
            }
          />
        ) : (
          <ul
            className={cn(
              'space-y-3 bg-ivory p-3 transition-opacity md:p-4',
              list.isFetching && 'opacity-60',
            )}
          >
            {rows.map((v) => (
              <li key={v.id}>
                <VoucherTicket
                  v={v}
                  kind={kind}
                  actions={
                    <TicketActions
                      v={v}
                      onEdit={() => setForm({ open: true, voucher: v })}
                      onConfirm={setConfirm}
                    />
                  }
                />
              </li>
            ))}
          </ul>
        )}

        {list.data && list.data.total > 0 && (
          <div className="border-t px-4 py-3 md:px-5">
            <Pager
              page={page}
              pageSize={PAGE_SIZE}
              total={list.data.total}
              onChange={(p) => {
                const next = new URLSearchParams(params);
                if (p > 1) next.set('page', String(p));
                else next.delete('page');
                setParams(next, { replace: true });
              }}
            />
          </div>
        )}
      </div>

      <VoucherFormDialog
        open={form.open}
        onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
        voucher={form.voucher}
        kind={kind}
        basePath={cfg.path}
        listKey={listKey}
        onSaved={(saved) => {
          // Vừa tạo: chuyển sang tab của voucher đó để thấy ngay
          if (!form.voucher && tab !== 'ALL' && saved.state !== tab) setTab(saved.state);
        }}
      />

      <Dialog open={!!confirm} onOpenChange={(o) => !o && !busy && setConfirm(null)}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          {confirm && (
            <>
              <DialogHeader className="text-left">
                <DialogTitle className="text-navy">
                  {confirm.action === 'end' ? 'Kết thúc voucher ngay?' : 'Xóa voucher?'}
                </DialogTitle>
                <DialogDescription>
                  <code className="font-mono font-semibold text-navy">{confirm.voucher.code}</code>{' '}
                  · {discountText(confirm.voucher)}
                </DialogDescription>
              </DialogHeader>
              <p className="text-sm text-ink">
                {confirm.action === 'end'
                  ? 'Voucher sẽ kết thúc ngay bây giờ, buyer không dùng được nữa. Không mở lại được.'
                  : 'Voucher chưa bắt đầu nên xóa hẳn được. Thao tác này không hoàn tác.'}
              </p>
              <DialogFooter>
                <Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>
                  Không
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => void runConfirm()}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {busy && <Loader2 className="animate-spin" />}
                  {confirm.action === 'end' ? 'Kết thúc voucher' : 'Xóa voucher'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Nút của một vé: Sửa (chưa kết thúc), Kết thúc (chưa kết thúc), Xóa (chỉ sắp diễn ra) */
function TicketActions({
  v,
  onEdit,
  onConfirm,
}: {
  v: Voucher;
  onEdit: () => void;
  onConfirm: (c: Confirm) => void;
}) {
  if (v.state === 'ENDED') {
    return (
      <span className="text-xs text-muted-foreground">Kết thúc lúc {formatDateTime(v.endAt)}</span>
    );
  }
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="rounded-full border-navy/30 text-navy"
        onClick={onEdit}
      >
        <Pencil /> Sửa
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="rounded-full text-red-700 hover:bg-red-50 hover:text-red-700"
        onClick={() => onConfirm({ action: 'end', voucher: v })}
      >
        <Ban /> Kết thúc
      </Button>
      {v.state === 'UPCOMING' && (
        <Button
          size="icon-sm"
          variant="ghost"
          className="rounded-full text-muted-foreground hover:bg-red-50 hover:text-red-700"
          onClick={() => onConfirm({ action: 'delete', voucher: v })}
          aria-label={`Xóa voucher ${v.code}`}
          title="Xóa voucher"
        >
          <Trash2 />
        </Button>
      )}
    </>
  );
}
