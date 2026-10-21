# Quyết định đã chốt ở P6: trải nghiệm và hoàn thiện (21/10/2026)

File này gồm những gì chốt ở vòng **P6**. Các vòng trước nằm ở `02` đến `12`. API của P6 ở `docs/api/README.md` mục 7, sự kiện ở `docs/api/events.md` mục 7, cột bảng ở `docs/erd/README.md`.

Phạm vi P6: ENG-01 đánh giá sản phẩm/shop, ENG-02 seller trả lời đánh giá, ENG-03 theo dõi shop và thả tim sản phẩm, MSG-01 chat người mua với shop, MSG-02 thông báo theo sự kiện, MOD-01 báo cáo vi phạm và kiểm duyệt, RPT-01 báo cáo vận hành, RPT-02 báo cáo tài chính, SRC-01 (phần P6: lọc theo sao, sắp xếp theo đánh giá), kiểm thử tổng hợp cả vòng đời.

Kết quả cần đạt: người mua, seller, admin dùng được trọn vòng đời; đủ bằng chứng nghiệm thu.

## 1. Quyết định của chủ đồ án

7 thẻ quyết định ngày 20–21/10/2026, cộng 3 điểm đã chốt từ vòng ERD (08/10).

| # | Chủ đề | Quyết định |
| --- | --- | --- |
| 1 | Sao của shop | **Trung bình sao của mọi sản phẩm trong shop.** Không có điểm chấm riêng cho shop. |
| 2 | Lúc được đánh giá | **Sau khi đơn con hoàn tất**, trong 30 ngày tính từ lúc hoàn tất. Món đã trả hết thì không đánh giá được. |
| 3 | Báo cáo vi phạm | Người mua báo cáo **sản phẩm hoặc shop**, có lý do và ảnh. Admin Kiểm duyệt gỡ sản phẩm hoặc đình chỉ shop. |
| 4 | Thông báo | **Trong app và email.** Trong app: biểu tượng chuông, trang thông báo, hiện ngay. Email cho việc quan trọng (đơn đã giao, đã hoàn tiền, kết quả rút tiền…, bảng ở mục 3). |
| 5 | Chat | **Người mua mở chat** với shop, shop trả lời. Shop không tự mở chat. Admin không đọc chat. |
| 6 | Trang báo cáo | Dùng thư viện biểu đồ **Recharts** (chỉ cho web), lọc theo khoảng ngày. |
| 7 | Tìm kiếm | Thêm **lọc theo số sao** và **sắp xếp theo đánh giá**; vẫn chỉ dò trong tên sản phẩm. |
| 8 | Đánh giá (vòng ERD) | Mỗi dòng hàng đánh giá 1 lần, tối đa 5 ảnh, trong 30 ngày, sửa được 1 lần. |
| 9 | Yêu thích (vòng ERD) | Theo dõi shop và thả tim sản phẩm. |
| 10 | Nội dung chat (vòng ERD) | Chữ, ảnh tối đa 5 MB, thẻ sản phẩm, thẻ đơn hàng. |

## 2. Điểm Claude tự chọn (chủ đồ án có thể đổi)

