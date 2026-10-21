# Bảng dữ liệu (ERD)

Cách làm đã chốt: **khung cả dự án + chi tiết theo phase**. File này là khung của cả 4 service (P1–P6): tên bảng, phase làm bảng đó, các cột chính và quan hệ. Tổng cộng 60 bảng (P3 bỏ `saved_vouchers`), trong đó 12 bảng kỹ thuật (3 bảng giống nhau ở mỗi service). Chi tiết đủ cột chỉ viết cho phase sắp code:

| Phase | Chi tiết đủ cột ở đâu |
| --- | --- |
| P1 | `services/*/prisma/schema.prisma` và migration đầu tiên `prisma/migrations/*_p1_init` của mỗi service |
| P2 | `schema.prisma` + migration `*_p2_catalog_cart_voucher` (marketplace), `*_p2_violations` (approval) |
| P3 | Cột ghi ở các bảng P3 dưới đây; `schema.prisma` + migration `*_p3_orders` (marketplace), `*_p3_payments` (payment), `*_p3_order_checks` (approval) |
| P4 | Cột ghi ở các bảng P4 dưới đây; migration `*_p4_shipping` (marketplace), `*_p4_wallet_reconciliation` (payment) |
| P5 | Cột ghi ở các bảng P5 dưới đây; migration `*_p5_returns` (marketplace), `*_p5_returns_withdrawals` (payment), `*_p5_disputes_withdrawals` (approval) |
| P6 | Cột ghi ở các bảng P6 dưới đây; migration `*_p6_engagement_chat` (marketplace), `*_p6_reports` (approval) |

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
| `shops` | P1 | id<br>owner_id ↗U (1 tài khoản 1 shop)<br>status: PENDING \| REJECTED \| ACTIVE \| SUSPENDED<br>name, description, logo_url, phone<br>địa chỉ lấy hàng<br>tài khoản ngân hàng<br>suspend_reason, moderated_at (P2) | Thông tin shop đang dùng |
| `shop_applications` | P1 | id<br>shop_id → shops<br>version, type: REGISTER \| CHANGE<br>status: PENDING \| APPROVED \| REJECTED<br>data (hồ sơ đã nộp)<br>reject_reason | Hồ sơ mở shop / đổi thông tin |

### Sản phẩm (P2)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `categories` | P2 | id<br>parent_id → categories (2 cấp)<br>name, slug, icon, sort, hidden | Danh mục |
| `products` | P2 | id<br>shop_id → shops<br>category_id → categories<br>name, description<br>status: ACTIVE \| HIDDEN \| REMOVED (P6, bị gỡ do vi phạm)<br>option1_name, option2_name (Màu, Size)<br>weight, min_price, max_price, sold_count<br>search_vector (từ khóa không dấu, PostgreSQL tự tính)<br>rating_count, rating_total, removed_reason, moderated_at (P6) | Sản phẩm. Đăng là bán ngay nên không có nháp; sản phẩm bị gỡ do vi phạm thêm ở P6 |
| `product_variants` | P2 | id<br>product_id → products<br>option1_value, option2_value<br>price, original_price, stock, reserved<br>sort, active | Biến thể (SKU): giá và tồn riêng. Bỏ biến thể thì `active = false`, không xóa |
| `product_images` | P2 | id<br>product_id → products<br>url, sort<br>option1_value? (ảnh theo màu) | Ảnh, tối đa 9 + 1 ảnh/màu |
| `stock_history` | P2 | id<br>variant_id → product_variants<br>change (+/-), stock_after, reason<br>created_by<br>order_id? → orders (P3: bán, hủy đơn) | Lịch sử nhập/điều chỉnh tồn. Giữ/nhả giữ tồn chỉ đổi `reserved`, không ghi lịch sử |

### Giỏ hàng, voucher

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `cart_items` | P2 | user_id ↗U<br>variant_id → product_variants<br>quantity, selected | Giỏ hàng |
| `vouchers` | P2 | id<br>shop_id? → shops (trống = voucher sàn)<br>code, name, discount_type: AMOUNT \| PERCENT<br>value, max_discount<br>min_order, start_at, end_at<br>quantity, per_user_limit, used_count<br>created_by | Voucher shop và sàn |
| `voucher_usages` | P3 | id<br>voucher_id → vouchers<br>user_id ↗U<br>order_id → orders<br>shop_order_id? → shop_orders (trống = voucher sàn)<br>amount (số tiền đã giảm)<br>returned_at (trả lượt khi hủy) | Lượt dùng voucher. Giới hạn mỗi người đếm các dòng chưa trả |

