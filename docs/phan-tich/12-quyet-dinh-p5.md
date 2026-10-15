# Quyết định đã chốt ở P5: hậu mãi và rút tiền (15/10/2026)

File này gồm những gì chốt ở vòng **P5**. Các vòng trước nằm ở `02` đến `11`. API của P5 ở `docs/api/README.md` mục 6, sự kiện ở `docs/api/events.md` mục 6, cột bảng ở `docs/erd/README.md`.

Phạm vi P5: RET-01 yêu cầu trả hàng, RET-02 seller trả lời, RET-03 vận chuyển hàng trả, RET-04 hoàn tất hậu mãi, DIS-01 khiếu nại và phân xử, DIS-02 ngoại lệ sau khi đã ghi/chi tiền, REF-02 hoàn một phần sau trả hàng, VCH-03 (phần trả hàng), FIN-02 (phần chặn tiền khi có hồ sơ mở), FIN-03 (đảo phí sàn theo phần hoàn), FIN-04 yêu cầu rút tiền, FIN-05 duyệt rút, FIN-06 chi trả và đối soát chi trả. Đây cũng là phần chi tiết của STATE-03 (trước đây ghi "chốt trước P5").

Kết quả cần đạt: một hồ sơ trả hàng chạy tới kết thúc; một yêu cầu rút có nguồn tiền, quyết định và kết quả thực hiện rõ.

## 1. Quyết định của chủ đồ án

| # | Chủ đề | Quyết định |
| --- | --- | --- |
| 1 | Lý do trả hàng | **Chỉ lỗi hàng hoặc lỗi shop**: hàng lỗi/không hoạt động, hư hỏng/bể vỡ, giao sai mẫu/màu/size, thiếu hàng/phụ kiện, không đúng mô tả, hàng giả. Không nhận "đổi ý". Bắt buộc mô tả và 1–6 ảnh bằng chứng. |
| 2 | Gửi hàng trả | **Sàn tạo vận đơn trả hàng GHN, sàn chịu phí.** Yêu cầu được chấp nhận thì hệ thống tự tạo vận đơn (GHN lấy ở địa chỉ nhận hàng của người mua, giao về địa chỉ lấy hàng của shop). Chưa có `GHN_TOKEN` thì chạy MÔ PHỎNG trên trang GHN mô phỏng. |
| 3 | Lúc hoàn tiền | **Sau khi shop nhận lại hàng**: shop kiểm hàng đúng thì hoàn; quá hạn kiểm hàng thì tự hoàn. Lúc chấp nhận, shop được chọn **"Hoàn tiền ngay, không cần gửi trả"** (thiếu hàng, hàng rẻ). |
| 4 | Tiền hoàn | **Tiền hàng của phần trả sau voucher, không hoàn phí ship chiều đi** (kể cả trả hết). Seller bị trừ phần tiền hàng sau voucher shop của món trả; phí sàn tính lại trên phần còn lại. Không trả lượt voucher. |
| 5 | Hạn và quá hạn | Shop trả lời trong **48 giờ**, quá hạn **tự chấp nhận**. Người mua giao hàng cho GHN trong **3 ngày**, quá hạn yêu cầu tự hủy. Shop kiểm hàng trong **48 giờ** sau khi hàng về, quá hạn tự hoàn tiền (không cộng kho). Người mua khiếu nại trong **48 giờ** sau khi bị từ chối. Cả bốn mốc là cấu hình. |
| 6 | Tranh chấp | Người mua khiếu nại khi shop từ chối; shop khiếu nại khi hàng trả về không đúng (sai hàng, đã dùng, thiếu). **Admin `SUPPORT` phân xử, mọi mức tiền**: chấp nhận trả hàng / hoàn toàn bộ / hoàn một phần / không hoàn. Không tự quyết hồ sơ của mình; không bao giờ tự quyết khi quá hạn. |
| 7 | Trả hàng đơn COD | **Chuyển khoản tay**: người mua nhập tài khoản ngân hàng khi gửi yêu cầu; admin `FINANCE` chuyển khoản rồi nhập mã giao dịch và ảnh biên lai (màn hình hoàn tay của P3). |
| 8 | Ngoại lệ sau khi đã ghi/chi tiền (DIS-02) | **Điều chỉnh có người duyệt**: admin `FINANCE` lập đề nghị cộng/trừ ngăn khả dụng của shop và/hoặc hoàn thêm cho người mua (chuyển khoản tay), gắn mã đơn con, có lý do. **Một admin `FINANCE` khác** duyệt ở approval-service; payment-service chỉ trừ khi số dư còn đủ (không âm), không sửa dòng cũ. |
| 9 | Chi trả rút tiền | Admin `FINANCE` bất kỳ chuyển khoản ngoài hệ thống; chỉ ghi "đã chi" khi nhập mã giao dịch và ảnh biên lai. Chuyển lỗi thì ghi lý do, mở khóa tiền. Người duyệt và người chi có thể là một người; chủ shop không tự duyệt, không tự chi cho shop mình. |
| 10 | Hạn mức rút | **Không giới hạn trên**: tối thiểu 50.000đ (đã chốt ở STATE-02), rút tới toàn bộ số khả dụng; mọi yêu cầu vẫn qua admin `FINANCE` duyệt. |
| 11 | Vận đơn trả bị GHN từ chối mà người mua không tạo lại (chốt 15/10/2026, sau rà soát) | **Admin `SUPPORT` xử lý, không có luật tự động.** Quá hạn giao hàng trả thì yêu cầu hiện nhãn đỏ ở Quản trị › Trả hàng; admin liên hệ người mua rồi chọn **hủy yêu cầu** (đơn con hoàn tất, seller nhận tiền) hoặc **hoàn tiền không cần gửi trả** (seller bị trừ như khi shop tự chọn cách này). Bắt buộc ghi chú, ghi nhật ký. |

