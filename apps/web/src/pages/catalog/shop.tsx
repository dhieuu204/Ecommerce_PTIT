import {
  IconBuildingStore,
  IconCalendar,
  IconPackage,
  IconPlayerPause,
  IconRosetteDiscountCheckFilled,
  IconStarFilled,
  IconUsers,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
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
import { ChatWithShopButton } from '@/components/chat/chat-with-shop-button';
import { LoadError } from '@/components/console/empty-state';
import { ShopLogo } from '@/components/console/shop-logo';
import { ReportButton } from '@/components/moderation/report-button';
import { ShopEngagement } from '@/components/reviews/engagement';
import { ShopTabs } from '@/components/reviews/shop-tabs';
import { formatCount, formatRating } from '@/components/reviews/stars';
import { Skeleton } from '@/components/ui/skeleton';
import { API, ApiError, api } from '@/lib/api';
import type { ProductSort, PublicShop, Voucher } from '@/lib/catalog-types';
import { cn } from '@/lib/utils';
import { CARD, CardTitle } from '@/pages/checkout/checkout-parts';

const SORTS: ProductSort[] = ['newest', 'best_selling', 'rating', 'price_asc', 'price_desc'];

const monthYear = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  month: 'numeric',
  year: 'numeric',
});

/** "6/2026" */
function joinedText(iso: string) {
  const parts = monthYear.formatToParts(new Date(iso));
  const m = parts.find((p) => p.type === 'month')?.value;
  const y = parts.find((p) => p.type === 'year')?.value;
  return `${m}/${y}`;
}

function Stat({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof IconPackage;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <Icon className="size-[1.125rem] shrink-0 text-navy [stroke-width:1.75]" />
      <div className="min-w-0">
        <dt className="text-[13px] leading-4 text-ink/55">{label}</dt>
        <dd className="truncate font-semibold text-charcoal">{children}</dd>
      </div>
    </div>
  );
}

function ShopHeader({ shop }: { shop: PublicShop }) {
  return (
    <ShopEngagement
      shop={shop}
      actions={<ChatWithShopButton shopId={shop.id} className="h-10 rounded-lg" />}
    >
      {({ followerCount, buttons }) => (
        <section className={cn(CARD, 'p-5 md:p-6')}>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-center">
            <div className="flex min-w-0 items-center gap-4">
              <ShopLogo
                url={shop.logoUrl}
                className="size-20 rounded-xl ring-1 ring-ink/[0.08] md:size-24"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h1 className="text-xl font-bold tracking-tight text-charcoal md:text-2xl">
                    {shop.name}
                  </h1>
                  {shop.suspended ? (
                    <span className="rounded-md bg-ink/10 px-2 py-0.5 text-xs font-medium text-ink/70">
                      Tạm ngừng bán
                    </span>
                  ) : (
                    <IconRosetteDiscountCheckFilled className="size-5 text-navy" />
                  )}
                  <ReportButton targetType="SHOP" targetId={shop.id} shopId={shop.id} />
                </div>
                {shop.provinceName && (
                  <div className="mt-0.5 text-[13px] text-ink/55">
                    Gửi hàng từ {shop.provinceName}
                  </div>
                )}
                <div className="mt-3">{buttons}</div>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-ink/[0.06] pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
              {!shop.suspended && (
                <Stat icon={IconPackage} label="Sản phẩm">
                  {shop.productCount.toLocaleString('vi-VN')}
                </Stat>
              )}
              <Stat icon={IconStarFilled} label="Đánh giá">
                {shop.ratingAvg !== null && shop.ratingCount > 0
                  ? `${formatRating(shop.ratingAvg)} (${formatCount(shop.ratingCount)})`
                  : 'Chưa có'}
              </Stat>
              <Stat icon={IconUsers} label="Người theo dõi">
                {followerCount.toLocaleString('vi-VN')}
              </Stat>
              <Stat icon={IconCalendar} label="Tham gia">
                {joinedText(shop.joinedAt)}
              </Stat>
            </dl>
          </div>
          {shop.description && (
            <p className="mt-4 border-t border-ink/[0.06] pt-4 text-sm leading-6 whitespace-pre-line text-ink/65">
              {shop.description}
            </p>
          )}
        </section>
      )}
    </ShopEngagement>
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
    <section className={cn(CARD, 'mt-4 p-5')}>
      <CardTitle>Mã giảm giá của shop</CardTitle>
      <div className="mt-3.5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {q.isPending
          ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
          : q.data.map((v) => <VoucherTicket key={v.id} voucher={v} />)}
      </div>
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
    <section className="mt-4">
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
      <div className="mt-4">
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
    <div className="mx-auto max-w-7xl px-4 pb-12">
      <Skeleton className="my-3.5 h-5 w-40" />
      <Skeleton className="h-44 rounded-2xl" />
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
          icon={IconBuildingStore}
          title="Không tìm thấy shop"
          text="Shop này không có hoặc chưa được duyệt mở bán."
        />
      );
    }
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className={CARD}>
          <LoadError message={e.message} onRetry={() => void shop.refetch()} />
        </div>
      </div>
    );
  }

  const s = shop.data;
  return (
    <div className="mx-auto max-w-7xl px-4 pb-12">
      <Breadcrumb items={[{ label: s.name }]} />
      <ShopHeader shop={s} />
      {s.suspended ? (
        <div className={cn(CARD, 'mt-4 flex flex-col items-center px-6 py-14 text-center')}>
          <span className="flex size-16 items-center justify-center rounded-full bg-champagne-50 text-navy">
            <IconPlayerPause className="size-7 [stroke-width:1.5]" />
          </span>
          <h2 className="mt-4 text-lg font-bold text-charcoal">Shop đang tạm ngừng bán</h2>
          <p className="mt-1 max-w-md text-sm text-ink/60">
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
