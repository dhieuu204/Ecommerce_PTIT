# Bảng dữ liệu (ERD)

Cách làm đã chốt: **khung cả dự án + chi tiết theo phase**. File này là khung của cả 4 service (P1–P6): tên bảng, phase làm bảng đó, các cột chính và quan hệ. Tổng cộng 61 bảng, trong đó 12 bảng kỹ thuật (3 bảng giống nhau ở mỗi service). Chi tiết đủ cột chỉ viết cho phase sắp code:

| Phase | Chi tiết đủ cột ở đâu |
| --- | --- |
| P1 | `services/*/prisma/schema.prisma` và migration đầu tiên `prisma/migrations/*_p1_init` của mỗi service |
| P2–P6 | Viết trước khi bắt đầu phase đó (thêm vào `schema.prisma`, tạo migration mới) |

Sơ đồ (mở file `.excalidraw` trên excalidraw.com để sửa, `.png` để xem): `docs/so-do/09-erd-u-user-service`, `10-erd-m-marketplace-service`, `11-erd-p-payment-service`, `12-erd-a-approval-service`.

## Quy ước

- Mỗi service chỉ có bảng trong database của mình. Cột ghi `↗U`, `↗M`, `↗P`, `↗A` là **mã của service khác**: chỉ lưu mã (và bản chụp thông tin cần hiển thị), không có khóa ngoại, không join chéo database.
- Cột ghi `→ bảng` là khóa ngoại trong cùng database.
- Khóa chính UUID. Tiền là số nguyên đồng. Thời gian `timestamptz` lưu UTC.
- Tên bảng và cột `snake_case` (Prisma dùng `@@map`, `@map`), model Prisma `PascalCase`.
- Dữ liệu đơn hàng, tiền, đánh giá giữ **bản chụp** (giá, tên sản phẩm, địa chỉ, phí) tại thời điểm tạo; sửa sản phẩm hay địa chỉ sau đó không làm đổi đơn cũ.
- Không xóa cứng dữ liệu nghiệp vụ: sản phẩm thì ẩn, tiền thì ghi bút toán điều chỉnh.
- Ràng buộc Prisma chưa khai được (ví dụ "mỗi người một địa chỉ mặc định") viết tay thêm vào cuối file migration, kèm chú thích.
- Mỗi service có 3 bảng kỹ thuật giống nhau: `audit_logs` (nhật ký admin), `outbox_events` (sự kiện chờ gửi), `inbox_events` (sự kiện đã nhận).
- Giữ ít bảng: bảng con nhỏ gộp thành cột (ví dụ ảnh đánh giá là một cột danh sách ảnh), chỉ tách bảng khi cần nhiều dòng có thông tin riêng.

## Thêm hoặc sửa bảng

1. Sửa `services/<service>/prisma/schema.prisma`.
2. Chạy `pnpm --filter @san/<service> prisma:migrate` (cần `pnpm infra:up`), đặt tên migration rõ nghĩa, ví dụ `add_products`.
3. Commit cả `schema.prisma` và thư mục migration mới trong cùng Pull Request. Không sửa migration đã vào `main`.
4. Cập nhật bảng ở file này nếu khác khung.

## U: user-service (user_db)

Sơ đồ: `docs/so-do/09-erd-u-user-service`

### Tài khoản

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `users` | P1 | id<br>email (không trùng), password_hash<br>google_id (không trùng)<br>full_name, phone, birthday, gender<br>status: UNVERIFIED \| ACTIVE \| LOCKED<br>permissions: bộ quyền admin<br>failed_logins, locked_until | Tài khoản và bộ quyền admin |
| `verification_codes` | P1 | id<br>user_id → users<br>purpose: VERIFY_EMAIL \| RESET_PASSWORD<br>code_hash, expires_at, attempts, used_at | Mã 6 số gửi qua email |
| `sessions` | P1 | id<br>user_id → users<br>token_hash, expires_at, revoked_at<br>device | Phiên đăng nhập (refresh token) |
| `addresses` | P1 | id<br>user_id → users<br>receiver_name, phone<br>province_id, district_id, ward_code<br>street, is_default | Sổ địa chỉ, tối đa 10 |

## M: marketplace-service (market_db)

Sơ đồ: `docs/so-do/10-erd-m-marketplace-service`

### Địa chỉ hành chính

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `provinces` | P1 | id (mã GHN)<br>name | Tỉnh/thành, lấy từ GHN |
| `districts` | P1 | id (mã GHN)<br>province_id → provinces<br>name | Quận/huyện |
| `wards` | P1 | code (mã GHN)<br>district_id → districts<br>name | Phường/xã |

