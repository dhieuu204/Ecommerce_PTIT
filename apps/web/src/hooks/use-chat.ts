import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { API, api } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import type {
  ChatMessage,
  ChatRole,
  ChatUnread,
  Conversation,
  MessagesPage,
} from '@/lib/chat-types';
import type { Page } from '@/lib/types';

/** Mọi dữ liệu chat nằm dưới khóa này */
export const CHAT_KEY = ['chat'] as const;
export const CHAT_UNREAD_KEY = [...CHAT_KEY, 'unread'] as const;
export const conversationKey = (id: string) => [...CHAT_KEY, 'conversation', id] as const;
export const messagesKey = (id: string) => [...CHAT_KEY, 'messages', id] as const;
const CONVERSATIONS_PAGE = 20;

/** Số tin chưa đọc: buyer (tôi là người mua), shop (tin người mua gửi shop của tôi) */
export function useChatUnread() {
  const user = useCurrentUser();
  return useQuery({
    queryKey: CHAT_UNREAD_KEY,
    queryFn: () => api<ChatUnread>(`${API.market}/conversations/unread-count`),
    enabled: !!user,
  });
}

/** Danh sách cuộc trò chuyện theo vai, mới nhất trước, bấm "Xem thêm" để tải trang sau */
export function useConversations(role: ChatRole) {
  return useInfiniteQuery({
    queryKey: [...CHAT_KEY, 'conversations', role],
    queryFn: ({ pageParam }) =>
      api<Page<Conversation>>(`${API.market}/conversations`, {
        query: { role, page: pageParam, pageSize: CONVERSATIONS_PAGE },
      }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
  });
}

export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: conversationKey(id ?? ''),
    queryFn: () => api<Conversation>(`${API.market}/conversations/${id}`),
    enabled: !!id,
  });
}

/**
 * Tin nhắn của một cuộc: trang đầu là các tin mới nhất, "trang sau" là tin cũ hơn (cuộn lên để tải).
 * Ghép lại theo thứ tự thời gian bằng `chronological`.
 */
export function useMessages(id: string | undefined) {
  return useInfiniteQuery({
    queryKey: messagesKey(id ?? ''),
    queryFn: ({ pageParam }) =>
      api<MessagesPage>(`${API.market}/conversations/${id}/messages`, {
        query: { before: pageParam, limit: 30 },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.items[0]?.id : undefined),
    enabled: !!id,
    // Tin mới tới qua Socket.IO; mở lại cuộc thì tải lại cho chắc
    staleTime: 0,
  });
}

export function chronological(data: InfiniteData<MessagesPage> | undefined): ChatMessage[] {
  if (!data) return [];
  return [...data.pages].reverse().flatMap((p) => p.items);
}

/** Thêm một tin (vừa gửi hoặc nhận qua Socket.IO) vào cuối danh sách đang có, bỏ qua nếu đã có */
export function appendMessage(qc: ReturnType<typeof useQueryClient>, message: ChatMessage) {
  qc.setQueryData<InfiniteData<MessagesPage>>(messagesKey(message.conversationId), (data) => {
    if (!data) return data;
    if (data.pages.some((p) => p.items.some((m) => m.id === message.id))) return data;
    const [first, ...rest] = data.pages;
    if (!first) return data;
    return { ...data, pages: [{ ...first, items: [...first.items, message] }, ...rest] };
  });
}

/** Mở (hoặc lấy lại) cuộc trò chuyện với một shop */
export function openConversation(shopId: string) {
  return api<Conversation>(`${API.market}/conversations`, { method: 'POST', body: { shopId } });
}
