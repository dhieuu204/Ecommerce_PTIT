# Quyết định mới chốt: bảng dữ liệu (ERD) (08/10/2026, 16:16–16:40)

File này chỉ gồm những gì chốt ở vòng **ERD**. Các vòng trước nằm ở `02` đến `06`. Cột "Sửa ở đâu trong kế hoạch" chỉ chỗ tương ứng trong `Ke-hoach-san-TMDT-day-du.md`.

Kết quả đi kèm (trong repo `san-tmdt`):
- `docs/erd/README.md`: khung bảng cả dự án (P1–P6), quy ước bảng/cột, cách tạo migration.
- Sơ đồ `so-do/09-erd-u-user-service`, `10-erd-m-marketplace-service`, `11-erd-p-payment-service`, `12-erd-a-approval-service` (màu theo phase, ô xanh lá là quy tắc đã chốt).
- Bảng P1 đủ cột: `services/*/prisma/schema.prisma` và migration `*_p1_init`, đã chạy thử trên PostgreSQL 16.

## 1. Cách làm ERD

| # | Chủ đề | Quyết định | Sửa ở đâu trong kế hoạch |
| --- | --- | --- | --- |
| 1 | Chốt bảng một lần hay theo phase | **Khung cả dự án + chi tiết P1.** Tên bảng, quan hệ, cột chính của P1–P6 vẽ một lần; đủ cột chỉ viết cho phase sắp code. Thêm bảng/cột về sau bằng migration của Prisma. | §6 (dòng ERD-U/M/P/A) |

## 2. Các điểm dữ liệu (8 điểm, đều theo đề xuất)

| # | Chủ đề | Quyết định | Sửa ở đâu trong kế hoạch |
| --- | --- | --- | --- |
| 1 | Danh mục | **2 cấp.** Cấp 1 ở thanh danh mục, cấp 2 trong mega menu; sản phẩm gắn vào cấp 2. | §5.2 CAT-01 |
| 2 | Biến thể | **Tối đa 2 nhóm, mỗi nhóm tối đa 10 lựa chọn**; mỗi tổ hợp là một SKU có giá và tồn riêng. | §5.2 CAT-03 |
| 3 | Ảnh sản phẩm | **Bộ ảnh chung tối đa 9 ảnh + 1 ảnh tùy chọn cho mỗi lựa chọn của nhóm 1** (thường là Màu); bấm màu thì đổi ảnh. | §5.2 CAT-02, CAT-04 |
| 4 | Yêu thích/theo dõi | **Theo dõi shop + thả tim sản phẩm** (xem lại trong "Đã thích"). Nút tim quay lại thẻ sản phẩm trên giao diện (P6). | §5.8 ENG-03; sơ đồ 07 (thêm nút tim) |
| 5 | Đánh giá | **Mỗi dòng hàng 1 lần**, 1–5 sao, chữ, tối đa 5 ảnh, trong 30 ngày sau khi đơn hoàn tất, **được sửa 1 lần**. Điểm shop = trung bình sao các sản phẩm. | §5.8 ENG-01, ENG-02 |
| 6 | Chat | **Chữ, ảnh (tối đa 5 MB), thẻ sản phẩm/đơn hàng**; mỗi cặp buyer–shop một cuộc trò chuyện. | §5.8 MSG-01 |
| 7 | Mã đơn | **Ngày đặt + 6 ký tự ngẫu nhiên**, ví dụ `261008ABC123`; đơn con thêm đuôi `-1`, `-2`. | §5.3 ORD-01, ORD-02 |
| 8 | Sổ tiền seller | **Mỗi biến động một dòng** (`wallet_transactions`: cộng/trừ ngăn đang giữ, khả dụng hay đang khóa, vì đơn/rút nào) **+ số dư lưu sẵn** (`seller_wallets`); test kiểm tổng các dòng khớp số dư. | §5.7 FIN-01 |

## 3. Rút gọn theo yêu cầu của bạn (16:35): bảng vừa đủ, tên dễ hiểu

Từ 79 bảng xuống **61 bảng** (trong đó 12 bảng kỹ thuật, mỗi service 3 bảng giống nhau). Tính năng không đổi, chỉ gộp chỗ tách quá kỹ và đổi tên khó hiểu.

