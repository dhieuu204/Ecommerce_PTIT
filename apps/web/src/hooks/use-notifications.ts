import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API, api } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import type { AppNotification } from '@/lib/chat-types';
import type { Page } from '@/lib/types';

/** Mọi dữ liệu thông báo nằm dưới khóa này (Socket.IO báo có thông báo mới thì làm mới) */
export const NOTIFICATIONS_KEY = ['notifications'] as const;
export const NOTIFICATIONS_UNREAD_KEY = [...NOTIFICATIONS_KEY, 'unread'] as const;

/** Số thông báo chưa đọc (chuông trên header) */
export function useUnreadNotifications() {
  const user = useCurrentUser();
  return useQuery({
    queryKey: NOTIFICATIONS_UNREAD_KEY,
    queryFn: async () =>
      (await api<{ count: number }>(`${API.market}/me/notifications/unread-count`)).count,
    enabled: !!user,
  });
}

/** Danh sách thông báo, mới nhất trước */
export function useNotifications(opts: { page: number; pageSize: number; unread?: boolean }) {
  const user = useCurrentUser();
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, 'list', opts],
    queryFn: () =>
      api<Page<AppNotification>>(`${API.market}/me/notifications`, {
        query: {
          page: opts.page,
          pageSize: opts.pageSize,
          unread: opts.unread ? 'true' : undefined,
        },
      }),
    enabled: !!user,
    // Giữ trang cũ trong lúc tải trang mới
    placeholderData: keepPreviousData,
  });
}

/** Đánh dấu đã đọc một thông báo hoặc tất cả */
export function useReadNotifications() {
  const qc = useQueryClient();
  const done = (count: number) => {
    qc.setQueryData(NOTIFICATIONS_UNREAD_KEY, count);
    void qc.invalidateQueries({ queryKey: [...NOTIFICATIONS_KEY, 'list'] });
  };
  const one = useMutation({
    mutationFn: (id: string) =>
      api<{ count: number }>(`${API.market}/me/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: (r) => done(r.count),
  });
  const all = useMutation({
    mutationFn: () =>
      api<{ count: number }>(`${API.market}/me/notifications/read-all`, { method: 'POST' }),
    onSuccess: (r) => done(r.count),
  });
  return { one, all };
}