Không có bảng `saved_vouchers` (quyết định P3: không có bước lưu voucher).

### Đơn hàng (P3)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `checkouts` | P3 | id (= mã phiên `checkoutId`)<br>buyer_id ↗U<br>input (dòng giỏ, địa chỉ, mã voucher đã chọn)<br>data (bản xem trước: giá, voucher, phí ship, địa chỉ)<br>total, expires_at<br>order_id? → orders (không trùng) | Bước xem trước, chống đặt trùng |
| `orders` | P3 | id, code (ngày + 6 ký tự, không trùng)<br>buyer_id ↗U, buyer_name, buyer_email<br>payment_method: VNPAY (COD ở P4)<br>receiver_name, receiver_phone<br>province_id, district_id, ward_code, address (chép lại)<br>platform_voucher_id? → vouchers, platform_voucher_code, platform_discount<br>subtotal, shipping_fee, total<br>payment_status: UNPAID \| PAID<br>check_status: PENDING \| PASSED \| REJECTED<br>pay_before, hold_until (hết giữ tồn), paid_at | Đơn tổng (1 lần đặt). Trạng thái chung tính từ đơn con, không lưu |
| `shop_orders` | P3 | id, code (mã đơn tổng -1, -2)<br>order_id → orders<br>shop_id → shops, shop_name (chép lại)<br>status: PENDING \| TO_CONFIRM \| CONFIRMED \| CANCEL_REQUESTED \| CANCELLED<br>subtotal, shop_voucher_id? → vouchers, shop_voucher_code, shop_discount, platform_discount<br>shipping_fee, shipping_fee_source: GHN \| FALLBACK \| FIXED, total<br>platform_fee_rate, platform_fee, seller_amount (từ payment khi đã trả)<br>confirm_before, confirmed_at<br>cancelled_by: BUYER \| SELLER \| ADMIN \| SYSTEM, cancel_reason, cancelled_at<br>cancel_request_reason, cancel_requested_at, cancel_request_used<br>refund_status: NONE \| PROCESSING \| NEEDS_MANUAL \| SUCCEEDED \| MANUAL_DONE, refund_updated_at<br>cod_amount, completed_at (P4) | Đơn của từng shop |
| `order_items` | P3 | id<br>shop_order_id → shop_orders<br>product_id → products, variant_id → product_variants<br>product_name, variant_name, image (chép lại)<br>price, original_price, quantity, weight<br>discount (phần voucher shop + sàn chia cho dòng này)<br>returned_quantity (P5) | Dòng hàng trong đơn |
| `order_history` | P3 | id<br>shop_order_id → shop_orders<br>from_status?, to_status<br>actor_type: BUYER \| SELLER \| ADMIN \| SYSTEM, actor_id?, actor_name?<br>note (lý do), created_at | Lịch sử trạng thái đơn con |
| `settings` | P3 | key, version (khóa chính 2 cột)<br>value (số nguyên)<br>effective_from<br>created_by ↗U, created_by_name, reason | Cấu hình có phiên bản (hạn thanh toán, giữ tồn, hạn xác nhận, phí ship cố định). Giống nhau ở marketplace, payment, approval |

### Giao hàng (P4)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `shipments` | P4 | id<br>shop_order_id → shop_orders, type: DELIVERY (RETURN ở P5); mỗi đơn con một vận đơn mỗi loại<br>carrier: GHN \| MOCK<br>client_code (mã đơn con gửi GHN, không trùng), ghn_code (không trùng)<br>status: CREATING \| UNKNOWN \| CREATE_FAILED \| READY_TO_PICK \| PICKED \| DELIVERED \| RETURNING \| RETURNED \| CANCELLED \| LOST<br>cod_amount, weight, fee (phí GHN), failed_attempts<br>picked_at, delivered_at, returned_at, last_event_at, last_error | Vận đơn GHN (hoặc MÔ PHỎNG) |
| `shipment_history` | P4 | id<br>shipment_id → shipments<br>ghn_status (mã GHN gốc), status (đã quy đổi)<br>source: GHN \| MOCK, event_key (không trùng: bỏ tin lặp)<br>note, happened_at | Các mốc GHN báo về |

