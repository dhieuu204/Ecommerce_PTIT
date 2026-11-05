import { Link } from 'react-router';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';

type Tone = 'light' | 'dark' | 'inverse';

/**
 * Biểu tượng HK Shop: túi mua sắm viền nét bo góc, quai tròn, chữ HK bên trong (vẽ bằng nét để không phụ
 * thuộc font). `light`: nét trắng trên nền cam; `dark` / `inverse`: nét cam trên nền sáng / nền than.
 * Bản tĩnh cùng hình ở `public/favicon.svg`.
 */
export function BrandMark({ className, tone = 'dark' }: { className?: string; tone?: Tone }) {
  return (
    <svg
      viewBox="0 0 40 40"
      aria-hidden
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(tone === 'light' ? 'stroke-white' : 'stroke-navy', className)}
    >
      {/* Quai túi */}
      <path d="M14 12.5V10a6 6 0 0 1 12 0v2.5" strokeWidth="2.6" />
      {/* Thân túi */}
      <rect x="5.3" y="12.5" width="29.4" height="25" rx="6.5" strokeWidth="2.6" />
      {/* Chữ HK */}
      <path
        d="M12 19.5v11M18 19.5v11M12 25h6M22.2 19.5v11M28.2 19.5l-6 5.7M24.3 23.3l4 7.2"
        strokeWidth="2.9"
      />
    </svg>
  );
}

/** Logo đầy đủ: biểu tượng + chữ "HK Shop", bấm về trang chủ. */
export function BrandLogo({
  className,
  to = '/',
  tone = 'light',
}: {
  className?: string;
  to?: string;
  tone?: Tone;
}) {
  return (
    <Link
      to={to}
      aria-label={`${BRAND} - trang chủ`}
      className={cn(
        'group inline-flex shrink-0 items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-champagne',
        className,
      )}
    >
      <BrandMark
        tone={tone}
        // Nhích lên: quai túi làm thân túi (chỗ chữ HK) thấp hơn tâm khung, nhích để thân túi thẳng hàng với chữ
        className="size-8 -translate-y-[3px] transition-transform duration-300 group-hover:-rotate-6 md:size-10 md:-translate-y-1"
      />
      <span className="text-lg leading-none font-bold tracking-tight whitespace-nowrap md:text-[1.4rem]">
        <span className={tone === 'light' ? 'text-white' : 'text-navy'}>HK</span>{' '}
        <span className={tone === 'dark' ? 'text-charcoal' : 'text-white'}>Shop</span>
      </span>
    </Link>
  );
}
