# Quyết định đã chốt ở P4: giao hàng và đối soát (11/10/2026)

File này gồm những gì chốt ở vòng **P4**. Các vòng trước nằm ở `02` đến `10`. API của P4 ở `docs/api/README.md` mục 5, sự kiện ở `docs/api/events.md` mục 5, cột bảng ở `docs/erd/README.md`.

Phạm vi P4: ORD-03 (phần bàn giao), SHIP-02 tạo/hủy vận đơn, SHIP-03 bàn giao và theo dõi, SHIP-04 giao lại/thất bại/hoàn kiện, SHIP-05 đối soát phí vận chuyển, COD-01 điều kiện chọn COD, COD-02 thu hộ và đối soát COD, PAY-05 đối soát VNPay, FIN-01 sổ tiền seller, FIN-02 (phần P4) điều kiện ghi tiền khả dụng.

Kết quả cần đạt: theo dõi đầy đủ hàng và tiền; tiền COD chưa đối soát không được coi là đã về sàn.

## 1. Quyết định của chủ đồ án

| # | Chủ đề | Quyết định |
| --- | --- | --- |
| 1 | Token GHN | **Chưa có, làm mô phỏng trước.** Viết sẵn phần gọi GHN thật (tạo vận đơn, hủy vận đơn, tra theo mã của sàn, nhận trạng thái qua webhook). Chưa có `GHN_TOKEN` thì chạy bản **MÔ PHỎNG**, ghi rõ trên giao diện và log. |
| 2 | Mô phỏng trạng thái GHN | **Bảng điều khiển cho admin**: trang "GHN MÔ PHỎNG" trong Quản trị, chọn vận đơn rồi bấm bước tiếp theo (đã lấy hàng, giao thất bại, đã giao, hoàn hàng, đã hoàn, thất lạc/hư hỏng). Mỗi bước đi đúng đường xử lý như tin GHN thật báo về. |
| 3 | Lúc tạo vận đơn | **Xác nhận = tạo vận đơn** (đúng sơ đồ 04): seller bấm "Xác nhận và giao cho GHN" là tạo vận đơn ngay. Hạn bàn giao 48 giờ tính tới lúc GHN lấy hàng. |
| 4 | Giao lại | Số lần giao thất bại tối đa là **cấu hình, mặc định 3**. Bản mô phỏng tự chuyển sang hoàn hàng khi thất bại đủ số lần; với GHN thật thì theo trạng thái GHN báo. |
| 5 | Nhận kiện hoàn | Shop xác nhận đã nhận kiện và **chọn nhập lại kho cho từng dòng hàng** (mặc định bật, món hỏng thì bỏ chọn). |
| 6 | Tiền khả dụng | **Đúng như STATE-02 đã chốt**: khả dụng khi đơn con hoàn tất và tiền đã về sàn (COD phải đối soát xong), không giữ thêm. Điều kiện "không có trả hàng/tranh chấp đang mở" để sẵn chỗ cho P5 nối vào. |
| 7 | COD | Mỗi shop có công tắc **"Nhận COD"** (mặc định bật). Không giới hạn số tiền; đơn COD từ 3 triệu đã có luật kiểm tra đơn. Chỉ chọn được COD khi mọi shop trong đơn đều nhận COD. |
| 8 | File đối soát COD | Đọc **file Excel theo mẫu GHN** (và cả `.csv`) bằng thư viện **exceljs** (chủ đồ án đồng ý thêm vào payment-service). Chưa có file mẫu thật nên nhận diện cột theo tên tiêu đề (bảng tên cột để riêng, dễ sửa khi có file thật). Có nút tải file mẫu và nút sinh file **MÔ PHỎNG** từ các đơn COD đã giao. Admin `FINANCE` tải lên. |
| 9 | Đối soát phí vận chuyển | **Đối chiếu và báo chênh lệch**: mỗi dòng hiện phí ship sàn đã thu của người mua, phí GHN thực trừ, phí hoàn, phần chênh lệch sàn chịu. Tiền COD ghi theo số gộp (trước khi GHN trừ phí). Không thêm bảng. |
| 10 | Đối soát VNPay | **Job hằng ngày + trang ngoại lệ**: job mỗi đêm tra cứu lại giao dịch thành công trong 2 ngày gần nhất và các giao dịch, khoản hoàn còn chưa rõ; trang admin `FINANCE` liệt kê các khoản lệch để xử lý có ghi chú. |
| 11 | Sự cố GHN (thất lạc, hư hỏng) | Admin **`SUPPORT`** xác nhận sự cố có ghi chú. Phần tiền tự chạy theo quy tắc STATE-01 số 8: người mua trả trước được hoàn đủ; seller được đền bằng tiền hàng sau voucher shop trừ phí sàn, vào thẳng ngăn khả dụng. |

## 2. Điểm Claude tự chọn (chủ đồ án có thể đổi)

