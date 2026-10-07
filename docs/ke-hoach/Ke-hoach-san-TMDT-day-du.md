# Sàn TMĐT đầy đủ — Phạm vi, chức năng và kế hoạch triển khai

Ngày cập nhật: 06/10/2026. Tài liệu nội bộ để team dev và Claude tiếp tục thiết kế/triển khai.

**Thay đổi phạm vi:** chủ đồ án đã chọn xây sàn đầy đủ về vòng đời mua bán, giữ kiến trúc **4 backend service + 1 frontend**. Tài liệu này thay thế các giới hạn của bản tinh gọn và bản bàn giao Claude cũ: trả hàng, tranh chấp, chat, thông báo, đánh giá và tài chính seller nay nằm trong kế hoạch chính. Đặc tả V5 là nguồn tham khảo; các nhà cung cấp, thời hạn và mức phí chưa chốt không được tự biến thành yêu cầu cố định.

## 1. Sản phẩm cần đạt

Một sàn có nhiều buyer và seller; mỗi seller quản lý shop và hàng của mình. Buyer mua sản phẩm của nhiều shop trong một lần checkout. Hệ thống tạo đơn tổng và đơn con theo shop; theo dõi riêng hàng, voucher, phí ship, tiền và hậu mãi của từng đơn con.

Sản phẩm phải phục vụ được ba phía:

- **Buyer:** tìm hàng → đặt và thanh toán → nhận hàng → đánh giá; hủy, trả hàng hoặc khiếu nại nếu cần.
- **Seller:** mở shop → đăng hàng/quản lý tồn → xử lý và giao đơn → xử lý hậu mãi → xem tiền và yêu cầu rút.
- **Admin:** duyệt/kiểm duyệt → quản lý chính sách → xử lý bất thường/tranh chấp → đối soát và quản lý quyền.

Thanh toán qua cổng và tiền thật của buyer vẫn là mục tiêu đã chốt. COD, vận chuyển, hoàn tiền và chi trả seller cần tích hợp theo khả năng thực tế của đối tác. Lộ trình này có đầy đủ quy trình tài chính seller; việc tự động chuyển tiền ngân hàng, chuyển thủ công có chứng từ hay dùng nhà cung cấp chi trả là **quyết định còn mở**. Ghi số dư nội bộ không đủ chứng minh đã chuyển tiền thật.

“Đầy đủ” ở đây là đủ vòng đời mua–bán–vận hành. ML, chatbot, cá nhân hóa, livestream, quảng cáo và đội giao hàng riêng được giữ trong hướng phát triển; không phải điều kiện hoàn thành phiên bản này.

## 2. Kiến trúc giữ 4 service

| Mã dùng trong bảng | Service | Module thuộc service |
| --- | --- | --- |
| **U** | **User Service** — `user-service` | Tài khoản, xác thực, hồ sơ, sổ địa chỉ, role và quyền. |
| **M** | **Marketplace Service** — `marketplace-service` | Shop, catalog, biến thể/tồn, search, giỏ, voucher, checkout, đơn, vận chuyển, yêu cầu trả hàng, đánh giá, yêu thích/theo dõi, chat, thông báo. |
| **P** | **Payment Service** — `payment-service` | Giao dịch, phân bổ tiền, hoàn tiền, tiền seller, phí tài chính, đối soát, khóa tiền rút và chi trả. |
| **A** | **Approval Service** — `approval-service` | Hồ sơ xét duyệt shop/vi phạm, kiểm tra đơn theo luật, quyết định tranh chấp, quyết định duyệt rút và ngoại lệ theo quyền. |

Frontend có khu vực buyer, seller và admin trong cùng ứng dụng. Database, broker, Redis nếu cần, ingress/gateway là hạ tầng, không tính thành service nghiệp vụ. Framework, broker và phương án Kubernetes/k3s còn phải chọn; máy cá nhân có 24 GB RAM nên cần cấu hình phát triển vừa sức.

### Quy tắc chia trách nhiệm

- **Service sở hữu nghiệp vụ mới được đổi trạng thái nghiệp vụ đó.** A lưu hồ sơ và quyết định duyệt; M áp quyết định lên shop/sản phẩm/đơn; P áp quyết định lên tiền/chi trả sau khi kiểm tra điều kiện hiện tại.
- A không có quyền ghi trực tiếp bảng shop, order hoặc số dư của service khác. Một quyết định bị gửi lại hoặc đã lỗi thời không được gây tác động lặp/trái trạng thái.
- Đây là mở rộng vai trò của Approval so với bản cũ chỉ kiểm tra đơn giá trị cao. Chia module theo loại hồ sơ, dùng chung quyền/nhật ký/phiên bản; chưa cần xây một workflow engine tổng quát.
- M sẽ lớn nên chia module rõ trong code. Shop/catalog, checkout/order, after-sales, chat và notification có ranh giới nội bộ; không gom vào một tập handler dùng chung mọi bảng tùy tiện.
- M sở hữu nội dung và điều kiện voucher; P sở hữu bút toán trợ giá/thu hồi và số tiền liên quan. Checkout dùng bảng phí có phiên bản/snapshot được thống nhất với P.
- Vận đơn và sự kiện giao hàng thuộc M. P nhận thông tin có nguồn gốc để đối soát COD, không coi sự kiện đã giao là bằng chứng tiền đã về.
- Notification trong M nhận sự kiện từ các service; sự cố gửi thông báo không được làm giao dịch tiền bị ghi lại. Nội dung gửi phải được giới hạn theo người nhận.
- Có thể dùng chung máy chủ PostgreSQL để tiết kiệm tài nguyên, nhưng tách database/schema và quyền sở hữu; không phối hợp service bằng cách tự ghi/join dữ liệu của nhau.

