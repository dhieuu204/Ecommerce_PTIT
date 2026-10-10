# Quyết định đã chốt ở P3: đặt hàng và trả trước (11/10/2026)

File này gồm những gì chốt ở vòng **P3**. Các vòng trước nằm ở `02` đến `09`. API của P3 ở `docs/api/README.md` mục 4, sự kiện ở `docs/api/events.md` mục 4, cột bảng ở `docs/erd/README.md`.

Phạm vi P3: ORD-01 checkout và tách đơn, ORD-02 xem đơn, ORD-03 (phần xác nhận/từ chối), ORD-04 hết hạn thanh toán/xác nhận, ORD-05 hủy trước bàn giao, INV-02 giữ/chốt/hoàn tồn, VCH-02 áp mã, VCH-03 (phần hủy theo đơn con), SHIP-01 phí ship, RSK-01 kiểm tra đơn, PAY-01..04 thanh toán VNPay, REF-01 hoàn tiền khi hủy, FIN-03 (phần chụp phí sàn), ADM-01 màn hình cấu hình chính sách.

Kết quả cần đạt: một lần checkout → hai đơn con → trả trước → hủy một đơn con không ảnh hưởng đơn còn lại.

## 1. Quyết định của chủ đồ án

| # | Chủ đề | Quyết định |
| --- | --- | --- |
| 1 | VNPay | **Làm cả hai qua adapter**: có mã TMN và khóa bí mật trong `services/payment-service/.env` thì chạy VNPay sandbox; chưa có thì chạy **bản mô phỏng** (trang trả tiền giả có nút Thành công / Thất bại / Trả tiền nhưng mất tin báo, ghi rõ MÔ PHỎNG). Đổi qua lại không sửa code. |
| 2 | Nhận kết quả VNPay khi chạy trên máy | **Tunnel cloudflared** để VNPay gọi được IPN về máy (hướng dẫn trong `services/payment-service/README.md`). Khi buyer quay về sàn, payment-service vẫn kiểm chữ ký và **tra cứu VNPay** trước khi ghi "đã trả" (phòng lúc tunnel tắt); job mỗi phút tra cứu lần thanh toán chưa có kết quả. |
| 3 | Phí ship | **Adapter GHN, tạm phí cố định.** Có `GHN_TOKEN` thì gọi API tính phí GHN (lỗi thì dùng phí dự phòng, ghi "phí dự phòng"); chưa có token thì dùng phí cố định trong cấu hình, giao diện ghi "Phí cố định (chưa nối GHN)". |
| 4 | Cấu hình chính sách | **Một trang chung, sửa được.** Trang admin chia 3 phần (marketplace, payment, approval), mỗi phần gọi đúng service sở hữu con số. Sửa = tạo phiên bản mới có hiệu lực ngay, bắt buộc lý do, ghi nhật ký, xem được lịch sử. Bộ quyền `SYSTEM` sửa; `FINANCE` chỉ xem. Đơn đã đặt giữ con số lúc đặt. |
| 5 | COD | **P3 chỉ trả trước VNPay.** Toàn bộ COD (shop bật/tắt COD, đặt, thu hộ, đối soát) để P4; checkout không hiện ô COD. Luật "COD ≥ 3 triệu cần duyệt" vẫn có sẵn ở approval-service. |
| 6 | Hạn bàn giao 48 giờ | **Bật ở P4** cùng vận đơn GHN. Ở P3 đơn đã xác nhận dừng ở "Chờ giao hàng". |
| 7 | Hủy khi chưa thanh toán | **Chỉ hủy được cả đơn tổng.** Hủy từng đơn con chỉ có sau khi đã trả; khi đó hoàn đúng phần tiền của đơn con đó. |
| 8 | Shop bị đình chỉ khi đang có đơn | **Hủy mọi đơn con chưa bàn giao** của shop đó, hoàn tiền, trả tồn. Đơn tổng chưa thanh toán thì hủy cả đơn tổng (theo quyết định 7). |
| 9 | Lưu voucher | **Không có bước lưu.** Ở checkout mỗi shop tự hiện voucher dùng được, cộng danh sách voucher sàn và ô nhập mã. Bỏ bảng `saved_vouchers` khỏi khung. |
| 10 | Quyền admin với đơn | Duyệt đơn lớn và hoàn tay: `FINANCE`. Xem mọi đơn và hủy có lý do: `SUPPORT`. Admin là người mua hoặc chủ shop của đơn thì không được tự duyệt (403). |

## 2. Điểm Claude tự chọn (chủ đồ án có thể đổi)

Điểm 1–7 chủ đồ án đã đồng ý ở vòng hỏi; điểm 8–14 là chi tiết kỹ thuật Claude thêm khi viết thiết kế.

