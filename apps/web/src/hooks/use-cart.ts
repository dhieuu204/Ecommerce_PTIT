import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API, api } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import type { Cart } from '@/lib/catalog-types';

export const CART_KEY = ['cart'] as const;

/** Số dòng trong giỏ cho biểu tượng giỏ trên header (GET /cart/count); chỉ khi đã đăng nhập */
export function useCartCount() {
  const user = useCurrentUser();
  return useQuery({
    queryKey: [...CART_KEY, 'count', user?.id],
    queryFn: () => api<{ count: number }>(`${API.market}/cart/count`),
    enabled: !!user,
    select: (d) => d.count,
  });
}

/** Giỏ hàng đầy đủ (GET /cart) */
export function useCart() {
  const user = useCurrentUser();
  return useQuery({
    queryKey: [...CART_KEY, 'full', user?.id],
    queryFn: () => api<Cart>(`${API.market}/cart`),
    enabled: !!user,
  });
}

/**
 * Thêm vào giỏ (POST /cart/items). Lỗi trả về ApiError: NOT_ENOUGH_STOCK (details.available),
 * PRODUCT_UNAVAILABLE, OWN_PRODUCT, CART_FULL. Thành công thì tải lại số trên header và giỏ.
 */
export function useAddToCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { variantId: string; quantity: number }) =>
      api<{ itemId: string; quantity: number; count: number }>(`${API.market}/cart/items`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CART_KEY }),
  });
}