## 3. Role và quyền vận hành

Giữ 3 nhóm tài khoản **Buyer, Seller, Admin**. Guest được xem/tìm hàng khi chưa đăng nhập. Một tài khoản có thể vừa mua vừa bán.

Trong nhóm Admin có các bộ quyền để phân công:

| Bộ quyền | Trách nhiệm |
| --- | --- |
| Kiểm duyệt | Duyệt shop, sản phẩm bị báo cáo, đình chỉ/khôi phục. |
| Hỗ trợ | Tra đơn, hồ sơ trả hàng, tranh chấp và bằng chứng được phép xem. |
| Tài chính/rủi ro | Đơn bị giữ, hoàn ngoại lệ, đối soát, duyệt rút/chi trả trong hạn mức. |
| Quản trị hệ thống | Cấp quyền, cấu hình chính sách, xem nhật ký theo quyền. |

Chưa bắt buộc tạo thêm 4 tên role đăng nhập. Tuy vậy, hệ thống phải kiểm tra quyền theo hành động và đối tượng. Một admin đồng thời là seller không được tự duyệt các hồ sơ tài chính/tranh chấp của shop mình. Demo có thể dùng nhiều tài khoản admin với bộ quyền khác nhau.

## 4. Các giai đoạn và kết quả cần đạt

Đây là thứ tự theo phụ thuộc, không phải ước lượng tuần. Chưa biết số thành viên, thời gian rảnh và stack nên chưa gán deadline.

| Giai đoạn | Mục tiêu | Kết quả kiểm tra được |
| --- | --- | --- |
| **P0 — Thiết kế** | Chốt phạm vi, quy tắc, sơ đồ nghiệp vụ/trạng thái, kiến trúc, dữ liệu và hợp đồng trao đổi. | Team giải thích được luồng chính/ngoại lệ và biết service nào sở hữu từng trạng thái. |
| **P1 — Tài khoản & shop** | Nền tảng dự án, auth, quyền, hồ sơ, quy trình duyệt shop và nhật ký. | Đăng ký → mở shop → admin khác duyệt → seller chỉ quản lý shop của mình. |
| **P2 — Hàng & giỏ** | Catalog/biến thể, tồn, danh mục, tìm kiếm, giỏ, cấu hình voucher cơ bản. | Hai shop có hàng; buyer tìm và thêm hàng của cả hai vào giỏ. |
| **P3 — Đặt & trả trước** | Checkout, snapshot giá/voucher/phí, giữ tồn, cổng thanh toán, kiểm tra đơn, hủy/hoàn trước giao. | Một lần checkout → hai đơn con → trả trước → hủy một đơn con không ảnh hưởng đơn còn lại. |
| **P4 — Giao & đối soát** | Seller xử lý, carrier, COD, thất bại/giao lại/hoàn kiện, sổ tiền, điều kiện ghi tiền seller. | Theo dõi đầy đủ hàng và tiền; COD chưa đối soát không được coi là đã về sàn. |
| **P5 — Hậu mãi & rút tiền** | Trả hàng, tranh chấp, hoàn một phần, giữ tiền khi có hồ sơ, rút/chi trả và đối soát. | Một hồ sơ trả hàng chạy tới kết thúc; một yêu cầu rút có nguồn tiền, quyết định và kết quả thực hiện rõ. |
| **P6 — Trải nghiệm & hoàn thiện** | Chat, thông báo, đánh giá, theo dõi, báo cáo, tối ưu tìm kiếm, kiểm thử tổng hợp. | Buyer/seller/admin dùng được trọn vòng đời; đủ bằng chứng nghiệm thu. |

**Kiểm thử và Kubernetes làm xuyên suốt:** P1 dựng deployment cơ bản và CI; mỗi giai đoạn bổ sung kiểm thử luồng và lỗi liên service. P6 tổng hợp demo chịu lỗi, không đợi đến P6 mới thử deploy.

P4 chỉ dựng/kiểm tra đường giải ngân bình thường; khi hoàn tất phiên bản đầy đủ phải nối thêm điều kiện chặn trả hàng/tranh chấp của P5 trước khi chạy cùng nhau với tiền thật.

