import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { Page } from '@san/shared';
import { API, api } from '@/lib/api';
import type { ProductCardData, ProductSort } from '@/lib/catalog-types';

/** Số thẻ mỗi trang ở trang danh mục, tìm kiếm, trang shop (4 hàng × 5 cột trên màn lớn) */
export const BROWSE_PAGE_SIZE = 20;

export interface ProductSearchParams {
  q?: string;
  categoryId?: string;
  shopId?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: ProductSort;
  page?: number;
  pageSize?: number;
}

/** Tìm và lọc hàng đang bán (GET /products). Đổi trang/bộ lọc vẫn giữ kết quả cũ trong lúc tải. */
export function useProductSearch(params: ProductSearchParams, enabled = true) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: () =>
      api<Page<ProductCardData>>(`${API.market}/products`, {
        query: { pageSize: BROWSE_PAGE_SIZE, ...params },
      }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export const SORT_LABELS: Record<ProductSort, string> = {
  relevance: 'Liên quan',
  newest: 'Mới nhất',
  best_selling: 'Bán chạy',
  price_asc: 'Giá thấp → cao',
  price_desc: 'Giá cao → thấp',
};

const SORTS = Object.keys(SORT_LABELS) as ProductSort[];

function toInt(v: string | null): number | undefined {
  if (!v || !/^\d+$/.test(v)) return undefined;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : undefined;
}

export interface BrowseState {
  sort: ProductSort;
  /** Có `sort` trên đường dẫn hay đang dùng mặc định */
  sortExplicit: boolean;
  minPrice?: number;
  maxPrice?: number;
  page: number;
}

/**
 * Sắp xếp, khoảng giá, trang nằm trên đường dẫn (?sort=&minPrice=&maxPrice=&page=) để bấm
 * quay lại/tiến tới và gửi link cho người khác vẫn đúng. Đổi bộ lọc thì về trang 1.
 */
export function useBrowseState(defaultSort: ProductSort = 'newest') {
  const [params, setParams] = useSearchParams();

  const state = useMemo<BrowseState>(() => {
    const raw = params.get('sort') as ProductSort | null;
    const sortExplicit = !!raw && SORTS.includes(raw);
    return {
      sort: sortExplicit ? raw! : defaultSort,
      sortExplicit,
      minPrice: toInt(params.get('minPrice')),
      maxPrice: toInt(params.get('maxPrice')),
      page: Math.max(1, toInt(params.get('page')) ?? 1),
    };
  }, [params, defaultSort]);

  /** Đổi vài tham số; giá trị undefined/'' là bỏ khỏi đường dẫn. Không đổi trang thì về trang 1. */
  const update = useCallback(
    (patch: Record<string, string | number | undefined>) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined || v === '') next.delete(k);
          else next.set(k, String(v));
        }
        if (!('page' in patch)) next.delete('page');
        if (next.get('page') === '1') next.delete('page');
        return next;
      });
    },
    [setParams],
  );

  const setPage = useCallback(
    (page: number) => {
      update({ page });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [update],
  );

  return {
    state,
    params,
    update,
    setSort: (sort: ProductSort) => update({ sort: sort === defaultSort ? undefined : sort }),
    setPrice: (minPrice?: number, maxPrice?: number) => update({ minPrice, maxPrice }),
    setPage,
    hasPriceFilter: state.minPrice !== undefined || state.maxPrice !== undefined,
  };
}