| # | Điểm |
| --- | --- |
| 1 | Web bấm "Thanh toán" → marketplace kiểm đơn rồi gọi REST sang payment-service để tạo link (đúng sơ đồ ARCH-01), kèm vé đăng nhập của buyer. Số tiền payment-service lấy từ bản chép đơn nhận qua sự kiện `order.placed`, không lấy từ request. |
| 2 | Địa chỉ nhận hàng: marketplace lấy sổ địa chỉ của buyer từ user-service (bằng vé của buyer) ở bước xem trước, chép vào đơn. |
| 3 | "Đơn tối thiểu" của voucher shop tính trên tiền hàng của shop đó; của voucher sàn tính trên tổng tiền hàng sau voucher shop. Phí ship không được giảm. |
| 4 | Hủy đơn con sau khi đã trả: hoàn đủ số buyer đã trả cho đơn con đó (tiền hàng sau voucher + phí ship, vì hàng chưa giao). Voucher shop được trả lượt; voucher sàn chỉ trả khi cả đơn tổng bị hủy; voucher đã hết hạn không trả. |
| 5 | Phí sàn làm tròn xuống tới đồng (phần lẻ sàn chịu). Seller thấy "Dự kiến nhận" sau khi đơn đã thanh toán. |
| 6 | Số "đã bán" của sản phẩm chỉ tăng khi tiền đã về; hủy sau đó thì giảm lại. |
| 7 | Lý do hủy: chọn từ danh sách có sẵn hoặc tự ghi. Buyer gửi yêu cầu hủy (sau khi shop xác nhận) tối đa 1 lần cho mỗi đơn con. |
| 8 | Ảnh biên lai hoàn tay lưu trong MinIO ở bucket riêng tư (chỉ admin `FINANCE` xem qua API); payment-service dùng thư viện `minio` như marketplace-service. |
| 9 | Thanh toán: còn lần thanh toán đang chờ (buyer đóng tab VNPay) thì bấm lại mở lại đúng link cũ, không tính thêm lần. Buyer bấm Hủy trên VNPay thì lần đó là thất bại. Sau 3 lần thất bại đơn hết hạn ngay. |
| 10 | Kiểm tra đơn chạy cho **mọi** đơn: đơn không chạm luật được "qua" tự động ngay (vẫn lưu một dòng `order_checks`, để admin xem lịch sử mua của buyer). |
| 11 | Ngưỡng duyệt so với `>=` (đơn đúng 10.000.000đ cũng cần duyệt), đúng chữ "≥" trong quyết định đã chốt. |
| 12 | Cấu hình có phiên bản viết một lần trong `packages/nest-common` (`SettingsModule`), 3 service dùng chung; mỗi service một bảng `settings` của riêng mình. |
| 13 | Payment-service không có bảng đơn hàng riêng: bản chép đơn nằm trong `seller_earnings` (mỗi đơn con một dòng: số buyer trả, phí sàn, seller nhận, trạng thái), đúng khung ERD. |
| 14 | Job hẹn giờ P3 chạy mỗi phút và quét những gì quá hạn (hết hạn thanh toán, hết giữ tồn, quá 24 giờ xác nhận, quá 24 giờ duyệt, thử lại hoàn tiền). Chạy lại nhiều lần không tạo tác động mới. |

## 3. Con số cấu hình P3 (bảng `settings`, admin sửa trên web)

| Service | Khóa | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| marketplace | `payment_minutes` | 15 | Hạn thanh toán đơn trả trước (phút) |
| marketplace | `stock_hold_minutes` | 20 | Giữ tồn cho đơn chưa trả (phút), phải ≥ hạn thanh toán |
| marketplace | `confirm_hours` | 24 | Hạn shop xác nhận đơn (giờ) |
| marketplace | `shipping_fixed_fee` | 30.000 | Phí ship cố định / dự phòng mỗi đơn con (đồng) |
| payment | `platform_fee_percent_x100` | 500 | Phí sàn tính trên tiền hàng sau voucher shop (500 = 5,00%) |
| payment | `max_payment_attempts` | 3 | Số lần thanh toán tối đa của một đơn |
| payment | `refund_max_tries` | 3 | Số lần tự gửi lại lệnh hoàn trước khi chuyển hoàn tay |
| approval | `review_total_threshold` | 10.000.000 | Đơn tổng từ mức này cần admin duyệt (đồng) |
| approval | `review_cod_threshold` | 3.000.000 | Đơn COD từ mức này cần admin duyệt (dùng từ P4) |
| approval | `review_timeout_hours` | 24 | Quá hạn này chưa duyệt thì tự hủy (giờ) |

## 4. Còn để phase sau

- Hạn bàn giao 48 giờ, vận đơn, "GHN lấy hàng thì yêu cầu hủy hết hiệu lực": P4.
- COD và đối soát: P4. Ví seller, chuyển "đang giữ" sang "khả dụng": P4.
- Trả hàng, hoàn một phần: P5. Thông báo trong app: P6 (P3 buyer/seller xem trạng thái ngay trên trang đơn).
