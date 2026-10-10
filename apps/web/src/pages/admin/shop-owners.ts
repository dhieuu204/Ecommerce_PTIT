import { useQuery } from '@tanstack/react-query';
import type { ShopApprovalRow } from '@/lib/admin-types';
import { API, api } from '@/lib/api';
import type { Page } from '@/lib/types';

export interface ShopOwner {
  ownerName: string;
  ownerEmail: string;
  /** Hồ sơ mở shop đã duyệt (để mở trang Duyệt shop › chi tiết) */
  approvalId: string;
}

/**
 * Tên và email chủ shop. marketplace-service chỉ lưu `ownerId`, nên lấy từ hồ sơ mở shop đã duyệt
 * của approval-service (cùng bộ quyền MODERATION): một lần tải tối đa 100 hồ sơ, giữ 5 phút.
 * Không tìm thấy thì giao diện hiện mã chủ shop rút gọn.
 */
export function useShopOwners() {
  return useQuery({
    queryKey: ['admin', 'shop-owners'],
    queryFn: async () => {
      const page = await api<Page<ShopApprovalRow>>(`${API.approval}/admin/shop-approvals`, {
        query: { status: 'APPROVED', type: 'REGISTER', page: 1, pageSize: 100 },
      });
      return new Map<string, ShopOwner>(
        page.items.map((r) => [
          r.shopId,
          { ownerName: r.ownerName, ownerEmail: r.ownerEmail, approvalId: r.id },
        ]),
      );
    },
    staleTime: 5 * 60_000,
  });
}

/** Mã rút gọn: 8 ký tự cuối, ví dụ "#1a2b3c4d" */
export const shortId = (id: string) => `#${id.replace(/-/g, '').slice(-8)}`;
