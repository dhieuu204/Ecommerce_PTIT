import { ImageOff } from 'lucide-react';
import { Link } from 'react-router';
import { RatingInline } from '@/components/reviews/stars';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProductCardData } from '@/lib/catalog-types';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Phần trăm giảm làm tròn: giá 900.000, giá gốc 1.000.000 → 10 */
export function discountPercent(price: number, originalPrice: number | null | undefined): number {
  if (!originalPrice || originalPrice <= price) return 0;
  return Math.round(((originalPrice - price) / originalPrice) * 100);
}

/** Số đã bán gọn: 1234 → "1,2k" */
export function formatSold(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}k`;
}

/** Nhãn giảm giá góc trên trái của ảnh, như thẻ sản phẩm onewaymobile.vn */
export function DiscountBadge({ percent, className }: { percent: number; className?: string }) {
  if (percent <= 0) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-br-xl rounded-tl-xl bg-navy px-2.5 py-1 text-xs font-bold text-champagne',
        className,
      )}
    >
      -{percent}%
    </span>
  );
}

/**
 * Thẻ sản phẩm dùng chung (trang chủ, danh mục, tìm kiếm, trang shop, sản phẩm liên quan).
 * Ảnh vuông, nhãn -%, các lựa chọn nhóm 1 (ví dụ dung lượng), giá thấp nhất và giá gốc gạch ngang.
 */
export function ProductCard({
  product,
  className,
}: {
  product: ProductCardData;
  className?: string;
}) {
  const percent = discountPercent(product.minPrice, product.originalPrice);
  // Một hàng chip cố định để các thẻ cùng hàng thẳng giá với nhau
  const chips = product.option1Values.slice(0, 2);
  const more = product.option1Values.length - chips.length;

  return (
    <Link
      to={`/san-pham/${product.id}`}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border border-ivory-200 bg-card p-3 transition duration-200 hover:-translate-y-0.5 hover:border-champagne/60 hover:shadow-[0_12px_32px_-12px_rgba(23,37,84,0.25)] sm:p-4',
        className,
      )}
    >
      <DiscountBadge percent={percent} className="absolute left-0 top-0 z-10" />
      <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-xl">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            className="size-full object-contain transition duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-ivory text-ink/30">
            <ImageOff className="size-8" />
          </div>
        )}
        {!product.inStock && (
          <span className="absolute inset-x-0 bottom-2 mx-auto w-fit rounded-full bg-ink/75 px-3 py-1 text-xs font-medium text-white">
            Tạm hết hàng
          </span>
        )}
      </div>

      <h3 className="mt-3 line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-5 text-ink group-hover:text-navy">
        {product.name}
      </h3>

      {/* Điện thoại: 1 chip; màn lớn: 2 chip; còn lại gộp thành "+N" */}
      <div className="mt-2 flex h-5 min-w-0 gap-1.5 overflow-hidden">
        {chips.map((v, i) => (
          <span
            key={v}
            title={v}
            className={cn(
              'truncate rounded-full border px-2 text-[11px] leading-[18px]',
              i === 0
                ? 'max-w-[75%] border-navy bg-navy text-white sm:max-w-[48%]'
                : 'hidden max-w-[48%] border-ivory-200 bg-ivory text-ink/70 sm:inline-block',
            )}
          >
            {v}
          </span>
        ))}
        {product.option1Values.length > 1 && (
          <span className="shrink-0 rounded-full border border-ivory-200 px-1.5 text-[11px] leading-[18px] text-ink/60 sm:hidden">
            +{product.option1Values.length - 1}
          </span>
        )}
        {more > 0 && (
          <span className="hidden shrink-0 rounded-full border border-ivory-200 px-1.5 text-[11px] leading-[18px] text-ink/60 sm:inline-block">
            +{more}
          </span>
        )}
      </div>

      <div className="mt-auto pt-3">
        <div className="truncate text-base font-bold text-navy sm:text-lg">
          {formatMoney(product.minPrice)}
        </div>
        <div className="flex h-4 items-center justify-between gap-2 text-xs leading-4 text-ink/45">
          {percent > 0 ? (
            <span className="truncate line-through">{formatMoney(product.originalPrice!)}</span>
          ) : (
            <span />
          )}
          <RatingInline
            avg={product.ratingAvg}
            count={product.ratingCount}
            className="text-[11px]"
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-dashed border-ivory-200 pt-2 text-[11px] text-ink/55">
          <span className="truncate">{product.shop.name}</span>
          {product.soldCount > 0 && (
            <span className="shrink-0">Đã bán {formatSold(product.soldCount)}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

/** Khung chờ cùng kích thước thẻ sản phẩm */
export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col rounded-2xl border border-ivory-200 bg-card p-3 sm:p-4">
      <Skeleton className="aspect-square w-full rounded-xl" />
      <Skeleton className="mt-3 h-4 w-11/12" />
      <Skeleton className="mt-1.5 h-4 w-2/3" />
      <Skeleton className="mt-3 h-5 w-1/2" />
    </div>
  );
}

/** Lưới thẻ: 2 cột trên điện thoại, 3–5 cột trên màn lớn */
export function ProductGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
        className,
      )}
    >
      {children}
    </div>
  );
}
