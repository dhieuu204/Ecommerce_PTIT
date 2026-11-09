import { IconMessage2, IconPackage } from '@tabler/icons-react';
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
    { key: 'products' as const, label: 'Sản phẩm', icon: IconPackage, count: shop.productCount },
    {
      key: 'reviews' as const,
      label: 'Đánh giá',
      icon: IconMessage2,
      count: shop.ratingCount,
    },
  ];

  return (
    <div className="mt-4">
      <div
        role="tablist"
        aria-label="Nội dung shop"
        className="rounded-2xl bg-card shadow-[0_1px_2px_rgba(15,26,61,0.04)] flex gap-1 overflow-hidden px-2 md:px-3"
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => open(t.key)}
            className={cn(
              'inline-flex items-center gap-2 border-b-2 px-3 py-3.5 text-sm whitespace-nowrap transition sm:px-4',
              tab === t.key
                ? 'border-navy font-semibold text-navy'
                : 'border-transparent text-ink/60 hover:text-navy',
            )}
          >
            <t.icon className="size-[1.125rem] [stroke-width:1.75]" />
            {t.label}
            <span
              className={cn(
                'rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums',
                tab === t.key ? 'bg-champagne-50 text-navy' : 'bg-page text-ink/50',
              )}
            >
              {t.count.toLocaleString('vi-VN')}
            </span>
          </button>
        ))}
      </div>
      {tab === 'products' ? (
        products
      ) : (
        <ReviewsSection source="shop" id={shop.id} className="mt-4" />
      )}
    </div>
  );
}
