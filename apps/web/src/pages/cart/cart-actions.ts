import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CART_KEY } from '@/hooks/use-cart';
import { API, api } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { toastCartError } from '@/lib/cart-errors';
import type { Cart, CartItem } from '@/lib/catalog-types';

const WRITE_KEY = ['cart-write'] as const;

/** Tính lại tình trạng số lượng và tổng tiền sau khi sửa tạm trên máy (trước khi máy chủ trả lời) */
function recompute(cart: Cart): Cart {
  let selectedCount = 0;
  let selectedTotal = 0;
  const shops = cart.shops.map((g) => ({
    ...g,
    items: g.items.map((it) => {
      let state = it.state;
      if (state === 'OK' || state === 'NOT_ENOUGH_STOCK')
        state = it.quantity > it.available ? 'NOT_ENOUGH_STOCK' : 'OK';
      if (it.selected && state === 'OK') {
        selectedCount += 1;
        selectedTotal += it.price * it.quantity;
      }
      return state === it.state ? it : { ...it, state };
    }),
  }));
  return { shops, selectedCount, selectedTotal };
}

function mapItems(cart: Cart, ids: string[], patch: (it: CartItem) => CartItem): Cart {
  const set = new Set(ids);
  return recompute({
    ...cart,
    shops: cart.shops.map((g) => ({
      ...g,
      items: g.items.map((it) => (set.has(it.id) ? patch(it) : it)),
    })),
  });
}

function dropItems(cart: Cart, ids: string[]): Cart {
  const set = new Set(ids);
  return recompute({
    ...cart,
    shops: cart.shops
      .map((g) => ({ ...g, items: g.items.filter((it) => !set.has(it.id)) }))
      .filter((g) => g.items.length > 0),
  });
}

/**
 * Các thao tác sửa giỏ. API trả về cả giỏ mới nên ghi thẳng vào bộ nhớ đệm (không tải lại).
 * - Sửa tạm trên máy trước (chọn, số lượng, xóa) cho giao diện phản hồi ngay.
 * - Nhiều thao tác liên tiếp: chỉ lấy kết quả của thao tác cuối (máy chủ xử lý lần lượt nên
 *   kết quả cuối đã gồm mọi thay đổi), tránh giỏ nhảy qua lại.
 * - Lỗi: báo theo mã rồi tải lại giỏ từ máy chủ.
 */
export function useCartActions() {
  const qc = useQueryClient();
  const user = useCurrentUser();
  const fullKey = [...CART_KEY, 'full', user?.id];

  function useCartWrite<V>(
    request: (v: V) => Promise<Cart>,
    optimistic?: (cart: Cart, v: V) => Cart,
    onDone?: (v: V) => void,
  ) {
    return useMutation({
      mutationKey: WRITE_KEY,
      mutationFn: request,
      onMutate: async (v: V) => {
        if (!optimistic) return;
        await qc.cancelQueries({ queryKey: fullKey });
        const prev = qc.getQueryData<Cart>(fullKey);
        if (prev) qc.setQueryData(fullKey, optimistic(prev, v));
      },
      onSuccess: (cart, v) => {
        // Thao tác này còn đang tính là "đang chạy" nên <= 1 nghĩa là không còn thao tác nào khác
        if (qc.isMutating({ mutationKey: WRITE_KEY }) <= 1) qc.setQueryData(fullKey, cart);
        void qc.invalidateQueries({ queryKey: [...CART_KEY, 'count'] });
        onDone?.(v);
      },
      onError: (error) => {
        toastCartError(error);
        void qc.invalidateQueries({ queryKey: CART_KEY });
      },
    });
  }

  const url = `${API.market}/cart`;
  return { useCartWrite, url, mapItems, dropItems };
}

/** Một dòng giỏ: đổi số lượng, đổi phân loại, xóa */
export function useCartItemActions(itemId: string) {
  const { useCartWrite, url, mapItems, dropItems } = useCartActions();
  const setQuantity = useCartWrite(
    (quantity: number) =>
      api<Cart>(`${url}/items/${itemId}`, { method: 'PATCH', body: { quantity } }),
    (cart, quantity) => mapItems(cart, [itemId], (it) => ({ ...it, quantity })),
  );
  const setVariant = useCartWrite((variantId: string) =>
    api<Cart>(`${url}/items/${itemId}`, { method: 'PATCH', body: { variantId } }),
  );
  const remove = useCartWrite(
    () => api<Cart>(`${url}/items/${itemId}`, { method: 'DELETE' }),
    (cart) => dropItems(cart, [itemId]),
  );
  return { setQuantity, setVariant, remove };
}

/** Nhiều dòng: chọn/bỏ chọn, xóa nhiều */
export function useCartBulkActions() {
  const { useCartWrite, url, mapItems, dropItems } = useCartActions();
  const select = useCartWrite(
    (v: { itemIds: string[]; selected: boolean }) =>
      api<Cart>(`${url}/selection`, { method: 'POST', body: v }),
    (cart, v) => mapItems(cart, v.itemIds, (it) => ({ ...it, selected: v.selected })),
  );
  const removeMany = useCartWrite(
    (itemIds: string[]) => api<Cart>(`${url}/items/remove`, { method: 'POST', body: { itemIds } }),
    (cart, itemIds) => dropItems(cart, itemIds),
  );
  return { select, removeMany };
}