| # | Điểm |
| --- | --- |
| 1 | Chống tạo hai vận đơn cho một kiện: mỗi đơn con một dòng `shipments`; mã gửi GHN (`client_order_code`) là mã đơn con. Tạo vận đơn bị lỗi mạng thì ghi "chưa rõ" và tra cứu GHN theo mã đơn con, không gửi lại mù quáng. |
| 2 | Hủy đơn đã có vận đơn (shop hủy, người mua xin hủy được đồng ý, admin hủy, quá hạn, shop bị đình chỉ): **hủy vận đơn GHN trước**; GHN báo đã lấy hàng thì không hủy được (409). Tin "đã lấy hàng" tới khi đơn đang có yêu cầu hủy thì yêu cầu hủy hết hiệu lực (STATE-01 T9). Hai việc chỉ một bên thắng. |
| 3 | Webhook GHN thật: `POST /api/market/v1/webhooks/ghn?token=...`; GHN không ký dữ liệu nên kiểm bằng mã bí mật trong đường dẫn (`GHN_WEBHOOK_TOKEN` trong `.env`). Tin trùng bỏ qua; tin trái thứ tự chỉ ghi lịch sử, không làm trạng thái đi lùi. |
| 4 | Trạng thái mới của đơn con: `SHIPPING` (đang giao), `DELIVERED` (đã giao), `COMPLETED` (hoàn tất), `RETURNING` (đang hoàn kiện), `RETURNED` (chờ shop xác nhận nhận kiện hoàn), `FAILED` (đóng: giao thất bại), `INCIDENT` (sự cố GHN chờ xác nhận), `INCIDENT_RESOLVED` (đóng: sự cố). Đơn tổng tính thêm "Hoàn tất" và "Hoàn tất một phần". |
| 5 | Giao thất bại lần cuối (bắt đầu hoàn kiện): đơn trả trước được hoàn ngay tiền hàng sau voucher (không hoàn phí ship chiều đi); voucher không trả lượt (chỉ trả khi hủy trước bàn giao); tồn kho chỉ cộng khi shop xác nhận nhận kiện. |
| 6 | Tiền seller vào ngăn **đang giữ**: trả trước khi đơn tổng đã thanh toán; COD khi GHN báo đã giao. Chuyển sang **khả dụng** khi đủ điều kiện ở mục 1.6; hủy/giao thất bại thì trừ lại ngăn đang giữ bằng một dòng điều chỉnh, không xóa dòng cũ. Ngăn **đang khóa** (rút tiền) có từ P5. |
| 7 | payment-service biết chủ shop qua sự kiện `order.placed` (đã có `ownerId`), lưu vào ví seller; seller xem ví bằng vé đăng nhập của mình, không phải gọi sang marketplace. |
| 8 | Đối soát COD: mỗi file chỉ nhập một lần (so mã băm nội dung); dòng của vận đơn đã đối soát trước đó ghi là "trùng", không cộng tiền lần nữa; dòng lệch số tiền chưa coi là đã về, admin xử lý có ghi chú (chấp nhận số GHN hoặc để lại). |
| 9 | Kích thước kiện gửi GHN (dài, rộng, cao) dùng giá trị mặc định trong `.env`; khối lượng cộng từ sản phẩm. Phiếu in nhãn giao hàng chưa làm ở P4. |
| 10 | Bảng điều khiển GHN mô phỏng và xác nhận sự cố dùng bộ quyền `SUPPORT`. |
| 11 | Đơn COD không có hạn thanh toán; kiểm tra đơn qua là sang "Chờ shop xác nhận". Hủy đơn COD không phát sinh hoàn tiền; tồn kho (đã trừ lúc đặt) được cộng lại. |
| 12 | GHN báo thất lạc khi kiện **đang hoàn về** (đơn trả trước đã được hoàn tiền hàng lúc giao thất bại): xác nhận sự cố không hoàn thêm cho người mua; seller vẫn được đền. |

## 3. Con số cấu hình mới (bảng `settings`)

| Service | Khóa | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| marketplace | `handover_hours` | 48 | Hạn bàn giao cho GHN, tính từ lúc đơn con sang "Chờ shop xác nhận" |
| marketplace | `max_delivery_attempts` | 3 | Số lần giao thất bại trước khi hoàn hàng (bản mô phỏng) |
| marketplace | `complete_days` | 7 | Số ngày sau khi giao thì đơn tự hoàn tất (cũng là hạn trả hàng) |
| marketplace | `return_close_days` | 7 | Số ngày sau khi GHN báo đã hoàn mà shop chưa xác nhận thì tự đóng, không cộng kho |

## 4. Còn để phase sau

- Ngăn "đang khóa", rút tiền, chi trả: P5. Trả hàng, tranh chấp và điều kiện chặn tiền khi có hồ sơ mở: P5 (đã để sẵn chỗ nối).
- Phiếu in nhãn giao hàng, nhiều đơn vị vận chuyển: ngoài phạm vi.
