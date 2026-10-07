# user-service [U]

Tài khoản, đăng nhập/JWT, hồ sơ, sổ địa chỉ, role và bộ quyền admin (ACC-*).

- Cổng chạy local: `3001`
- Database riêng: `user_db` (không service nào khác được đọc/ghi)
- Kiểm tra sống: `GET http://localhost:3001/health`

```bash
cp .env.example .env
pnpm --filter @san/user-service dev
```
