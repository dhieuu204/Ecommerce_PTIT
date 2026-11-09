import { IconFolderSearch, IconLayoutGrid } from '@tabler/icons-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { findCategory, useCategories } from '@/hooks/use-catalog';
import type { ProductSort } from '@/lib/catalog-types';

const SORTS: ProductSort[] = ['newest', 'best_selling', 'rating', 'price_asc', 'price_desc'];

function CategorySkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-12">
      <Skeleton className="my-3.5 h-5 w-48" />
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-4 h-10 w-full rounded-lg" />
      <Skeleton className="mt-4 h-28 w-full rounded-2xl" />
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
      minRating: state.minRating,
      page: state.page,
    },
    !!current,
  );

  if (categories.isPending) return <CategorySkeleton />;
  if (!found || !current) {
    return (
      <NotFoundBlock
        icon={IconFolderSearch}
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
    <div className="mx-auto max-w-7xl px-4 pb-12">
      <Breadcrumb
        items={
          child
            ? [{ label: parent.name, to: `/danh-muc/${parent.slug}` }, { label: child.name }]
            : [{ label: parent.name }]
        }
      />

      <h1 className="text-xl font-bold tracking-tight text-charcoal md:text-2xl">{current.name}</h1>

      {chips.length > 0 && (
        <ChipRow className="mt-4">
          <Link
            to={`/danh-muc/${parent.slug}${suffix}`}
            aria-current={!child ? 'page' : undefined}
            className={chipClass(!child)}
          >
            <IconLayoutGrid className="size-4 [stroke-width:1.75]" />
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
      )}

      <CatalogToolbar
        className="mt-4"
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
                  ? 'Không có sản phẩm nào hợp bộ lọc giá và đánh giá này. Bạn thử bỏ bớt bộ lọc nhé.'
                  : `Chưa có sản phẩm nào trong danh mục ${current.name}. Bạn quay lại sau nhé.`
              }
            />
          }
        />
      </div>
    </div>
  );
}
