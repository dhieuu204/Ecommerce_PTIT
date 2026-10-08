# Bảng dữ liệu (ERD)

Cách làm đã chốt: **khung cả dự án + chi tiết theo phase**. File này là khung của cả 4 service (P1–P6): tên bảng, phase làm bảng đó, các cột chính và quan hệ. Chi tiết đủ cột chỉ viết cho phase sắp code:

| Phase | Chi tiết đủ cột ở đâu |
| --- | --- |
| P1 | `services/*/prisma/schema.prisma` và migration đầu tiên `prisma/migrations/*_p1_init` của mỗi service |
| P2–P6 | Viết trước khi bắt đầu phase đó (thêm vào `schema.prisma`, tạo migration mới) |

Sơ đồ (mở file `.excalidraw` trên excalidraw.com để sửa, `.png` để xem): `docs/so-do/09-erd-u-user-service`, `10-erd-m-marketplace-service`, `11-erd-p-payment-service`, `12-erd-a-approval-service`.

## Quy ước

- Mỗi service chỉ có bảng trong database của mình. Cột ghi `↗U`, `↗M`, `↗P`, `↗A` là **mã của service khác**: chỉ lưu mã (và bản chụp thông tin cần hiển thị), không có khóa ngoại, không join chéo database.
- Cột ghi `→ bảng` là khóa ngoại trong cùng database.
- Khóa chính UUID. Tiền là số nguyên đồng (`Int`, hoặc `BigInt` cho tổng lớn). Thời gian `timestamptz` lưu UTC.
- Tên bảng và cột `snake_case` (Prisma dùng `@@map`, `@map`), model Prisma `PascalCase`.
- Dữ liệu đơn hàng, tiền, đánh giá giữ **bản chụp** (giá, tên sản phẩm, địa chỉ, phí) tại thời điểm tạo; sửa sản phẩm hay địa chỉ sau đó không làm đổi đơn cũ.
- Không xóa cứng dữ liệu nghiệp vụ: sản phẩm thì ẩn, tiền thì ghi bút toán điều chỉnh.
- Ràng buộc Prisma chưa khai được (ví dụ "mỗi người một địa chỉ mặc định") viết tay thêm vào cuối file migration, kèm chú thích.
- Mỗi service có 3 bảng nền tảng giống nhau: `audit_logs`, `outbox_events`, `inbox_events`.

## Thêm hoặc sửa bảng

1. Sửa `services/<service>/prisma/schema.prisma`.
2. Chạy `pnpm --filter @san/<service> prisma:migrate` (cần `pnpm infra:up`), đặt tên migration rõ nghĩa, ví dụ `add_products`.
3. Commit cả `schema.prisma` và thư mục migration mới trong cùng Pull Request. Không sửa migration đã vào `main`.
4. Cập nhật bảng ở file này nếu khác khung.

## U: user-service (user_db)

Sơ đồ: `docs/so-do/09-erd-u-user-service`

### Tài khoản và đăng nhập

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `users` | P1 | id<br>email (duy nhất)<br>password_hash?<br>full_name, phone, date_of_birth, gender<br>status: UNVERIFIED \| ACTIVE \| LOCKED<br>failed_login_count, login_locked_until | Tài khoản (ACC-01..04) |
| `user_identities` | P1 | id<br>user_id → users<br>provider: GOOGLE<br>provider_subject (duy nhất) | Liên kết Google |
| `verification_codes` | P1 | id<br>user_id → users<br>purpose: VERIFY_EMAIL \| RESET_PASSWORD<br>code_hash, expires_at<br>attempts, used_at | Mã 6 số qua email |
| `refresh_tokens` | P1 | id<br>user_id → users<br>family_id<br>token_hash (duy nhất)<br>expires_at, revoked_at | Phiên đăng nhập 7 ngày |
| `user_permissions` | P1 | user_id → users<br>permission: MODERATION \| SUPPORT \| FINANCE \| SYSTEM<br>granted_by, granted_at | Bộ quyền admin (ACC-05) |

### Sổ địa chỉ

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `addresses` | P1 | id<br>user_id → users<br>recipient_name, phone<br>province_id, district_id, ward_code (GHN)<br>street, label<br>is_default (1 mặc định/người) | ACC-04, tối đa 10 |

## M: marketplace-service (market_db)

Sơ đồ: `docs/so-do/10-erd-m-marketplace-service`

### Địa giới GHN

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `ghn_provinces` | P1 | id (ProvinceID)<br>name | Lấy từ GHN, cập nhật mỗi ngày |
| `ghn_districts` | P1 | id (DistrictID)<br>province_id → ghn_provinces<br>name |  |
| `ghn_wards` | P1 | code (WardCode)<br>district_id → ghn_districts<br>name |  |

