# Quyết định P7: cộng tác viên bán hàng (affiliate), chủ đồ án duyệt 13/11/2026

File này gồm những gì chốt cho vòng **P7**, phần mở rộng sau 6 phase. Các vòng trước nằm ở `02` đến `13`. Đã code xong (13/11/2026). API ở `docs/api/README.md` mục 9, sự kiện ở `docs/api/events.md` mục 9, bảng ở `docs/erd/README.md`. Mục 10 ghi những chỗ Claude tự quyết khi code.

Phạm vi P7 (mã chức năng ở `docs/ke-hoach` mục 5.9):

| Mã | Chức năng | Ai dùng | Service | Tiêu chí hoàn thành |
| --- | --- | --- | --- | --- |
| AFF-01 | Đăng ký và duyệt cộng tác viên (CTV), khóa/mở CTV | Người dùng, admin `MODERATION` | M, A | Mỗi tài khoản một hồ sơ CTV; admin không tự duyệt hồ sơ của mình; quyết định cũ tới sau không ghi đè quyết định mới. |
| AFF-02 | Shop đặt hoa hồng cho sản phẩm | Seller | M | % nằm trong khoảng sàn cho phép; đổi % chỉ áp cho đơn đặt sau đó. |
| AFF-03 | Link tiếp thị và lượt bấm | CTV, người mua | M, web | Link mở đúng trang sản phẩm/shop; lượt bấm có hạn 7 ngày; mã CTV sai hoặc bị khóa không làm hỏng trang. |
| AFF-04 | Gắn đơn cho CTV và tính hoa hồng | Hệ thống | M, P | Đúng CTV bấm gần nhất; tự mua hoặc chủ shop không có hoa hồng; tính đúng khi hủy, giao thất bại, trả hàng một phần. |
| AFF-05 | Ví CTV và rút tiền | CTV, admin `FINANCE` | P, A | Tiền CTV đi đúng nhịp tiền seller; rút tiền dùng luồng duyệt và chi trả có sẵn; số dư không âm. |
| AFF-06 | Khu Cộng tác viên và báo cáo | CTV, seller | M, P, web | CTV thấy lượt bấm, đơn, hoa hồng theo ngày; seller thấy đơn nào qua CTV và hoa hồng phải trả. |

Kết quả cần đạt khi demo: CTV đăng ký → admin duyệt → lấy link → người mua bấm link và đặt hàng → đơn hoàn tất → hoa hồng sang khả dụng → CTV rút tiền. Thêm một nhánh trả hàng một phần để thấy hoa hồng được tính lại.

## 1. Quyết định của chủ đồ án (13/11/2026)

| # | Chủ đề | Quyết định |
| --- | --- | --- |
| 1 | Hướng làm | **Link tiếp thị sản phẩm** (kiểu Shopee Affiliate), **một cấp**: không có hoa hồng cho việc mời thêm CTV. |
| 2 | Ai trả hoa hồng | **Shop trả**, trừ vào tiền shop nhận của đơn con đó. |
| 3 | Mức % | **Shop bật và đặt % cho từng sản phẩm**, trong khoảng sàn cho phép (cấu hình). Sản phẩm không bật thì không có hoa hồng. |
| 4 | Ai làm CTV | **Đăng ký, admin duyệt** ở approval-service, giống duyệt shop. |
| 5 | Đơn tính cho ai | **CTV có link được bấm gần nhất, trong 7 ngày** (cấu hình) trước lúc đặt hàng. |
| 6 | Phạm vi | **Mọi sản phẩm có bật hoa hồng của shop trong link**, mỗi món tính theo % của chính nó. Link sản phẩm hay link shop đều tính theo shop. |
| 7 | Cơ sở tính | **Tiền hàng sau voucher shop**, giống phí sàn: không tính phí ship, không trừ voucher sàn. Làm tròn xuống tới đồng. |
| 8 | Ví CTV | **Mở rộng ví 3 ngăn hiện có** (đang giữ, khả dụng, đang khóa) để chủ ví là shop hoặc CTV. |
| 9 | Chống gian lận | Không có hoa hồng khi **CTV tự mua qua link của mình**, hoặc khi **CTV là chủ shop đó**. Đơn vẫn đặt bình thường. |