| # | Điểm |
| --- | --- |
| 1 | **Sao lưu bằng số nguyên**: mỗi sản phẩm và mỗi shop lưu số đánh giá (`rating_count`) và tổng số sao (`rating_total`); sao trung bình = tổng / số, tính khi đọc, làm tròn 1 chữ số. Không lưu số thực. |
| 2 | Đánh giá **hiện ngay**, không qua duyệt. Nội dung tối đa 1.000 ký tự, được để trống (chỉ chấm sao). Tên người đánh giá hiện đã che bớt (ví dụ "N***n"). |
| 3 | Lượt sửa duy nhất dùng được trong hạn 30 ngày; sửa được sao, nội dung, ảnh. Shop trả lời một lần cho mỗi đánh giá và sửa được câu trả lời của mình. |
| 4 | Đánh giá mới tạo thông báo cho chủ shop (không email). |
| 5 | Một người mua với một shop có **đúng một cuộc trò chuyện**. Shop bị đình chỉ vẫn chat được (để giải quyết đơn cũ). Không chat với shop của chính mình. |
| 6 | Ảnh chat ở bucket **riêng tư**, chỉ hai bên xem qua API có kiểm quyền. Thẻ đơn hàng chỉ gửi được đơn con của chính người mua ở shop đó. Tin nhắn không sửa, không xóa. |
| 7 | Gửi tin bằng REST (có mã chống gửi lặp), nhận tức thời qua **Socket.IO** (đã chốt ở vòng chọn công nghệ). Chạy nhiều bản service thì dùng Redis adapter (`REDIS_URL`). Mất kết nối thì web tự lấy lại tin bằng REST. |
| 8 | Chat không tạo thông báo cho từng tin: chỉ khi cuộc trò chuyện chuyển từ "đã đọc hết" sang "có tin chưa đọc" mới có **một** thông báo, để không spam. Biểu tượng chat trên header có số tin chưa đọc riêng. |
| 9 | Thông báo do marketplace tạo (marketplace sở hữu bảng `notifications`). Sự kiện của service khác (hoàn tiền, rút tiền, duyệt shop, đình chỉ, gỡ sản phẩm, phân xử) tới marketplace rồi marketplace tạo thông báo. **Email do user-service gửi** (user-service giữ địa chỉ email và hộp thư gửi), nhận qua sự kiện `notification.created`. |
| 10 | Admin không nhận thông báo trong P6: việc của admin nằm trong các hàng chờ có sẵn (duyệt shop, duyệt đơn, tranh chấp, rút tiền, báo cáo vi phạm). |
| 11 | **Báo cáo vi phạm gửi thẳng tới approval-service**: với sản phẩm, approval gọi API công khai của marketplace để lấy tên, ảnh, shop; chủ shop lấy từ hồ sơ shop đã duyệt (approval có sẵn). Ảnh bằng chứng tải lên bucket riêng tư của marketplace (`report-images/<userId>/`), chỉ người báo cáo và admin Kiểm duyệt xem được. |
| 12 | Lý do báo cáo: hàng giả/nhái, hàng cấm, lừa đảo, thông tin sai sự thật, nội dung phản cảm, khác. Mô tả 10–1.000 ký tự, 0–5 ảnh. Mỗi người chỉ có một báo cáo đang chờ cho cùng một đối tượng; không báo cáo shop/sản phẩm của chính mình. |
| 13 | Admin xử lý một báo cáo thì **mọi báo cáo đang chờ của cùng đối tượng** được xử lý theo. Biện pháp: gỡ sản phẩm (báo cáo sản phẩm), đình chỉ shop (báo cáo sản phẩm hoặc shop), hoặc bác báo cáo. Đối tượng đã bị gỡ/đình chỉ rồi thì báo cáo chỉ được đánh dấu đã xử lý. Bắt buộc ghi lý do, ghi nhật ký; admin là chủ shop không tự xử lý. Người báo cáo xem kết quả ở trang "Báo cáo vi phạm của tôi" (không có thông báo, vì approval không gửi thông báo). |
| 14 | Sản phẩm bị gỡ: trạng thái `REMOVED`, biến mất khỏi sàn như sản phẩm ẩn, dòng giỏ thành "Không còn bán". Seller thấy nhãn "Bị gỡ" kèm lý do, vẫn sửa được nội dung nhưng không tự bật bán lại. Admin khôi phục thì sản phẩm về **ẩn**, seller tự bật bán. |
| 15 | Báo cáo vận hành của admin: bộ quyền `SYSTEM` hoặc `FINANCE`. Báo cáo tài chính của admin: `FINANCE`. Seller xem báo cáo của shop mình. Khoảng ngày theo giờ Việt Nam, tối đa 366 ngày, mặc định 30 ngày gần nhất. Định nghĩa từng con số ở mục 4. |
| 16 | Tìm kiếm: `minRating` = sao trung bình ≥ số đã chọn (sản phẩm chưa có đánh giá không ra khi lọc); sắp xếp `rating` = sao trung bình cao trước, bằng nhau thì nhiều đánh giá trước, chưa có đánh giá xếp cuối. |
| 17 | Kiểm thử tổng hợp: `pnpm test:e2e` chạy một kịch bản thật qua cả 4 service đang chạy (đặt hàng → giao → hoàn tất → đánh giá → chat → thông báo → báo cáo vi phạm → báo cáo), ngoài bộ test riêng của từng service. |
| 18 | Thư viện mới: `socket.io`, `@nestjs/websockets`, `@nestjs/platform-socket.io`, `@socket.io/redis-adapter`, `redis` (marketplace), `socket.io-client`, `recharts` (web). Socket.IO + Redis adapter là công nghệ đã chốt cho chat; Recharts chủ đồ án đồng ý ở thẻ số 6. |

