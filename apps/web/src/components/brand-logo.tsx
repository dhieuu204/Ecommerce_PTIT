import { Link } from 'react-router';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';

/** Logo chữ (chưa có logo hình): khung viền champagne trên nền navy */
export function BrandLogo({ className, to = '/' }: { className?: string; to?: string }) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex shrink-0 items-center rounded-xl border-2 border-champagne px-4 py-1.5 text-sm font-bold tracking-[0.18em] text-champagne transition hover:bg-champagne/10',
        className,
      )}
    >
      {BRAND}
    </Link>
  );
}
