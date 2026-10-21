import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { RealtimeConnector } from '@/components/realtime-connector';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { refreshSession } from '@/lib/api';
import { queryClient } from '@/lib/query';
import { router } from '@/router';

export function App() {
  // Mở trang: thử lấy vé bằng cookie refresh (giữ đăng nhập sau khi tải lại trang, sau đăng nhập Google)
  useEffect(() => {
    void refreshSession();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeConnector />
      <TooltipProvider>
        <RouterProvider router={router} />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
