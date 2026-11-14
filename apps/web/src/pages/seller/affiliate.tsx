import { IconAffiliate, IconPackage, IconReceipt, IconSearch } from '@tabler/icons-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { Pager } from '@/components/console/pager';
import { inputClass } from '@/components/form-bits';
import { PageHeader } from '@/components/layout/page-header';
import { ConfirmDialog, ShopOrderStatusBadge } from '@/components/orders/order-parts';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { ratePercent, type SellerAffiliateOrder } from '@/lib/affiliate-types';
import { API, api } from '@/lib/api';
import type { SellerProductRow } from '@/lib/catalog-types';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { ShopOrderStatus } from '@/lib/order-types';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CARD } from '@/pages/checkout/checkout-parts';

const PAGE_SIZE = 20;
const key = ['seller', 'affiliate'] as const;
type Tab = 'PRODUCTS' | 'ORDERS';

/**
 * Kênh người bán › Tiếp thị liên kết (P7, AFF-02, AFF-06): bật/đặt/tắt hoa hồng cho sản phẩm, xem đơn qua
 * cộng tác viên. Hoa hồng shop trả, trừ vào tiền shop nhận; đổi % chỉ áp cho đơn đặt sau đó.
 */
export function SellerAffiliatePage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'don-hang' ? 'ORDERS' : 'PRODUCTS';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const range = useQuery({
    queryKey: [...key, 'range'],
    queryFn: () => api<{ min: number; max: number }>(`${API.market}/shops/me/affiliate-settings`),
  });
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ label: 'Marketing' }, { label: 'Tiếp thị liên kết' }]}
        title="Tiếp thị liên kết"
        description={
          range.data
            ? `Cộng tác viên chia sẻ link sản phẩm của shop. Bạn đặt hoa hồng từ ${ratePercent(range.data.min)} đến ${ratePercent(range.data.max)} tiền hàng sau voucher shop; chỉ trả khi đơn hoàn tất.`
            : undefined
        }
      />
      <div className={cn(CARD, 'overflow-hidden')}>
        <nav
          className="flex gap-1 overflow-x-auto border-b border-ink/[0.06] px-2 md:px-3"
          aria-label="Mục"
        >
          {(
            [
              ['PRODUCTS', 'Hoa hồng sản phẩm', null],
              ['ORDERS', 'Đơn qua cộng tác viên', 'don-hang'],
            ] as const
          ).map(([value, label, param]) => (
            <button
              key={value}
              type="button"
              onClick={() => setParams(param ? { tab: param } : {}, { replace: true })}
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
        {tab === 'PRODUCTS' ? (
          <ProductCommissions
            range={range.data ?? null}
            page={page}
            onPage={(p) => setParams({ page: String(p) }, { replace: true })}
          />
        ) : (
          <AffiliateOrders
            page={page}
            onPage={(p) => setParams({ tab: 'don-hang', page: String(p) }, { replace: true })}
          />
        )}
      </div>
    </div>
  );
}

function ProductCommissions({
  range,
  page,
  onPage,
}: {
  range: { min: number; max: number } | null;
  page: number;
  onPage: (p: number) => void;
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [setting, setSetting] = useState(false);
  const [turningOff, setTurningOff] = useState(false);
  const [percent, setPercent] = useState('');
  const list = useQuery({
    queryKey: [...key, 'products', q, page],
    queryFn: () =>
      api<Page<SellerProductRow>>(`${API.market}/shops/me/products`, {
        query: { q: q || undefined, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });
  const save = useMutation({
    mutationFn: (rate: number | null) =>
      api<{ updated: number }>(`${API.market}/shops/me/product-commissions`, {
        method: 'PUT',
        body: { productIds: [...selected], rate },
      }),
    onSuccess: (r, rate) => {
      void qc.invalidateQueries({ queryKey: key });
      setSelected(new Set());
      toast.success(
        rate === null
          ? `Đã tắt hoa hồng cho ${r.updated} sản phẩm.`
          : `Đã đặt hoa hồng ${ratePercent(rate)} cho ${r.updated} sản phẩm.`,
      );
    },
    onError: (e) => toast.error(e.message),
  });
  const rows = list.data?.items ?? [];
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const rate = Math.round(Number(percent.replace(',', '.')) * 100);
  const rateError =
    !percent.trim() || !Number.isFinite(rate)
      ? 'Nhập % hoa hồng.'
      : range && (rate < range.min || rate > range.max)
        ? `Từ ${ratePercent(range.min)} đến ${ratePercent(range.max)}.`
        : null;

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-ink/[0.06] p-4 md:flex-row md:items-center md:px-5">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(search.trim());
          }}
        >
          <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm sản phẩm"
            aria-label="Tìm sản phẩm"
            className={cn(inputClass, 'pl-9')}
          />
        </form>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink/60">Đã chọn {selected.size}</span>
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={() => {
              setPercent('');
              setSetting(true);
            }}
            className="h-9 rounded-lg bg-gradient-to-r from-header-from to-header-to px-4 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-50"
          >
            Đặt hoa hồng
          </button>
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={() => setTurningOff(true)}
            className="h-9 rounded-lg border border-ink/15 px-4 text-sm text-charcoal transition hover:border-navy/40 hover:text-navy disabled:opacity-50"
          >
            Tắt
          </button>
        </div>
      </div>
      {list.isPending ? (
        <div className="space-y-3 p-5">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : list.isError ? (
        <LoadError message={list.error.message} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={IconPackage} title="Chưa có sản phẩm nào" />
      ) : (
        <>
          <label className="flex items-center gap-3 border-b border-ink/[0.06] px-4 py-2.5 text-[13px] text-ink/55 md:px-5">
            <Checkbox
              checked={allOnPage}
              onCheckedChange={(c) =>
                setSelected((s) => {
                  const n = new Set(s);
                  for (const r of rows) {
                    if (c === true) n.add(r.id);
                    else n.delete(r.id);
                  }
                  return n;
                })
              }
              aria-label="Chọn cả trang"
            />
            Chọn cả trang
          </label>
          <ul className="divide-y divide-ink/[0.06]">
            {rows.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3 md:px-5">
                <Checkbox
                  checked={selected.has(p.id)}
                  onCheckedChange={() => toggle(p.id)}
                  aria-label={`Chọn ${p.name}`}
                />
                <span className="size-12 shrink-0 overflow-hidden rounded-lg bg-page ring-1 ring-ink/[0.06]">
                  {p.image && (
                    <img src={p.image} alt="" className="size-full object-cover" loading="lazy" />
                  )}
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <Link
                    to={`/kenh-nguoi-ban/san-pham/${p.id}`}
                    className="line-clamp-1 font-medium text-charcoal hover:text-navy"
                  >
                    {p.name}
                  </Link>
                  <div className="text-xs text-ink/55">
                    {formatMoney(p.minPrice)} · đã bán {p.soldCount.toLocaleString('vi-VN')}
                  </div>
                </div>
                {p.commissionRate ? (
                  <span className="shrink-0 rounded-md bg-champagne-50 px-2 py-0.5 text-xs font-bold text-navy">
                    {ratePercent(p.commissionRate)}
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-ink/45">Chưa bật</span>
                )}
              </li>
            ))}
          </ul>
          <Pager
            className="border-t border-ink/[0.06] px-5 py-3"
            page={page}
            pageSize={PAGE_SIZE}
            total={list.data.total}
            onChange={onPage}
          />
        </>
      )}
      <ConfirmDialog
        open={setting}
        onOpenChange={setSetting}
        title={`Đặt hoa hồng cho ${selected.size} sản phẩm`}
        description="Áp dụng cho đơn đặt sau khi lưu; đơn đã đặt giữ mức cũ."
        confirmLabel="Lưu"
        onConfirm={() =>
          rateError ? Promise.reject(toast.error(rateError)) : save.mutateAsync(rate)
        }
      >
        <label className="block text-sm">
          <span className="mb-1 block text-ink/70">Hoa hồng (% tiền hàng sau voucher shop)</span>
          <div className="relative">
            <input
              inputMode="decimal"
              value={percent}
              onChange={(e) => setPercent(e.target.value.replace(/[^\d.,]/g, ''))}
              placeholder="Ví dụ: 5"
              className={cn(inputClass, 'pr-8')}
              aria-label="Phần trăm hoa hồng"
            />
            <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-ink/50">%</span>
          </div>
          {percent && rateError && (
            <span className="mt-1 block text-xs text-destructive">{rateError}</span>
          )}
        </label>
      </ConfirmDialog>
      <ConfirmDialog
        open={turningOff}
        onOpenChange={setTurningOff}
        title={`Tắt hoa hồng cho ${selected.size} sản phẩm?`}
        description="Cộng tác viên không lấy được link mới cho các sản phẩm này; đơn đã đặt vẫn trả hoa hồng như cũ."
        confirmLabel="Tắt hoa hồng"
        onConfirm={() => save.mutateAsync(null)}
      />
    </>
  );
}

function AffiliateOrders({ page, onPage }: { page: number; onPage: (p: number) => void }) {
  const list = useQuery({
    queryKey: [...key, 'orders', page],
    queryFn: () =>
      api<Page<SellerAffiliateOrder>>(`${API.market}/shops/me/affiliate-orders`, {
        query: { page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });
  if (list.isPending) {
    return (
      <div className="space-y-3 p-5">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
    );
  }
  if (list.isError)
    return <LoadError message={list.error.message} onRetry={() => list.refetch()} />;
  if (list.data.items.length === 0) {
    return (
      <EmptyState
        icon={IconReceipt}
        title="Chưa có đơn nào qua cộng tác viên"
        text="Bật hoa hồng cho sản phẩm để cộng tác viên giới thiệu hàng của shop."
      />
    );
  }
  return (
    <>
      <ul className="divide-y divide-ink/[0.06]">
        {list.data.items.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 md:px-5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-champagne-50 text-navy">
              <IconAffiliate className="size-[1.125rem] [stroke-width:1.75]" />
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/kenh-nguoi-ban/don-hang/${o.id}`}
                  className="font-semibold text-charcoal hover:text-navy"
                >
                  {o.code}
                </Link>
                <ShopOrderStatusBadge status={o.status as ShopOrderStatus} paid />
              </div>
              <div className="text-xs text-ink/55">
                Qua {o.affiliateName} · tiền hàng {formatMoney(o.subtotal - o.shopDiscount)} ·{' '}
                {formatDateTime(o.createdAt)}
              </div>
            </div>
            <div className="text-right text-sm">
              <div className="text-xs text-ink/55">Hoa hồng</div>
              <div className="font-bold text-navy tabular-nums">{formatMoney(o.commission)}</div>
            </div>
          </li>
        ))}
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