Bảng P3 đổi ở P4: `shops` thêm `cod_enabled`; `orders.payment_method` thêm `COD`, `payment_status` thêm `COD`, `pay_before`/`hold_until` để trống với đơn COD; `shop_orders` thêm trạng thái `SHIPPING`, `DELIVERED`, `COMPLETED`, `RETURNING`, `RETURNED`, `FAILED`, `INCIDENT`, `INCIDENT_RESOLVED` và cột `cod_amount`, `handover_before`, `picked_at`, `delivered_at`, `complete_before`, `completed_at`, `returned_at`, `return_close_before`, `incident_note`.

### Trả hàng (P5)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `returns` | P5 | id, code (mã đơn con + `-TH`, không trùng; cũng là mã gửi GHN của vận đơn trả)<br>shop_order_id → shop_orders (không trùng: mỗi đơn con 1 yêu cầu), order_id → orders, shop_id → shops<br>buyer_id ↗U<br>status: REQUESTED \| REJECTED \| DISPUTED \| SHIPPING_BACK \| RECEIVED \| REFUNDING \| REFUNDED \| CLOSED \| CANCELLED<br>reason: DEFECTIVE \| DAMAGED \| WRONG_ITEM \| MISSING \| NOT_AS_DESCRIBED \| COUNTERFEIT<br>description, images (khóa ảnh MinIO riêng tư)<br>refund_amount (hoàn tối đa), seller_base (tiền hàng sau voucher shop của món trả)<br>refund_without_return<br>bank_name, bank_account_number, bank_account_name (đơn COD)<br>seller_note, seller_images (lời shop khi từ chối/kiểm hàng)<br>dispute_note, dispute_images, dispute_stage: REQUEST_REJECTED \| GOODS_PROBLEM<br>deadline (hạn của bước đang chờ)<br>decided_refund, platform_covers (sàn chịu khi kiện trả thất lạc)<br>refund_status, refund_updated_at (nhận từ payment)<br>history (các bước đã qua, dạng danh sách)<br>request_key (Idempotency-Key, không trùng), resolved_at | Yêu cầu trả hàng (STATE-03) |
| `return_items` | P5 | id<br>return_id → returns, order_item_id → order_items (cặp không trùng)<br>quantity<br>refund_amount (người mua đã trả cho số món này)<br>seller_base (tiền hàng sau voucher shop của số món này)<br>restocked (shop chọn nhập lại kho) | Món trả, số lượng, tiền |

Bảng cũ đổi ở P5: `order_items` thêm `returned_quantity` (số món đã được hoàn đủ tiền); `shipments.type` dùng thêm `RETURN` (vận đơn trả hàng, `client_code` = mã yêu cầu).

### Đánh giá, theo dõi (P6)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `reviews` | P6 | id<br>order_item_id → order_items (không trùng: mỗi dòng hàng 1 đánh giá), shop_order_id<br>product_id → products, shop_id → shops, buyer_id ↗U, buyer_name, variant_name (chép lúc đánh giá)<br>rating 1–5 (ràng buộc trong database), content (≤ 1000, được trống), images (≤ 5 đường dẫn công khai)<br>edited (đã dùng lượt sửa)<br>seller_reply, seller_replied_at | Đánh giá sản phẩm (ENG-01, ENG-02) |
| `shop_follows` | P6 | user_id ↗U, shop_id → shops (cặp là khóa chính) | Theo dõi shop (ENG-03) |
| `product_likes` | P6 | user_id ↗U, product_id → products (cặp là khóa chính) | Thả tim sản phẩm (ENG-03) |

Bảng cũ đổi ở P6: `products` thêm `rating_count`, `rating_total` (sao trung bình = tổng / số, tính khi đọc), trạng thái `REMOVED` (bị gỡ do vi phạm), `removed_reason`, `moderated_at`; `shops` thêm `rating_count`, `rating_total` (sao shop = trung bình sao mọi sản phẩm).

