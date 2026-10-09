import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

/** TanStack Query: giữ dữ liệu đã tải, tự tải lại khi cần. Lỗi 4xx không thử lại. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});