## 3. Thông báo: ai nhận, lúc nào

Mỗi thông báo có tiêu đề, nội dung ngắn và đường dẫn mở đúng trang. Cột "Email" là loại gửi thêm email.

| Loại | Người nhận | Lúc nào | Email |
| --- | --- | --- | --- |
| `ORDER_CONFIRMED` | Người mua | Shop xác nhận đơn con | |
| `ORDER_SHIPPING` | Người mua | GHN đã lấy hàng | |
| `ORDER_DELIVERED` | Người mua | GHN giao thành công | Có |
| `ORDER_COMPLETED` | Người mua | Đơn con hoàn tất (mời đánh giá) | |
| `ORDER_CANCELLED` | Người mua | Đơn con bị hủy bởi shop, hệ thống hoặc admin (không báo khi chính người mua hủy) | Có |
| `ORDER_FAILED` | Người mua | Giao thất bại, hàng hoàn về shop | |
| `REFUND_DONE` | Người mua | Khoản hoàn tiền thành công (qua cổng hoặc admin hoàn tay) | Có |
| `RETURN_ACCEPTED` | Người mua | Yêu cầu trả hàng được chấp nhận (gửi hàng về hoặc hoàn ngay) | |
| `RETURN_REJECTED` | Người mua | Shop từ chối yêu cầu trả hàng | |
| `RETURN_REFUNDING` | Người mua | Đã quyết hoàn tiền cho yêu cầu trả hàng | |
| `RETURN_CLOSED` | Người mua | Yêu cầu đóng không hoàn tiền | |
| `SHOP_ORDER_NEW` | Chủ shop | Có đơn chờ xác nhận | |
| `SHOP_ORDER_CANCEL_REQUESTED` | Chủ shop | Người mua xin hủy đơn đã xác nhận | |
| `SHOP_ORDER_CANCELLED` | Chủ shop | Đơn con bị hủy bởi người mua, hệ thống hoặc admin | |
| `SHOP_RETURN_REQUESTED` | Chủ shop | Có yêu cầu trả hàng mới | |
| `SHOP_RETURN_RESULT` | Chủ shop | Admin phân xử tranh chấp của shop | |
| `SHOP_REVIEW_NEW` | Chủ shop | Có đánh giá mới | |
| `SHOP_APPROVED` / `SHOP_REJECTED` | Chủ shop | Hồ sơ mở shop hoặc đổi thông tin được duyệt / bị từ chối | Có |
| `SHOP_SUSPENDED` / `SHOP_RESTORED` | Chủ shop | Shop bị đình chỉ / được khôi phục | Có |
| `PRODUCT_REMOVED` | Chủ shop | Sản phẩm bị gỡ do vi phạm | Có |
| `PRODUCT_RESTORED` | Chủ shop | Sản phẩm được khôi phục (về ẩn) | |
| `WITHDRAWAL_APPROVED` | Chủ shop | Yêu cầu rút tiền được duyệt, chờ chuyển khoản | |
| `WITHDRAWAL_REJECTED` / `WITHDRAWAL_PAID` / `WITHDRAWAL_FAILED` | Chủ shop | Bị từ chối / đã chuyển khoản / chuyển lỗi (tiền đã mở khóa) | Có |
| `CHAT_MESSAGE` | Bên còn lại | Cuộc trò chuyện có tin chưa đọc đầu tiên (xem mục 2 số 8) | |

