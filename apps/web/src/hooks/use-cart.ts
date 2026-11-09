import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { API, api } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { toastCartError } from '@/lib/cart-errors';
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

/**
 * Mua ngay: đưa sản phẩm vào giỏ rồi sang thẳng trang đặt hàng, chỉ với đúng sản phẩm này.
 * Dòng đã có sẵn trong giỏ thì API cộng dồn số lượng, nên đặt lại đúng số khách vừa chọn
 * (khách vẫn đổi được ở trang đặt hàng).
 */
export function useBuyNow() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async (body: { variantId: string; quantity: number }) => {
      const url = `${API.market}/cart/items`;
      const added = await api<{ itemId: string; quantity: number }>(url, { method: 'POST', body });
      if (added.quantity !== body.quantity) {
        await api(`${url}/${added.itemId}`, {
          method: 'PATCH',
          body: { quantity: body.quantity },
        });
      }
      return added.itemId;
    },
    onSuccess: (itemId) => {
      void qc.invalidateQueries({ queryKey: CART_KEY });
      navigate(`/dat-hang?items=${itemId}`);
    },
    onError: toastCartError,
  });
}