Không làm trong P7 (chủ đồ án không chọn): chặn trùng số điện thoại/địa chỉ, giới hạn lượt bấm, mã giới thiệu, sàn trả thưởng, thuế thu nhập cá nhân, nhiều cấp.

## 2. Điểm Claude tự chọn (chủ đồ án có thể đổi)

**Hồ sơ CTV**

1. Hồ sơ gồm: tên hiển thị, kênh bán hàng (đường dẫn Facebook/TikTok/YouTube/website, 1–3 kênh), số điện thoại, tài khoản ngân hàng nhận tiền. Mỗi tài khoản tối đa một hồ sơ CTV; bị từ chối thì sửa và nộp lại (mỗi lần nộp tăng `version`, như hồ sơ shop).
2. Chủ shop **vẫn làm CTV được** cho shop khác. Admin là CTV không tự duyệt hồ sơ, không tự duyệt và tự chi yêu cầu rút của mình.
3. Được duyệt thì CTV có **mã CTV** 8 ký tự (chữ in hoa và số, ngẫu nhiên, không đổi), dùng trong link.
4. Đổi tài khoản ngân hàng sau khi duyệt **không cần duyệt lại**, vì mọi lần rút đều qua admin `FINANCE` duyệt và admin thấy tài khoản nhận. Không đổi được khi đang có yêu cầu rút chưa xong.
5. Admin `MODERATION` khóa/mở CTV, bắt buộc ghi lý do. CTV bị khóa: link không tính đơn mới, không rút tiền được (giống shop bị đình chỉ); đơn đã gắn trước đó vẫn đi hết vòng đời và hoa hồng vẫn ghi vào ví.

**Link và lượt bấm**

6. Link = đường dẫn trang sản phẩm hoặc trang shop hiện có, thêm `?aff=<mã CTV>`. Web tự ghép link, không cần API tạo link.
7. Mở link: web gọi API ghi lượt bấm, nhận mã lượt bấm và giữ trong trình duyệt theo từng shop (lượt mới thay lượt cũ của cùng shop), hết hạn sau 7 ngày. Nếu người mua đang đăng nhập thì lượt bấm cũng gắn với tài khoản, nên đổi máy vẫn tính.
8. Mã CTV sai hoặc CTV bị khóa: trang vẫn mở bình thường, chỉ không ghi lượt bấm.
9. CTV không thấy nút "Lấy link" với sản phẩm/shop của chính mình.

**Gắn đơn và tính hoa hồng**

10. Gắn CTV **lúc tạo đơn**, không phải lúc xem trước. Với mỗi đơn con: lấy các lượt bấm còn hạn của shop đó (do trình duyệt gửi kèm, hoặc gắn với tài khoản người mua), chọn lượt **mới nhất** có CTV đang hoạt động. CTV là người mua hoặc là chủ shop thì không gắn.
11. Hoa hồng từng dòng = ⌊(thành tiền dòng − phần voucher shop của dòng) × % ⌋. Phần voucher shop chia cho dòng theo đúng cách P5 đang dùng (`shopDiscountByLine`). Tỉ lệ % và tiền hoa hồng được **chụp vào dòng hàng**; shop đổi % sau đó không ảnh hưởng.
12. Phí sàn **vẫn tính trên tiền hàng sau voucher shop**, không trừ hoa hồng trước. Seller nhận = tiền hàng − voucher shop − phí sàn − hoa hồng. Khoảng % tối đa (30%) cộng phí sàn (5%) luôn nhỏ hơn 100% nên seller không bao giờ nhận số âm.
13. Người mua không thấy gì khác: giá, voucher và số tiền phải trả không đổi.

**Tiền của CTV**