## 5. Danh mục chức năng và tiêu chí hoàn thành

Mỗi ID là đầu mục backlog để liên kết với sơ đồ và test. Cột service là **bên sở hữu chức năng**; service phối hợp được ghi trong nội dung. Những ID liên service cần chia subtasks nhưng giữ một người chịu trách nhiệm kiểm tra luồng xuyên suốt.

### 5.1. Tài khoản và gian hàng

| ID | Chức năng | Người dùng | Service | Giai đoạn | Hoàn thành khi |
| --- | --- | --- | --- | --- | --- |
| ACC-01 | Đăng ký và xác minh tài khoản | Guest | U | P1 | Tạo tài khoản không trùng định danh; mã xác minh có hạn dùng và giới hạn thử. Kênh xác minh cần chọn. |
| ACC-02 | Đăng nhập, đăng xuất và phiên | Buyer/Seller/Admin | U | P1 | Phiên hết hạn/thu hồi hoạt động; thông tin xác thực được xử lý an toàn và có giới hạn thử đăng nhập. |
| ACC-03 | Quên/đổi mật khẩu | Người có tài khoản | U | P1 | Token dùng một lần, có hạn; không đổi mật khẩu chỉ dựa vào email được nhập. |
| ACC-04 | Hồ sơ và sổ địa chỉ | Buyer/Seller | U | P1 | Sửa được thông tin của mình; đơn đã đặt giữ snapshot địa chỉ cũ. |
| ACC-05 | Role và bộ quyền admin | Admin | U | P1 | API chặn truy cập sai quyền/sai chủ; cấp/thu hồi quyền có nhật ký. |
| SHP-01 | Đăng ký shop | Seller | M | P1 | Lưu hồ sơ chờ duyệt và tạo yêu cầu ở A có thể retry mà không trùng. |
| SHP-02 | Duyệt/từ chối shop | Admin kiểm duyệt | A | P1 | Có lý do/người duyệt; M chỉ áp quyết định đúng phiên bản hồ sơ. |
| SHP-03 | Hồ sơ, địa chỉ lấy/trả hàng | Seller | M | P1 | Seller chỉ sửa shop mình; thông tin cần cho vận chuyển được kiểm tra. |
| SHP-04 | Đình chỉ/khôi phục shop | Admin kiểm duyệt | A | P2 | M áp quyết định lên khả năng bán; các đơn cũ có cách tiếp tục/hủy theo chính sách. |

### 5.2. Sản phẩm, tồn và tìm kiếm

| ID | Chức năng | Người dùng | Service | Giai đoạn | Hoàn thành khi |
| --- | --- | --- | --- | --- | --- |
| CAT-01 | Danh mục | Admin | M | P2 | Quản lý được danh mục; thay đổi không làm mất lịch sử đơn. |
| CAT-02 | Đăng/sửa/ẩn sản phẩm, ảnh | Seller | M | P2 | Giá và dữ liệu hợp lệ; ảnh đúng quyền/kích thước; ẩn sản phẩm không xóa dòng đơn cũ. |
| CAT-03 | Biến thể sản phẩm | Seller/Buyer | M | P2 | Chọn đúng SKU màu/size; mỗi SKU có giá/tồn xác định và không trùng tổ hợp. |
| INV-01 | Nhập/điều chỉnh tồn | Seller | M | P2 | Có lịch sử điều chỉnh; lượng đang giữ cho đơn được bảo vệ. |
| INV-02 | Giữ, chốt và hoàn tồn | Hệ thống | M | P3 | Tranh mua SKU cuối không bán vượt tồn; retry không trừ/hoàn hai lần. |
| CAT-04 | Trang sản phẩm/shop | Guest/Buyer | M | P2 | Hiện sản phẩm được bán; phân biệt tồn theo biến thể và trạng thái shop. |
| SRC-01 | Tìm kiếm/lọc/sắp xếp | Guest/Buyer | M | P2, P6 | P2 có từ khóa/danh mục/giá; P6 bổ sung các tiêu chí đã thống nhất, phân trang ổn định. |
| MOD-01 | Báo cáo vi phạm, kiểm duyệt | Buyer/Admin | A | P6 | Hồ sơ có bằng chứng/quyền xem; M thực thi gỡ/khôi phục đúng đối tượng. |

### 5.3. Giỏ, voucher và đơn hàng