### Shop

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `shops` | P1 | id<br>owner_id ↗U (1 tài khoản 1 shop)<br>status: PENDING \| REJECTED \| ACTIVE \| SUSPENDED<br>name, description, logo_url, phone<br>địa chỉ lấy hàng<br>tài khoản ngân hàng | Thông tin shop đang dùng |
| `shop_applications` | P1 | id<br>shop_id → shops<br>version, type: REGISTER \| CHANGE<br>status: PENDING \| APPROVED \| REJECTED<br>data (hồ sơ đã nộp)<br>reject_reason | Hồ sơ mở shop / đổi thông tin |

### Sản phẩm (P2)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `categories` | P2 | id<br>parent_id → categories (2 cấp)<br>name, slug, sort | Danh mục |
| `products` | P2 | id<br>shop_id → shops<br>category_id → categories<br>name, description<br>status: DRAFT \| ACTIVE \| HIDDEN \| BANNED<br>option1_name, option2_name (Màu, Size)<br>weight, rating, sold_count | Sản phẩm |
| `product_variants` | P2 | id<br>product_id → products<br>option1_value, option2_value<br>price, stock, reserved | Biến thể (SKU): giá và tồn riêng |
| `product_images` | P2 | id<br>product_id → products<br>url, sort<br>option1_value? (ảnh theo màu) | Ảnh, tối đa 9 + 1 ảnh/màu |
| `stock_history` | P2 | id<br>variant_id → product_variants<br>change (+/-), reason<br>order_id?, created_by | Lịch sử nhập/điều chỉnh tồn |

### Giỏ hàng, voucher

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `cart_items` | P2 | user_id ↗U<br>variant_id → product_variants<br>quantity, selected | Giỏ hàng |
| `vouchers` | P2 | id<br>shop_id? → shops (trống = voucher sàn)<br>code, discount_type, value, max_discount<br>min_order, start_at, end_at<br>quantity, per_user_limit, used_count | Voucher shop và sàn |
| `saved_vouchers` | P3 | user_id ↗U<br>voucher_id → vouchers | Voucher buyer đã lưu |
| `voucher_usages` | P3 | id<br>voucher_id → vouchers<br>user_id ↗U, order_id → orders<br>amount, returned | Lượt dùng voucher |

### Đơn hàng (P3)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `checkouts` | P3 | id<br>buyer_id ↗U<br>data (giá, voucher, phí ship lúc xem)<br>expires_at, order_id? | Bước xem trước, chống đặt trùng |
| `orders` | P3 | id, code (mã ngắn)<br>buyer_id ↗U<br>payment_method: VNPAY \| COD<br>địa chỉ nhận (chép lại)<br>platform_voucher_id, platform_discount<br>total, payment_status, pay_before | Đơn tổng (1 lần đặt) |
| `shop_orders` | P3 | id, code (mã đơn tổng -1, -2)<br>order_id → orders<br>shop_id → shops<br>status<br>subtotal, shop_discount, platform_discount<br>shipping_fee, platform_fee_rate, cod_amount<br>deadlines, cancel_reason, completed_at | Đơn của từng shop |
| `order_items` | P3 | id<br>shop_order_id → shop_orders<br>variant_id → product_variants<br>tên, ảnh, biến thể (chép lại)<br>price, quantity, discount<br>returned_quantity | Dòng hàng trong đơn |
| `order_history` | P3 | id<br>shop_order_id → shop_orders<br>from_status, to_status<br>by, reason, created_at | Lịch sử trạng thái đơn |
| `settings` | P3 | key, version<br>value, effective_from | Cấu hình có phiên bản (hạn, phí...) |

### Giao hàng (P4)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `shipments` | P4 | id<br>shop_order_id → shop_orders<br>type: DELIVERY \| RETURN<br>ghn_code (không trùng)<br>status, fee, cod_amount | Vận đơn GHN |
| `shipment_history` | P4 | id<br>shipment_id → shipments<br>ghn_status, happened_at | Các mốc GHN báo về |

### Trả hàng (P5)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `returns` | P5 | id<br>shop_order_id → shop_orders<br>buyer_id ↗U<br>reason, images, status<br>refund_amount, seller_note<br>deadline | Yêu cầu trả hàng |
| `return_items` | P5 | return_id → returns<br>order_item_id → order_items<br>quantity, amount | Hàng trả, số lượng |