### Chat, thông báo (P6)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `conversations` | P6 | id<br>buyer_id ↗U, buyer_name, shop_id → shops (cặp buyer + shop không trùng)<br>last_message_at, last_message_preview<br>buyer_unread, shop_unread (số tin chưa đọc của mỗi bên, không âm) | Cuộc trò chuyện người mua – shop (MSG-01) |
| `messages` | P6 | id<br>conversation_id → conversations<br>sender_id ↗U, sender_role: BUYER \| SHOP<br>type: TEXT \| IMAGE \| PRODUCT \| ORDER<br>content (chữ, khóa ảnh riêng tư, mã sản phẩm hoặc mã đơn con), card (bản chụp thẻ sản phẩm/đơn)<br>client_key (chống gửi lặp, không trùng theo cuộc trò chuyện) | Tin nhắn, chỉ thêm |
| `notifications` | P6 | id<br>user_id ↗U<br>type (ví dụ ORDER_DELIVERED), title, content, link<br>read_at | Thông báo trong app (MSG-02); loại quan trọng còn gửi email qua user-service |

## P: payment-service (payment_db)

Sơ đồ: `docs/so-do/11-erd-p-payment-service`

### Thu tiền, hoàn tiền (P3)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `payments` | P3 | id<br>order_id ↗M, attempt (1..3, không trùng theo đơn)<br>ref (= `vnp_TxnRef`, không trùng), request_key (Idempotency-Key, không trùng)<br>gateway: VNPAY | MOCK<br>amount, pay_url, client_ip<br>\| MOCK<br>amount, pay_url<br>status: PENDING \| SUCCEEDED \| FAILED \| UNKNOWN<br>applied (tiền được áp vào đơn; false = trả muộn/trùng, phải hoàn)<br>transaction_no, bank_code, paid_at<br>gateway_response, checked_at | Mỗi lần thanh toán VNPay |
| `refunds` | P3 | id<br>payment_id → payments<br>order_id ↗M, shop_order_id? ↗M (không trùng; trống = hoàn cả khoản trả muộn/trùng)<br>amount, reason: CANCELLED \| LATE_PAYMENT \| DUPLICATE_PAYMENT<br>status: PENDING \| FAILED \| UNKNOWN \| NEEDS_MANUAL \| SUCCEEDED \| MANUAL_DONE<br>tries, next_try_at, request_id (mã lệnh hoàn gần nhất), last_error, gateway_response<br>transfer_code, receipt_key, manual_note, manual_by ↗U (hoàn tay)<br>completed_at<br>return_id? ↗M (P5) | Hoàn tiền |
| `settings` | P3 | Như `settings` của marketplace | Phí sàn (500 = 5%), số lần thanh toán, số lần thử hoàn |

### Tiền seller (P3–P5)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `seller_earnings` | P3 | id<br>order_id ↗M, order_code<br>shop_order_id ↗M (không trùng), shop_order_code<br>shop_id ↗M, buyer_id ↗U<br>subtotal, shop_discount, platform_discount, shipping_fee<br>buyer_paid (số buyer trả cho đơn con)<br>platform_fee_rate (500 = 5%, chụp lúc nhận đơn), platform_fee, seller_amount<br>status: UNPAID \| HELD \| AVAILABLE \| EXPIRED \| CANCELLED \| FAILED \| COMPENSATED<br>pay_before (trống với COD), paid_at<br>P4: payment_method: VNPAY \| COD, cod_amount, ghn_code, carrier_fee, delivered_at, completed_at, money_received_at (trả trước: lúc thu; COD: lúc đối soát khớp), released_at | Tiền của mỗi đơn con: buyer trả bao nhiêu, sàn thu phí bao nhiêu, seller nhận bao nhiêu. Cũng là bản chép đơn để payment-service biết số tiền cần thu (nhận qua `order.placed`) |
| `seller_wallets` | P4 | shop_id ↗M (khóa chính)<br>owner_id ↗U (chủ shop, không trùng)<br>pending, available, locked (không âm, có ràng buộc trong database) | Ví seller: 3 ngăn tiền |
| `wallet_transactions` | P4 | id<br>shop_id → seller_wallets<br>type: HELD \| RELEASED \| REVERSED \| COMPENSATION<br>amount (luôn dương), from_bucket, to_bucket: PENDING \| AVAILABLE \| LOCKED (trống = tiền vào/ra ví)<br>shop_order_id? (không trùng theo cặp đơn con + loại), withdrawal_id? (P5), note | Lịch sử ví: mỗi biến động 1 dòng. Test kiểm tổng các dòng khớp số dư |
| `withdrawals` | P5 | id<br>shop_id → seller_wallets, owner_id ↗U, shop_name<br>amount (≥ `withdraw_min_amount`)<br>status: PENDING \| APPROVED \| PAID \| REJECTED \| CANCELLED \| FAILED (mỗi shop tối đa 1 yêu cầu PENDING/APPROVED, ràng buộc viết tay)<br>bank_name, bank_account_number, bank_account_name (chép từ hồ sơ shop lúc yêu cầu)<br>request_key (Idempotency-Key, không trùng)<br>reason (lý do từ chối / chuyển lỗi), decided_by_name, decided_at<br>transfer_code, receipt_key (MinIO riêng tư), paid_by ↗U, paid_by_name, paid_at, note | Yêu cầu rút tiền và chi trả |