| ID | Chức năng | Người dùng | Service | Giai đoạn | Hoàn thành khi |
| --- | --- | --- | --- | --- | --- |
| CRT-01 | Giỏ nhiều shop | Buyer | M | P2 | Thêm/sửa/xóa SKU, chọn dòng cần mua; hàng trong giỏ được kiểm tra lại khi checkout. |
| VCH-01 | Voucher shop/sàn | Seller/Admin | M | P2–P3 | Giới hạn quyền tạo, hiệu lực, điều kiện, mức giảm; xác định bên chịu chi phí. |
| VCH-02 | Xem/lưu/áp mã | Buyer | M | P3 | Backend tính lại; lượt dùng/ngân sách giới hạn không bị vượt khi nhiều người đặt đồng thời. |
| VCH-03 | Phân bổ và hoàn voucher | Hệ thống | M | P3, P5 | P3 hủy theo đơn con, P5 theo phần trả; làm tròn đúng và gửi dữ liệu đảo trợ giá cho P. |
| ORD-01 | Checkout và tách đơn | Buyer | M | P3 | Có đơn tổng/con, snapshot giá/địa chỉ/phí; double-click không tạo đơn ngoài ý muốn. |
| ORD-02 | Xem/theo dõi đơn | Buyer/Seller/Admin | M | P3 | Đúng phạm vi dữ liệu; đơn tổng phản ánh trường hợp các đơn con khác trạng thái. |
| ORD-03 | Seller xác nhận/từ chối | Seller | M | P3–P4 | Chỉ xử lý khi tiền/COD và kiểm tra đơn đủ điều kiện; có lý do, timeout và cách xử lý tồn/tiền. |
| ORD-04 | Hết hạn thanh toán/xác nhận | Hệ thống | M | P3 | Job chạy lại không hủy/hoàn tồn trùng; cạnh tranh với callback/bàn giao được kiểm soát. |
| ORD-05 | Hủy trước bàn giao | Buyer/Seller/Admin | M | P3 | Đúng quyền/chính sách, không hủy thành công đồng thời với bàn giao; gửi P hoàn khoản đã thu. |
| RSK-01 | Kiểm tra đơn theo luật | Hệ thống/Admin | A | P3 | Có kết quả rõ, ngưỡng/timeout đã chốt; M không tự duyệt đơn vì A chưa trả lời. |

### 5.4. Thanh toán và hoàn tiền

| ID | Chức năng | Người dùng | Service | Giai đoạn | Hoàn thành khi |
| --- | --- | --- | --- | --- | --- |
| PAY-01 | Tạo giao dịch qua cổng | Buyer | P | P3 | Mã tham chiếu duy nhất; số tiền khớp snapshot; theo dõi từng lần thử thanh toán. |
| PAY-02 | Xác minh kết quả thu tiền | Cổng/hệ thống | P | P3 | Kiểm tra tính hợp lệ, số tiền và mã giao dịch; không dựa vào trang frontend báo thành công. |
| PAY-03 | Callback trùng, muộn, không rõ | Hệ thống | P | P3 | Không ghi tiền hai lần; tiền đến sau khi đơn hủy có luồng hoàn/đối soát; trạng thái chưa rõ được tra cứu. |
| PAY-04 | Phân bổ tiền theo đơn con | Hệ thống | P | P3 | Tổng tiền các phần khớp giao dịch; tách voucher shop/sàn và ship để tính đúng nghĩa vụ. |
| REF-01 | Hoàn tiền khi hủy đơn con | Buyer/hệ thống | P | P3 | Gửi hoàn qua cổng; phân biệt đang hoàn/đã hoàn/thất bại; retry không hoàn hai lần. |
| REF-02 | Hoàn một phần sau trả hàng | Buyer/hệ thống | P | P5 | Giới hạn tổng tiền hoàn theo khoản hợp lệ đã thu; phân bổ giảm giá và đảo phí đúng chính sách. |
| PAY-05 | Đối soát cổng | Admin tài chính/hệ thống | P | P4 | So được tiền nội bộ và nguồn ngoài; khoản thiếu/thừa/chưa rõ có hồ sơ xử lý và dấu vết. |

### 5.5. Vận chuyển và COD

| ID | Chức năng | Người dùng | Service | Giai đoạn | Hoàn thành khi |
| --- | --- | --- | --- | --- | --- |
| SHIP-01 | Phí ship khi checkout | Buyer | M | P3 | Chốt phí theo đơn con; mức cố định là điểm bắt đầu, không tính nhầm phí thành doanh thu shop. |
| SHIP-02 | Tạo/liên kết/hủy vận đơn | Seller/hệ thống | M | P4 | Lưu mã nhà vận chuyển; timeout tạo đơn được tra cứu/retry an toàn, tránh hai vận đơn cho cùng kiện. |
| SHIP-03 | Bàn giao và theo dõi | Seller/carrier | M | P4 | Phân biệt seller bàn giao và carrier đã giao; xác thực nguồn, xử lý sự kiện lặp/trái thứ tự. |
| SHIP-04 | Giao lại/thất bại/hoàn kiện | Carrier/Admin | M | P4 | Có kết cục và giới hạn giao lại; tồn chỉ tăng khi hàng thực sự về và đủ điều kiện bán lại. |
| COD-01 | Điều kiện chọn COD | Buyer | M | P4 | Chính sách đủ rõ; số cần thu đúng theo đơn con và voucher/ship đã chốt. |
| COD-02 | Thu hộ và đối soát COD | Carrier/Admin tài chính | P | P4 | Tách đã giao, đã thu và đã chuyển tiền; nhận đúng bên hưởng và không ghi trùng. |
| SHIP-05 | Đối soát phí vận chuyển | Admin tài chính | P | P4 | Phí giao/hoàn và khoản carrier khấu trừ được đối chiếu; tránh ghi tiền COD ròng như tiền gộp. |

