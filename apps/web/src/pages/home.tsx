import { type ProductSearchParams, useProductSearch } from '@/components/catalog/browse-query';
import type { ProductCardVariant } from '@/components/catalog/product-card';
import { LoadError } from '@/components/console/empty-state';
import { FlashSaleSection } from '@/components/home/home-flash-sale';
import { FeaturedShops } from '@/components/home/home-shops';
import { BackToTop, SideRail } from '@/components/home/home-floating';
import { HomeHero } from '@/components/home/home-hero';
import { HomePromos } from '@/components/home/home-promos';
import { ProductSpotlight } from '@/components/home/home-spotlight';
import {
  CategoryShowcase,
  FeaturedLaptops,
  ProductRow,
  Reveal,
  SectionTitle,
} from '@/components/home/home-sections';
import { useCategories } from '@/hooks/use-catalog';

/** Một khu sản phẩm theo tham số tìm kiếm; không có hàng thì ẩn hẳn */
function ProductSection({
  title,
  subtitle,
  kicker,
  more,
  params,
  variant,
  rows = 1,
}: {
  title: string;
  subtitle?: string;
  kicker?: string;
  more: string;
  params: ProductSearchParams;
  variant?: ProductCardVariant;
  rows?: 1 | 2;
}) {
  const q = useProductSearch({ pageSize: rows * 5, ...params });
  if (q.data && q.data.items.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 pt-8 md:pt-10">
      <SectionTitle title={title} subtitle={subtitle} kicker={kicker} more={more} />
      {q.isError ? (
        <div className="rounded-2xl bg-card">
          <LoadError message={q.error.message} onRetry={() => void q.refetch()} />
        </div>
      ) : (
        <ProductRow
          items={q.data?.items ?? []}
          loading={q.isPending}
          variant={variant}
          rows={rows}
        />
      )}
    </section>
  );
}

/**
 * Trang chủ khu mua hàng theo thiết kế đã chốt (HK-Shop-Homepage-Sections): banner chính, 2 thẻ ưu đãi +
 * voucher, cam kết, mua theo danh mục, điện thoại nổi bật, đang giảm giá, sản phẩm tiêu điểm, laptop nổi bật, shop nổi bật,
 * hàng mới về. Các khu hiện dần khi cuộn tới.
 */
export function HomePage() {
  const categories = useCategories();
  const tree = categories.data ?? [];

  // Khu "nổi bật" theo danh mục (không có thì bỏ qua)
  const phones = tree.find((c) => c.slug === 'dien-thoai') ?? tree[0];
  const laptops = tree.find((c) => c.slug === 'laptop');

  return (
    <>
      <HomeHero />
      <HomePromos />

      <Reveal>
        <CategoryShowcase tree={tree} loading={categories.isPending} />
      </Reveal>
      {phones && (
        <Reveal>
          <ProductSection
            kicker="Lựa chọn nổi bật"
            title={`${phones.name} nổi bật`}
            more={`/danh-muc/${phones.slug}?sort=best_selling`}
            params={{ categoryId: phones.id, sort: 'best_selling' }}
          />
        </Reveal>
      )}
      <Reveal>
        <FlashSaleSection />
      </Reveal>
      <Reveal>
        <ProductSpotlight />
      </Reveal>
      {laptops && laptops.id !== phones?.id && (
        <Reveal>
          <FeaturedLaptops category={laptops} />
        </Reveal>
      )}
      <Reveal>
        <FeaturedShops />
      </Reveal>
      <Reveal>
        <ProductSection
          title="Hàng mới về"
          more="/tim-kiem?sort=newest"
          params={{ sort: 'newest' }}
          variant="compact"
          rows={2}
        />
      </Reveal>

      <SideRail />
      <BackToTop />
    </>
  );
}
