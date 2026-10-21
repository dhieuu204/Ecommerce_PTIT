import { useQuery } from '@tanstack/react-query';
import { CalendarDays, MapPin, Package, PauseCircle, Store, TicketPercent } from 'lucide-react';
import { useParams } from 'react-router';
import { useBrowseState, useProductSearch } from '@/components/catalog/browse-query';
import {
  Breadcrumb,
  CatalogToolbar,
  NoProducts,
  NotFoundBlock,
  ProductResults,
} from '@/components/catalog/browse-parts';
import { VoucherTicket } from '@/components/catalog/voucher-ticket';
import { LoadError } from '@/components/console/empty-state';
import { ShopLogo } from '@/components/console/shop-logo';
import { ReportButton } from '@/components/moderation/report-button';
import { ShopEngagement } from '@/components/reviews/engagement';
import { ShopTabs } from '@/components/reviews/shop-tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { API, ApiError, api } from '@/lib/api';
import type { ProductSort, PublicShop, Voucher } from '@/lib/catalog-types';

const SORTS: ProductSort[] = ['newest', 'best_selling', 'rating', 'price_asc', 'price_desc'];

const monthYear = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  month: 'numeric',
  year: 'numeric',
});

/** "Tham gia tháng 6/2026" */
function joinedText(iso: string) {
  const parts = monthYear.formatToParts(new Date(iso));
  const m = parts.find((p) => p.type === 'month')?.value;
  const y = parts.find((p) => p.type === 'year')?.value;
  return `Tham gia tháng ${m}/${y}`;
}

function Stat({ icon: Icon, children }: { icon: typeof Package; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-4 text-champagne-600" />
      {children}
    </span>
  );
}

function ShopHeader({ shop }: { shop: PublicShop }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-ivory-200 bg-card shadow-[0_1px_2px_rgba(15,26,61,0.05)]">
      {/* Dải bìa navy có hoa văn vòng tròn */}
      <div className="relative h-24 overflow-hidden bg-gradient-to-r from-navy-900 via-navy to-navy-800 md:h-32">
        <div
          aria-hidden
          className="absolute -top-16 right-10 size-56 rounded-full border border-champagne/25"
        />
        <div
          aria-hidden
          className="absolute -top-6 right-24 size-32 rounded-full border border-dashed border-champagne/30"
        />
        <div
          aria-hidden
          className="absolute -bottom-24 left-1/3 size-48 rounded-full bg-champagne/15 blur-3xl"
        />
      </div>
      <div className="relative px-5 pb-5 md:px-8 md:pb-7">
        <div className="-mt-10 flex flex-col gap-4 md:-mt-12 md:flex-row md:items-end md:gap-6">
          <ShopLogo
            url={shop.logoUrl}
            className="size-20 border-4 border-card bg-card shadow-lg md:size-28"
          />
          <div className="min-w-0 flex-1 md:pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-navy md:text-2xl">{shop.name}</h1>
              {shop.suspended ? (
                <span className="rounded-full bg-ink/10 px-2.5 py-0.5 text-xs font-medium text-ink/70">
                  Tạm ngừng bán
                </span>
              ) : (
                <span className="rounded-full border border-champagne/50 bg-champagne-50 px-2.5 py-0.5 text-xs font-medium text-champagne-600">
                  Shop đã duyệt
                </span>
              )}
              <ReportButton
                targetType="SHOP"
                targetId={shop.id}
                shopId={shop.id}
                className="ml-auto"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink/70">
              {!shop.suspended && (
                <Stat icon={Package}>
                  <b className="font-semibold text-navy">
                    {shop.productCount.toLocaleString('vi-VN')}
                  </b>{' '}
                  sản phẩm
                </Stat>
              )}
              <Stat icon={CalendarDays}>{joinedText(shop.joinedAt)}</Stat>
              {shop.provinceName && <Stat icon={MapPin}>Gửi hàng từ {shop.provinceName}</Stat>}
            </div>
          </div>
          <ShopEngagement shop={shop} />
        </div>
        {shop.description && (
          <p className="mt-4 max-w-3xl text-sm leading-6 whitespace-pre-line text-ink/70">
            {shop.description}
          </p>
        )}
      </div>
    </section>
  );
}