### 5.6. Hậu mãi và tranh chấp

| ID | Chức năng | Người dùng | Service | Giai đoạn | Hoàn thành khi |
| --- | --- | --- | --- | --- | --- |
| RET-01 | Yêu cầu trả hàng | Buyer | M | P5 | Kiểm tra quyền/thời hạn/số lượng chưa trả; có lý do/bằng chứng; chặn ghi tiền seller theo giao thức đã thống nhất với P. |
| RET-02 | Seller phản hồi trả hàng | Seller | M | P5 | Chấp nhận/từ chối có lý do; quá hạn chuyển xử lý, không bỏ quên hồ sơ. |
| DIS-01 | Khiếu nại và phân xử | Buyer/Seller/Admin hỗ trợ | A | P5 | Lưu hai phía/bằng chứng, quyết định có hạn mức/quyền; không tự phê duyệt hồ sơ có xung đột. |
| RET-03 | Vận chuyển hàng hoàn | Buyer/carrier/Seller | M | P5 | Theo dõi kiện về, ai được xác nhận nhận/kiểm hàng; quyết định hoàn tồn độc lập với quyết định hoàn tiền. |
| RET-04 | Hoàn tất hậu mãi | Hệ thống/Admin | M | P5 | M nhận kết quả hoàn từ P; số lượng trả, tồn, tiền và trạng thái đơn khớp nhau. |
| DIS-02 | Ngoại lệ sau khi đã ghi/chi tiền | Admin tài chính/hỗ trợ | A | P5 | Có đường xử lý riêng, không sửa lịch sử hoặc trừ tiền thiếu cơ sở; P thực thi điều chỉnh hợp lệ. |

### 5.7. Tiền seller và chi trả

| ID | Chức năng | Người dùng | Service | Giai đoạn | Hoàn thành khi |
| --- | --- | --- | --- | --- | --- |
| FIN-01 | Sổ tiền và số dư seller | Seller/Admin tài chính | P | P4 | Phân biệt đang giữ, khả dụng, đang khóa để rút; mọi biến động có nguồn và bút toán điều chỉnh thay vì xóa dấu vết. |
| FIN-02 | Điều kiện ghi tiền khả dụng | Hệ thống | P | P4–P5 | Đã có tiền, giao xong, hết thời hạn, không có hold/tranh chấp/hoàn đang mở; chống race với RET-01. |
| FIN-03 | Phí sàn và trợ giá | Admin tài chính/hệ thống | P | P3–P5 | Chốt phiên bản phí, tính trên cơ sở đã định nghĩa, xử lý đảo phí/trợ giá theo phần hoàn. |
| FIN-04 | Yêu cầu rút tiền | Seller | P | P5 | Chỉ khóa phần khả dụng đủ rút; nhiều yêu cầu đồng thời không khóa vượt số dư. |
| FIN-05 | Duyệt/từ chối rút | Admin tài chính | A | P5 | Có quyết định/hạn mức; P kiểm tra yêu cầu vẫn hợp lệ, từ chối thì giải phóng khóa đúng một lần. |
| FIN-06 | Chi trả và đối soát chi trả | Admin/nhà cung cấp | P | P5 | Chỉ đánh dấu đã trả khi có xác nhận/chứng từ; kết quả chưa rõ được tra cứu, không gửi lại mù quáng. |

### 5.8. Tương tác và quản trị

| ID | Chức năng | Người dùng | Service | Giai đoạn | Hoàn thành khi |
| --- | --- | --- | --- | --- | --- |
| ENG-01 | Đánh giá sản phẩm/shop | Buyer | M | P6 | Chỉ người mua đủ điều kiện được đánh giá; ràng buộc từng sản phẩm/đơn, xử lý trùng. |
| ENG-02 | Seller phản hồi đánh giá | Seller | M | P6 | Chỉ phản hồi đánh giá của shop mình; không sửa nội dung buyer. |
| ENG-03 | Yêu thích/theo dõi shop | Buyer/Seller | M | P6 | Lưu/bỏ theo dõi không trùng; seller chỉ thấy thông tin follower được phép. |
| MSG-01 | Chat buyer–seller | Buyer/Seller | M | P6 | Hội thoại đúng người tham gia, lịch sử và chưa đọc; realtime hoạt động khi chạy nhiều replica. |
| MSG-02 | Thông báo theo sự kiện | Buyer/Seller/Admin | M | P6 | Đơn/tiền/chat tạo thông báo đúng người, không lộ dữ liệu; event trùng không spam. |
| ADM-01 | Cấu hình chính sách | Admin đúng quyền | U/M/P/A | P1–P5 | Mỗi cấu hình có chủ sở hữu rõ ở service tương ứng; phiên bản mới không sửa ngược đơn đã chốt. |
| ADM-02 | Nhật ký thao tác | Admin đúng quyền | U/M/P/A | P1–P6 | Mỗi service ghi ai/làm gì/đối tượng/lý do/thời điểm và mã liên kết; admin xem được theo quyền. |
| RPT-01 | Báo cáo vận hành shop/sàn | Seller/Admin | M | P6 | Thống kê đơn, bán hàng, tỷ lệ hủy/hoàn và hiệu quả voucher có định nghĩa thống nhất. |
| RPT-02 | Báo cáo tài chính | Seller/Admin tài chính | P | P6 | Phân biệt giá trị đơn, tiền thực thu, khoản hoàn, trợ giá, phí và khoản phải trả seller. |