### Đánh giá, theo dõi (P6)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `reviews` | P6 | id<br>order_item_id → order_items (1 lần)<br>product_id, shop_id, buyer_id ↗U<br>rating 1–5, content, images<br>edited, seller_reply | Đánh giá sản phẩm |
| `shop_follows` | P6 | user_id ↗U<br>shop_id → shops | Theo dõi shop |
| `product_likes` | P6 | user_id ↗U<br>product_id → products | Thả tim sản phẩm |

### Chat, thông báo (P6)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `conversations` | P6 | id<br>buyer_id ↗U, shop_id → shops<br>last_message_at, unread counts | Cuộc trò chuyện buyer–shop |
| `messages` | P6 | id<br>conversation_id → conversations<br>sender_id, type: TEXT \| IMAGE \| PRODUCT \| ORDER<br>content | Tin nhắn |
| `notifications` | P6 | id<br>user_id ↗U<br>title, content, link<br>read_at | Thông báo |

## P: payment-service (payment_db)

Sơ đồ: `docs/so-do/11-erd-p-payment-service`

### Thu tiền, hoàn tiền (P3)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `payments` | P3 | id<br>order_id ↗M<br>attempt (tối đa 3), vnpay_ref (không trùng)<br>amount, status<br>paid_at, vnpay_response | Mỗi lần thanh toán VNPay |
| `refunds` | P3 | id<br>payment_id → payments<br>shop_order_id ↗M, return_id? ↗M<br>amount, reason, status, tries<br>manual_proof (hoàn tay) | Hoàn tiền |
| `settings` | P3 | key, version<br>value (phí sàn 5%...), effective_from | Cấu hình có phiên bản |

### Tiền seller (P3–P5)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `seller_earnings` | P3 | shop_order_id ↗M<br>shop_id ↗M<br>subtotal, discounts, shipping_fee<br>platform_fee, seller_amount<br>money_received, released_at | Tiền seller nhận từ mỗi đơn |
| `seller_wallets` | P4 | shop_id ↗M<br>pending, available, locked | Ví seller: 3 ngăn tiền |
| `wallet_transactions` | P4 | id<br>shop_id → seller_wallets<br>type, amount (+/-), from, to<br>shop_order_id?, withdrawal_id? | Lịch sử ví: mỗi biến động 1 dòng |
| `withdrawals` | P5 | id<br>shop_id → seller_wallets<br>amount (≥ 50.000đ), status<br>tài khoản ngân hàng (chép lại)<br>transfer_code, receipt_url, paid_at | Yêu cầu rút tiền và chi trả |

### Đối soát COD (P4)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `cod_reconciliations` | P4 | id<br>file_url, uploaded_by ↗U<br>status, total | File đối soát GHN |
| `cod_reconciliation_items` | P4 | id<br>reconciliation_id → cod_reconciliations<br>ghn_code, cod_amount, fee<br>shop_order_id? ↗M, matched | Từng dòng trong file |

## A: approval-service (approval_db)

Sơ đồ: `docs/so-do/12-erd-a-approval-service`

### Duyệt shop, vi phạm

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `shop_approvals` | P1 | id<br>shop_id ↗M, version<br>type: REGISTER \| CHANGE<br>status: PENDING \| APPROVED \| REJECTED \| REPLACED<br>owner_id ↗U (không tự duyệt)<br>data (hồ sơ nhận được)<br>change (phần muốn đổi, chỉ với CHANGE)<br>reason, decided_by, decided_at | Duyệt hồ sơ shop |
| `violations` | P2 | id<br>target: SHOP \| PRODUCT ↗M<br>reporter_id? ↗U, reason, images<br>action: SUSPEND \| RESTORE \| REMOVE<br>status, decided_by | Báo cáo vi phạm, đình chỉ |

### Kiểm tra đơn (P3)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `order_checks` | P3 | id<br>order_id ↗M<br>amount, payment_method, rules_hit<br>status: PENDING \| PASSED \| REJECTED \| TIMEOUT<br>deadline, decided_by | Đơn lớn cần admin xem |
| `settings` | P3 | key, version<br>value (10 triệu, COD 3 triệu...) | Cấu hình có phiên bản |

### Tranh chấp, rút tiền (P5)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `disputes` | P5 | id<br>return_id ↗M, shop_order_id ↗M<br>buyer_statement, seller_statement, images<br>status, decision, refund_amount<br>decided_by | Khiếu nại cần admin phân xử |
| `withdrawal_approvals` | P5 | id<br>withdrawal_id ↗P<br>shop_id ↗M, amount<br>status, reason, decided_by | Duyệt rút tiền |