### Shop

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `shops` | P1 | id<br>owner_user_id ↗U (duy nhất: 1 TK 1 shop)<br>status: PENDING \| REJECTED \| ACTIVE \| SUSPENDED(P2)<br>name, description, logo_key, phone<br>địa chỉ lấy hàng (mã GHN)<br>tài khoản ngân hàng<br>approved_version, latest_version | SHP-01, SHP-03, SHP-04 |
| `shop_applications` | P1 | id<br>shop_id → shops<br>version, kind: REGISTRATION \| CHANGE<br>status: PENDING \| APPROVED \| REJECTED \| SUPERSEDED<br>profile (bản chụp), change<br>reject_reason, decided_at | Mỗi lần nộp là 1 phiên bản |
| `uploaded_files` | P1 | key (MinIO)<br>owner_user_id ↗U<br>purpose: SHOP_LOGO \| PRODUCT_IMAGE \| ...<br>content_type, size_bytes, used_at | File đã tải lên |
| `idempotency_keys` | P1 | user_id ↗U + key<br>endpoint, request_hash<br>status_code, response_body | Chống gửi lặp |

### Danh mục, sản phẩm, tồn (P2)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `categories` | P2 | id<br>parent_id → categories (2 cấp)<br>name, slug, sort, is_active | CAT-01 |
| `products` | P2 | id<br>shop_id → shops<br>category_id → categories<br>name, description<br>status: DRAFT \| ACTIVE \| HIDDEN \| BANNED<br>weight_g, kích thước (GHN)<br>min_price, sold_count, rating_avg<br>search_vector (tìm không dấu) | CAT-02, CAT-04, SRC-01 |
| `product_images` | P2 | id<br>product_id → products<br>file_key, sort (tối đa 9) | Bộ ảnh chung |
| `product_options` | P2 | id<br>product_id → products<br>position: 1 \| 2, name (Màu, Size) | Tối đa 2 nhóm biến thể |
| `product_option_values` | P2 | id<br>option_id → product_options<br>value, sort<br>image_key? (chỉ nhóm 1) | Lựa chọn, ảnh theo màu |
| `skus` | P2 | id<br>product_id → products<br>option_value_1_id, option_value_2_id<br>price<br>stock_on_hand, stock_reserved<br>status | CAT-03, mỗi tổ hợp 1 SKU |
| `stock_movements` | P2 | id<br>sku_id → skus<br>type: IN \| ADJUST \| RESERVE \| COMMIT \| RELEASE \| RETURN<br>qty, ref_type, ref_id, actor | INV-01, lịch sử tồn |

### Giỏ hàng, voucher

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `cart_items` | P2 | user_id ↗U + sku_id → skus<br>qty, selected | CRT-01 |
| `vouchers` | P2 | id<br>scope: SHOP \| PLATFORM, shop_id? → shops<br>code, discount_type, discount_value, max_discount<br>min_order_amount, starts_at, ends_at<br>total_quota, per_user_limit, used_count | VCH-01 |
| `saved_vouchers` | P3 | user_id ↗U + voucher_id → vouchers<br>saved_at | VCH-02 lưu mã |
| `voucher_usages` | P3 | id<br>voucher_id → vouchers<br>user_id ↗U<br>order_group_id, shop_order_id?<br>amount, status: USED \| RETURNED | VCH-02, VCH-03 |

### Checkout và đơn hàng (P3)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `checkout_sessions` | P3 | id (mã xem trước)<br>buyer_id ↗U<br>snapshot (giá, voucher, phí ship)<br>expires_at, order_group_id? | Chống đặt trùng |
| `order_groups` | P3 | id, code (mã ngắn)<br>buyer_id ↗U<br>payment_method: VNPAY \| COD<br>địa chỉ nhận (bản chụp)<br>platform_voucher_id, platform_discount<br>goods_total, ship_fee_total, grand_total<br>payment_deadline, check_status | Đơn tổng ORD-01 |
| `shop_orders` | P3 | id, code (mã tổng + -1, -2)<br>order_group_id → order_groups<br>shop_id → shops<br>status (STATE-01)<br>goods_amount, shop_discount, platform_discount<br>ship_fee, ship_fee_is_fallback<br>platform_fee_rate (bản chụp), cod_amount<br>confirm_deadline, handover_deadline, completed_at | Đơn con ORD-02..05 |
| `order_items` | P3 | id<br>shop_order_id → shop_orders<br>sku_id → skus<br>tên, ảnh, biến thể (bản chụp)<br>unit_price, qty, discount phân bổ<br>returned_qty | Dòng hàng |
| `stock_reservations` | P3 | id<br>shop_order_id → shop_orders<br>sku_id → skus<br>qty, status: HELD \| COMMITTED \| RELEASED<br>expires_at | INV-02 giữ tồn |
| `order_status_history` | P3 | id<br>shop_order_id → shop_orders<br>from_status, to_status<br>actor_type, actor_id, reason | Lịch sử trạng thái |
| `cancel_requests` | P3 | id<br>shop_order_id → shop_orders<br>requested_by, reason<br>status, decided_at | ORD-05 sau khi xác nhận |
| `policy_configs` | P3 | key, version<br>value, effective_from<br>created_by ↗U | ADM-01 cấu hình có phiên bản |