ADM-01/02 là nhóm đầu việc xuyên service, không phải dữ liệu chung cho ai cũng sửa. Khi chia task phải tách theo chủ sở hữu cụ thể.

## 6. Bộ sơ đồ cần tạo và thứ tự

Ưu tiên Excalidraw vì chủ đồ án muốn để Claude tạo file và sửa trực quan. Dùng các phần tử chỉnh sửa được, đặt ID chức năng lên sơ đồ. Mỗi file một chủ đề; số lượng bên dưới là checklist dự kiến, không phải tất cả phải vẽ ngay một lượt.

| ID | Sơ đồ | Cần làm rõ | Làm khi |
| --- | --- | --- | --- |
| MAP-01 | Bản đồ chức năng toàn sàn | Buyer/Seller/Admin, các nhóm chức năng, phần phát triển sau. | Đầu tiên |
| FLOW-01 | Đăng ký và duyệt shop | Người nộp/duyệt, kết quả, sửa hồ sơ, đình chỉ. | P0 trước P1 |
| FLOW-02 | Checkout nhiều shop | SKU, giá, voucher, ship, giữ tồn, tách đơn, rollback. | P0 trước P3 |
| FLOW-03 | Trả trước và kiểm tra đơn | Cổng, Approval, chờ/lỗi/quá hạn/kết quả muộn. | P0 trước P3 |
| FLOW-04 | Hủy và hoàn tiền | Cạnh tranh bàn giao, hoàn tồn, hoàn cổng, theo dõi lỗi. | P0 trước P3 |
| FLOW-05 | Giao hàng và COD | Bàn giao/giao/thu/chuyển tiền, giao lại và hoàn kiện. | Trước P4 |
| FLOW-06 | Trả hàng và tranh chấp | Chặn tiền, thời hạn, seller phản hồi, admin quyết định, nhận hàng hoàn. | Thiết kế khung P0; chi tiết trước P5 |
| FLOW-07 | Ghi tiền và rút/chi trả | Tiền giữ/khả dụng/khóa, phê duyệt, xác nhận thực trả, đối soát. | Thiết kế khung P0; chi tiết trước P5 |
| STATE-01 | Vòng đời đơn con/vận đơn | Tác nhân, điều kiện chuyển và nhánh thất bại. | P0 |
| STATE-02 | Vòng đời thanh toán/hoàn/tiền seller | Tránh coi đơn hủy là hoàn xong hoặc đã giao là có tiền. | P0 |
| STATE-03 | Hồ sơ trả hàng/tranh chấp/phê duyệt | Quyết định, timeout, phiên bản và kết thúc. | P0 khung; trước P5 chi tiết |
| ARCH-01 | Kiến trúc 4 service | Chủ dữ liệu, API/event, đối tác, frontend và hạ tầng. | Sau bản đồ nghiệp vụ |
| SEQ-01..04 | Sequence các luồng khó | Checkout/trả trước; hủy/hoàn; COD; giữ tiền tranh chấp so với giải ngân. | Trước API/code tương ứng |
| ERD-U/M/P/A | Dữ liệu từng service | Bảng/quan hệ/ràng buộc và dữ liệu snapshot. | Sau ranh giới/trạng thái |
| DEPLOY-01 | Triển khai | Deployment/replica, routing, storage và đường webhook. | Khung P1; hoàn thiện dần |

Luồng nghiệp vụ chia làn theo người thực hiện: Buyer, Seller, Admin, hệ thống, đối tác nếu cần. Sequence mới chia theo các service. Sơ đồ tổng quan không nhồi bảng database/pod vào cùng hình.

## 7. Quy tắc cần chốt trước khi code các luồng tiền

Các con số như 24 giờ, 5% hoặc 20.000đ đã từng xuất hiện trong nguồn/trao đổi, nhưng chưa phải cấu hình đã duyệt cho phạm vi đầy đủ này.

