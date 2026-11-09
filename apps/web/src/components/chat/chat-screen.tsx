import { IconMessages } from '@tabler/icons-react';
import { useParams } from 'react-router';
import { EmptyState } from '@/components/console/empty-state';
import type { ChatRole } from '@/lib/chat-types';
import { cn } from '@/lib/utils';
import { ChatWindow } from './chat-window';
import { ConversationList } from './conversation-list';

/**
 * Trang tin nhắn (MSG-01): máy tính 2 cột (danh sách | khung chat), điện thoại 1 cột
 * (chưa chọn cuộc thì hiện danh sách, chọn rồi thì hiện khung chat có nút quay lại).
 */
export function ChatScreen({
  role,
  basePath,
  className,
}: {
  role: ChatRole;
  basePath: string;
  /** Chiều cao khung theo khu (header khu mua hàng và Kênh người bán cao khác nhau) */
  className?: string;
}) {
  const { conversationId } = useParams();
  return (
    <div
      className={cn(
        'grid min-h-0 overflow-hidden rounded-2xl bg-card shadow-[0_1px_2px_rgba(15,26,61,0.04)] lg:grid-cols-[20rem_minmax(0,1fr)]',
        className,
      )}
    >
      <aside
        className={cn(
          'min-h-0 flex-col border-r border-ink/[0.06] lg:flex',
          conversationId ? 'hidden' : 'flex',
        )}
      >
        <div className="border-b px-4 py-3 font-bold tracking-tight text-charcoal">Tin nhắn</div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ConversationList role={role} basePath={basePath} activeId={conversationId} />
        </div>
      </aside>
      <section className={cn('min-h-0', conversationId ? 'block' : 'hidden lg:block')}>
        {conversationId ? (
          <ChatWindow key={conversationId} conversationId={conversationId} basePath={basePath} />
        ) : (
          <div className="flex h-full items-center justify-center bg-ivory/70">
            <EmptyState icon={IconMessages} title="Chọn một cuộc trò chuyện" />
          </div>
        )}
      </section>
    </div>
  );
}
