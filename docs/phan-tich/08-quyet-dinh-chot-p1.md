# Quyết định mới chốt: hoàn thiện P1 trước khi code (09/10/2026, 17:19–17:30)

File này chỉ gồm những gì chốt ở vòng **chốt nốt P1**. Các vòng trước nằm ở `02` đến `07`. Cột "Sửa ở đâu trong kế hoạch" chỉ chỗ tương ứng trong `Ke-hoach-san-TMDT-day-du.md`.

Kết quả đi kèm (trong repo):
- Sơ đồ `so-do/13-ui-man-hinh-p1`: khung các màn hình P1 còn thiếu (hồ sơ, sổ địa chỉ, mở shop, Kênh người bán › Hồ sơ shop, admin duyệt shop, người dùng và quyền, nhật ký thao tác, bản điện thoại).
- Sơ đồ `so-do/07-ui-khung-chung` sửa 2 chỗ: màn hình Đăng ký thêm ô **Họ tên** (đã chốt ở thẻ API 3 ngày 08/10); mục admin "Cấu hình chính sách" chuyển từ (P1) sang **(P3)**.

## 1. Quyết định

| # | Chủ đề | Quyết định | Sửa ở đâu trong kế hoạch |
| --- | --- | --- | --- |
| 1 | Kubernetes | **Để sau.** Làm xong các phase rồi mới đưa lên Kubernetes (k3s), trước buổi demo. Code hiện tại đã sẵn cho việc đó (service không lưu gì trên máy, có `/health`, cấu hình qua biến môi trường) nên lúc chuyển chỉ thêm file, không sửa code. | §4 (dòng "Kiểm thử và Kubernetes làm xuyên suốt": bỏ phần Kubernetes, giữ phần kiểm thử); §9.3 |
| 2 | Chạy bằng Docker trong lúc làm | **Như cũ, thêm Dockerfile cuối P1.** Lúc code: PostgreSQL, RabbitMQ, Redis, MinIO, hộp thư giả chạy trong Docker; 4 service và web chạy bằng `pnpm dev`. Cuối P1 viết Dockerfile cho từng service để bật cả sàn bằng 1 lệnh khi demo; sau này dùng lại cho Kubernetes. | §4 (P1: "dựng deployment cơ bản" → "Dockerfile + Docker Compose") |
| 3 | Nơi lưu con số cấu hình P1 (thẻ API 7) | **File `.env` của service, bảng `settings` từ P3.** Hạn mã xác nhận 10 phút, sai 5 lần, khóa đăng nhập 15 phút, gửi lại mã sau 60 giây… nằm trong `.env` (có giá trị mặc định trong code). Từ P3 các con số về đơn và tiền vào bảng `settings`, admin sửa trên web (màn hình "Cấu hình chính sách" ở P3). | §8 |

## 2. Màn hình P1: điểm Claude tạm đề xuất (ghi chú vàng trên sơ đồ 13, bạn sửa được)

| # | Màn hình | Đề xuất |
| --- | --- | --- |
| 1 | Hồ sơ của tôi | Không có ảnh đại diện ở P1 (bảng `users` không có cột ảnh); hiện chữ cái đầu họ tên. |
| 2 | Sổ địa chỉ | Đủ 10 địa chỉ thì nút thêm mờ đi; xóa địa chỉ hỏi lại một lần. |
| 3 | Đăng ký mở shop | Một trang dài 3 phần đánh số (thông tin shop, địa chỉ lấy hàng, tài khoản ngân hàng), không tách 3 bước. |
| 4 | Đăng ký mở shop | Danh sách ngân hàng cố định trong code web (khoảng 20 ngân hàng), không thêm bảng. |
| 5 | Đăng ký mở shop | Tên shop trùng chỉ báo khi bấm Nộp, không kiểm lúc đang gõ (đỡ thêm API). |
| 6 | Kênh người bán › Hồ sơ shop | "Yêu cầu đổi" tên/tài khoản ngân hàng mở cửa sổ nổi; số tài khoản chỉ hiện 4 số cuối; mục menu "Địa chỉ lấy hàng" nhảy tới ô địa chỉ trong cùng trang. |
| 7 | Admin › Duyệt shop | Cột "Đã chờ" tô đỏ khi quá 24 giờ (chỉ để ý, không có hạn tự động); có nút lý do từ chối thường gặp điền sẵn chữ. |
| 8 | Admin › Người dùng và quyền | Chi tiết mở ở cột phải; admin đầu tiên tạo bằng lệnh seed, không có màn hình tạo admin. |
| 9 | Admin › Nhật ký thao tác | Tên hành động hiển thị tiếng Việt (SET_PERMISSIONS → "Cấp bộ quyền"). |
| 10 | Điện thoại | Bảng thành thẻ; nút chính (Nộp hồ sơ, Duyệt) dính ở đáy màn hình. |

## 3. Còn chờ bạn

- Danh sách thành viên và thế mạnh frontend/backend của từng người, để chia việc P1.
- Duyệt sơ đồ 13 (sửa trực tiếp trên excalidraw.com hoặc nhắn lại chỗ muốn đổi).
- Chuẩn bị tài khoản, **không gửi khóa qua chat**: token GHN môi trường dev (danh sách tỉnh/huyện/xã), ứng dụng Google OAuth (đăng nhập Google), Gmail của dự án kèm mật khẩu ứng dụng (gửi mã xác nhận).
