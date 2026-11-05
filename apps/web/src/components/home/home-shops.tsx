import {
  IconCheck,
  IconChevronRight,
  IconLoader2,
  IconMapPin,
  IconPlus,
  IconRosetteDiscountCheckFilled,
  IconStarFilled,
} from '@tabler/icons-react';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useProductSearch } from '@/components/catalog/browse-query';
import { formatSold } from '@/components/catalog/product-card';
import { ShopLogo } from '@/components/console/shop-logo';
import { followedShopsKey } from '@/components/reviews/engagement';
import { Skeleton } from '@/components/ui/skeleton';
import { useMyShop } from '@/hooks/use-my-shop';
import { API, api } from '@/lib/api';
import { useSession } from '@/lib/auth';
import type { ProductCardData, PublicShop } from '@/lib/catalog-types';
import type { FollowState } from '@/lib/engagement-types';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { HOME_BEST_SELLING, SectionTitle } from './home-sections';

/** Thời gian đã tham gia sàn: "8 tháng", "2 năm", "Mới tham gia" */
function joinedFor(joinedAt: string): string {
  const months = Math.floor((Date.now() - new Date(joinedAt).getTime()) / (30.44 * 86_400_000));
  if (months < 1) return 'Mới tham gia';
  if (months < 12) return `${months} tháng`;
  return `${Math.floor(months / 12)} năm`;
}

/**
 * Nút Theo dõi / Đang theo dõi trên thẻ shop (ENG-02, PUT/DELETE /shops/{id}/follow). Chưa đăng nhập thì sang
 * trang đăng nhập rồi quay lại; chủ shop xem shop của mình thì không hiện nút.
 */
export function FollowButton({ shop }: { shop: PublicShop }) {
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const myShop = useMyShop();
  const following = session.status === 'user' && shop.following;
  const toggle = useMutation({
    mutationFn: (follow: boolean) =>
      api<FollowState>(`${API.market}/shops/${shop.id}/follow`, {
        method: follow ? 'PUT' : 'DELETE',
      }),
    onSuccess: (next) => {
      qc.setQueryData<PublicShop>(['shop', shop.id], (old) => (old ? { ...old, ...next } : old));
      void qc.invalidateQueries({ queryKey: followedShopsKey });
      void qc.invalidateQueries({ queryKey: ['shop-follow', shop.id] });
      toast.success(next.following ? `Đã theo dõi ${shop.name}.` : 'Đã bỏ theo dõi shop.');
    },
    onError: (e) => toast.error(e.message),
  });
  if (myShop.data?.shop?.id === shop.id) return null;

  const onClick = () => {
    if (session.status === 'loading') return;
    if (session.status === 'guest') {
      navigate(`/dang-nhap?returnTo=${encodeURIComponent(location.pathname)}`);
      return;
    }
    toggle.mutate(!following);
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={toggle.isPending}
      aria-pressed={following}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-semibold transition focus-visible:ring-2 focus-visible:ring-champagne focus-visible:outline-none active:scale-[0.97] disabled:opacity-60',
        following
          ? 'border border-ink/15 text-charcoal hover:border-ink/30'
          : 'bg-navy text-white hover:bg-navy-900',
      )}
    >
      {toggle.isPending ? (
        <IconLoader2 className="size-4 animate-spin" />
      ) : following ? (
        <IconCheck className="size-4 [stroke-width:2.25]" />
      ) : (
        <IconPlus className="size-4 [stroke-width:2.25]" />
      )}
      {following ? 'Đang theo dõi' : 'Theo dõi'}
    </button>
  );
}

/** Một ô số liệu trong dải thống kê của shop */
function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="min-w-0 px-2 text-center">
      <div className="flex items-center justify-center gap-1 truncate text-[15px] font-bold text-charcoal">
        {value}
      </div>
      <div className="mt-0.5 truncate text-[11px] text-ink/50">{label}</div>
    </div>
  );
}

/**
 * Thẻ shop kiểu Shopee Mall / LazMall: dải bìa cam chuyển sắc, logo đè mép dải bìa, tên + nhãn đã kiểm
 * duyệt, mô tả và nơi bán, nút Theo dõi và Xem shop; dải 4 số liệu (đánh giá, sản phẩm, người theo dõi, tham
 * gia); lưới hàng bán chạy của shop có ảnh, tên, giá.
 */
