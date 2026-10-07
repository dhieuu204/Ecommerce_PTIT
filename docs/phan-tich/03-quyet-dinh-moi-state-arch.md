# Quyết định mới chốt: STATE-01, STATE-02, ARCH-01 (06/10/2026, 09:20–10:12)

File này chỉ gồm những gì **mới chốt sau bản 09:10** (MAP-01, FLOW-02, FLOW-03 đã có từ trước nên không nhắc lại). Cột "Sửa ở đâu trong kế hoạch" chỉ chỗ tương ứng trong `Ke-hoach-san-TMDT-day-du.md` để bạn cập nhật.

Sơ đồ đi kèm: `so-do/04-state01-vong-doi-don-con`, `so-do/05-state02-thanh-toan-hoan-tien-tien-seller`, `so-do/06-arch01-kien-truc-4-service` (.excalidraw và .png).

## 1. Vòng đời đơn con và vận đơn (STATE-01)

| # | Chủ đề | Quyết định | Sửa ở đâu trong kế hoạch |
| --- | --- | --- | --- |
| 1 | Hạn của shop | Xác nhận trong **24 giờ**, bàn giao GHN trong **48 giờ**, tính từ lúc đơn con đủ điều kiện (đã trả hoặc COD, và kiểm tra đơn đạt). Quá hạn thì tự hủy, hoàn tồn và hoàn tiền nếu đã trả. Hai mốc là cấu hình. | §5.3 ORD-03, ORD-04 |
| 2 | Buyer hủy đơn | **Trước khi shop xác nhận:** buyer hủy ngay. **Sau xác nhận, trước bàn giao:** buyer gửi yêu cầu và shop phải đồng ý. Hủy và GHN lấy hàng chỉ một bên thắng. Shop được hủy có lý do trước bàn giao. | §5.3 ORD-02, ORD-03 |
| 3 | Khi nào đơn con "Hoàn tất" | **7 ngày sau khi GHN giao**, hoặc sớm hơn khi buyer bấm "Đã nhận, không trả". 7 ngày này cũng là hạn yêu cầu trả hàng. | §5.3 ORD-02; §5.6 RET-01; §7 dòng "Hậu mãi" |
| 4 | Giao thất bại | Theo chính sách giao lại của GHN. Thất bại cuối thì GHN hoàn kiện; shop xác nhận đã nhận kiện và chọn có nhập lại kho không. Không cộng kho khi kiện còn ở GHN. Seller không có tiền đơn này. | §5.5 SHIP-04; §7 dòng "Tồn" |
| 5 | Tiền khi giao thất bại | **Trả trước:** hoàn tiền hàng (sau voucher), giữ phí ship chiều đi; sàn chịu phí hoàn GHN. **COD:** không có gì để hoàn, sàn chịu phí. | §5.4 REF-01; §5.5 SHIP-04; §7 dòng "Phí" |
| 6 | Trạng thái đơn tổng | Không lưu riêng, tính từ các đơn con theo luật ưu tiên: còn đơn con chưa kết thúc là "Đang xử lý"; tất cả hoàn tất là "Hoàn tất"; tất cả hủy là "Đã hủy"; có cả hai là "Hoàn tất một phần". | §5.3 ORD-02 |
| 7 | Voucher khi hủy | Voucher shop **được trả lại** khi đơn con của shop đó bị hủy trước bàn giao. Voucher sàn chỉ trả lại khi **cả đơn tổng** bị hủy. Voucher đã hết hạn thì không trả. | §5.3 VCH-03; §7 dòng "Voucher" |
| 8 | GHN làm mất hoặc hỏng hàng | Admin xác nhận sự cố. Buyer trả trước được hoàn đủ. Seller được ghi khoản đền bằng tiền hàng sau voucher shop trừ phí sàn. Sàn tự khiếu nại GHN. | §5.5 SHIP-04 |
| 9 | Shop không bấm "Đã nhận kiện hoàn" | Tự đóng đơn **7 ngày** sau khi GHN báo đã hoàn, không tự cộng kho. | §5.5 SHIP-04 |

## 2. Thanh toán, hoàn tiền, tiền seller (STATE-02)