Danh sách loại nằm trong code ở `services/marketplace-service/src/notifications/notification-types.ts`.

## 4. Báo cáo: định nghĩa các con số

Mọi con số tính theo **đơn con** (phần của một shop trong đơn), tiền là số nguyên đồng. "Trong khoảng" = theo ngày giờ Việt Nam.

**Báo cáo vận hành (RPT-01, marketplace)**, đơn con **đặt trong khoảng**, bỏ đơn trả trước chưa thanh toán đã hết hạn:

| Con số | Cách tính |
| --- | --- |
| Số đơn | Số đơn con đã đặt |
| Giá trị đặt hàng | Tổng tiền hàng (`subtotal`) của các đơn đó |
| Đơn hoàn tất, doanh số | Đơn đang ở trạng thái hoàn tất; doanh số = tiền hàng − giảm giá của shop, trừ phần tiền hàng của món đã trả và được hoàn |
| Tỉ lệ hủy | Đơn bị hủy / số đơn |
| Tỉ lệ trả hàng | Đơn có yêu cầu trả hàng đã hoàn tiền / đơn đã giao tới tay người mua |
| Hiệu quả voucher | Mỗi mã: số đơn dùng, tổng tiền giảm, giá trị đặt hàng của các đơn đó |
| Theo ngày | Số đơn và giá trị đặt hàng từng ngày |
| Sản phẩm bán chạy | 10 sản phẩm có số lượng bán nhiều nhất (đơn không bị hủy) |

Admin xem thêm: số shop có đơn, 10 shop có giá trị đặt hàng cao nhất, voucher sàn.

**Báo cáo tài chính (RPT-02, payment)**, theo sổ tiền của payment-service:

| Con số | Cách tính |
| --- | --- |
| Giá trị đơn | Tổng số người mua phải trả của các đơn con ghi nhận trong khoảng (`seller_earnings.buyer_paid`) |
| Tiền thực thu | Thanh toán VNPay thành công trong khoảng + tiền COD đã đối soát khớp trong khoảng |
| Khoản hoàn | Tổng các khoản hoàn đã xong trong khoảng (qua cổng hoặc hoàn tay) |
| Trợ giá voucher sàn | Tổng phần voucher sàn của các đơn con ghi nhận trong khoảng (sàn chịu) |
| Phí sàn | Phí sàn của các đơn con ghi nhận trong khoảng, sau khi đã đảo phần trả hàng |
| Phải trả seller | Số dư hiện tại của mọi ví seller: đang giữ + khả dụng + đang khóa |
| Đã chi cho seller | Tổng yêu cầu rút đã chuyển khoản trong khoảng |

Seller xem cùng bảng cho shop mình: giá trị đơn, khoản hoàn, phí sàn, tiền seller nhận, tiền chuyển sang khả dụng, đã rút, số dư 3 ngăn hiện tại.

## 5. Con số cấu hình mới

| Ở đâu | Khóa | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| Bảng `settings` (marketplace) | `review_days` | 30 | Hạn đánh giá và sửa đánh giá, tính từ lúc đơn con hoàn tất |
| `.env` marketplace | `REVIEW_IMAGE_MAX_MB`, `REVIEW_MAX_IMAGES` | 5, 5 | Ảnh đánh giá |
| `.env` marketplace | `CHAT_IMAGE_MAX_MB` | 5 | Ảnh chat |
| `.env` marketplace | `REPORT_IMAGE_MAX_MB`, `REPORT_MAX_IMAGES` | 5, 5 | Ảnh bằng chứng báo cáo vi phạm |
| `.env` marketplace | `REDIS_URL` | `redis://localhost:6379` | Redis cho Socket.IO khi chạy nhiều bản |