function ShopCard({ shop, products }: { shop: PublicShop; products: ProductCardData[] }) {
  const rated = shop.ratingAvg !== null && shop.ratingCount > 0;
  return (
    <article className="group/shop flex flex-col overflow-hidden rounded-2xl bg-card shadow-[0_1px_2px_rgba(15,26,61,0.04)] transition duration-300 hover:shadow-[0_22px_44px_-26px_rgba(15,26,61,0.4)]">
      {/* Dải bìa */}
      <div className="relative h-24 overflow-hidden bg-gradient-to-r from-header-from to-header-to">
        <div
          aria-hidden
          className="absolute -top-16 right-[8%] size-48 rounded-full border border-white/20"
        />
        <div
          aria-hidden
          className="absolute -right-10 -bottom-20 size-56 rounded-full bg-white/[0.08]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_20%_120%,rgba(255,255,255,0.18),transparent_55%)]"
        />
        <span className="absolute top-3 right-4 inline-flex items-center gap-1 rounded-lg bg-white/15 px-2 py-1 text-[11px] font-semibold text-white ring-1 ring-white/25 backdrop-blur-sm">
          <IconRosetteDiscountCheckFilled className="size-3.5" />
          Shop đã kiểm duyệt
        </span>
      </div>

      <div className="px-5 pb-5">
        {/* Logo đè mép bìa + nút */}
        <div className="relative z-10 -mt-9 flex items-end justify-between gap-3">
          <ShopLogo
            url={shop.logoUrl}
            className="size-[4.5rem] rounded-2xl bg-card ring-4 ring-card shadow-[0_8px_20px_-10px_rgba(15,26,61,0.45)]"
          />
          <div className="flex shrink-0 translate-y-1.5 gap-2">
            <FollowButton shop={shop} />
            <Link
              to={`/shop/${shop.id}`}
              className="inline-flex h-9 items-center rounded-lg border border-navy px-3.5 text-[13px] font-semibold text-navy transition hover:bg-champagne-50 focus-visible:ring-2 focus-visible:ring-champagne focus-visible:outline-none"
            >
              Xem shop
            </Link>
          </div>
        </div>

        <Link
          to={`/shop/${shop.id}`}
          className="mt-3 flex items-center gap-1.5 text-base font-bold tracking-tight text-charcoal transition hover:text-navy"
        >
          <span className="truncate">{shop.name}</span>
          <IconRosetteDiscountCheckFilled className="size-[1.125rem] shrink-0 text-navy" />
        </Link>
        <div className="mt-1 flex min-w-0 items-center gap-3 text-xs text-ink/55">
          {shop.provinceName && (
            <span className="inline-flex shrink-0 items-center gap-1">
              <IconMapPin className="size-3.5" />
              {shop.provinceName}
            </span>
          )}
          {shop.description && <span className="truncate">{shop.description}</span>}
        </div>

        {/* Số liệu */}
        <div className="mt-4 grid grid-cols-4 divide-x divide-ink/[0.07] rounded-xl bg-page py-3">
          <Stat
            value={
              rated ? (
                <>
                  <IconStarFilled className="size-3.5 text-champagne" />
                  {shop.ratingAvg!.toFixed(1)}
                </>
              ) : (
                '—'
              )
            }
            label={rated ? `${formatSold(shop.ratingCount)} đánh giá` : 'Chưa có đánh giá'}
          />
          <Stat value={formatSold(shop.productCount)} label="Sản phẩm" />
          <Stat value={formatSold(shop.followerCount)} label="Người theo dõi" />
          <Stat value={joinedFor(shop.joinedAt)} label="Tham gia" />
        </div>

        {/* Hàng bán chạy của shop */}
        {products.length > 0 && (
          <>
            <div className="mt-4 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-charcoal">Bán chạy của shop</h3>
              <Link
                to={`/shop/${shop.id}`}
                className="inline-flex items-center text-xs font-medium text-ink/55 transition hover:text-navy"
              >
                Xem tất cả
                <IconChevronRight className="size-3.5 [stroke-width:2]" />
              </Link>
            </div>
            <div
              className={cn(
                'mt-2 grid gap-2.5',
                products.length >= 4 ? 'grid-cols-4' : 'grid-cols-3',
              )}
            >
              {products.map((p) => (
                <Link
                  key={p.id}
                  to={`/san-pham/${p.id}`}
                  title={p.name}
                  className="group/item min-w-0 rounded-xl p-1.5 ring-1 ring-ink/[0.06] transition hover:ring-navy/30 focus-visible:ring-2 focus-visible:ring-champagne focus-visible:outline-none"
                >
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg">
                    {p.image && (
                      <img
                        src={p.image}
                        alt={p.name}
                        loading="lazy"
                        decoding="async"
                        className="size-[88%] object-contain transition duration-300 group-hover/item:scale-105"
                      />
                    )}
                  </div>
                  <p className="mt-1 truncate px-0.5 text-[11px] text-ink/70">
                    {p.name.replace(/^(Điện thoại|Máy tính bảng|Laptop)\s+/i, '')}
                  </p>
                  <p className="truncate px-0.5 text-xs font-bold text-navy">
                    {formatMoney(p.minPrice)}
                  </p>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </article>
  );
}

/**
 * Shop nổi bật: các shop có hàng bán chạy nhất (tối đa 3). Shop phải được sàn duyệt mới bán được nên shop nào
 * cũng có nhãn "đã kiểm duyệt".
 */
export function FeaturedShops() {
  const q = useProductSearch(HOME_BEST_SELLING);
  const products = q.data?.items ?? [];
  const shopIds = [...new Set(products.map((p) => p.shop.id))].slice(0, 3);
  const shops = useQueries({
    queries: shopIds.map((id) => ({
      queryKey: ['shop', id],
      queryFn: () => api<PublicShop>(`${API.market}/shops/${id}`),
      staleTime: 60_000,
    })),
  });
  if (q.data && shopIds.length === 0) return null;
  const loading = q.isPending || shops.some((s) => s.isPending);
  const n = Math.max(shopIds.length, 2);
  // 2 shop: thẻ rộng, 4 món mỗi shop; 3 shop: 3 món cho vừa cột
  const perShop = n >= 3 ? 3 : 4;

  return (
    <section className="mx-auto max-w-7xl px-4 pt-8 md:pt-10">
      <SectionTitle title="Shop nổi bật" />
      <div className={cn('grid gap-4 md:grid-cols-2', n >= 3 && 'lg:grid-cols-3')}>
        {loading
          ? Array.from({ length: n }, (_, i) => (
              <Skeleton key={i} className="h-[27rem] rounded-2xl" />
            ))
          : shops.map((s, i) => {
              const shop = s.data;
              if (!shop) return null;
              return (
                <ShopCard
                  key={shopIds[i]}
                  shop={shop}
                  products={products.filter((p) => p.shop.id === shop.id).slice(0, perShop)}
                />
              );
            })}
      </div>
    </section>
  );
}
