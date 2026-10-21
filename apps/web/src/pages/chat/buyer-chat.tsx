import { ChatScreen } from '@/components/chat/chat-screen';

/** /tin-nhan, /tin-nhan/:conversationId: người mua chat với các shop (MSG-01) */
export function BuyerChatPage() {
  return (
    <div className="mx-auto max-w-7xl px-0 py-0 sm:px-4 sm:py-6">
      <ChatScreen
        role="BUYER"
        basePath="/tin-nhan"
        className="h-[calc(100dvh-6.5rem)] rounded-none border-x-0 sm:h-[calc(100dvh-12rem)] sm:min-h-[28rem] sm:rounded-2xl sm:border-x"
      />
    </div>
  );
}
