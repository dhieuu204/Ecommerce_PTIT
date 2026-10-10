import { useQuery } from '@tanstack/react-query';
import { API, api } from '@/lib/api';
import type { CategoryNode } from '@/lib/catalog-types';

export const CATEGORIES_KEY = ['categories'] as const;

/** Cây danh mục công khai (GET /categories), dùng cho header, trang chủ, trang danh mục, form sản phẩm */
export function useCategories() {
  return useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: () => api<CategoryNode[]>(`${API.market}/categories`),
    staleTime: 5 * 60_000,
  });
}

/** Tìm danh mục theo slug trong cây: trả cấp 1 và (nếu là cấp 2) mục con */
export function findCategory(
  tree: CategoryNode[] | undefined,
  slug: string,
): { parent: CategoryNode; child: CategoryNode | null } | null {
  for (const parent of tree ?? []) {
    if (parent.slug === slug) return { parent, child: null };
    const child = parent.children?.find((c) => c.slug === slug);
    if (child) return { parent, child };
  }
  return null;
}
