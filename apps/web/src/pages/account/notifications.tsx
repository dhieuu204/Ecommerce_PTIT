import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { Pager } from '@/components/console/pager';
import { useOpenNotification } from '@/components/notifications/notification-bell';
import { NotificationItem } from '@/components/notifications/notification-item';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useNotifications,
  useReadNotifications,
  useUnreadNotifications,
} from '@/hooks/use-notifications';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

/** Tài khoản › Thông báo (MSG-02): mọi thông báo của tôi, mới nhất trước, lọc chưa đọc */
export function NotificationsPage() {
  const [params, setParams] = useSearchParams();
  const unreadOnly = params.get('loc') === 'chua-doc';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const list = useNotifications({ page, pageSize: PAGE_SIZE, unread: unreadOnly });
  const unread = useUnreadNotifications();
  const { all } = useReadNotifications();
  const open = useOpenNotification();
  const set = (next: { loc?: string | null; page?: number }) => {
    const p = new URLSearchParams(params);
    if ('loc' in next) {
      if (next.loc) p.set('loc', next.loc);
      else p.delete('loc');
      p.delete('page');
    }
    if (next.page) p.set('page', String(next.page));
    setParams(p, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-ivory-200 bg-card px-4 py-4 md:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-navy">Thông báo</h1>
            <p className="mt-1 text-sm text-ink/60">
              Cập nhật về đơn hàng, trả hàng, shop và tin nhắn. Thông báo quan trọng cũng được gửi
              qua email.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!unread.data || all.isPending}
            onClick={() => all.mutate()}
          >
            {all.isPending ? <Loader2 className="animate-spin" /> : <CheckCheck />}
            Đánh dấu đã đọc tất cả
          </Button>
        </div>
        <div className="mt-3 flex gap-2" role="radiogroup">
          {[
            { value: null, label: 'Tất cả' },
            { value: 'chua-doc', label: `Chưa đọc${unread.data ? ` (${unread.data})` : ''}` },
          ].map((f) => {
            const active = (f.value === 'chua-doc') === unreadOnly;
            return (
              <button
                key={f.label}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => set({ loc: f.value })}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1 text-xs transition',
                  active
                    ? 'border-navy bg-navy text-white'
                    : 'border-ivory-200 bg-card text-ink/70 hover:border-champagne',
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {list.isPending ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : list.isError ? (
        <div className="rounded-2xl border border-ivory-200 bg-card">
          <LoadError message={list.error.message} onRetry={() => void list.refetch()} />
        </div>
      ) : list.data.items.length === 0 ? (
        <div className="rounded-2xl border border-ivory-200 bg-card">
          <EmptyState
            icon={Bell}
            title={unreadOnly ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo nào'}
            text="Khi đơn hàng, trả hàng hay tin nhắn có cập nhật, thông báo sẽ hiện ở đây."
          />
        </div>
      ) : (
        <>
          <div className="divide-y overflow-hidden rounded-2xl border border-ivory-200 bg-card">
            {list.data.items.map((n) => (
              <NotificationItem key={n.id} n={n} onOpen={open} />
            ))}
          </div>
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            total={list.data.total}
            onChange={(p) => set({ page: p })}
          />
        </>
      )}
    </div>
  );
}