| Chủ đề | Quyết định cần có | Tác động |
| --- | --- | --- |
| Shop | Một seller được mở bao nhiêu shop; quy tắc đình chỉ với đơn cũ. | Quyền dữ liệu và xử lý đơn. |
| Checkout | Tất cả shop phải đặt thành công hay chấp nhận thành công một phần. | Transaction tồn/voucher/đơn. |
| Tồn | Giữ tồn hay trừ rồi bù; hạn giữ; hàng hoàn có được bán lại không. | Không bán vượt hoặc cộng tồn sai. |
| Voucher | Được ghép mã nào, quota/budget, phân bổ/làm tròn, hoàn lượt khi hủy. | Tiền buyer, tiền seller, trợ giá sàn. |
| Phí | Phí sàn tính trên gì; bên chịu phí cổng/ship/hoàn; thời điểm snapshot. | Doanh thu và khoản phải trả. |
| Trả trước | Cổng hỗ trợ những thao tác nào, mã tham chiếu, hoàn từng phần và đối soát. | Khả năng thực hiện yêu cầu tiền thật. |
| COD | Carrier, tài khoản đứng tên ai, tiền chuyển cho sàn hay shop. | Ai có tiền và ai nợ phí sàn. |
| Kiểm tra đơn | Đơn tổng/con, trước/sau trả tiền, timeout, hạn mức admin. | Không treo hoặc tiếp tục đơn chưa được phép. |
| Hậu mãi | Thời hạn mở hồ sơ, lý do, bằng chứng, SLA seller/admin và lúc hoàn tiền. | Tranh chấp/giữ tiền/hoàn hàng. |
| Ghi tiền seller | Mốc hết thời hạn trả hàng, thời gian giữ bổ sung, những trạng thái chặn. | Không ghi khả dụng khi còn phải hoàn. |
| Chi trả | Chuyển thủ công có chứng từ hay API; lịch/hạn mức và xác nhận nhận tiền. | Xác định thế nào là đã trả. |

Claude nên đưa phương án đề xuất cụ thể cho mỗi điểm theo giai đoạn, đánh dấu rõ chưa chốt. Không hỏi tất cả cùng lúc trước khi vẽ được bản đồ tổng quan.

## 8. Những điều kiện kỹ thuật bắt buộc để nghiệp vụ chạy đúng

1. **Idempotency:** checkout, thanh toán, callback, hoàn, tạo vận đơn, ghi tiền và chi trả đều có mã tham chiếu/chống tác động lặp.
2. **Nhất quán trong service:** tạo đơn/giữ tồn/dùng voucher trong M phải có transaction và quy tắc rollback rõ. P giữ nguyên tắc số dư không âm/số hoàn không vượt khoản hợp lệ.
3. **Nhất quán giữa service:** thống nhất API/sự kiện, phiên bản dữ liệu, retry, deduplication và outbox hoặc cơ chế bảo đảm tương đương. Không giả định event luôn tới đúng thứ tự.
4. **Quyền và xác thực:** kiểm tra user/shop/đơn; webhook theo tài liệu đối tác; bí mật không đưa vào frontend hoặc Git. Che dữ liệu nhạy cảm trong log.
5. **Trả hàng đua với giải ngân:** cần giao thức giữ tiền và kiểm tra phiên bản/điều kiện nguyên tử ở P. Nếu yêu cầu trả hàng hợp lệ đã được tiếp nhận, không được mất quyền chỉ vì event đến P chậm; đồng thời không chi tiền dựa trên snapshot hết hạn. Thiết kế và test tình huống này ở SEQ-04 trước khi bật chung hai luồng.
6. **Trạng thái tách biệt:** order, shipment, payment, refund, approval, return và payout có vòng đời riêng. Đơn tổng tổng hợp từ đơn con theo quy tắc.
7. **Tiền là dữ liệu có lịch sử:** không dùng số thực thiếu kiểm soát; có bút toán điều chỉnh/đối soát; kiểm tra các tổng theo giao dịch/đơn con.
8. **Đối tác mất kết nối:** có trạng thái chưa xác định, tra cứu và xử lý ngoại lệ; không gửi lệnh thu/chi mới chỉ vì request cũ timeout.
9. **Khả năng vận hành:** log có mã liên kết, health/readiness, retry giới hạn và chỗ theo dõi lỗi chưa xử lý; backup và thử khôi phục dữ liệu quan trọng.
10. **Đa replica:** trạng thái quan trọng lưu bền; các job chỉ tạo một tác động; chat/notification phát tới đúng kết nối ở nhiều pod.

## 9. Cách chia việc và dùng Claude

### 9.1. Đơn vị giao việc

Chia theo một luồng nhỏ có thể chạy và kiểm tra, đi qua cả UI/API/dữ liệu nếu cần. Ví dụ “seller đăng ký shop, admin duyệt, seller thấy kết quả” là một mốc; không làm tất cả màn hình xong mới xây backend.

Mỗi task cần có:

- ID chức năng và sơ đồ liên quan.
- Actor, quyền, dữ liệu đầu vào/đầu ra.
- Quy tắc và trạng thái trước/sau.
- Service chủ và service phối hợp; API/event có thể mock rõ trong lúc phát triển.
- Tình huống thành công, lỗi, retry và xung đột cần kiểm tra.
- Tiêu chí nghiệm thu từ bảng, cách demo, phần chưa hỗ trợ được ghi rõ.

