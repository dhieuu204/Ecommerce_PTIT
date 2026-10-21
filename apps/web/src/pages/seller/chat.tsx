import { ChatScreen } from '@/components/chat/chat-screen';

/** Kênh người bán › Tin nhắn (MSG-01): trả lời người mua */
export function SellerChatPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <ChatScreen
        role="SHOP"
        basePath="/kenh-nguoi-ban/tin-nhan"
        className="h-[calc(100dvh-8.5rem)] min-h-[26rem]"
      />
    </div>
  );
}
