import { useQuery } from '@tanstack/react-query';
import { ImageOff } from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import { API, api } from '@/lib/api';
import type { ProductStatus, SellerProduct } from '@/lib/catalog-types';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Khóa cache của Kênh người bán › Sản phẩm */
export const SELLER_PRODUCTS_KEY = ['seller', 'products'] as const;
export const sellerProductKey = (id: string) => ['seller', 'product', id] as const;
export const stockHistoryKey = (id: string) => ['seller', 'stock-history', id] as const;

export const productPath = (id: string) => `${API.market}/shops/me/products/${id}`;

/** Chi tiết sản phẩm của shop mình (có tồn, lượng đang giữ của từng biến thể) */
export function useSellerProduct(id: string | null | undefined) {
  return useQuery({
    queryKey: sellerProductKey(id ?? ''),
    queryFn: () => api<SellerProduct>(productPath(id!)),
    enabled: !!id,
  });
}

/** "Đen / 256GB"; sản phẩm không phân loại thì "Mặc định" */
export function variantLabel(v: { option1Value: string | null; option2Value: string | null }) {
  return [v.option1Value, v.option2Value].filter(Boolean).join(' / ') || 'Mặc định';
}

/** "290.000đ" hoặc "290.000đ – 1.290.000đ" */
export function priceRange(min: number, max: number) {
  return min === max ? formatMoney(min) : `${formatMoney(min)} – ${formatMoney(max)}`;
}

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return status === 'ACTIVE' ? (
    <StatusBadge tone="success">Đang bán</StatusBadge>
  ) : (
    <StatusBadge tone="neutral">Đã ẩn</StatusBadge>
  );
}

/** Ảnh vuông nền trắng (ảnh sản phẩm là hình vẽ trên nền trắng nên dùng object-contain) */
export function ProductThumb({ url, className }: { url: string | null; className?: string }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white',
        className,
      )}
    >
      {url ? (
        <img src={url} alt="" loading="lazy" className="size-full object-contain p-0.5" />
      ) : (
        <ImageOff className="size-1/3 text-muted-foreground/60" />
      )}
    </span>
  );
}

/** Người làm trong lịch sử tồn: chỉ có userId, nên "Bạn" nếu là mình, còn lại mã rút gọn */
export function actorLabel(createdBy: string, myId: string | undefined) {
  return createdBy === myId ? 'Bạn' : `#${createdBy.slice(0, 8)}`;
}
