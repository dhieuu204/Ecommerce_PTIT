# Quyết định mới chốt: hợp đồng API P1 và cách triển khai (08/10/2026, 15:55–15:59)

File này chỉ gồm những gì chốt ở vòng **API P1** và câu hỏi **cách triển khai**. Các vòng trước nằm ở `02` đến `05`. Cột "Sửa ở đâu trong kế hoạch" chỉ chỗ tương ứng trong `Ke-hoach-san-TMDT-day-du.md`.

Kết quả đi kèm (trong repo `san-tmdt`): `docs/api/README.md` (quy ước + danh sách API P1 kèm quy tắc), `docs/api/events.md` (sự kiện), `packages/shared/src` (kiểu JWT, lỗi, phân trang, sự kiện), trang Swagger tự sinh ở cả 4 service.

## 1. Cách triển khai (1 điểm)

| # | Chủ đề | Quyết định | Sửa ở đâu trong kế hoạch |
| --- | --- | --- | --- |
| 1 | Lên kế hoạch hết hay làm dần | **Cuốn chiếu theo phase.** Phân tích tổng thể đã xong cho P1–P6. Trước mỗi phase mới viết chi tiết của phase đó (API, bảng dữ liệu, màn hình), rồi code, demo, sang phase sau. | §4 (thêm câu về cách làm mỗi phase); §9.2 |

## 2. API P1 (9 điểm đã chốt, 1 điểm còn chờ)

| # | Chủ đề | Quyết định | Sửa ở đâu trong kế hoạch |
| --- | --- | --- | --- |
| 1 | Cách viết hợp đồng API (bạn chọn khác đề xuất) | **Code trước, tài liệu tự sinh.** Không viết file OpenAPI bằng tay; mỗi service tự sinh trang Swagger từ code NestJS ở `/api/<service>/v1/docs`. Danh sách API và quy tắc chính của mỗi phase vẫn ghi trong `docs/api/README.md` để 4 người code khớp nhau. Frontend dựng giao diện với dữ liệu giả, nối thật khi API có trên Swagger. | §2 (dòng "REST/JSON + OpenAPI"); §9.1 |
| 2 | Quy tắc mật khẩu (bạn chọn khác đề xuất) | **Từ 8 ký tự, không bắt buộc chữ hoa, số hay ký tự đặc biệt.** Tối đa 72 ký tự (giới hạn kỹ thuật của cách băm mật khẩu bcrypt). | §5.1 ACC-01, ACC-03 |
| 3 | Thông tin khi đăng ký | **Họ tên + email + mật khẩu.** SĐT, ngày sinh, địa chỉ điền sau ở "Hồ sơ của tôi". | §5.1 ACC-01, ACC-04 |
| 4 | Admin duyệt shop xem hồ sơ lấy từ đâu | **Sự kiện mang bản chụp hồ sơ.** marketplace gửi kèm toàn bộ hồ sơ lúc nộp; approval lưu lại, không gọi ngược sang marketplace. | §2 (quy tắc chia trách nhiệm); §5.1 SHP-02 |
| 5 | Các service biết quyền admin thế nào | **Ghi bộ quyền vào vé đăng nhập (JWT).** Thu hồi quyền có hiệu lực trong tối đa 15 phút. | §3; §5.1 ACC-05 |
| 6 | Nhật ký thao tác admin | **Mỗi service tự lưu, trang admin gộp lại theo thời gian.** | §5.8 ADM-02 |
| 7 | Nơi lưu các con số cấu hình P1 (hạn mã, số lần thử…) | **Chưa trả lời.** Đang tạm theo đề xuất: để trong file cấu hình của service, bảng cấu hình có phiên bản làm ở P3. | §8 |
| 8 | Gửi email thật khi demo | **Gmail SMTP** (mật khẩu ứng dụng của một Gmail riêng cho đồ án, để trong `.env`). Khi code hằng ngày dùng hộp thư giả Mailpit. | §9.3 |
| 9 | Tải logo shop (và ảnh sau này) | **Gửi qua API của marketplace** (`POST /uploads/shop-logo`), marketplace kiểm loại và dung lượng rồi lưu vào MinIO. | §5.1 SHP-01; §5.2 (ảnh sản phẩm) |
| 10 | Danh sách tỉnh/huyện/xã | **marketplace lấy từ GHN và lưu lại**, cập nhật mỗi ngày; user-service hỏi marketplace khi kiểm địa chỉ. | §5.1 ACC-04, SHP-03; §5.5 |

## 3. Mặc định kỹ thuật Claude đặt (bạn có thể đổi)

| Chủ đề | Mặc định | Sửa ở đâu trong kế hoạch |
| --- | --- | --- |
| Đường dẫn | Mỗi service một tiền tố `/api/user/v1`, `/api/market/v1`, `/api/payment/v1`, `/api/approval/v1`; `/health` để ngoài. | §2 |
| Dạng lỗi, phân trang, mã định danh | Lỗi `{code, message, details}` (message tiếng Việt); danh sách `page`/`pageSize` (20, tối đa 100); UUID; giờ UTC; tiền số nguyên đồng. | §8 |
| Tên sự kiện | `shop.application_submitted` (marketplace → approval) và `shop_review.decided` (approval → marketplace). Sơ đồ ARCH-01 và FLOW-01 đang ghi tên dự kiến `shop.submitted`, `shop.approved`, `shop.rejected`; tên đúng là tên trong `docs/api/events.md`. | §2; §6 (ARCH-01) |
| Thư viện thêm vào 4 service | `@nestjs/swagger` (sinh tài liệu), `class-validator` và `class-transformer` (kiểm dữ liệu vào). Đều là thư viện NestJS hướng dẫn dùng chính thức. | §2 |
| Thử lại sự kiện | 3 lần (10 giây, 1 phút, 5 phút), sau đó vào hàng đợi lỗi. | §8 |
| Logo shop | JPG/PNG/WebP, tối đa 2 MB. | §5.1 SHP-01 |

## 4. Việc tiếp theo

1. Bạn trả lời thẻ 7 (nơi lưu cấu hình) khi tiện.
2. Bạn tạo repo GitHub trống và gửi danh sách thành viên.
3. Claude làm ERD (bảng dữ liệu) cho P1.
4. Chia P1 thành việc cho từng người (GitHub Issues).
