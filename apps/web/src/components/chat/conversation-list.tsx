import { Loader2, MessagesSquare } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { ShopLogo } from '@/components/console/shop-logo';
import { CountBadge } from '@/components/count-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/user-avatar';
import { useConversations } from '@/hooks/use-chat';
import type { ChatRole } from '@/lib/chat-types';
import { cn } from '@/lib/utils';
import { chatTime } from './chat-parts';

/** Cột trái của trang tin nhắn: các cuộc trò chuyện, mới nhất trước */
export function ConversationList({
  role,
  basePath,
  activeId,
}: {
  role: ChatRole;
  basePath: string;
  activeId?: string;
}) {
  const list = useConversations(role);
  if (list.isPending) {
    return (
      <div className="space-y-2 p-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }
  if (list.isError)
    return <LoadError message={list.error.message} onRetry={() => void list.refetch()} />;
  const items = list.data.pages.flatMap((p) => p.items);
  if (items.length === 0) {
    return (
      <EmptyState
        icon={MessagesSquare}
        title="Chưa có cuộc trò chuyện"
        text={
          role === 'BUYER'
            ? 'Bấm “Chat với shop” ở trang sản phẩm, trang shop hoặc đơn hàng để hỏi shop.'
            : 'Khi người mua nhắn cho shop, cuộc trò chuyện sẽ hiện ở đây.'
        }
      />
    );
  }
  return (
    <div className="p-2">
      {items.map((c) => {
        const name = role === 'BUYER' ? c.shop.name : c.buyer.name;
        return (
          <Link
            key={c.id}
            to={`${basePath}/${c.id}`}
            aria-current={c.id === activeId ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 transition',
              c.id === activeId
                ? 'bg-champagne-50 ring-1 ring-champagne/50'
                : 'hover:bg-ivory-200/70',
            )}
          >
            {role === 'BUYER' ? (
              <ShopLogo
                url={c.shop.logoUrl}
                className="size-11 rounded-full border border-ivory-200"
              />
            ) : (
              <UserAvatar name={c.buyer.name} className="size-11" />
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-sm',
                    c.unread ? 'font-semibold text-navy' : 'font-medium text-ink',
                  )}
                >
                  {name}
                </span>
                <span className="shrink-0 text-[11px] text-ink/40">
                  {chatTime(c.lastMessageAt)}
                </span>
              </span>
              <span className="mt-0.5 flex items-center gap-2">
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-xs',
                    c.unread ? 'text-ink' : 'text-ink/55',
                  )}
                >
                  {c.lastMessagePreview ?? 'Chưa có tin nhắn'}
                </span>
                <CountBadge count={c.unread} label="tin chưa đọc" className="ml-0" />
              </span>
            </span>
          </Link>
        );
      })}
      {list.hasNextPage && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 w-full text-ink/60"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          {list.isFetchingNextPage && <Loader2 className="animate-spin" />}
          Xem thêm
        </Button>
      )}
    </div>
  );
}
