# Quyết định đã chốt (06/10/2026)

Chủ đồ án chốt qua các thẻ quyết định trong thread. Đây là quy tắc chính thức cho thiết kế và code; muốn đổi thì ghi lại ở đây kèm ngày.

## Từ MAP-01 (toàn sàn)

| # | Chủ đề | Quyết định | ID liên quan |
| --- | --- | --- | --- |
| 1 | Số shop | 1 tài khoản = 1 shop; mọi dữ liệu gắn `shop_id` để sau mở nhiều shop không phải đổi dữ liệu. | SHP-01 |
| 2 | Xác minh tài khoản | Email (mã hoặc link). Dev dùng hộp thư giả lập. Quên mật khẩu cũng qua email. | ACC-01, ACC-03 |
| 3 | Cổng thanh toán | VNPay: sandbox khi phát triển, tiền thật khi có tài khoản merchant. Code qua lớp adapter. | PAY-01..05, REF-01/02 |
| 4 | Vận chuyển | GHN môi trường dev. Sự kiện thiếu thì mô phỏng và ghi rõ là mô phỏng. | SHIP-02..05 |
| 5 | Tiền COD | Về tài khoản của sàn; trả trước và COD đi chung một đường tiền. | COD-02, FIN-01..03 |
| 6 | Chi trả seller | Thủ công có chứng từ: admin tài chính chuyển khoản, nhập mã giao dịch và ảnh biên lai. Giữ adapter để sau gắn API. | FIN-04..06 |

## Từ FLOW-02 (checkout)

| # | Chủ đề | Quyết định |
| --- | --- | --- |
| 1 | Lỗi một shop lúc đặt | Toàn bộ hoặc không: không tạo đơn nào, buyer sửa giỏ rồi đặt lại. |
| 2 | Tồn kho | Trả trước: giữ khi đặt, chốt khi thanh toán xong, nhả khi hết hạn. COD: chốt ngay khi đặt. |
| 3 | Ghép voucher | Mỗi đơn con tối đa 1 voucher shop; cả đơn tổng tối đa 1 voucher sàn. |
| 4 | Chia voucher sàn | Theo tỉ lệ tiền hàng từng đơn con (sau voucher shop), làm tròn xuống tới đồng, phần dư vào đơn con lớn nhất. |
| 5 | Phương thức thanh toán | Một phương thức cho cả đơn tổng; COD chỉ khi mọi shop đều cho COD. |
| 6 | Phí ship | **Giá thật từ API GHN** ở bước xem trước, snapshot vào đơn con. Cần cân nặng SKU và mã tỉnh/huyện/xã GHN cho địa chỉ shop và buyer. |
| 6b | GHN lỗi lúc checkout | Dùng phí dự phòng cố định trong cấu hình (ví dụ 30.000đ), đánh dấu "phí dự phòng", sàn chịu chênh lệch. |
| 7 | Chống đặt trùng | Backend cấp mã phiên ở bước xem trước; gửi lại trả kết quả cũ; giá khác bản xem trước thì buyer xem lại. |
| 8 | Thời hạn | Trả trước 15 phút, giữ tồn 20 phút (cấu hình được). |

Lưu ý: quyết định 6 kéo "phí theo vùng/trọng lượng" (trước đây xếp vào phát triển sau) vào phạm vi hiện tại, nhưng vẫn chỉ một nhà vận chuyển là GHN.

## Từ FLOW-03 (trả trước và kiểm tra đơn)

