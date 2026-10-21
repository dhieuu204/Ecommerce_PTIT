import {
  Bell,
  Banknote,
  MessageCircle,
  Package,
  Scale,
  Store,
  Undo2,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { formatDateTime } from '@/lib/format';
import type { AppNotification } from '@/lib/chat-types';
import { cn } from '@/lib/utils';

/** Icon theo nhóm loại thông báo (docs/api: NotificationType) */
function iconFor(type: string): LucideIcon {
  if (type === 'CHAT_MESSAGE') return MessageCircle;
  if (type === 'REFUND_DONE') return Wallet;
  if (type.startsWith('WITHDRAWAL')) return Banknote;
  if (type.startsWith('DISPUTE')) return Scale;
  if (type.includes('RETURN')) return Undo2;
  if (type.startsWith('SHOP_ORDER') || type.startsWith('ORDER')) return Package;
  if (type.startsWith('SHOP')) return Store;
  return Bell;
}

/** Một dòng thông báo: icon, tiêu đề, nội dung, giờ; chưa đọc thì nền nhạt và có chấm */
export function NotificationItem({
  n,
  onOpen,
  compact,
}: {
  n: AppNotification;
  onOpen: (n: AppNotification) => void;
  compact?: boolean;
}) {
  const Icon = iconFor(n.type);
  return (
    <button
      type="button"
      onClick={() => onOpen(n)}
      className={cn(
        'flex w-full gap-3 text-left transition hover:bg-ivory-200/70',
        compact ? 'px-4 py-3' : 'px-4 py-4 md:px-5',
        !n.read && 'bg-champagne-50/60',
      )}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full',
          n.read ? 'bg-ivory text-ink/40' : 'bg-navy text-champagne',
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span
            className={cn(
              'min-w-0 flex-1 text-sm',
              n.read ? 'text-ink/80' : 'font-semibold text-navy',
            )}
          >
            {n.title}
          </span>
          {!n.read && (
            <span
              className="mt-1.5 size-2 shrink-0 rounded-full bg-champagne"
              aria-label="Chưa đọc"
            />
          )}
        </span>
        <span
          className={cn('mt-0.5 block text-xs break-words text-ink/60', compact && 'line-clamp-2')}
        >
          {n.content}
        </span>
        <span className="mt-1 block text-[11px] text-ink/40">{formatDateTime(n.createdAt)}</span>
      </span>
    </button>
  );
}