## 2. Điểm Claude tự chọn (chủ đồ án có thể đổi)

| # | Điểm |
| --- | --- |
| 1 | **Mỗi đơn con một yêu cầu trả hàng** (chọn nhiều món, số lượng từng món). Bị từ chối thì khiếu nại; đã hủy thì không gửi lại. Mã yêu cầu = mã đơn con + `-TH`, ví dụ `261011ABC123-1-TH`. |
| 2 | Hạn gửi yêu cầu là hạn tự hoàn tất của đơn con (`complete_days` ngày sau khi giao, STATE-01 số 3). Khi có yêu cầu đang mở, đơn con giữ "Đã giao": không tự hoàn tất, người mua không bấm "Đã nhận" được. Yêu cầu kết thúc (quyết hoàn tiền, đóng, hủy) thì đơn con hoàn tất ngay. |
| 3 | Lý do "Thiếu hàng" mà shop quá hạn trả lời: tự chấp nhận theo kiểu "hoàn tiền không cần gửi trả" (không có gì để gửi). Các lý do khác: tự chấp nhận và tạo vận đơn trả. |
| 4 | Tiền hoàn của một món = giá × số lượng trả − phần giảm giá của dòng đó chia theo số lượng (phần giảm làm tròn lên, nên tiền hoàn làm tròn xuống, không bao giờ hoàn quá số đã trả). Phần seller bị trừ của món đó = giá × số lượng trả − phần voucher shop của dòng chia theo số lượng. |
| 5 | Admin quyết **hoàn một phần** (X đồng nhỏ hơn số hoàn tối đa): seller bị trừ theo cùng tỉ lệ X / số hoàn tối đa (làm tròn xuống); phí sàn tính lại trên tiền hàng còn lại. Món hàng không tính là đã trả. |
| 6 | Kiện trả bị GHN làm thất lạc/hư hỏng: admin `SUPPORT` xác nhận → người mua được hoàn đủ, **seller không bị trừ** (sàn chịu, tự khiếu nại GHN), giống STATE-01 số 8. |
| 7 | Nhập lại kho do shop chọn từng dòng lúc kiểm hàng (kể cả khi khiếu nại), độc lập với quyết định hoàn tiền (RET-03). "Đã bán" giảm và `returned_quantity` tăng khi món đó được hoàn đủ tiền. |
| 8 | Vận đơn trả hàng tạo xong mà GHN báo lỗi thì người mua bấm "Tạo lại vận đơn". Hạn 3 ngày chỉ hủy yêu cầu khi vận đơn đã tạo được mà GHN chưa lấy hàng. |
| 9 | Ảnh bằng chứng lưu MinIO bucket **riêng tư** của marketplace (`return-images/<userId>/...`). Chỉ người mua, chủ shop của yêu cầu đó và admin `SUPPORT` xem được, qua API có kiểm quyền. |
| 10 | **Chống đua giữa trả hàng và giải ngân (SEQ-04).** Tạo yêu cầu và hoàn tất đơn con cùng khóa theo đơn trong marketplace, nên đơn đã hoàn tất thì không mở yêu cầu được nữa. marketplace gửi `return.requested` ngay khi tạo; payment-service đánh dấu "có trả hàng đang mở", không chuyển tiền sang khả dụng. `shop_order.completed` mang mã yêu cầu trả hàng (nếu có): payment-service chưa nhận kết quả của yêu cầu đó thì chờ, không chuyển. Sự kiện tới sai thứ tự nào cũng không làm chi tiền dựa trên số cũ. |
| 11 | Tranh chấp lưu ở approval-service (bảng `disputes`), mỗi yêu cầu trả hàng tối đa một tranh chấp ở mỗi giai đoạn (shop từ chối / hàng trả về không đúng). Hạn phân xử 72 giờ chỉ để nhắc (lên đầu danh sách, tô đỏ), không tự quyết. |
| 12 | Rút tiền: tài khoản nhận chép từ hồ sơ shop lúc yêu cầu (payment-service gọi marketplace bằng vé của seller, đúng mặc định ERD). Shop bị đình chỉ không rút được. Seller hủy được khi chưa duyệt (mở khóa đúng một lần). |
| 13 | Admin duyệt rút xem "nguồn tiền" của shop: số dư 3 ngăn và các biến động ví gần nhất (lấy ở payment-service). |
| 14 | DIS-02 lưu ở bảng `disputes` (loại `ADJUSTMENT`, đúng quyết định gộp `finance_exceptions` vào `disputes` ở vòng ERD). approval-service tự tra shop, chủ shop, người mua của đơn con từ dữ liệu đơn đã nhận (`order.placed`), không tin dữ liệu do web gửi. Người lập, chủ shop và người mua của đơn đều không được duyệt. payment-service thực thi **tất cả hoặc không**: không đủ số dư khả dụng, hoặc hoàn thêm vượt số người mua đã trả, thì không thực thi và báo lại lý do. |
| 15 | Khoản hoàn bằng chuyển khoản (trả hàng đơn COD, DIS-02) tạo ra ở trạng thái "chờ hoàn tay" ngay, không qua cổng thanh toán. |

