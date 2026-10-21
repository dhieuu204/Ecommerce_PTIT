import { MessageSquareText, Store } from 'lucide-react';
import { useSearchParams } from 'react-router';
import type { PublicShop } from '@/lib/catalog-types';
import { cn } from '@/lib/utils';
import { ReviewsSection } from './review-list';

/**
 * Hai tab của trang shop: "Sản phẩm" (phần sản phẩm có sẵn của trang) và "Đánh giá" (mọi đánh giá sản phẩm
 * của shop). Tab đang mở nằm trên đường dẫn (?tab=danh-gia) để gửi link vẫn đúng.
 */
export function ShopTabs({ shop, products }: { shop: PublicShop; products: React.ReactNode }) {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'danh-gia' ? 'reviews' : 'products';
  const open = (next: 'products' | 'reviews') =>
    setParams(next === 'reviews' ? { tab: 'danh-gia' } : {}, { replace: true });

  const tabs = [
    { key: 'products' as const, label: 'Sản phẩm', icon: Store, count: shop.productCount },
    {
      key: 'reviews' as const,
      label: 'Đánh giá',
      icon: MessageSquareText,
      count: shop.ratingCount,
    },
  ];

  return (
    <div className="mt-8">
      <div
        role="tablist"
        aria-label="Nội dung shop"
        className="flex gap-1 border-b border-ivory-200"
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => open(t.key)}
            className={cn(
              '-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition sm:px-5 sm:text-[15px]',
              tab === t.key
                ? 'border-navy text-navy'
                : 'border-transparent text-ink/55 hover:text-navy',
            )}
          >
            <t.icon className={cn('size-4', tab === t.key ? 'text-champagne-600' : 'opacity-70')} />
            {t.label}
            <span
              className={cn(
                'rounded-full px-2 text-xs font-medium',
                tab === t.key ? 'bg-champagne-50 text-champagne-600' : 'bg-ivory-200 text-ink/55',
              )}
            >
              {t.count.toLocaleString('vi-VN')}
            </span>
          </button>
        ))}
      </div>
      {tab === 'products' ? (
        <div className="-mt-6">{products}</div>
      ) : (
        <ReviewsSection source="shop" id={shop.id} className="mt-6" />
      )}
    </div>
  );
}
