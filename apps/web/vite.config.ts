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
    rollupOptions: {
      output: {
        // Tách thư viện ra file riêng: trình duyệt giữ cache lâu, code của mình đổi không phải tải lại
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id)) return 'react';
          if (/[\\/](@radix-ui|radix-ui)[\\/]/.test(id)) return 'radix';
          return 'vendor';
        },
      },
    },
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
