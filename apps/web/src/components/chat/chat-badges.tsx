import { CountBadge } from '@/components/count-badge';
import { useChatUnread } from '@/hooks/use-chat';

/** Số tin shop gửi tôi chưa đọc (icon tin nhắn trên header khu mua hàng) */
export function BuyerChatBadge() {
  const unread = useChatUnread();
  return <CountBadge count={unread.data?.buyer} label="tin nhắn chưa đọc" floating />;
}

/** Số tin người mua gửi shop của tôi chưa đọc (menu Kênh người bán) */
export function SellerChatBadge() {
  const unread = useChatUnread();
  return <CountBadge count={unread.data?.shop} label="tin nhắn chưa đọc" />;
}