### Vận chuyển (P4)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `shipments` | P4 | id<br>shop_order_id → shop_orders<br>kind: OUTBOUND \| RETURN<br>ghn_order_code (duy nhất)<br>status, fee, cod_amount<br>incident: LOST \| DAMAGED? | SHIP-02..04 |
| `shipment_events` | P4 | id<br>shipment_id → shipments<br>ghn_status, occurred_at<br>dedupe_key (duy nhất), raw | Webhook GHN, chống trùng |

### Trả hàng (P5)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `return_requests` | P5 | id<br>shop_order_id → shop_orders<br>buyer_id ↗U<br>reason, status (STATE-03)<br>refund_amount, seller_response<br>deadline, dispute_id? ↗A | RET-01..04 |
| `return_items` | P5 | return_request_id → return_requests<br>order_item_id → order_items<br>qty, amount | Phần trả |
| `return_evidence` | P5 | id<br>return_request_id → return_requests<br>file_key, uploaded_by | Ảnh/video bằng chứng |

### Đánh giá, theo dõi (P6)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `reviews` | P6 | id<br>order_item_id → order_items (duy nhất)<br>product_id, shop_id, buyer_id ↗U<br>rating 1–5, content<br>edit_count (sửa 1 lần)<br>seller_reply, replied_at | ENG-01, ENG-02 |
| `review_images` | P6 | review_id → reviews<br>file_key, sort (tối đa 5) |  |
| `shop_follows` | P6 | user_id ↗U + shop_id → shops<br>created_at | ENG-03 |
| `product_likes` | P6 | user_id ↗U + product_id → products<br>created_at | ENG-03 |

### Chat, thông báo (P6)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `conversations` | P6 | id<br>buyer_id ↗U + shop_id → shops (duy nhất)<br>last_message_at<br>buyer_unread, shop_unread | MSG-01 |
| `messages` | P6 | id<br>conversation_id → conversations<br>sender_type, sender_id<br>type: TEXT \| IMAGE \| PRODUCT \| ORDER<br>content, file_key, ref_id |  |
| `notifications` | P6 | id<br>user_id ↗U<br>type, title, body, link<br>source_event_id (chống trùng)<br>read_at | MSG-02 |

## P: payment-service (payment_db)

Sơ đồ: `docs/so-do/11-erd-p-payment-service`

### Thu tiền (P3)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `payments` | P3 | id<br>order_group_id ↗M (duy nhất)<br>buyer_id ↗U, method<br>amount, status<br>paid_at | Mỗi đơn tổng 1 khoản thu |
| `payment_attempts` | P3 | id<br>payment_id → payments<br>attempt_no (tối đa 3)<br>vnp_txn_ref (duy nhất), amount<br>status: PENDING \| SUCCEEDED \| FAILED \| UNKNOWN \| EXPIRED<br>vnp_transaction_no | PAY-01..03 |
| `gateway_callbacks` | P3 | id<br>payment_attempt_id → payment_attempts<br>source: IPN \| RETURN \| QUERYDR<br>signature_valid, raw, received_at | Lưu nguyên mọi phản hồi VNPay |
| `allocations` | P3 | id<br>payment_id → payments<br>shop_order_id ↗M (duy nhất), shop_id ↗M<br>goods, shop_discount, platform_discount<br>ship_fee, platform_fee, seller_net | PAY-04 phân bổ theo đơn con |
| `refunds` | P3 | id<br>payment_id → payments<br>shop_order_id ↗M, return_request_id? ↗M<br>kind: CANCEL \| RETURN \| INCIDENT<br>amount, status, attempts<br>manual_tx_code, manual_proof_key | REF-01, REF-02 |
| `fee_configs` | P3 | version, platform_fee_rate<br>effective_from, created_by ↗U | FIN-03 phí 5% |

