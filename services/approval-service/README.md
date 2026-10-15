# approval-service [A]

Hồ sơ duyệt shop/vi phạm, kiểm tra đơn theo luật, quyết định tranh chấp, duyệt rút tiền. Chỉ LƯU quyết định; M và P áp dụng.

- Cổng chạy local: `3004`
- Database riêng: `approval_db` (không service nào khác được đọc/ghi)
- Kiểm tra sống: `GET http://localhost:3004/health`

```bash
cp .env.example .env
pnpm --filter @san/approval-service dev
```

Tài liệu API (tự sinh): http://localhost:3004/api/approval/v1/docs. Danh sách API và quy tắc đã chốt: `docs/api/README.md` mục 2–6.

## Các module

| Thư mục                    | Việc                                                                                                                                                                             | Mã             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `src/shop-approvals`       | Nhận `shop_application.submitted` → lưu hồ sơ chờ duyệt (bản cũ đang chờ thành `REPLACED`). Admin `MODERATION` xem, duyệt/từ chối → phát `shop_application.decided`, ghi nhật ký | SHP-02         |
| `src/shop-moderation`      | Admin `MODERATION` đình chỉ/khôi phục shop → phát `shop_suspension.decided`                                                                                                      | SHP-04         |
| `src/order-checks`         | Kiểm tra đơn theo luật (ngưỡng đơn lớn, COD); admin `FINANCE` duyệt/từ chối; quá hạn thì tự hủy, không bao giờ tự duyệt                                                          | RSK-01         |
| `src/disputes`             | Tranh chấp trả hàng (admin `SUPPORT` phân xử) và điều chỉnh ví sau giải ngân (một admin `FINANCE` lập, admin `FINANCE` khác duyệt)                                               | DIS-01, DIS-02 |
| `src/withdrawal-approvals` | Nhận `withdrawal.requested`; admin `FINANCE` duyệt/từ chối yêu cầu rút → phát `withdrawal_approval.decided`                                                                      | FIN-05         |

`GET /admin/audit-logs` có sẵn từ `packages/nest-common`.

Quy tắc chính khi quyết: admin là chủ shop thì không được tự quyết (403 `SELF_APPROVAL_FORBIDDEN`); chỉ quyết được hồ sơ còn `PENDING` (đã quyết → 409 `ALREADY_DECIDED`, shop đã nộp bản mới → 409 `APPLICATION_REPLACED`); đổi trạng thái bằng một lệnh "chỉ khi còn PENDING" nên hai admin bấm cùng lúc chỉ một người quyết được.

## Test

```bash
pnpm --filter @san/approval-service test
```

Test chạy cả app với database thật: tự tạo database `approval_db_test` (tên trong `DATABASE_URL` + `_test`) và chạy migration, nên không đụng dữ liệu dev. Vé đăng nhập được ký bằng khóa tạm trong test (không cần user-service); sự kiện nhận được giả lập bằng cách gọi thẳng handler, sự kiện gửi đi nằm lại trong bảng `outbox_events` để kiểm (`test/helpers.ts`). Chưa bật PostgreSQL (`pnpm infra:up`) thì các test cần database được bỏ qua; trên CI thì báo lỗi.