## 3. Trạng thái yêu cầu trả hàng (STATE-03)

Sơ đồ: `docs/so-do/16-state03-tra-hang-tranh-chap.png` (mã nguồn `docs/so-do/plantuml/16-state03-tra-hang-tranh-chap.puml`).

| Trạng thái | Nghĩa | Sang |
| --- | --- | --- |
| `REQUESTED` | Chờ shop trả lời (hạn `return_response_hours`) | `SHIPPING_BACK` hoặc `REFUNDING` (shop chấp nhận, quá hạn tự chấp nhận), `REJECTED`, `CANCELLED` (người mua hủy) |
| `REJECTED` | Shop từ chối có lý do; người mua còn khiếu nại được tới hạn `return_dispute_hours` | `DISPUTED`, `CLOSED` (quá hạn không khiếu nại) |
| `DISPUTED` | Đang khiếu nại, chờ admin `SUPPORT` phân xử | `SHIPPING_BACK` (chấp nhận trả hàng), `REFUNDING` (hoàn toàn bộ/một phần), `CLOSED` (không hoàn) |
| `SHIPPING_BACK` | Chờ GHN lấy hàng ở nhà người mua (hạn `return_ship_days`) và chuyển về shop | `RECEIVED`, `CANCELLED` (người mua hủy trước khi GHN lấy, hoặc quá hạn; vận đơn lỗi quá hạn thì admin hủy), `REFUNDING` (admin xác nhận kiện trả thất lạc, hoặc admin hoàn không cần gửi trả khi vận đơn lỗi quá hạn) |
| `RECEIVED` | Hàng đã về shop, chờ shop kiểm (hạn `return_inspect_hours`) | `REFUNDING` (hàng đúng, hoặc quá hạn), `DISPUTED` (shop báo hàng không đúng) |
| `REFUNDING` | Đã quyết hoàn tiền, payment-service đang hoàn | `REFUNDED` |
| `REFUNDED` | Đã hoàn xong (cổng báo thành công hoặc admin hoàn tay có chứng từ) | |
| `CLOSED` | Đóng, không hoàn tiền | |
| `CANCELLED` | Người mua hủy, hoặc quá hạn giao hàng trả | |

## 4. Con số cấu hình mới (bảng `settings`)

| Service | Khóa | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| marketplace | `return_response_hours` | 48 | Hạn shop trả lời yêu cầu trả hàng; quá hạn tự chấp nhận |
| marketplace | `return_ship_days` | 3 | Hạn người mua giao hàng trả cho GHN; quá hạn yêu cầu tự hủy |
| marketplace | `return_inspect_hours` | 48 | Hạn shop kiểm hàng trả sau khi hàng về; quá hạn tự hoàn tiền, không cộng kho |
| marketplace | `return_dispute_hours` | 48 | Hạn người mua khiếu nại sau khi shop từ chối |
| approval | `dispute_sla_hours` | 72 | Hạn admin phân xử (chỉ để nhắc, không tự quyết) |
| payment | `withdraw_min_amount` | 50.000 | Số tiền rút tối thiểu mỗi lần |

Giới hạn ảnh (tối đa 6 ảnh mỗi lần, mỗi ảnh 5 MB) đọc từ `.env` của marketplace như giới hạn ảnh sản phẩm ở P2.

## 5. Còn để phase sau

- Thông báo trong app khi yêu cầu trả hàng, tranh chấp, rút tiền đổi trạng thái: P6 (MSG-02). P5 xem trạng thái ngay trên trang.
- Báo cáo tài chính (RPT-02) tổng hợp khoản hoàn, trợ giá, phí sàn đã đảo: P6.
- Chi trả bằng API ngân hàng: giữ adapter, chưa làm (quyết định MAP-01 số 6).