| Trước | Sau | Vì sao |
| --- | --- | --- |
| `user_identities` (liên kết Google) | cột `users.google_id` | Mỗi tài khoản chỉ gộp 1 Google |
| `user_permissions` | cột `users.permissions` | Chỉ là danh sách tối đa 4 bộ quyền |
| `refresh_tokens` | `sessions` | Dễ hiểu hơn: phiên đăng nhập |
| `ghn_provinces`, `ghn_districts`, `ghn_wards` | `provinces`, `districts`, `wards` | Bỏ tiền tố, mã vẫn theo GHN |
| `uploaded_files`, `idempotency_keys` | bỏ | Kiểm file theo thư mục của người tải; chống gửi lặp bằng cột `request_key` của hồ sơ |
| `skus`, `product_options`, `product_option_values` | `product_variants` + cột `option1_name`, `option2_name` ở `products` | Tối đa 2 nhóm biến thể nên không cần bảng riêng |
| `stock_movements`, `stock_reservations` | `stock_history` + cột `reserved` ở `product_variants` | Giữ lịch sử tồn, bỏ bảng giữ tồn riêng |
| `checkout_sessions`, `order_groups`, `order_status_history`, `cancel_requests` | `checkouts`, `orders`, `order_history`, cột `cancel_reason` ở `shop_orders` | Tên quen thuộc; hủy đơn chỉ cần vài cột |
| `shipment_events` | `shipment_history` | Cùng cách đặt tên với `order_history` |
| `return_requests`, `return_evidence`, `review_images` | `returns`; ảnh thành cột danh sách ảnh | Bảng con chỉ chứa ảnh |
| `payments` + `payment_attempts` + `gateway_callbacks` | `payments` (mỗi lần thanh toán 1 dòng) | Gộp 3 bảng thành 1 |
| `allocations`, `shop_order_finances` | `seller_earnings` | Tiền seller nhận từ mỗi đơn, một bảng |
| `seller_accounts`, `ledger_entries` | `seller_wallets`, `wallet_transactions` | Tên "ví" dễ trình bày hơn "sổ cái" |
| `payouts`, `shop_bank_accounts`, `platform_entries`, `gateway_reconciliation_runs` | bỏ (gộp cột vào `withdrawals`, `refunds`) | Thông tin chi trả nằm luôn trong yêu cầu rút |
| `fee_configs`, `policy_configs`, `risk_rule_configs` | `settings` ở mỗi service | Một tên chung cho cấu hình |
| `shop_reviews` | `shop_approvals` | Tránh nhầm với đánh giá sản phẩm (`reviews`) |
| `moderation_cases` + `violation_reports` | `violations` | Một bảng cho báo cáo vi phạm và đình chỉ |
| `dispute_statements`, `finance_exceptions` | gộp vào `disputes` | Lời hai bên và điều chỉnh tiền là cột của tranh chấp |
| `withdrawal_reviews` | `withdrawal_approvals` | Cùng cách đặt tên với `shop_approvals` |

Đổi theo: tên sự kiện thành `shop_application.submitted` và `shop_application.decided`; API duyệt shop thành `/admin/shop-approvals`; loại hồ sơ `REGISTER`/`CHANGE`, hồ sơ bị thay thế `REPLACED`. Đã sửa trong `docs/api` và `packages/shared`.

## 4. Mặc định kỹ thuật Claude đặt (bạn có thể đổi)

| Chủ đề | Mặc định | Sửa ở đâu trong kế hoạch |
| --- | --- | --- |
| Tên shop | Không trùng giữa các shop. | §5.1 SHP-01 |
| Hồ sơ shop | Bảng `shops` giữ thông tin **đang dùng** (trống tới khi duyệt lần đầu); mỗi lần nộp lưu ở `shop_applications`; mỗi shop tối đa 1 hồ sơ đang chờ. | §5.1 SHP-01, SHP-03 |
| Tài khoản ngân hàng | marketplace giữ trong hồ sơ shop; khi seller rút tiền, payment hỏi marketplace rồi chép vào yêu cầu rút. | §2 |
| Mật khẩu, mã, token | Chỉ lưu bản băm (bcrypt cho mật khẩu, băm cho mã 6 số và refresh token), không lưu bản gốc. | §8 |
| File tải lên | Lưu trong thư mục riêng của người tải; marketplace chỉ nhận file nằm trong thư mục của chính người đó. | §5.1 SHP-01 |
| Ràng buộc viết tay | "Mỗi người 1 địa chỉ mặc định", "mỗi shop 1 hồ sơ chờ" viết tay trong migration vì Prisma chưa khai được. | §8 |

## 5. Việc tiếp theo

1. Bạn trả lời thẻ API 7 (nơi lưu cấu hình) khi tiện; bảng `policy_configs` trong khung đang theo đề xuất.
2. Bạn tạo repo GitHub trống và gửi danh sách thành viên.
3. Claude chia P1 thành việc cho từng người (GitHub Issues).