14. Tiền hoa hồng đi **cùng nhịp và cùng giao dịch** với tiền seller của đơn con đó:

| Lúc | Tiền seller | Tiền CTV |
| --- | --- | --- |
| Đơn trả trước đã thu tiền / đơn COD đã giao | Vào đang giữ | Hoa hồng vào đang giữ |
| Đơn hoàn tất, tiền đã về sàn, không còn yêu cầu trả hàng mở | Sang khả dụng | Sang khả dụng |
| Hủy, giao thất bại, hết hạn thanh toán | Trừ lại | Trừ lại, hoa hồng = 0 |
| Sự cố GHN (seller được đền) | Đền vào khả dụng | Không có hoa hồng (hàng không tới tay người mua) |
| Trả hàng hoàn toàn bộ | Trừ phần trả | Trừ hoa hồng của các món trả |
| Trả hàng hoàn một phần X | Trừ theo tỉ lệ | Trừ ⌊hoa hồng của các món trả × X / số hoàn tối đa⌋ |
| Kiện trả bị GHN làm thất lạc (sàn chịu) | Không trừ | Không trừ |

15. Điều chỉnh sau giải ngân (DIS-02) **chỉ áp cho ví shop** trong P7. Hoa hồng đã sang khả dụng không bị đòi lại.
16. CTV rút tiền giống seller: tối thiểu `withdraw_min_amount` (50.000đ), mỗi ví một yêu cầu đang xử lý, admin `FINANCE` duyệt ở approval-service rồi chuyển khoản ngoài hệ thống và nhập biên lai.

**Quyền riêng tư**

17. CTV thấy mã đơn con, tên sản phẩm, số lượng, trạng thái, hoa hồng; **không thấy** tên, số điện thoại, địa chỉ người mua.
18. Seller thấy đơn nào qua CTV, tên hiển thị của CTV và hoa hồng của từng dòng; không thấy tài khoản ngân hàng của CTV.

## 3. Bảng dữ liệu

Thêm **3 bảng mới** (chủ đồ án duyệt cùng bản này), sửa một số bảng có sẵn.

### marketplace-service (`market_db`)

| Bảng | Mới/sửa | Cột chính |
| --- | --- | --- |
| `affiliates` | **Mới** | `id`, `user_id` (duy nhất), `code` (mã CTV, duy nhất, có khi được duyệt), `status` (`PENDING`, `REJECTED`, `ACTIVE`, `SUSPENDED`), `version`, `display_name`, `channels` (mảng chữ, 1–3 đường dẫn), `phone`, `bank_name`, `bank_account_number`, `bank_account_name`, `reject_reason`, `suspend_reason`, `request_key` (chống nộp lặp), `moderated_at` (bỏ quyết định cũ tới sau), `created_at`, `updated_at` |
| `affiliate_clicks` | **Mới** | `id`, `affiliate_id`, `shop_id`, `product_id` (trống với link shop), `user_id` (trống nếu chưa đăng nhập), `created_at`, `expires_at` |
| `products` | Sửa | Thêm `commission_rate` (phần vạn, 500 = 5%; trống = không bật) |
| `order_items` | Sửa | Thêm `commission_rate`, `commission` (chụp lúc đặt, 0 nếu không có) |
| `shop_orders` | Sửa | Thêm `affiliate_id`, `affiliate_click_id`, `commission` (tổng hoa hồng đơn con) |

### payment-service (`payment_db`)

Đây là phần sửa nặng nhất vì đụng vào ví đang chạy.