## 6. Còn để sau

- Kubernetes (k3s) cho buổi demo (DEPLOY-01), đã hẹn làm sau P6.
- Chi trả bằng API ngân hàng (giữ adapter).
- Thông báo đẩy ra điện thoại (push), tùy chọn tắt email.

## 7. Điểm Claude tự quyết khi code (21/10/2026, chủ đồ án có thể đổi)

Những chỗ tài liệu trên chưa nói tới, Claude chọn cách dưới đây và đã có test.

**Đánh giá, theo dõi, tìm kiếm**

1. Lọc `minRating` và sắp xếp "Đánh giá cao" dùng sao đã làm tròn 1 chữ số, cho khớp số đang hiển thị (3,95 sao được tính là 4,0).
2. Sửa đánh giá là gửi lại toàn bộ: không gửi ảnh thì ảnh cũ bị bỏ.
3. Seller xem đánh giá của shop cũng thấy tên người mua đã che bớt; danh sách có thêm số đánh giá chưa trả lời.
4. Shop bị đình chỉ: đánh giá vẫn xem công khai được, người mua vẫn theo dõi được.

**Chat, thông báo**

5. Socket.IO gắn thẳng vào server HTTP của marketplace, không dùng `@nestjs/websockets` (thư viện này làm hỏng test của payment-service). Không có Redis thì vẫn chạy, chỉ là một bản.
6. Thẻ đơn trong chat chọn trong 50 đơn gần nhất của người mua với shop đó; thẻ sản phẩm chọn từ hàng đang bán của shop.
7. Email thông báo có nút "Xem chi tiết" mở đúng trang; màu trong email viết thẳng mã màu vì email không đọc được class Tailwind.

**Báo cáo vi phạm**

8. Admin là chủ shop bị chặn với mọi lựa chọn của báo cáo về shop mình, kể cả "bác báo cáo".
9. Đình chỉ shop từ một báo cáo sản phẩm chỉ đóng các báo cáo của sản phẩm đó; báo cáo về chính shop vẫn chờ xử lý riêng.
10. Mỗi lần xử lý ghi nhật ký `RESOLVE_REPORT` hoặc `DISMISS_REPORT`, thêm `REMOVE_PRODUCT` / `SUSPEND_SHOP` khi thật sự có biện pháp mới. Biện pháp xem ở lịch sử của đối tượng, không lưu trên dòng báo cáo.

**Báo cáo vận hành và tài chính**

11. Đơn trả trước bị hệ thống hủy vì quá hạn thanh toán không tính vào báo cáo (chưa từng là đơn thật). Đơn người mua tự hủy, hoặc bị hủy vì không qua kiểm tra đơn, vẫn tính là đơn hủy.
12. Doanh số trừ phần trả hàng giống cách payment trừ tiền seller: chỉ tính yêu cầu đã hoàn tiền; hoàn một phần trừ theo tỉ lệ; khoản sàn chịu thì không trừ.
13. Sản phẩm bán chạy đếm số lượng đã bán (chưa trừ món trả), xếp theo số lượng rồi tiền hàng. Hiệu quả voucher không tính đơn đã hủy.
14. Bên tài chính, đơn trả trước ghi nhận lúc trả tiền, đơn COD lúc giao thành công. Thực thu COD lấy theo lúc đối soát khớp (hoặc admin chấp nhận dòng lệch).

**Nền tảng chung**

15. Sửa lỗi có từ P1 ở `@san/nest-common`: service vừa khởi động mà có nhiều yêu cầu tới cùng lúc thì yêu cầu thứ hai bị báo "chưa đăng nhập", vì chưa kịp tải khóa công khai. Nay các yêu cầu chờ chung một lần tải (có test).
