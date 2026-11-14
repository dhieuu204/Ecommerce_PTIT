import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import type { MyAffiliate } from '@/lib/affiliate-types';
import { recordAffiliateClick } from '@/lib/affiliate-link';
import { API, api } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';

export const MY_AFFILIATE_KEY = ['my-affiliate'] as const;

/** Hồ sơ cộng tác viên của tôi (GET /affiliates/me); chỉ tải khi đã đăng nhập */
export function useMyAffiliate() {
  const user = useCurrentUser();
  return useQuery({
    queryKey: [...MY_AFFILIATE_KEY, user?.id],
    queryFn: () => api<MyAffiliate>(`${API.market}/affiliates/me`),
    enabled: !!user,
  });
}

/**
 * Trang sản phẩm/shop: có `?aff=` thì ghi lượt bấm rồi bỏ tham số khỏi địa chỉ (chia sẻ lại link không
 * kéo theo mã của người khác, tải lại trang không ghi thêm lượt)
 */
export function useAffiliateLanding(target: { productId: string } | { shopId: string } | null) {
  const [params, setParams] = useSearchParams();
  const code = params.get('aff');
  const id = target ? ('productId' in target ? target.productId : target.shopId) : null;
  useEffect(() => {
    if (!code || !target) return;
    void recordAffiliateClick(code, target);
    const next = new URLSearchParams(params);
    next.delete('aff');
    setParams(next, { replace: true });
    // chỉ chạy khi mã hoặc trang đổi
  }, [code, id]);
}