| Bảng | Mới/sửa | Thay đổi |
| --- | --- | --- |
| `seller_wallets` → **`wallets`** | Sửa, đổi tên | Khóa chính đổi từ `shop_id` thành `id`; thêm `owner_type` (`SHOP`, `AFFILIATE`), `affiliate_id`. `shop_id` và `affiliate_id` đúng một cột có giá trị (ràng buộc CHECK). `owner_id` (userId) đổi từ duy nhất thành duy nhất theo cặp (`owner_type`, `owner_id`), vì một người có thể vừa có shop vừa là CTV. Giữ ràng buộc 3 ngăn không âm. |
| `wallet_transactions` | Sửa | `shop_id` thay bằng `wallet_id`. Ràng buộc chống ghi trùng đổi từ (`shop_order_id`, `type`) thành (`wallet_id`, `shop_order_id`, `type`), vì cùng một đơn con giờ ghi vào hai ví (shop và CTV). |
| `withdrawals` | Sửa | `shop_id` thay bằng `wallet_id`; thêm `owner_type`; `shop_name` đổi tên thành `display_name` (tên shop hoặc tên CTV). Ràng buộc "mỗi shop một yêu cầu đang xử lý" thành "mỗi ví một yêu cầu". |
| `seller_earnings` | Sửa | Thêm `affiliate_id`, `affiliate_user_id`, `commission`, `return_commission_reversed`. `seller_amount` đã trừ hoa hồng. |

Dữ liệu cũ chuyển bằng migration: mỗi ví shop hiện có thành một dòng `wallets` loại `SHOP`, các dòng lịch sử và yêu cầu rút trỏ sang ví đó.

### approval-service (`approval_db`)

| Bảng | Mới/sửa | Cột chính |
| --- | --- | --- |
| `affiliate_approvals` | **Mới** | `id`, `affiliate_id`, `type` (`REGISTER`, `SUSPEND`, `RESTORE`), `version` (với `REGISTER`), `status` (`PENDING`, `APPROVED`, `REJECTED`, `REPLACED`), `user_id`, `user_name`, `user_email`, `data` (hồ sơ nhận trong sự kiện), `reason`, `decided_by`, `decided_by_name`, `decided_at`, `submitted_at` |
| `withdrawal_approvals` | Sửa | Thêm `owner_type`, `affiliate_id`; `shop_id` cho phép trống; `shop_name` đổi tên thành `display_name` |

## 4. API

Danh sách đầy đủ ở `docs/api/README.md` mục 9.

## 5. Sự kiện

Danh sách đầy đủ ở `docs/api/events.md` mục 9.

## 6. Màn hình

**Khu mua hàng**
- Menu tài khoản thêm mục "Cộng tác viên": chưa đăng ký thì mở trang giới thiệu và form đăng ký; đã đăng ký thì vào khu Cộng tác viên.
- Trang sản phẩm và trang shop: CTV đang hoạt động thấy nút **"Lấy link · Hoa hồng x%"**, bấm thì sao chép link. Người khác không thấy gì.

**Khu Cộng tác viên** (khung giống Kênh người bán: menu trái, trên điện thoại thành nút ☰)
- Tổng quan: lượt bấm, số đơn, hoa hồng dự kiến, ví 3 ngăn, biểu đồ theo ngày (Recharts, đã duyệt).
- Sản phẩm có hoa hồng: lọc, sắp xếp, nút lấy link.
- Đơn và hoa hồng.
- Ví và rút tiền (giống trang tài chính của shop).
- Hồ sơ và tài khoản nhận tiền.

**Kênh người bán**
- Sản phẩm: cột "Hoa hồng CTV", chọn nhiều sản phẩm để bật/tắt hoặc đặt %.
- Đơn hàng: nhãn "Qua CTV" trên đơn, chi tiết đơn hiện CTV và hoa hồng từng dòng.
- Tài chính: tiền từng đơn con hiện thêm dòng "Hoa hồng CTV".

**Quản trị**
- Duyệt CTV: hàng chờ giống Duyệt shop.
- Cộng tác viên: danh sách, khóa/mở.
- Rút tiền: lọc theo shop hay CTV.
- Cấu hình: 3 con số ở mục 7.

## 7. Con số cấu hình mới