| # | Chủ đề | Quyết định |
| --- | --- | --- |
| 1 | Kiểm tra đơn | Trên đơn tổng, chạy song song với thanh toán. Seller chỉ xác nhận khi đã trả (hoặc COD) và đã qua kiểm tra. |
| 2 | Luật khởi điểm | Đơn tổng ≥ 10.000.000đ hoặc đơn COD ≥ 3.000.000đ thì cần admin duyệt. Ngưỡng cấu hình có phiên bản ở approval-service. |
| 3 | Chờ duyệt quá lâu | Không bao giờ tự duyệt. Quá 24 giờ: tự hủy, nhả tồn, hoàn tiền nếu đã thu, báo buyer. |
| 4 | Số lần thử thanh toán | Tối đa 3 lần trong 15 phút, mỗi lần một mã VNPay riêng; không tạo lần mới khi lần trước đang "không rõ". |
| 5 | Phí cổng khi hoàn | Sàn chịu; buyer nhận lại đủ số đã trả. |

## Từ STATE-01 (vòng đời đơn con và vận đơn)

Sơ đồ: `so-do/04-state01-vong-doi-don-con.excalidraw`

| # | Chủ đề | Quyết định |
| --- | --- | --- |
| 1 | Hạn của shop | Xác nhận trong 24 giờ, bàn giao GHN trong 48 giờ, tính từ lúc đơn con đủ điều kiện. Quá hạn: tự hủy, hoàn tồn, hoàn tiền nếu đã trả. Hai mốc là cấu hình. |
| 2 | Buyer hủy | Trước khi shop xác nhận: hủy ngay. Sau xác nhận, trước bàn giao: gửi yêu cầu, shop phải đồng ý. Hủy và GHN lấy hàng chỉ một bên thắng. Shop được hủy có lý do trước bàn giao. |
| 3 | Hoàn tất | 7 ngày sau khi GHN giao, hoặc sớm hơn khi buyer bấm "Đã nhận, không trả". 7 ngày này cũng là hạn yêu cầu trả hàng. |
| 4 | Giao thất bại | Theo chính sách giao lại của GHN; thất bại cuối thì GHN hoàn kiện, shop xác nhận đã nhận và chọn có nhập lại kho. Không cộng kho khi kiện còn ở GHN; seller không có tiền đơn này. |
| 5 | Tiền khi giao thất bại | Trả trước: hoàn tiền hàng (sau voucher), giữ phí ship chiều đi; sàn chịu phí hoàn. COD: không có gì để hoàn, sàn chịu phí. |
| 6 | Trạng thái đơn tổng | Không lưu riêng, tính theo luật ưu tiên từ các đơn con. |
| 7 | Voucher khi hủy | Voucher shop trả lại khi đơn con của shop đó bị hủy trước bàn giao; voucher sàn chỉ trả lại khi cả đơn tổng bị hủy; voucher hết hạn thì không trả. |
| 8 | GHN làm mất/hỏng hàng | Admin xác nhận sự cố; buyer trả trước được hoàn đủ; seller được ghi khoản đền = tiền hàng sau voucher shop trừ phí sàn; sàn tự khiếu nại GHN. |
| 9 | Shop không bấm "Đã nhận kiện hoàn" | Tự đóng 7 ngày sau khi GHN báo đã hoàn, không tự cộng kho. |

## Từ STATE-02 (thanh toán, hoàn tiền, tiền seller)

Sơ đồ: `so-do/05-state02-thanh-toan-hoan-tien-tien-seller.excalidraw`

| # | Chủ đề | Quyết định |
| --- | --- | --- |
| 1 | Phí sàn | 5% tiền hàng sau voucher shop. Voucher sàn do sàn chịu; phí ship không phải doanh thu shop. Tỉ lệ có phiên bản, chụp vào đơn con. |
| 2 | Tiền seller khả dụng | Khi đơn con hoàn tất, không còn hồ sơ trả hàng/tranh chấp mở, và tiền đã thực về sàn (COD đã đối soát). |
| 3 | Đối soát COD | Admin tài chính tải file đối soát GHN; hệ thống tự khớp theo mã vận đơn và báo dòng lệch. |
| 4 | Đối soát VNPay | Job hằng ngày tra cứu giao dịch và khoản hoàn còn "không rõ" hoặc chưa khớp. |
| 5 | Hoàn tiền lỗi | Tự thử lại tối đa 3 lần theo lịch, rồi admin tài chính hoàn tay có chứng từ. Không ghi "đã hoàn" khi mới gửi lệnh. |
| 6 | Duyệt rút tiền | Mọi yêu cầu rút đều cần admin tài chính duyệt (quyết định lưu ở approval-service); payment-service kiểm lại số dư trước khi chi. |
| 7 | Giới hạn rút | Tối thiểu 50.000đ mỗi lần, rút một phần hoặc hết; chỉ 1 yêu cầu đang xử lý mỗi lúc; không thu phí rút. |

