import { IconBuildingStore, IconPhotoOff, IconStarFilled } from '@tabler/icons-react';
import { Link } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProductCardData } from '@/lib/catalog-types';
import { isColorOption, swatchColor } from '@/lib/color-swatch';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { LikeButton } from './like-button';

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

/** Nhãn giảm giá bo góc màu cam (trang sản phẩm tiêu điểm...) */
export function DiscountBadge({ percent, className }: { percent: number; className?: string }) {
  if (percent <= 0) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-lg bg-navy px-2.5 py-0.5 text-[11px] font-bold text-white',
        className,
      )}
    >
      -{percent}%
    </span>
  );
}

/**
 * Cỡ thẻ: `default` ảnh vuông (điện thoại, giảm giá, trang danh mục); `wide` ảnh ngang (laptop);
 * `compact` gọn hơn: ảnh thấp, chữ nhỏ, không có ô thông tin cuối thẻ (lưới "Hàng mới về").
 */
export type ProductCardVariant = 'default' | 'wide' | 'compact';

const IMAGE_ASPECT: Record<ProductCardVariant, string> = {
  default: 'aspect-square',
  wide: 'aspect-[4/3]',
  compact: 'aspect-[5/4]',
};

/**
 * Cỡ ảnh trong khung (ảnh gốc vuông nền trắng, vật thể chiếm 80%). Khung ngang: ảnh vuông rộng 95% khung,
 * phần nền trắng trên dưới thừa ra bị cắt, nhờ vậy laptop to gần hết bề ngang.
 */
const IMAGE_SIZE: Record<ProductCardVariant, string> = {
  default: 'size-[92%]',
  wide: 'aspect-square w-[95%] max-w-none',
  compact: 'size-[88%]',
};

/**
 * Thẻ sản phẩm dùng chung (trang chủ, danh mục, tìm kiếm, trang shop, sản phẩm liên quan), theo kiểu thẻ
 * của các trang bán lẻ điện thoại lớn: thẻ trắng, nhãn -% dạng tab cam ở góc trên trái, nút tim góc trên
 * phải, ảnh lớn trên nền trắng, tên đậm 2 dòng, chip lựa chọn nhóm 1 (chip đầu tô cam) hoặc chấm màu, giá cam
 * cạnh giá gốc gạch ngang, sao và số đã bán, ô xám nhạt cuối thẻ ghi shop bán và cách thanh toán.
 *
 * Nút tim nằm ngoài link (không lồng nút trong thẻ a); `showLike={false}` khi trang tự có nút tim riêng.
 */
