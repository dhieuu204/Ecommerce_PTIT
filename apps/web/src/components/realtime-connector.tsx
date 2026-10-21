import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import { CHAT_KEY, CHAT_UNREAD_KEY, appendMessage, conversationKey } from '@/hooks/use-chat';
import { NOTIFICATIONS_KEY, NOTIFICATIONS_UNREAD_KEY } from '@/hooks/use-notifications';
import { API, getAccessToken, refreshSession } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import type { AppNotification, ChatMessage, ChatRole } from '@/lib/chat-types';

/** Đường dẫn Socket.IO của marketplace-service (qua Vite proxy khi dev, Ingress/nginx khi chạy thật) */
const SOCKET_PATH = `${API.market}/socket.io`;

/**
 * Kết nối Socket.IO dùng chung cả web (MSG-01, MSG-02): mở khi đã đăng nhập, đóng khi đăng xuất.
 * - Vé hết hạn lúc kết nối: làm mới vé rồi kết nối lại.
 * - Kết nối lại sau khi rớt mạng: tải lại thông báo và chat qua REST (có thể đã lỡ sự kiện).
 * - Sự kiện tới thì cập nhật dữ liệu TanStack Query đang có, không cần tải lại cả trang.
 * Socket.IO chỉ để báo nhanh; dữ liệu thật vẫn lấy qua REST.
 */
export function RealtimeConnector() {
  const user = useCurrentUser();
  const qc = useQueryClient();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) {
      // Đăng xuất: bỏ dữ liệu thông báo, chat của người trước
      qc.removeQueries({ queryKey: NOTIFICATIONS_KEY });
      qc.removeQueries({ queryKey: CHAT_KEY });
      return;
    }
    let socket: Socket | null = null;
    let closed = false;
    let connectedBefore = false;
    let authRetries = 0;
    const refetchAll = () => {
      void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      void qc.invalidateQueries({ queryKey: CHAT_KEY });
    };

    const listen = (socket: Socket) => {
      socket.on('connect', () => {
        authRetries = 0;
        if (connectedBefore) refetchAll();
        connectedBefore = true;
      });
      socket.on('connect_error', (err: Error) => {
        // Lỗi mạng: Socket.IO tự thử lại. Bị máy chủ từ chối vé: làm mới vé rồi tự kết nối lại (tối đa 3 lần)
        if (socket.active) return;
        const code = (err as Error & { data?: { code?: string } }).data?.code;
        if ((code === 'TOKEN_EXPIRED' || code === 'UNAUTHENTICATED') && authRetries < 3) {
          authRetries += 1;
          void refreshSession().then((ok) => {
            if (ok) socket.connect();
          });
        }
      });
      socket.on('notification:new', (p: { notification: AppNotification; unreadCount: number }) => {
        qc.setQueryData(NOTIFICATIONS_UNREAD_KEY, p.unreadCount);
        void qc.invalidateQueries({ queryKey: [...NOTIFICATIONS_KEY, 'list'] });
      });
      socket.on('chat:message', (p: { conversationId: string; message: ChatMessage }) => {
        appendMessage(qc, p.message);
        void qc.invalidateQueries({ queryKey: conversationKey(p.conversationId) });
        void qc.invalidateQueries({ queryKey: [...CHAT_KEY, 'conversations'] });
        void qc.invalidateQueries({ queryKey: CHAT_UNREAD_KEY });
      });
      // Một bên đã đọc (bên kia: hiện "Đã xem"; chính mình ở tab khác: bớt số chưa đọc)
      socket.on('chat:read', (p: { conversationId: string; role: ChatRole }) => {
        void qc.invalidateQueries({ queryKey: conversationKey(p.conversationId) });
        void qc.invalidateQueries({ queryKey: [...CHAT_KEY, 'conversations'] });
        void qc.invalidateQueries({ queryKey: CHAT_UNREAD_KEY });
        void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      });
    };

    // Tải thư viện Socket.IO riêng (chỉ khi đã đăng nhập) để lần mở web đầu tiên nhẹ hơn
    void import('socket.io-client').then(({ io }) => {
      if (closed) return;
      socket = io({
        path: SOCKET_PATH,
        // Gửi vé mới nhất mỗi lần kết nối (vé đổi sau mỗi lần làm mới)
        auth: (cb) => cb({ token: getAccessToken() }),
        transports: ['websocket', 'polling'],
      });
      listen(socket);
    });

    return () => {
      closed = true;
      socket?.removeAllListeners();
      socket?.disconnect();
    };
  }, [userId, qc]);

  return null;
}
