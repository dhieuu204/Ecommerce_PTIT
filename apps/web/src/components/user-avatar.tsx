import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';

/** P1 chưa có ảnh đại diện: hiện chữ cái đầu họ tên trong vòng tròn navy */
export function UserAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-semibold text-white ring-2 ring-champagne/40',
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