## Từ ARCH-01 (kiến trúc)

Sơ đồ: `so-do/06-arch01-kien-truc-4-service.excalidraw`

| # | Chủ đề | Quyết định |
| --- | --- | --- |
| 1 | Broker | RabbitMQ (hàng đợi riêng cho từng bên nhận, thử lại, hàng đợi lỗi). |
| 2 | Gọi đồng bộ | REST/JSON qua HTTP, mô tả bằng OpenAPI; việc không cần chờ đi qua sự kiện. |
| 3 | Cổng vào và đăng nhập | Ingress NGINX chỉ chuyển đường; user-service cấp JWT có chữ ký; mỗi service tự kiểm chữ ký và quyền. |
| 4 | Cơ sở dữ liệu | Một máy chủ PostgreSQL, 4 database riêng, mỗi service một tài khoản; không đọc/join database của nhau. |
| 5 | Lưu dữ liệu và phát sự kiện | Bảng outbox (ghi cùng giao dịch) + tiến trình đẩy lên RabbitMQ; bên nhận có bảng inbox để bỏ sự kiện trùng. |

Để sang bước chọn stack: ngôn ngữ/framework, k8s hay k3s, nơi lưu ảnh và chứng từ, cách đẩy chat/thông báo thời gian thực, có dùng Redis không.

## Từ vòng giao diện chung (07/10/2026)

Sơ đồ: `so-do/07-ui-khung-chung.excalidraw`

| # | Chủ đề | Quyết định |
| --- | --- | --- |
| 1 | Bộ giao diện | Tailwind CSS + shadcn/ui (bảng/form lớn cần thêm thư viện, hỏi trước khi thêm). |
| 2 | Bảng màu | Navy #172554 (chính), champagne #C8A96B (điểm nhấn), nền #FAF9F6, thẻ #FFFFFF, chữ #1F2937. Bố cục khu mua hàng theo kiểu onewaymobile.vn. |
| 3 | Responsive | Cả buyer, seller, admin đều dùng được trên điện thoại. |
| 4 | Ngôn ngữ | Chỉ tiếng Việt, không dùng thư viện đa ngôn ngữ. |

## Từ FLOW-01 (đăng ký tài khoản và mở shop, 07/10/2026)

Sơ đồ: `so-do/08-flow01-dang-ky-va-mo-shop.excalidraw`

| # | Chủ đề | Quyết định | ID liên quan |
| --- | --- | --- | --- |
| 1 | Cách đăng nhập | Email + mật khẩu, và Google (coi như đã xác minh email). | ACC-01, ACC-02 |
| 2 | Google trùng email | Tự gộp vào tài khoản cũ; từ đó đăng nhập được cả hai cách. | ACC-01, ACC-02 |
| 3 | Phiên | Vé 15 phút + refresh 7 ngày trong cookie httpOnly; đăng xuất/đổi mật khẩu/bị khóa thì thu hồi refresh. | ACC-02 |
| 4 | Giới hạn thử | Mã 6 số hạn 10 phút, sai 5 lần xin mã mới; đăng nhập sai 5 lần khóa 15 phút. | ACC-01, ACC-02 |
| 5 | Hồ sơ shop | Tên, mô tả, logo, SĐT, địa chỉ lấy hàng (mã GHN), tài khoản ngân hàng; không giấy tờ tùy thân. | SHP-01, SHP-03 |
| 6 | Bị từ chối | Sửa và nộp lại thành phiên bản mới, không giới hạn số lần. | SHP-01, SHP-02 |
| 7 | Sửa sau duyệt | Tên shop và tài khoản ngân hàng cần duyệt lại (vẫn bán bằng thông tin cũ); phần còn lại dùng ngay. | SHP-02, SHP-03 |
| 8 | Đang chờ duyệt | Chỉ xem và sửa hồ sơ, chưa vào Kênh người bán. | SHP-01 |
| 9 | Tạo admin | Admin hệ thống đầu tiên bằng lệnh seed; cấp/thu hồi bộ quyền có nhật ký. | ACC-05, ADM-02 |