Không mở rộng task sang các tính năng không liên quan chỉ vì AI có thể sinh code nhanh. Xem kết quả, chạy test và commit một thay đổi rõ ràng trước khi chuyển sang luồng kế tiếp.

### 9.2. Ba việc đầu tiên nên giao Claude

**Việc 1 — MAP-01:** tạo `01-ban-do-chuc-nang.excalidraw` từ bảng chức năng này, dùng các shape/chữ/mũi tên chỉnh sửa được; làm nổi nhóm Buyer/Seller/Admin và các miền nghiệp vụ. Duyệt để biết có thiếu chức năng trước khi đi sâu.

**Việc 2 — Luồng cốt lõi:** vẽ FLOW-02 và FLOW-03 riêng. Chỉ ra điểm chưa chốt như quota voucher, thời hạn trả trước và thứ tự Approval; đưa phương án gọn, chưa tự coi phương án là quyết định.

**Việc 3 — Trạng thái và giao tiếp:** làm STATE-01/02 và ARCH-01 cho luồng trên, rồi mới chọn stack, hợp đồng API/event, ERD và tạo repo. Thiết kế trước điểm nối trả hàng/giải ngân để P5 không phải sửa toàn bộ dòng tiền.

Sau ba việc này, bắt đầu P1, rồi P2/P3 theo thứ tự. Những luồng P4/P5 phải được thiết kế đủ trước khi triển khai phần phụ thuộc; không cần vẽ tất cả 20 hình trong một lượt đầu.

### 9.3. Môi trường tích hợp

Adapter sandbox/mock có ích để phát triển và kiểm thử, nhưng không thay mục tiêu tích hợp thật. Theo dõi rõ mỗi chức năng đang mock, sandbox hay production. Chỉ đánh dấu hoàn thành tích hợp thật khi đã có cấu hình nhà cung cấp, kết quả xác minh và đối soát tương ứng; không đưa khóa bí mật vào tài liệu prompt.

## 10. Nghiệm thu toàn sàn

| Kịch bản | Điều phải chứng minh |
| --- | --- |
| Hai shop, trả trước, một shop hủy | Voucher, tồn, ship, tiền hoàn và đơn còn lại đều đúng. |
| Hai người mua SKU cuối | Chỉ lượng hàng thực có được chấp nhận, không bán vượt. |
| COD giao thành công nhưng chưa chuyển tiền | Không coi tiền đã về; khi đối soát lặp không cộng hai lần. |
| Giao thất bại và hoàn kiện | Không ghi tiền seller; chỉ hoàn tồn khi hàng về đúng điều kiện. |
| Trả một phần đơn đã giao | Phần hàng/tiền còn lại vẫn đúng; không hoàn quá tiền hoặc số lượng. |
| Tranh chấp sát giờ giải ngân | Yêu cầu hợp lệ giữ được quyền xử lý dù sự kiện chậm; không vừa hoàn vừa chi cùng khoản. |
| Rút tiền đồng thời/chi trả timeout | Không khóa vượt số dư, không chuyển hai lần, có trạng thái chờ đối soát. |
| Seller/admin truy cập sai quyền | Bị chặn dù sửa ID hoặc gọi trực tiếp API. |
| Callback/event lặp hoặc trái thứ tự | Không trừ tồn, ghi tiền, hoàn, chi trả hay phát thông báo trùng ngoài chính sách. |
| Service/pod bị lỗi | Có replica sẵn sàng để phục vụ, dữ liệu không mất, xử lý dở được phục hồi/đối soát. |
| Chat trên nhiều replica | Tin tới đúng người, lịch sử không mất khi pod kết nối cũ bị thay. |

Một tính năng được coi là hoàn thành khi UI/API/dữ liệu/quyền và các nhánh lỗi liên quan đã chạy cùng nhau; một màn hình mẫu hoặc mock thành công chưa đủ. Demo Kubernetes cần chứng minh cả khả năng phục vụ và tính đúng nghiệp vụ, không chỉ pod tự tạo lại.

## 11. Giữ trong lộ trình phát triển tiếp

- Chatbot tư vấn/tra đơn; gợi ý sản phẩm cơ bản, cá nhân hóa và ML chống gian lận.
- Flash sale/combo/quảng cáo/livestream và chương trình khuyến mãi phức tạp.
- Nhiều carrier, giá ship theo vùng/trọng lượng nếu giai đoạn đầu chỉ tích hợp một nhà vận chuyển và phí cố định.
- Kho do sàn vận hành, đội shipper và app giao hàng riêng.
- Tách thêm service khi số liệu tải, nhu cầu triển khai độc lập hoặc độ phức tạp thực tế chứng minh cần thiết.

Các mục này không mất khỏi ý tưởng sản phẩm; hoàn thiện vòng đời giao dịch và vận hành trước khi mở rộng.
