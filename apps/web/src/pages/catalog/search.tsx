import { IconBulb, IconSearchOff } from '@tabler/icons-react';
import { Link } from 'react-router';
import { useBrowseState, useProductSearch } from '@/components/catalog/browse-query';
import {
  Breadcrumb,
  CatalogToolbar,
  ChipRow,
  NoProducts,
  ProductResults,
  chipClass,
} from '@/components/catalog/browse-parts';
import { CategoryIcon } from '@/components/catalog/category-icon';
import { findCategory, useCategories } from '@/hooks/use-catalog';
import type { CategoryNode, ProductSort } from '@/lib/catalog-types';

const SORTS: ProductSort[] = ['newest', 'best_selling', 'rating', 'price_asc', 'price_desc'];

/** Gợi ý khi không tìm thấy: các danh mục cấp 1 dạng ô có icon */
function CategorySuggestions({ tree }: { tree: CategoryNode[] }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-8">
      {tree.map((c) => (
        <Link
          key={c.id}
          to={`/danh-muc/${c.slug}`}
          className="group flex flex-col items-center gap-2 rounded-lg border border-ink/10 bg-card px-2 py-4 text-center transition hover:border-navy/40"
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-champagne-50 text-navy">
            <CategoryIcon icon={c.icon} className="size-5" />
          </span>
          <span className="line-clamp-2 text-xs leading-tight font-medium text-charcoal transition group-hover:text-navy">
            {c.name}
          </span>
        </Link>
      ))}
    </div>
  );
}

function NoMatch({ q, tree }: { q: string; tree: CategoryNode[] }) {
  return (
    <div className="px-5 py-12 text-center sm:px-10">
      <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-champagne-50 text-navy">
        <IconSearchOff className="size-7 [stroke-width:1.5]" />
      </span>
      <h2 className="mt-4 text-lg font-bold text-charcoal">Không tìm thấy sản phẩm cho “{q}”</h2>
      <ul className="mx-auto mt-3 max-w-md space-y-1 text-left text-sm text-ink/65">
        <li className="flex gap-2">
          <IconBulb className="mt-0.5 size-4 shrink-0 text-navy [stroke-width:1.75]" />
          Kiểm tra lại chính tả, hoặc gõ ngắn hơn (ví dụ “ip” thay vì “iphone 16 pro max 256”).
        </li>
        <li className="flex gap-2">
          <IconBulb className="mt-0.5 size-4 shrink-0 text-navy [stroke-width:1.75]" />
          Gõ có dấu hay không dấu đều được: “điện thoại” và “dien thoai” cho cùng kết quả.
        </li>
      </ul>
      {tree.length > 0 && (
        <div className="mt-8 text-left">
          <div className="mb-3 text-sm font-bold text-charcoal">Xem theo danh mục</div>
          <CategorySuggestions tree={tree} />
        </div>
      )}
    </div>
  );
}

/** Trang tìm kiếm /tim-kiem?q= (SRC-01): tìm không dấu do máy chủ làm */
export function SearchPage() {
  const categories = useCategories();
  const tree = categories.data ?? [];
  const browse = useBrowseState();
  const q = (browse.params.get('q') ?? '').trim();
  const categorySlug = browse.params.get('category') ?? '';
  const found = categorySlug ? findCategory(categories.data, categorySlug) : null;
  const selected = found ? (found.child ?? found.parent) : null;

  // Có từ khóa thì mặc định "Liên quan"
  const defaultSort: ProductSort = q ? 'relevance' : 'newest';
  const sort = browse.state.sortExplicit ? browse.state.sort : defaultSort;
  const sorts: ProductSort[] = q ? ['relevance', ...SORTS] : SORTS;

  const products = useProductSearch(
    {
      q: q || undefined,
      categoryId: selected?.id,
      sort: sort === 'relevance' && !q ? 'newest' : sort,
      minPrice: browse.state.minPrice,
      maxPrice: browse.state.maxPrice,
      minRating: browse.state.minRating,
      page: browse.state.page,
    },
    // Chờ cây danh mục để không tìm nhầm khi đường dẫn có ?category=
    !categorySlug || !categories.isPending,
  );

  const filtered = !!selected || browse.hasPriceFilter || browse.hasRatingFilter;
  const total = products.data?.total;
  const setCategory = (slug?: string) => browse.update({ category: slug });

  return (
    <div className="mx-auto max-w-7xl px-4 pb-12">
      <Breadcrumb items={[{ label: 'Tìm kiếm' }]} />

      <h1 className="text-xl font-bold tracking-tight text-charcoal md:text-2xl">
        {q ? (
          <>
            Kết quả cho <span className="text-navy">“{q}”</span>
          </>
        ) : (
          'Tất cả sản phẩm'
        )}
      </h1>

      {tree.length > 0 && (
        <section className="mt-4" aria-label="Lọc theo danh mục">
          <ChipRow>
            <button type="button" className={chipClass(!selected)} onClick={() => setCategory()}>
              Tất cả danh mục
            </button>
            {tree.map((c) => {
              const active = found?.parent.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={active}
                  className={chipClass(active)}
                  onClick={() => setCategory(active && !found?.child ? undefined : c.slug)}
                >
                  <CategoryIcon icon={c.icon} className="size-4" />
                  {c.name}
                </button>
              );
            })}
          </ChipRow>
          {found && (found.parent.children?.length ?? 0) > 0 && (
            <div className="mt-3 flex items-center gap-2 overflow-x-auto [scrollbar-width:none] sm:flex-wrap [&::-webkit-scrollbar]:hidden">
              <span className="shrink-0 text-[13px] text-ink/55">{found.parent.name}:</span>
              {found.parent.children!.map((c) => {
                const active = found.child?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCategory(active ? found.parent.slug : c.slug)}
                    className={chipClass(active, 'sm')}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {!(total === 0 && !filtered) && (
        <CatalogToolbar
          className="mt-4"
          sort={sort}
          sorts={sorts}
          onSort={(s) => browse.update({ sort: s === defaultSort ? undefined : s })}
          minPrice={browse.state.minPrice}
          maxPrice={browse.state.maxPrice}
          onPrice={browse.setPrice}
          minRating={browse.state.minRating}
          onRating={browse.setRating}
          total={total}
        />
      )}

      <div className="mt-4">
        <ProductResults
          query={products}
          onPage={browse.setPage}
          empty={
            filtered ? (
              <NoProducts
                filtered
                onClear={() =>
                  browse.update({
                    category: undefined,
                    minPrice: undefined,
                    maxPrice: undefined,
                    minRating: undefined,
                  })
                }
                text={
                  q
                    ? `Không có sản phẩm nào cho “${q}” hợp bộ lọc đang chọn. Bạn thử bỏ bớt bộ lọc nhé.`
                    : undefined
                }
              />
            ) : q ? (
              <NoMatch q={q} tree={tree} />
            ) : (
              <NoProducts filtered={false} onClear={() => undefined} />
            )
          }
        />
      </div>
    </div>
  );
}