Bảng cũ đổi ở P5:
- `seller_earnings`: trạng thái thêm `REFUNDED` (trả hàng hoàn toàn bộ); thêm `return_id`, `return_state` (NONE \| OPEN \| RESOLVED: có yêu cầu trả hàng đang mở thì không chuyển khả dụng), `return_refund`, `return_deduction` (seller bị trừ), `return_fee_reversed` (phí sàn được giảm).
- `wallet_transactions`: loại thêm `RETURN_DEDUCTED` (trừ ngăn đang giữ do trả hàng), `LOCKED` / `UNLOCKED` / `WITHDRAWN` (rút tiền), `ADJUSTMENT` (điều chỉnh DIS-02); thêm `withdrawal_id`, `adjustment_id` (mỗi cặp mã + loại không trùng).
- `refunds`: `payment_id` để trống được (hoàn bằng chuyển khoản); thêm `method` (GATEWAY \| BANK_TRANSFER), `return_id` (không trùng), `adjustment_id` (không trùng), `bank_name`, `bank_account_number`, `bank_account_name`; lý do thêm `RETURN`, `ADJUSTMENT`. `shop_order_id` không còn không trùng tuyệt đối: chỉ khoản hoàn do hủy/giao thất bại/sự cố mới tối đa một khoản mỗi đơn con (ràng buộc viết tay).

### Đối soát COD (P4)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `cod_reconciliations` | P4 | id<br>file_name, file_key (MinIO riêng tư), file_hash (không trùng: mỗi file nhập 1 lần)<br>uploaded_by ↗U, uploaded_by_name<br>total_rows, matched, mismatched, duplicated, not_found, not_delivered<br>total_cod | File đối soát COD của GHN |
| `cod_reconciliation_items` | P4 | id<br>reconciliation_id → cod_reconciliations, row_number<br>ghn_code, cod_amount, ship_fee, return_fee (theo file)<br>shop_order_id? ↗M, expected_cod, buyer_shipping_fee (theo sàn)<br>result: MATCHED \| MISMATCHED \| DUPLICATE \| NOT_FOUND \| NOT_DELIVERED<br>resolution: ACCEPTED \| NOTED, note, resolved_by ↗U, resolved_at | Từng dòng trong file |

Bảng P3 đổi ở P4: `payments` thêm `reconcile_status` (MATCHED \| MISMATCH \| RESOLVED), `reconcile_note`, `reconciled_at` cho đối soát VNPay; `refunds.reason` thêm `DELIVERY_FAILED`, `INCIDENT`.

## A: approval-service (approval_db)

Sơ đồ: `docs/so-do/12-erd-a-approval-service`