## Từ vòng API P1 và cách triển khai (08/10/2026)

Chi tiết: `phan-tich/06-quyet-dinh-api-p1.md`, `san-tmdt/docs/api/`.

| # | Chủ đề | Quyết định | ID liên quan |
| --- | --- | --- | --- |
| 1 | Cách triển khai | Cuốn chiếu theo phase: chi tiết (API, bảng, màn hình) của phase nào làm ngay trước khi code phase đó. | Tất cả |
| 2 | Hợp đồng API | Code trước, Swagger tự sinh; danh sách API + quy tắc mỗi phase ghi trong `docs/api/README.md`. | Tất cả |
| 3 | Mật khẩu | Từ 8 ký tự, không bắt buộc chữ hoa/số/ký tự đặc biệt (tối đa 72). | ACC-01, ACC-03 |
| 4 | Đăng ký | Họ tên + email + mật khẩu. | ACC-01 |
| 5 | Hồ sơ cho admin duyệt | Sự kiện mang bản chụp hồ sơ; approval lưu lại. | SHP-02 |
| 6 | Quyền admin | Ghi vào JWT, thu hồi có hiệu lực tối đa 15 phút. | ACC-05 |
| 7 | Nhật ký admin | Mỗi service tự lưu, web gộp. | ADM-02 |
| 8 | Email khi demo | Gmail SMTP; code hằng ngày dùng Mailpit. | ACC-01, ACC-03 |
| 9 | Tải ảnh | Qua API marketplace, lưu MinIO. | SHP-01 |
| 10 | Tỉnh/huyện/xã | marketplace lấy từ GHN, lưu lại, cập nhật mỗi ngày. | ACC-04, SHP-03 |

## Từ vòng ERD (08/10/2026)

Chi tiết: `phan-tich/07-quyet-dinh-erd.md`, `san-tmdt/docs/erd/`, sơ đồ `so-do/09..12-erd-*`.

| # | Chủ đề | Quyết định | ID liên quan |
| --- | --- | --- | --- |
| 1 | Cách làm ERD | Khung cả dự án + đủ cột cho phase sắp code (P1 đã xong). | Tất cả |
| 2 | Danh mục | 2 cấp, sản phẩm gắn cấp 2. | CAT-01 |
| 3 | Biến thể | Tối đa 2 nhóm × 10 lựa chọn, mỗi tổ hợp 1 SKU. | CAT-03 |
| 4 | Ảnh | Bộ ảnh chung ≤ 9 + 1 ảnh mỗi lựa chọn của nhóm 1. | CAT-02 |
| 5 | Yêu thích | Theo dõi shop + thả tim sản phẩm. | ENG-03 |
| 6 | Đánh giá | Mỗi dòng hàng 1 lần, ≤ 5 ảnh, trong 30 ngày, sửa 1 lần. | ENG-01 |
| 7 | Chat | Chữ, ảnh ≤ 5 MB, thẻ sản phẩm/đơn. | MSG-01 |
| 8 | Mã đơn | Ngày + 6 ký tự ngẫu nhiên; đơn con -1, -2. | ORD-01 |
| 9 | Sổ tiền seller | Mỗi biến động 1 dòng + số dư lưu sẵn. | FIN-01 |
