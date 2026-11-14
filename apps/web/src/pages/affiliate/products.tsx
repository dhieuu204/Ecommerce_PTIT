import { IconCheck, IconLink, IconPackage, IconSearch } from '@tabler/icons-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { copyText } from '@/components/affiliate/affiliate-link-button';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { Pager } from '@/components/console/pager';
import { inputClass } from '@/components/form-bits';
import { PageHeader } from '@/components/layout/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useMyAffiliate } from '@/hooks/use-my-affiliate';
import { affiliateLink } from '@/lib/affiliate-link';
import { ratePercent, type AffiliateProduct } from '@/lib/affiliate-types';
import { API, api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CARD } from '@/pages/checkout/checkout-parts';

const PAGE_SIZE = 20;
const SORTS = [
  { value: 'rate', label: 'Hoa hồng cao' },
  { value: 'best_selling', label: 'Bán chạy' },
  { value: 'newest', label: 'Mới nhất' },
] as const;
type Sort = (typeof SORTS)[number]['value'];

/** Khu Cộng tác viên › Sản phẩm có hoa hồng (P7, AFF-03): tìm hàng, sao chép link sản phẩm hoặc link shop */
export function AffiliateProductsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const sort = (params.get('sort') ?? 'rate') as Sort;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [draft, setDraft] = useState(q);
  const me = useMyAffiliate();
  const code = me.data?.affiliate?.code ?? null;
  const active = me.data?.status === 'ACTIVE';

  const list = useQuery({
    queryKey: ['affiliate', 'products', q, sort, page],
    queryFn: () =>
      api<Page<AffiliateProduct>>(`${API.market}/affiliate-products`, {
        query: { q: q || undefined, sort, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
    enabled: active,
  });

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
      <PageHeader
        crumbs={[{ label: 'Tiếp thị' }, { label: 'Sản phẩm có hoa hồng' }]}
        title="Sản phẩm có hoa hồng"
        description="Hoa hồng do shop đặt cho từng sản phẩm, tính trên tiền hàng sau voucher của shop."
      />
      <div className={cn(CARD, 'overflow-hidden')}>
        <div className="flex flex-col gap-3 border-b border-ink/[0.06] p-4 md:flex-row md:items-center md:px-5">
          <form
            className="relative flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              update({ q: draft.trim() || null });
            }}
          >
            <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink/40" />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Tìm theo tên sản phẩm"
              aria-label="Tìm sản phẩm"
              className={cn(inputClass, 'pl-9')}
            />
          </form>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Sắp xếp">
            {SORTS.map((s) => (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={sort === s.value}
                onClick={() => update({ sort: s.value === 'rate' ? null : s.value })}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs transition',
                  sort === s.value
                    ? 'border-navy bg-champagne-50 font-semibold text-navy'
                    : 'border-ink/15 bg-card text-ink/70 hover:border-navy/40 hover:text-navy',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {!active ? (
          <EmptyState
            icon={IconLink}
            title="Tài khoản đang bị khóa"
            text="Mở lại tài khoản thì bạn lấy được link mới."
          />
        ) : list.isPending ? (
          <div className="divide-y divide-ink/[0.06]">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex gap-4 px-5 py-4">
                <Skeleton className="size-16 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : list.isError ? (
          <LoadError message={list.error.message} onRetry={() => list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon={IconPackage}
            title={q ? 'Không có sản phẩm phù hợp' : 'Chưa có sản phẩm nào bật hoa hồng'}
            text={
              q ? 'Thử từ khóa khác.' : 'Khi shop bật hoa hồng cho sản phẩm, sản phẩm hiện ở đây.'
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-ink/[0.06]">
              {list.data.items.map((p) => (
                <ProductRow key={p.id} p={p} code={code} />
              ))}
            </ul>
            <Pager
              className="border-t border-ink/[0.06] px-5 py-3"
              page={page}
              pageSize={PAGE_SIZE}
              total={list.data.total}
              onChange={(n) => update({ page: String(n) })}
            />
          </>
        )}
      </div>
    </div>
  );
}

function ProductRow({ p, code }: { p: AffiliateProduct; code: string | null }) {
  const [copied, setCopied] = useState<'product' | 'shop' | null>(null);
  const copy = async (kind: 'product' | 'shop') => {
    if (!code) return;
    const link = affiliateLink(
      code,
      kind === 'product' ? { productId: p.id } : { shopId: p.shop.id },
    );
    if (await copyText(link)) {
      setCopied(kind);
      toast.success(kind === 'product' ? 'Đã sao chép link sản phẩm.' : 'Đã sao chép link shop.');
      window.setTimeout(() => setCopied(null), 2000);
    }
  };
  const price =
    p.minPrice === p.maxPrice
      ? formatMoney(p.minPrice)
      : `${formatMoney(p.minPrice)} – ${formatMoney(p.maxPrice)}`;
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center md:px-5">
      <div className="flex min-w-0 flex-1 gap-3">
        <Link
          to={`/san-pham/${p.id}`}
          className="size-16 shrink-0 overflow-hidden rounded-lg bg-page ring-1 ring-ink/[0.06]"
        >
          {p.image && (
            <img src={p.image} alt="" className="size-full object-cover" loading="lazy" />
          )}
        </Link>
        <div className="min-w-0 text-sm">
          <Link
            to={`/san-pham/${p.id}`}
            className="line-clamp-2 font-medium text-charcoal transition hover:text-navy"
          >
            {p.name}
          </Link>
          <div className="mt-0.5 text-xs text-ink/55">
            {p.shop.name} · {price} · đã bán {p.soldCount.toLocaleString('vi-VN')}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-champagne-50 px-1.5 py-0.5 text-xs font-bold text-navy">
              Hoa hồng {ratePercent(p.commissionRate)}
            </span>
            <span className="text-xs text-ink/60">
              từ <b className="font-semibold text-charcoal">{formatMoney(p.commissionFrom)}</b> mỗi
              sản phẩm
            </span>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => copy('product')}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg whitespace-nowrap sm:flex-none bg-gradient-to-r from-header-from to-header-to px-4 text-sm font-semibold text-white transition hover:brightness-105"
        >
          {copied === 'product' ? (
            <IconCheck className="size-4" />
          ) : (
            <IconLink className="size-4" />
          )}
          Link sản phẩm
        </button>
        <button
          type="button"
          onClick={() => copy('shop')}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg whitespace-nowrap sm:flex-none border border-ink/15 px-4 text-sm text-charcoal transition hover:border-navy/40 hover:text-navy"
        >
          {copied === 'shop' ? <IconCheck className="size-4" /> : <IconLink className="size-4" />}
          Link shop
        </button>
      </div>
    </li>
  );
}
