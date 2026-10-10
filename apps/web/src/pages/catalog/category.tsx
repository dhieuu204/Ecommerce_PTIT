import { FolderSearch, LayoutGrid } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { useBrowseState, useProductSearch } from '@/components/catalog/browse-query';
import {
  Breadcrumb,
  CatalogToolbar,
  ChipRow,
  NoProducts,
  NotFoundBlock,
  ProductResults,
  chipClass,
} from '@/components/catalog/browse-parts';
import { categoryIcon } from '@/components/catalog/category-icon';
import { type BannerContent, PromoBanner } from '@/components/catalog/promo-banner';
import { Skeleton } from '@/components/ui/skeleton';
import { findCategory, useCategories } from '@/hooks/use-catalog';
import type { CategoryNode, ProductSort } from '@/lib/catalog-types';

const SORTS: ProductSort[] = ['newest', 'best_selling', 'price_asc', 'price_desc'];

function scrollToResults() {
  document.getElementById('ket-qua')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Hai banner trang danh mục cấp 1 (vẽ bằng CSS theo tên và icon của danh mục) */
function categoryBanners(cat: CategoryNode, onSort: (s: ProductSort) => void): BannerContent[] {
  const icon = categoryIcon(cat.icon);
  const children = (cat.children ?? []).map((c) => c.name);
  return [
    {
      tone: 'light',
      eyebrow: 'Bán chạy',
      title: cat.name,
      accent: 'Giá tốt mỗi ngày',
      text: children.length ? children.join(' · ') : 'Hàng chính hãng từ các shop đã được duyệt',
      cta: 'Xem bán chạy',
      icon,
      onClick: () => {
        onSort('best_selling');
        scrollToResults();
      },
    },
    {
      tone: 'navy',
      eyebrow: 'Hàng mới về',
      title: `${cat.name} mới nhất`,
      accent: 'Từ shop đã duyệt',
      text: 'Giao qua GHN, trả qua VNPay hoặc COD.',
      cta: 'Khám phá',
      icon,
      onClick: () => {
        onSort('newest');
        scrollToResults();
      },
    },
  ];
}

function CategorySkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-5">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="mx-auto mt-8 h-9 w-56" />
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <Skeleton className="h-44 rounded-3xl md:h-60" />
        <Skeleton className="hidden h-60 rounded-3xl md:block" />
      </div>
    </div>
  );
}

/** Trang danh mục /danh-muc/:slug (CAT-04): cấp 1 gồm hàng của mọi danh mục con */
export function CategoryPage() {
  const { slug = '' } = useParams();
  const categories = useCategories();
  const browse = useBrowseState('newest');
  const { state } = browse;
  const found = findCategory(categories.data, slug);
  const current = found ? (found.child ?? found.parent) : null;

  const products = useProductSearch(
    {
      categoryId: current?.id,
      sort: state.sort,
      minPrice: state.minPrice,
      maxPrice: state.maxPrice,
      page: state.page,
    },
    !!current,
  );

  if (categories.isPending) return <CategorySkeleton />;
  if (!found || !current) {
    return (
      <NotFoundBlock
        icon={FolderSearch}
        title="Không tìm thấy danh mục"
        text="Danh mục này không có hoặc đã được ẩn. Bạn thử chọn danh mục khác trên thanh danh mục nhé."
      />
    );
  }

  const { parent, child } = found;
  const chips = parent.children ?? [];
  // Giữ sắp xếp và lọc giá khi chuyển qua lại giữa các danh mục con
  const keep = new URLSearchParams(browse.params);
  keep.delete('page');
  const suffix = keep.size ? `?${keep}` : '';

  return (
    <div className="mx-auto max-w-7xl px-4 pt-5 pb-4">
      <Breadcrumb
        items={
          child
            ? [{ label: parent.name, to: `/danh-muc/${parent.slug}` }, { label: child.name }]
            : [{ label: parent.name }]
        }
      />

      <h1 className="mt-6 text-center text-2xl font-bold tracking-tight text-navy md:mt-8 md:text-4xl">
        {current.name}
      </h1>
      <div className="mx-auto mt-3 h-1 w-14 rounded-full bg-champagne" />

      {!child && (
        <div className="mt-7 grid gap-5 md:mt-9 md:grid-cols-2">
          {categoryBanners(parent, browse.setSort).map((b, i) => (
            <PromoBanner
              key={b.title}
              banner={b}
              className={i === 1 ? 'hidden h-60 md:flex' : 'min-h-44 md:h-60'}
            />
          ))}
        </div>
      )}

      {chips.length > 0 && (
        <section className="mt-8">
          {!child && (
            <h2 className="mb-3 text-base font-semibold text-navy md:text-lg">
              Chọn theo danh mục
            </h2>
          )}
          <ChipRow>
            <Link
              to={`/danh-muc/${parent.slug}${suffix}`}
              aria-current={!child ? 'page' : undefined}
              className={chipClass(!child)}
            >
              <LayoutGrid className="size-4" />
              Tất cả
            </Link>
            {chips.map((c) => (
              <Link
                key={c.id}
                to={`/danh-muc/${c.slug}${suffix}`}
                aria-current={c.id === child?.id ? 'page' : undefined}
                className={chipClass(c.id === child?.id)}
              >
                {c.name}
              </Link>
            ))}
          </ChipRow>
        </section>
      )}

      <div id="ket-qua" className="scroll-mt-32 md:scroll-mt-24">
        <CatalogToolbar
          className="mt-6"
          sort={state.sort}
          sorts={SORTS}
          onSort={browse.setSort}
          minPrice={state.minPrice}
          maxPrice={state.maxPrice}
          onPrice={browse.setPrice}
          total={products.data?.total}
        />
        <div className="mt-5">
          <ProductResults
            query={products}
            onPage={browse.setPage}
            empty={
              <NoProducts
                filtered={browse.hasPriceFilter}
                onClear={() => browse.setPrice()}
                text={
                  browse.hasPriceFilter
                    ? 'Không có sản phẩm nào trong khoảng giá này. Bạn thử khoảng giá khác nhé.'
                    : `Chưa có sản phẩm nào trong danh mục ${current.name}. Bạn quay lại sau nhé.`
                }
              />
            }
          />
        </div>
      </div>
    </div>
  );
}
