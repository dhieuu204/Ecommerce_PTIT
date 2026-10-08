// Đọc file .env của service vào process.env. Phải là import đầu tiên trong main.ts.
try {
  process.loadEnvFile();
} catch {
  // Không có .env (ví dụ chạy trong Kubernetes, biến môi trường đã được đặt sẵn)
}