### Duyệt shop, vi phạm

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `shop_approvals` | P1 | id<br>shop_id ↗M, version<br>type: REGISTER \| CHANGE<br>status: PENDING \| APPROVED \| REJECTED \| REPLACED<br>owner_id ↗U (không tự duyệt)<br>data (hồ sơ nhận được)<br>change (phần muốn đổi, chỉ với CHANGE)<br>reason, decided_by, decided_at | Duyệt hồ sơ shop |
| `violations` | P2 | id<br>target_type: SHOP \| PRODUCT (P6), target_id ↗M, target_name, target_image (P6), shop_id ↗M (P6)<br>owner_id ↗U (không tự xử lý)<br>action: SUSPEND \| RESTORE \| REMOVE (P6); trống với dòng báo cáo<br>status (P6): PENDING \| RESOLVED \| DISMISSED<br>P6: reporter_id ↗U, reporter_name, report_reason, report_note, images (khóa ảnh riêng tư của marketplace), request_key (mỗi người tối đa 1 báo cáo đang chờ cho cùng đối tượng, ràng buộc viết tay)<br>reason, decided_by, decided_by_name, decided_at (P6) | Mỗi dòng là một quyết định của admin (đình chỉ/khôi phục shop, gỡ/khôi phục sản phẩm) hoặc một báo cáo vi phạm của người mua (P6, MOD-01) |

### Kiểm tra đơn (P3)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `order_checks` | P3 | id<br>order_id ↗M (không trùng), order_code<br>buyer_id ↗U, buyer_name, buyer_email<br>owner_ids ↗U (chủ các shop trong đơn, không tự duyệt)<br>amount, payment_method<br>data (đơn nhận qua sự kiện: shop, dòng hàng)<br>rules_hit (luật đã chạm kèm ngưỡng lúc đó)<br>status: PENDING \| PASSED \| REJECTED \| TIMEOUT \| CANCELLED<br>deadline, reason<br>decided_by ↗U, decided_by_name, decided_at | Mọi đơn đều có một dòng; đơn không chạm luật thì `PASSED` ngay. Đơn lớn chờ admin `FINANCE` |
| `settings` | P3 | Như `settings` của marketplace | Ngưỡng đơn tổng (10 triệu), ngưỡng COD (3 triệu), hạn duyệt (24 giờ) |

### Tranh chấp, rút tiền (P5)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `disputes` | P5 | id<br>type: RETURN (tranh chấp trả hàng) \| ADJUSTMENT (điều chỉnh sau giải ngân, DIS-02)<br>return_id ↗M, return_code, stage: REQUEST_REJECTED \| GOODS_PROBLEM (cặp return_id + stage không trùng)<br>order_id ↗M, order_code, shop_order_id ↗M, shop_order_code<br>shop_id ↗M, shop_name, owner_id ↗U (không tự quyết)<br>buyer_id ↗U, buyer_name<br>data (hồ sơ trả hàng nhận qua sự kiện)<br>buyer_statement, buyer_images, seller_statement, seller_images<br>max_refund<br>status: PENDING \| RESOLVED \| APPROVED \| REJECTED \| EXECUTED \| FAILED<br>decision: ACCEPT_RETURN \| REFUND \| REJECT \| APPROVE<br>refund_amount, seller_change (ADJUSTMENT: cộng/trừ ví), bank_account (ADJUSTMENT)<br>reason (lý do lập ADJUSTMENT), created_by ↗U, created_by_name, request_key<br>deadline (hạn nhắc phân xử)<br>decision_note, decided_by ↗U, decided_by_name, decided_at<br>execution_note, executed_at | Tranh chấp trả hàng cần admin `SUPPORT` phân xử, và đề nghị điều chỉnh tiền cần admin `FINANCE` thứ hai duyệt (gộp `finance_exceptions` theo vòng ERD) |
| `withdrawal_approvals` | P5 | id<br>withdrawal_id ↗P (không trùng)<br>shop_id ↗M, shop_name, owner_id ↗U, owner_name (không tự duyệt)<br>amount<br>bank_account (4 số cuối), wallet (số dư lúc yêu cầu)<br>status: PENDING \| APPROVED \| REJECTED \| CANCELLED<br>reason, decided_by ↗U, decided_by_name, decided_at, requested_at | Duyệt rút tiền |
| `settings` (bổ sung) | P5 | | Thêm hạn nhắc phân xử tranh chấp (72 giờ) |