| Ở đâu | Khóa | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| Bảng `settings` (marketplace) | `affiliate_click_days` | 7 | Hạn của lượt bấm |
| Bảng `settings` (marketplace) | `affiliate_rate_min_percent_x100` | 100 | % hoa hồng thấp nhất shop được đặt (1%) |
| Bảng `settings` (marketplace) | `affiliate_rate_max_percent_x100` | 3000 | % hoa hồng cao nhất (30%) |

Rút tiền dùng lại `withdraw_min_amount` của payment-service.

## 8. Test bắt buộc

- Tính hoa hồng: nhiều dòng, voucher shop chia dòng, làm tròn, sản phẩm không bật, % đổi sau khi đặt.
- Gắn đơn: lượt mới nhất thắng, hết hạn, CTV bị khóa, CTV tự mua, CTV là chủ shop, đơn nhiều shop chỉ gắn đúng shop.
- Ví: mọi dòng của bảng mục 2 số 14; nhận trùng sự kiện không ghi tiền hai lần; số dư không âm; migration ví cũ giữ đúng số dư.
- Quyền: CTV chỉ xem đơn và ví của mình; admin không tự duyệt hồ sơ và yêu cầu rút của mình.
- Kịch bản `pnpm test:e2e` thêm vòng CTV ở phần "Kết quả cần đạt".

## 9. Việc cần báo nhóm

- **payment-service sửa ví đang chạy** (đổi tên bảng, đổi khóa, đổi sự kiện rút tiền lên v2). Người phụ trách payment-service và approval-service cần duyệt PR.
- `packages/shared` thêm kiểu sự kiện mới, sửa kiểu sự kiện rút tiền: ảnh hưởng cả 4 service.

## 10. Điểm Claude tự quyết khi code (13/11/2026, chủ đồ án có thể đổi)

1. Đơn con **không có món nào bật hoa hồng thì không gắn CTV**, để CTV không thấy đơn 0đ.
2. **Sự cố GHN**: CTV không có hoa hồng, seller được đền cả phần hoa hồng đã trừ lúc đặt (đền = seller nhận + hoa hồng), vì đơn không tới tay người mua.
3. **Phí sàn không đổi** khi có CTV: vẫn tính trên tiền hàng sau voucher shop; hoa hồng trừ thêm vào phần seller nhận.
4. `GET /affiliates/me` trả `status: NONE` khi chưa đăng ký (giống `/shops/me`), thay vì 404 như bản nháp.
5. Đường dẫn đặt hoa hồng đổi thành `PUT /shops/me/product-commissions` để không đụng `PUT /shops/me/products/{productId}`; thêm `GET /shops/me/affiliate-settings` cho web biết khoảng % cho phép.
6. **Lượt bấm**: CTV tự bấm link của mình vẫn ghi nhưng không gắn tài khoản; link tới shop của chính CTV trả 404. Web bỏ `?aff=` khỏi địa chỉ sau khi ghi, để chia sẻ lại link không kéo theo mã người khác.
7. Khóa/mở CTV ở approval-service biết trạng thái theo quyết định gần nhất của chính nó: chưa duyệt → 409 `AFFILIATE_NOT_APPROVED`; khóa khi đang khóa → 409 `AFFILIATE_ALREADY_IN_STATE`. Lý do khóa/mở 10–500 ký tự.
8. Chỉ `withdrawal.requested` và `withdrawal.updated` lên version 2 (hai sự kiện còn lại không có thông tin shop). Thêm bảng tra `EVENT_VERSIONS` để EventBus ghi đúng phiên bản.
9. Báo cáo tài chính của admin tách riêng phần CTV (hoa hồng, phải trả, đã chi); "phải trả seller" và "đã chi cho seller" chỉ còn tính ví shop.
10. Test của payment-service luôn dùng cổng thanh toán MÔ PHỎNG, kể cả khi `.env` của máy có khóa VNPay sandbox (trước đây máy có khóa thì test không chạy được).
11. Kiểm thử tổng hợp vòng CTV qua 4 service: `pnpm test:e2e:affiliate` (`scripts/e2e-affiliate.mjs`), cần vận chuyển MÔ PHỎNG.
