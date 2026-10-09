# user-service [U]

Tài khoản, đăng nhập/JWT, hồ sơ, sổ địa chỉ, role và bộ quyền admin (ACC-*).

- Cổng chạy local: `3001`
- Database riêng: `user_db` (không service nào khác được đọc/ghi)
- Kiểm tra sống: `GET http://localhost:3001/health`

```bash
cp .env.example .env
pnpm --filter @san/user-service dev
```

Tài liệu API (tự sinh): http://localhost:3001/api/user/v1/docs. Danh sách API và quy tắc đã chốt: `docs/api/README.md` mục 2.

## Các module

| Thư mục           | Việc                                                                                     | Mã         |
| ----------------- | ---------------------------------------------------------------------------------------- | ---------- |
| `src/auth`        | Đăng ký, mã 6 số qua email, đăng nhập mật khẩu/Google, quên mật khẩu, khóa công khai JWT | ACC-01..03 |
| `src/sessions`    | Phiên đăng nhập: refresh token trong cookie `san_refresh`, đổi token mỗi lần làm mới     | ACC-02     |
| `src/me`          | Hồ sơ của tôi, đổi mật khẩu                                                              | ACC-03, 04 |
| `src/addresses`   | Sổ địa chỉ; kiểm mã tỉnh/huyện/xã bằng REST của marketplace-service                      | ACC-04     |
| `src/admin-users` | Admin: danh sách người dùng, bộ quyền, khóa/mở khóa (ghi nhật ký)                        | ACC-05     |
| `src/mail`        | Gửi mail (Mailpit khi dev, Gmail SMTP khi demo)                                          |            |
| `src/config.ts`   | Con số cấu hình (hạn mã, số lần sai, thời gian khóa...) đọc từ `.env`                    |            |

`GET /admin/audit-logs` có sẵn từ `packages/nest-common`.

## Admin đầu tiên

Không có màn hình tạo admin. Đăng ký một tài khoản bình thường trên web, rồi chạy:

```bash
pnpm --filter @san/user-service create-admin email@cua-ban.com
```

Tài khoản đó có bộ quyền `SYSTEM` (đăng nhập lại để vé mang quyền mới) và cấp quyền cho người khác ở trang Admin › Người dùng và quyền.

## Đăng nhập Google

Cần ứng dụng OAuth trên Google Cloud Console, điền `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` vào `.env` (không commit). Redirect URI khai trên Google: `http://localhost:5173/api/user/v1/auth/google/callback` (đi qua web để cookie cùng tên miền với web). Xong thì user-service chuyển về `returnTo` trên web; lỗi thì về `/dang-nhap?error=<mã>` (`google_state`, `google_failed`, `google_email_unverified`, `account_locked`).

## Test

```bash
pnpm --filter @san/user-service test
```

Test chạy cả app với database thật: tự tạo database `user_db_test` (tên trong `DATABASE_URL` + `_test`) và chạy migration, nên không đụng dữ liệu dev. Mail, Google và danh sách tỉnh/huyện/xã được thay bằng bản giả (`test/helpers.ts`). Chưa bật PostgreSQL (`pnpm infra:up`) thì các test cần database được bỏ qua; trên CI thì báo lỗi.
