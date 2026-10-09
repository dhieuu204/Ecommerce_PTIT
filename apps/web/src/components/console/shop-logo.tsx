import { Store } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Logo shop vuông bo tròn; chưa có ảnh thì hiện icon cửa hàng */
export function ShopLogo({ url, className }: { url: string | null; className?: string }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-ivory text-champagne-600',
        className,
      )}
    >
      {url ? (
        <img src={url} alt="Logo shop" className="size-full object-cover" />
      ) : (
        <Store className="size-1/2" />
      )}
    </span>
  );
}