export function ProductCard({
  product,
  variant = 'default',
  showLike = true,
  className,
}: {
  product: ProductCardData;
  variant?: ProductCardVariant;
  showLike?: boolean;
  className?: string;
}) {
  const compact = variant === 'compact';
  const percent = discountPercent(product.minPrice, product.originalPrice);
  // Tối đa 3 chip trên một dòng để các thẻ cùng hàng thẳng giá với nhau; còn lại gộp thành "+N"
  const chips = product.option1Values.slice(0, 3);
  const more = product.option1Values.length - chips.length;
  const hasRating = product.ratingAvg !== null && product.ratingCount > 0;
  const colors = isColorOption(product.option1Name, product.option1Values);

  return (
    <div
      className={cn(
        'group relative rounded-2xl bg-card shadow-[0_1px_2px_rgba(15,26,61,0.04)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_36px_-20px_rgba(15,26,61,0.32)]',
        className,
      )}
    >
      <Link
        to={`/san-pham/${product.id}`}
        className={cn(
          'flex h-full flex-col rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-champagne',
          compact ? 'p-3 pt-5' : 'p-3.5 pt-6',
        )}
      >
        {/* Ảnh lớn trên nền trắng, rê chuột thì phóng nhẹ */}
        <div
          className={cn(
            'relative flex w-full items-center justify-center overflow-hidden',
            IMAGE_ASPECT[variant],
          )}
        >
          {product.image ? (
            <img
              src={product.image}
              alt={product.name}
              loading="lazy"
              decoding="async"
              className={cn(
                'shrink-0 object-contain transition-transform duration-500 ease-out group-hover:scale-[1.05]',
                IMAGE_SIZE[variant],
              )}
            />
          ) : (
            <IconPhotoOff className="size-8 text-ink/30" />
          )}
          {!product.inStock && (
            <span className="absolute inset-x-0 bottom-1 mx-auto w-fit rounded-lg bg-ink/75 px-3 py-1 text-xs font-medium text-white">
              Tạm hết hàng
            </span>
          )}
        </div>

        <h3
          className={cn(
            'font-semibold text-charcoal transition group-hover:text-navy',
            compact
              ? 'mt-2.5 truncate text-[13px]'
              : 'mt-3 line-clamp-2 min-h-10 text-sm leading-5',
          )}
        >
          {product.name}
        </h3>

        {colors ? (
          /* Nhóm 1 là màu: chấm màu (tối đa 5), còn lại gộp "+N" */
          <div
            className="mt-2 flex h-6 items-center gap-1.5"
            aria-label={`Màu: ${product.option1Values.join(', ')}`}
          >
            {product.option1Values.slice(0, 5).map((v) => (
              <span
                key={v}
                title={v}
                className="size-4 rounded-full ring-1 ring-black/10 ring-offset-1 ring-offset-card"
                style={{ backgroundColor: swatchColor(v)! }}
              />
            ))}
            {product.option1Values.length > 5 && (
              <span className="text-[11px] font-medium text-ink/55">
                +{product.option1Values.length - 5}
              </span>
            )}
          </div>
        ) : (
          /* Lựa chọn đầu tô cam (lựa chọn rẻ nhất), các lựa chọn sau viền xám */
          <div className="mt-2 flex h-6 min-w-0 gap-1.5 overflow-hidden">
            {chips.map((v, i) => (
              <span
                key={v}
                title={v}
                className={cn(
                  'truncate rounded-lg border px-2 text-[11px] leading-[22px] font-medium',
                  i === 0
                    ? 'max-w-[55%] shrink-0 border-navy bg-navy text-white'
                    : 'max-w-[40%] border-ink/15 text-ink/65',
                )}
              >
                {v}
              </span>
            ))}
            {more > 0 && (
              <span className="shrink-0 rounded-lg border border-ink/15 px-1.5 text-[11px] leading-[22px] text-ink/50">
                +{more}
              </span>
            )}
          </div>
        )}

        {/* Giá cam và giá gốc gạch ngang cùng một dòng */}
        <div className={cn('flex min-w-0 items-baseline gap-2', compact ? 'mt-2' : 'mt-2.5')}>
          <span
            className={cn(
              'shrink-0 font-bold text-navy',
              compact ? 'text-sm' : 'text-base leading-6',
            )}
          >
            {formatMoney(product.minPrice)}
          </span>
          {percent > 0 && (
            <span className="truncate text-xs text-ink/40 line-through">
              {formatMoney(product.originalPrice!)}
            </span>
          )}
        </div>

        <div className="mt-1.5 flex h-4 items-center gap-2 text-xs text-ink/55">
          {hasRating && (
            <span className="inline-flex items-center gap-1 font-medium text-ink/75">
              <IconStarFilled className="size-3.5 text-champagne" />
              {product.ratingAvg!.toFixed(1)}
            </span>
          )}
          {hasRating && product.soldCount > 0 && (
            <span aria-hidden className="h-3 w-px bg-ink/15" />
          )}
          {product.soldCount > 0 && <span>Đã bán {formatSold(product.soldCount)}</span>}
        </div>

        {/* Ô thông tin cuối thẻ: shop bán và cách thanh toán (đúng cho mọi đơn của sàn) */}
        {!compact && (
          <div className="mt-auto pt-3">
            <div className="space-y-0.5 rounded-lg bg-mist px-2.5 py-2 text-xs leading-[1.125rem] text-ink/70">
              <div className="flex min-w-0 items-center gap-1.5">
                <IconBuildingStore className="size-3.5 shrink-0 text-ink/45" />
                <span className="truncate font-medium text-charcoal">{product.shop.name}</span>
              </div>
              <div className="truncate">
                Thanh toán <b className="font-semibold text-charcoal">VNPay</b> hoặc{' '}
                <b className="font-semibold text-charcoal">COD</b>
              </div>
            </div>
          </div>
        )}
      </Link>

      {/* Nhãn giảm giá dạng tab cam dính góc trên trái thẻ */}
      {percent > 0 && (
        <span className="pointer-events-none absolute top-0 left-0 rounded-tl-2xl rounded-br-xl bg-gradient-to-r from-navy to-header-to px-3 py-1 text-[13px] leading-5 font-bold text-white">
          -{percent}%
        </span>
      )}
      {showLike && (
        <LikeButton
          productId={product.id}
          productName={product.name}
          className="absolute top-1.5 right-1.5"
        />
      )}
    </div>
  );
}

/** Khung chờ cùng kích thước thẻ sản phẩm */
export function ProductCardSkeleton({ variant = 'default' }: { variant?: ProductCardVariant }) {
  const compact = variant === 'compact';
  return (
    <div className={cn('flex flex-col rounded-2xl bg-card', compact ? 'p-3 pt-5' : 'p-3.5 pt-6')}>
      <Skeleton className={cn('w-full rounded-xl', IMAGE_ASPECT[variant])} />
      <Skeleton className="mt-3 h-4 w-11/12" />
      <Skeleton className="mt-2 h-5 w-2/3" />
      <Skeleton className="mt-3 h-5 w-1/2" />
      <Skeleton className="mt-2 h-3.5 w-3/4" />
      {!compact && <Skeleton className="mt-3 h-12 w-full rounded-lg" />}
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
