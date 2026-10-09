import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    // File chính gồm React, router, TanStack Query, shadcn (~175 kB gzip); các trang đã tải riêng khi mở
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 5173,
    // Gọi API qua cùng địa chỉ web (cookie đăng nhập cùng tên miền), Vite chuyển tới từng service
    proxy: {
      '/api/user': 'http://localhost:3001',
      '/api/market': 'http://localhost:3002',
      '/api/payment': 'http://localhost:3003',
      '/api/approval': 'http://localhost:3004',
    },
  },
});