function ShopVouchers({ shopId }: { shopId: string }) {
  const q = useQuery({
    queryKey: ['shop-vouchers', shopId],
    queryFn: () => api<Voucher[]>(`${API.market}/shops/${shopId}/vouchers`),
  });
  // Không có voucher (hoặc lỗi tải): không hiện khối này, phần hàng bên dưới vẫn dùng được
  if (q.isError || (q.data && q.data.length === 0)) return null;
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <TicketPercent className="size-5 text-champagne-600" />
        <h2 className="text-lg font-semibold text-navy">Voucher của shop</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
        {q.isPending
          ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
          : q.data.map((v) => <VoucherTicket key={v.id} voucher={v} />)}
      </div>
      <p className="mt-2 text-xs text-ink/50">
        Sao chép mã để dùng khi đặt hàng. Lưu và áp voucher sẽ có khi mở chức năng đặt hàng.
      </p>
    </section>
  );
}

function ShopProducts({ shopId }: { shopId: string }) {
  const browse = useBrowseState('newest');
  const { state } = browse;
  const products = useProductSearch({
    shopId,
    sort: state.sort,
    minPrice: state.minPrice,
    maxPrice: state.maxPrice,
    minRating: state.minRating,
    page: state.page,
  });
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center gap-2">
        <Store className="size-5 text-champagne-600" />
        <h2 className="text-lg font-semibold text-navy">Sản phẩm của shop</h2>
      </div>
      <CatalogToolbar
        sort={state.sort}
        sorts={SORTS}
        onSort={browse.setSort}
        minPrice={state.minPrice}
        maxPrice={state.maxPrice}
        onPrice={browse.setPrice}
        minRating={state.minRating}
        onRating={browse.setRating}
        total={products.data?.total}
      />
      <div className="mt-5">
        <ProductResults
          query={products}
          onPage={browse.setPage}
          empty={
            <NoProducts
              filtered={browse.hasPriceFilter || browse.hasRatingFilter}
              onClear={() =>
                browse.update({ minPrice: undefined, maxPrice: undefined, minRating: undefined })
              }
              text={
                browse.hasPriceFilter || browse.hasRatingFilter
                  ? 'Shop không có sản phẩm nào hợp bộ lọc giá và đánh giá này.'
                  : 'Shop chưa đăng sản phẩm nào. Bạn quay lại sau nhé.'
              }
            />
          }
        />
      </div>
    </section>
  );
}

function ShopSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-5">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="mt-5 h-56 rounded-3xl" />
    </div>
  );
}

/** Trang shop /shop/:shopId (CAT-04, VCH-01) */
export function ShopPage() {
  const { shopId = '' } = useParams();
  const shop = useQuery({
    queryKey: ['public-shop', shopId],
    queryFn: () => api<PublicShop>(`${API.market}/shops/${shopId}`),
  });

  if (shop.isPending) return <ShopSkeleton />;
  if (shop.isError) {
    const e = shop.error;
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) {
      return (
        <NotFoundBlock
          icon={Store}
          title="Không tìm thấy shop"
          text="Shop này không có hoặc chưa được duyệt mở bán."
        />
      );
    }
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="rounded-3xl border border-ivory-200 bg-card">
          <LoadError message={e.message} onRetry={() => void shop.refetch()} />
        </div>
      </div>
    );
  }

  const s = shop.data;
  return (
    <div className="mx-auto max-w-7xl px-4 pt-5 pb-4">
      <Breadcrumb items={[{ label: s.name }]} />
      <div className="mt-5">
        <ShopHeader shop={s} />
      </div>
      {s.suspended ? (
        <div className="mt-8 flex flex-col items-center rounded-3xl border border-dashed border-champagne/60 bg-champagne-50/60 px-6 py-14 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-card text-champagne-600 shadow-sm">
            <PauseCircle className="size-7" />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-navy">Shop đang tạm ngừng bán</h2>
          <p className="mt-1 max-w-md text-sm text-ink/65">
            Sản phẩm của shop tạm thời không hiển thị. Bạn có thể xem hàng của các shop khác trong
            lúc chờ shop bán lại.
          </p>
        </div>
      ) : (
        <>
          <ShopVouchers shopId={s.id} />
          <ShopTabs shop={s} products={<ShopProducts shopId={s.id} />} />
        </>
      )}
    </div>
  );
}
