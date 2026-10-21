import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CountBadge } from '@/components/count-badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  useNotifications,
  useReadNotifications,
  useUnreadNotifications,
} from '@/hooks/use-notifications';
import type { AppNotification } from '@/lib/chat-types';
import { cn } from '@/lib/utils';
import { NotificationItem } from './notification-item';

const LATEST = 8;

/** Bấm một thông báo: đánh dấu đã đọc rồi mở trang liên quan */
export function useOpenNotification(after?: () => void) {
  const navigate = useNavigate();
  const { one } = useReadNotifications();
  return (n: AppNotification) => {
    if (!n.read) one.mutate(n.id);
    after?.();
    if (n.link) navigate(n.link);
  };
}

/**
 * Chuông thông báo trên header (MSG-02): số chưa đọc, bấm mở khung ~8 thông báo mới nhất.
 * tone: shop = header navy khu mua hàng (icon tròn có chữ); light/dark = header Kênh người bán/Quản trị.
 */
export function NotificationBell({ tone }: { tone: 'shop' | 'light' | 'dark' }) {
  const [open, setOpen] = useState(false);
  const unread = useUnreadNotifications();
  const count = unread.data ?? 0;
  const list = useNotifications({ page: 1, pageSize: LATEST });
  const { all } = useReadNotifications();
  const openItem = useOpenNotification(() => setOpen(false));

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) void list.refetch();
      }}
    >
      <PopoverTrigger
        aria-label={count ? `Thông báo, ${count} chưa đọc` : 'Thông báo'}
        className={cn(
          'group outline-none focus-visible:ring-2 focus-visible:ring-champagne',
          tone === 'shop'
            ? 'flex flex-col items-center gap-1 rounded-xl px-1.5 py-1 text-[11px] font-medium text-white/85 transition hover:text-champagne sm:px-2'
            : 'relative rounded-full p-2 transition',
          tone === 'light' && 'text-ink hover:bg-ivory-200',
          tone === 'dark' && 'text-white hover:bg-white/10',
        )}
      >
        {tone === 'shop' ? (
          <>
            <span className="relative flex size-9 items-center justify-center rounded-full border border-white/25 transition group-hover:border-champagne">
              <Bell className="size-4" />
              <CountBadge count={count} label="thông báo chưa đọc" floating />
            </span>
            <span className="hidden whitespace-nowrap lg:block">Thông báo</span>
          </>
        ) : (
          <>
            <Bell className="size-5" />
            <CountBadge
              count={count}
              label="thông báo chưa đọc"
              floating
              className={cn('-top-0.5 -right-1', tone === 'dark' ? 'ring-charcoal' : 'ring-white')}
            />
          </>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <span className="font-semibold text-navy">Thông báo</span>
          <button
            type="button"
            disabled={!count || all.isPending}
            onClick={() => all.mutate()}
            className="flex items-center gap-1 text-xs font-medium text-champagne-600 transition hover:text-navy disabled:pointer-events-none disabled:opacity-40"
          >
            {all.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CheckCheck className="size-3.5" />
            )}
            Đánh dấu đã đọc tất cả
          </button>
        </div>
        <div className="max-h-[60vh] divide-y overflow-y-auto">
          {list.isPending ? (
            <div className="flex justify-center py-10 text-ink/40">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : list.isError ? (
            <p className="px-4 py-8 text-center text-sm text-ink/60">{list.error.message}</p>
          ) : list.data.items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-ink/60">Bạn chưa có thông báo nào.</p>
          ) : (
            list.data.items.map((n) => (
              <NotificationItem key={n.id} n={n} onOpen={openItem} compact />
            ))
          )}
        </div>
        <Link
          to="/tai-khoan/thong-bao"
          onClick={() => setOpen(false)}
          className="block border-t px-4 py-3 text-center text-sm font-medium text-navy transition hover:bg-ivory-200/70"
        >
          Xem tất cả
        </Link>
      </PopoverContent>
    </Popover>
  );
}