| # | Chủ đề | Quyết định | Sửa ở đâu trong kế hoạch |
| --- | --- | --- | --- |
| 1 | Phí sàn | **5% tiền hàng sau voucher shop.** Voucher sàn do sàn chịu; phí ship không phải doanh thu shop. Tỉ lệ có phiên bản và được chụp vào đơn con. Ví dụ: 300.000đ hàng, voucher shop 20.000đ thì phí là 14.000đ và shop nhận 266.000đ. | §5.7 FIN-03; §7 dòng "Phí" |
| 2 | Tiền seller thành "khả dụng" | Khi có đủ 3 điều kiện: đơn con hoàn tất, không còn hồ sơ trả hàng hoặc tranh chấp đang mở, và tiền đã thực về sàn (trả trước đã thu; COD đã đối soát với GHN). Không có thời gian giữ thêm. | §5.7 FIN-01, FIN-02; §7 dòng "Ghi tiền seller" |
| 3 | Đối soát COD | Admin tài chính **tải file đối soát của GHN** (CSV/Excel). Hệ thống tự khớp theo mã vận đơn và báo dòng lệch. | §5.5 COD-02, SHIP-05 |
| 4 | Đối soát VNPay | **Job hằng ngày** tra cứu qua API VNPay các giao dịch và khoản hoàn còn "không rõ" hoặc chưa khớp. | §5.4 PAY-05 |
| 5 | Hoàn tiền VNPay bị lỗi | Tự **thử lại tối đa 3 lần** theo lịch. Vẫn lỗi thì admin tài chính hoàn tay bằng chuyển khoản và nhập chứng từ. Không ghi "đã hoàn" khi mới gửi lệnh; kết quả không rõ thì tra cứu, không gửi lại mù quáng. | §5.4 REF-01, REF-02 |
| 6 | Duyệt rút tiền | **Mọi yêu cầu rút** đều cần admin tài chính duyệt. Quyết định lưu ở approval-service; payment-service kiểm lại số dư trước khi chi. Từ chối thì mở khóa đúng một lần. | §5.7 FIN-05; §7 dòng "Chi trả" |
| 7 | Giới hạn rút tiền | Tối thiểu **50.000đ** mỗi lần, rút một phần hay hết đều được. **Chỉ 1 yêu cầu đang xử lý** mỗi lúc. Không thu phí rút. | §5.7 FIN-04; §7 dòng "Chi trả" |

## 3. Kiến trúc (ARCH-01)

| # | Chủ đề | Quyết định | Sửa ở đâu trong kế hoạch |
| --- | --- | --- | --- |
| 1 | Broker | **RabbitMQ.** | §2 (đang ghi "broker còn phải chọn") |
| 2 | Gọi đồng bộ giữa service | **REST/JSON qua HTTP**, mô tả bằng OpenAPI. Việc không cần chờ kết quả thì đi qua sự kiện RabbitMQ. | §2; §8 |
| 3 | Cổng vào và đăng nhập | **Ingress NGINX** chỉ chuyển đường. user-service cấp **JWT** có chữ ký; mỗi service tự kiểm chữ ký bằng khóa công khai của user-service và tự kiểm quyền. | §2; §3 |
| 4 | Cơ sở dữ liệu | **Một máy chủ PostgreSQL, 4 database riêng**, mỗi service một tài khoản; không đọc hoặc join database của nhau. | §2 "Quy tắc chia trách nhiệm" |
| 5 | Lưu dữ liệu và phát sự kiện | **Bảng outbox + bảng inbox:** ghi sự kiện vào outbox cùng giao dịch với dữ liệu, tiến trình nhỏ đẩy lên RabbitMQ; bên nhận lưu mã sự kiện đã xử lý để bỏ bản trùng. | §8 mục 3 |

## 4. Hai chỗ Claude tự điền (bạn sửa nếu muốn khác)

| # | Chủ đề | Claude đang ghi | Lý do |
| --- | --- | --- | --- |
| 1 | Lúc hoàn tiền khi giao thất bại (trả trước) | Hoàn ngay khi GHN báo giao thất bại lần cuối, không chờ kiện về tới shop. | Lúc đó chắc chắn buyer không nhận hàng; buyer không phải chờ thêm. |
| 2 | Lúc tiền đền sự cố GHN dùng được | Vào thẳng số dư khả dụng khi admin xác nhận sự cố. | Đơn đã đóng nên không còn khoản nào phải hoàn. |

## 5. Vẫn còn mở

- **Bước chọn stack:** ngôn ngữ và framework, k8s hay k3s (máy 24 GB RAM), nơi lưu ảnh và chứng từ, cách đẩy chat và thông báo theo thời gian thực, có dùng Redis không.
- **STATE-03 (trả hàng và tranh chấp):** lý do, bằng chứng, hạn xử lý của seller/admin, lúc hoàn tiền. Cần chốt trước P5.
- **Tên sự kiện** trong ARCH-01 mới là dự kiến; chốt ở bước hợp đồng API và sự kiện.
