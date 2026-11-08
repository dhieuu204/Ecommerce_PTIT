# Nối đối tác thật: VNPay, GHN, Gmail, Google

Code đã có sẵn; phần này chỉ là lấy khóa và điền vào `.env`. Chưa điền thì hệ thống chạy bằng bản mô phỏng có ghi nhãn (Google thì nút báo chưa cấu hình). Khóa chỉ ghi trong `.env`, không commit, không gửi qua chat.

Sau khi điền, chạy `pnpm check:integrations`. Lệnh chỉ gọi API đọc, không tạo giao dịch, vận đơn hay mail, và không in khóa. Sau đó khởi động lại service.

## 1. VNPay sandbox (`services/payment-service/.env`)

1. Đăng ký tại <https://sandbox.vnpayment.vn/devreg/>. VNPay gửi email có mã website và khóa bí mật.
2. Điền `VNPAY_TMN_CODE` và `VNPAY_HASH_SECRET`.
3. Đặt IPN URL trên trang merchant sandbox: `https://<địa-chỉ-công-khai>/api/payment/v1/webhooks/vnpay/ipn`.

Chạy trên máy cá nhân thì lấy địa chỉ công khai bằng cloudflared, xem `services/payment-service/README.md`.

## 2. GHN môi trường dev (`services/marketplace-service/.env`)

1. Đăng nhập <https://developer.ghn.dev>, vào **Manage token** để lấy token; `ShopId` nằm trong thông tin tài khoản. Tài khoản dev và tài khoản thật của GHN tách riêng.
2. Điền `GHN_TOKEN` và `GHN_SHOP_ID` (bắt buộc cả hai).
3. Ở **Webhook configuration** (`/account/webhook`), tab Order, nhập `https://<địa-chỉ-công-khai>/api/market/v1/webhooks/ghn?token=<GHN_WEBHOOK_TOKEN>`. Thay đổi có hiệu lực sau khoảng 15 phút.

**Danh sách địa chỉ đổi khi bật GHN.** Danh sách tỉnh/huyện/xã mẫu (mã từ 90001) bị thay bằng danh sách GHN ở lần đồng bộ tiếp theo: job chạy 3 giờ sáng, hoặc khi service khởi động mà bảng đang trống. Địa chỉ đã lưu theo mã mẫu không còn hợp lệ, vận đơn của chúng bị từ chối với lỗi "Cần cập nhật lại địa chỉ". Shop và người mua phải chọn lại địa chỉ, hoặc nạp lại dữ liệu trên database trống.

Phí ship, vận đơn dùng mô hình địa chỉ cũ của GHN (tỉnh, quận/huyện, phường/xã, trước sáp nhập 01/07/2025). GHN gọi đây là mô hình cũ và khuyên tích hợp mới dùng mô hình mới; tài liệu chưa ghi ngày ngừng hỗ trợ.

## 3. Email bằng Gmail (`services/user-service/.env`)

1. Bật xác minh 2 bước cho tài khoản Gmail, tạo **mật khẩu ứng dụng**.
2. Điền `SMTP_URL=smtps://<gmail>:<mat-khau-ung-dung>@smtp.gmail.com:465` (bỏ dấu cách trong mật khẩu) và `MAIL_FROM="Sàn TMĐT <gmail-của-bạn>"`.

Chạy `pnpm app:up` thì `SMTP_URL` lấy từ file `.env` ở thư mục gốc, không lấy từ file của service.

## 4. Đăng nhập Google (`services/user-service/.env`)

1. Trên Google Cloud Console, tạo OAuth client loại **Web application**.
2. Khai redirect URI: `http://localhost:5173/api/user/v1/auth/google/callback`; chạy `pnpm app:up` thì thêm `http://localhost:8080/api/user/v1/auth/google/callback`.
3. Điền `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URL`.

## 5. Chạy thử sau khi có khóa

Đặt một đơn trả trước đi hết vòng: thanh toán bằng thẻ test VNPay → IPN về → shop xác nhận → GHN tạo vận đơn → webhook đổi trạng thái → hoàn tiền một đơn khác. Test tự động chỉ dùng bản giả của đối tác, nên vòng này mới chứng minh được tích hợp chạy thật.
