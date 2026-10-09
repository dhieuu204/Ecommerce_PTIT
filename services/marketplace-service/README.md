# marketplace-service [M]

Shop, danh mục, sản phẩm/SKU, tồn kho, tìm kiếm, giỏ, voucher, checkout, đơn hàng, vận chuyển GHN, trả hàng, đánh giá, theo dõi, chat, thông báo.

- Cổng chạy local: `3002`
- Database riêng: `market_db` (không service nào khác được đọc/ghi)
- Kiểm tra sống: `GET http://localhost:3002/health`

```bash
cp .env.example .env
pnpm --filter @san/marketplace-service dev
```

Tài liệu API (tự sinh): http://localhost:3002/api/market/v1/docs. Danh sách API và quy tắc đã chốt: `docs/api/README.md` mục 2.

## Các module (P1)

| Thư mục         | Việc                                                                                                   | Mã         |
| --------------- | ------------------------------------------------------------------------------------------------------ | ---------- |
| `src/locations` | Tỉnh/huyện/xã lấy từ GHN, lưu trong market_db; job `sync-locations` (pg-boss) chạy 3 giờ sáng mỗi ngày | SHP-03     |
| `src/uploads`   | Tải logo shop vào MinIO (bucket công khai `san-public`, thư mục `shop-logos/<userId>/`)                | SHP-01     |
| `src/shops`     | Shop của tôi: nộp hồ sơ, sửa thông tin, yêu cầu đổi tên/tài khoản ngân hàng; nhận quyết định duyệt     | SHP-01..03 |

- **Chưa có token GHN**: lần chạy đầu nạp danh sách **mẫu** (3 tỉnh, mã từ 90001, ghi rõ trong log là mô phỏng). Đặt `GHN_TOKEN` trong `.env` rồi khởi động lại hoặc chờ lần đồng bộ sau để thay bằng dữ liệu GHN thật.
- **Hồ sơ shop**: mỗi lần nộp là một phiên bản (`shop_applications`), bản mới thay bản đang chờ (`REPLACED`). Hồ sơ mở shop ghi luôn vào bảng `shops` (giữ chỗ tên shop); yêu cầu đổi tên/tài khoản ngân hàng chỉ áp vào `shops` khi được duyệt.
- Quyết định duyệt đến qua sự kiện `shop_application.decided`; chỉ áp khi đúng phiên bản đang chờ.

## Test

```bash
pnpm --filter @san/marketplace-service test
```

Chạy với database `market_db_test` (tự tạo). GHN, MinIO và khóa ký vé được thay bằng bản giả (`test/helpers.ts`).