### Tiền seller (P4–P5)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `shop_order_finances` | P4 | shop_order_id ↗M<br>shop_id ↗M<br>money_received, completed<br>open_claims, released_at | Điều kiện ghi khả dụng FIN-02 |
| `seller_accounts` | P4 | shop_id ↗M<br>pending, available, locked (số dư tạm)<br>updated_at | FIN-01 |
| `ledger_entries` | P4 | id<br>shop_id → seller_accounts<br>bucket: PENDING \| AVAILABLE \| LOCKED<br>amount (+/-), entry_type<br>ref_type, ref_id (chống ghi trùng) | Mỗi biến động 1 dòng |
| `platform_entries` | P3 | id<br>type: PLATFORM_FEE \| VOUCHER_SUBSIDY \| GATEWAY_FEE \| SHIP_FEE \| ...<br>amount, ref_type, ref_id | Thu chi của sàn |

### Đối soát (P4)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `cod_reconciliation_batches` | P4 | id<br>file_key, uploaded_by ↗U<br>status, totals | COD-02 file GHN |
| `cod_reconciliation_lines` | P4 | id<br>batch_id → cod_reconciliation_batches<br>ghn_order_code, cod_amount, fee<br>shop_order_id? ↗M, match_status | Khớp theo mã vận đơn |
| `gateway_reconciliation_runs` | P4 | id<br>run_date, status<br>mismatch_count, details | PAY-05 querydr hằng ngày |

### Rút tiền (P5)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `shop_bank_accounts` | P5 | shop_id ↗M<br>bank_name, account_number, holder<br>version (từ M qua sự kiện) | Bản sao để chi trả |
| `withdrawals` | P5 | id<br>shop_id → seller_accounts<br>amount (≥ 50.000đ)<br>status: REQUESTED \| APPROVED \| REJECTED \| PAID<br>bank (bản chụp) | FIN-04, 1 yêu cầu mở/shop |
| `payouts` | P5 | id<br>withdrawal_id → withdrawals (duy nhất)<br>transfer_code, receipt_key<br>paid_by ↗U, paid_at | FIN-06 chuyển tay có chứng từ |

## A: approval-service (approval_db)

Sơ đồ: `docs/so-do/12-erd-a-approval-service`

### Duyệt shop, kiểm duyệt

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `shop_reviews` | P1 | id<br>shop_id ↗M, version (duy nhất cùng nhau)<br>kind: REGISTRATION \| CHANGE<br>status: PENDING \| APPROVED \| REJECTED \| SUPERSEDED<br>owner_user_id ↗U (chặn tự duyệt)<br>profile (bản chụp), change<br>reason, decided_by, decided_at | SHP-02 |
| `moderation_cases` | P2 | id<br>target_type: SHOP \| PRODUCT, target_id ↗M<br>action: SUSPEND \| RESTORE \| REMOVE<br>status, reason, decided_by | SHP-04, MOD-01 |
| `violation_reports` | P6 | id<br>reporter_id ↗U<br>target_type, target_id ↗M<br>reason, evidence<br>case_id → moderation_cases? | MOD-01 báo cáo vi phạm |

### Kiểm tra đơn (P3)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `order_checks` | P3 | id<br>order_group_id ↗M (duy nhất)<br>amount, payment_method<br>rules_hit, rule_version<br>status: PENDING \| PASSED \| REJECTED \| TIMED_OUT<br>deadline (24 giờ), decided_by | RSK-01 |
| `risk_rule_configs` | P3 | version<br>thresholds (10tr, COD 3tr)<br>effective_from | Luật kiểm tra có phiên bản |

### Tranh chấp, tài chính (P5)

| Bảng | Phase | Cột chính | Ghi chú |
| --- | --- | --- | --- |
| `disputes` | P5 | id<br>return_request_id ↗M, shop_order_id ↗M<br>buyer_id ↗U, shop_id ↗M<br>status, decision, refund_amount<br>deadline, decided_by | DIS-01 |
| `dispute_statements` | P5 | id<br>dispute_id → disputes<br>party: BUYER \| SELLER \| ADMIN<br>content, file_keys | Lời hai bên + bằng chứng |
| `withdrawal_reviews` | P5 | id<br>withdrawal_id ↗P (duy nhất)<br>shop_id ↗M, owner_user_id ↗U<br>amount, status<br>reason, decided_by | FIN-05 |
| `finance_exceptions` | P5 | id<br>target_type, target_id<br>proposed_adjustment<br>status, decided_by | DIS-02 ngoại lệ |
