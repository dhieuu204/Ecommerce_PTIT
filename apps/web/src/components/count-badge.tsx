import { cn } from '@/lib/utils';

/**
 * Chấm số chưa đọc (thông báo, tin nhắn). `floating`: nằm góc trên phải của icon tròn trên header;
 * không có thì nằm cùng dòng (menu trái). 0 thì không hiện.
 */
export function CountBadge({
  count,
  label,
  floating,
  className,
}: {
  count: number | undefined;
  /** Câu đọc cho trình đọc màn hình, ví dụ "tin nhắn chưa đọc" */
  label: string;
  floating?: boolean;
  className?: string;
}) {
  if (!count) return null;
  return (
    <span
      aria-label={`${count} ${label}`}
      className={cn(
        'flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] leading-none font-bold',
        floating
          ? 'absolute -top-1.5 -right-2 bg-champagne text-navy ring-2 ring-navy'
          : 'ml-2 inline-flex bg-navy text-white',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
