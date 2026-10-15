# marketplace-service [M]

Shop, danh mục, sản phẩm/SKU, tồn kho, tìm kiếm, giỏ, voucher, checkout, đơn hàng, vận chuyển GHN, trả hàng, đánh giá, theo dõi, chat, thông báo.

- Cổng chạy local: `3002`
- Database riêng: `market_db` (không service nào khác được đọc/ghi)
- Kiểm tra sống: `GET http://localhost:3002/health`

```bash
cp .env.example .env
pnpm --filter @san/marketplace-service dev
```

Tài liệu API (tự sinh): http://localhost:3002/api/market/v1/docs. Danh sách API và quy tắc đã chốt: `docs/api/README.md` mục 2–6.

## Các module

| Thư mục                                         | Việc                                                                                                                                            | Mã                         |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `src/locations`                                 | Tỉnh/huyện/xã lấy từ GHN, lưu trong market_db; job `sync-locations` (pg-boss) chạy 3 giờ sáng mỗi ngày                                          | SHP-03                     |
| `src/uploads`                                   | Tải ảnh vào MinIO: logo, ảnh sản phẩm (bucket công khai `san-public`); ảnh bằng chứng trả hàng (bucket riêng tư, chỉ xem qua API có kiểm quyền) | SHP-01, CAT-02, RET-01     |
| `src/shops`, `src/shop-admin`                   | Shop của tôi: nộp hồ sơ, sửa thông tin, yêu cầu đổi tên/tài khoản ngân hàng; nhận quyết định duyệt và đình chỉ                                  | SHP-01..04                 |
| `src/categories`, `src/products`, `src/catalog` | Danh mục 2 cấp, sản phẩm và phân loại, tồn kho, trang sản phẩm/shop, tìm kiếm                                                                   | CAT-01..04, INV-01, SRC-01 |
| `src/cart`, `src/vouchers`, `src/checkout`      | Giỏ nhiều shop, voucher shop/sàn, xem trước và đặt hàng                                                                                         | CRT-01, VCH-01..03, ORD-01 |
| `src/orders`                                    | Đơn tổng/đơn con, xác nhận, hủy, hết hạn, hoàn tất                                                                                              | ORD-02..05, INV-02         |
| `src/shipping`                                  | Vận đơn GHN (hoặc MÔ PHỎNG), webhook, giao lại/thất bại/hoàn kiện, sự cố                                                                        | SHIP-01..04, COD-01        |
| `src/returns`                                   | Yêu cầu trả hàng, shop trả lời/kiểm hàng, vận đơn trả, job quá hạn, áp quyết định tranh chấp                                                    | RET-01..04                 |

- **Chưa có token GHN**: lần chạy đầu nạp danh sách **mẫu** (3 tỉnh, mã từ 90001, ghi rõ trong log là mô phỏng). Đặt `GHN_TOKEN` trong `.env` rồi khởi động lại hoặc chờ lần đồng bộ sau để thay bằng dữ liệu GHN thật.
- **Hồ sơ shop**: mỗi lần nộp là một phiên bản (`shop_applications`), bản mới thay bản đang chờ (`REPLACED`). Hồ sơ mở shop ghi luôn vào bảng `shops` (giữ chỗ tên shop); yêu cầu đổi tên/tài khoản ngân hàng chỉ áp vào `shops` khi được duyệt.
- Quyết định duyệt đến qua sự kiện `shop_application.decided`; chỉ áp khi đúng phiên bản đang chờ.

## Test

```bash
pnpm --filter @san/marketplace-service test
```

Chạy với database `market_db_test` (tự tạo). GHN, MinIO và khóa ký vé được thay bằng bản giả (`test/helpers.ts`).
