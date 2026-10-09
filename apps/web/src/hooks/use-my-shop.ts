import { useQuery } from '@tanstack/react-query';
import { API, api } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import type { MyShop } from '@/lib/types';

export const MY_SHOP_KEY = ['my-shop'] as const;

/** Trạng thái shop của tôi (GET /shops/me); chỉ tải khi đã đăng nhập */
export function useMyShop() {
  const user = useCurrentUser();
  return useQuery({
    queryKey: [...MY_SHOP_KEY, user?.id],
    queryFn: () => api<MyShop>(`${API.market}/shops/me`),
    enabled: !!user,
  });
}
