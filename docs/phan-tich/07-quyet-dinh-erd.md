# Quyết định mới chốt: bảng dữ liệu (ERD) (08/10/2026, 16:16–16:25)

File này chỉ gồm những gì chốt ở vòng **ERD**. Các vòng trước nằm ở `02` đến `06`. Cột "Sửa ở đâu trong kế hoạch" chỉ chỗ tương ứng trong `Ke-hoach-san-TMDT-day-du.md`.

Kết quả đi kèm (trong repo `san-tmdt`):
- `docs/erd/README.md`: khung bảng cả dự án (P1–P6), quy ước bảng/cột, cách tạo migration.
- Sơ đồ `so-do/09-erd-u-user-service`, `10-erd-m-marketplace-service`, `11-erd-p-payment-service`, `12-erd-a-approval-service` (màu theo phase, ô xanh lá là quy tắc đã chốt).
- Bảng P1 đủ cột: `services/*/prisma/schema.prisma` và migration `*_p1_init`, đã chạy thử trên PostgreSQL 16.

## 1. Cách làm ERD

| # | Chủ đề | Quyết định | Sửa ở đâu trong kế hoạch |
| --- | --- | --- | --- |
| 1 | Chốt bảng một lần hay theo phase | **Khung cả dự án + chi tiết P1.** Tên bảng, quan hệ, cột chính của P1–P6 vẽ một lần; đủ cột chỉ viết cho phase sắp code. Thêm bảng/cột về sau bằng migration của Prisma. | §6 (dòng ERD-U/M/P/A) |

## 2. Các điểm dữ liệu (8 điểm, đều theo đề xuất)

| # | Chủ đề | Quyết định | Sửa ở đâu trong kế hoạch |
| --- | --- | --- | --- |
| 1 | Danh mục | **2 cấp.** Cấp 1 ở thanh danh mục, cấp 2 trong mega menu; sản phẩm gắn vào cấp 2. | §5.2 CAT-01 |
| 2 | Biến thể | **Tối đa 2 nhóm, mỗi nhóm tối đa 10 lựa chọn**; mỗi tổ hợp là một SKU có giá và tồn riêng. | §5.2 CAT-03 |
| 3 | Ảnh sản phẩm | **Bộ ảnh chung tối đa 9 ảnh + 1 ảnh tùy chọn cho mỗi lựa chọn của nhóm 1** (thường là Màu); bấm màu thì đổi ảnh. | §5.2 CAT-02, CAT-04 |
| 4 | Yêu thích/theo dõi | **Theo dõi shop + thả tim sản phẩm** (xem lại trong "Đã thích"). Nút tim quay lại thẻ sản phẩm trên giao diện (P6). | §5.8 ENG-03; sơ đồ 07 (thêm nút tim) |
| 5 | Đánh giá | **Mỗi dòng hàng 1 lần**, 1–5 sao, chữ, tối đa 5 ảnh, trong 30 ngày sau khi đơn hoàn tất, **được sửa 1 lần**. Điểm shop = trung bình sao các sản phẩm. | §5.8 ENG-01, ENG-02 |
| 6 | Chat | **Chữ, ảnh (tối đa 5 MB), thẻ sản phẩm/đơn hàng**; mỗi cặp buyer–shop một cuộc trò chuyện. | §5.8 MSG-01 |
| 7 | Mã đơn | **Ngày đặt + 6 ký tự ngẫu nhiên**, ví dụ `261008ABC123`; đơn con thêm đuôi `-1`, `-2`. | §5.3 ORD-01, ORD-02 |
| 8 | Sổ tiền seller | **Mỗi biến động một dòng** (cộng/trừ ngăn đang giữ, khả dụng hay đang khóa, vì đơn/rút nào) **+ số dư lưu sẵn** để đọc nhanh; test kiểm tổng các dòng khớp số dư. | §5.7 FIN-01 |

## 3. Mặc định kỹ thuật Claude đặt (bạn có thể đổi)

| Chủ đề | Mặc định | Sửa ở đâu trong kế hoạch |
| --- | --- | --- |
| Tên shop | Không trùng giữa các shop. | §5.1 SHP-01 |
| Hồ sơ shop | Bảng `shops` giữ thông tin **đang dùng** (trống tới khi duyệt lần đầu); mỗi lần nộp lưu ở `shop_applications`; mỗi shop tối đa 1 hồ sơ đang chờ. | §5.1 SHP-01, SHP-03 |
| Tài khoản ngân hàng | marketplace giữ bản gốc trong hồ sơ shop; payment giữ bản sao nhận qua sự kiện để chi trả (P5). | §2 |
| Mật khẩu, mã, token | Chỉ lưu bản băm (bcrypt cho mật khẩu, băm cho mã 6 số và refresh token), không lưu bản gốc. | §8 |
| File tải lên | Bảng `uploaded_files` ghi ai tải file nào, để chặn dùng file của người khác; file không dùng sau 24 giờ có thể dọn. | §5.1 SHP-01 |
| Ràng buộc viết tay | "Mỗi người 1 địa chỉ mặc định", "mỗi shop 1 hồ sơ chờ" viết tay trong migration vì Prisma chưa khai được. | §8 |

## 4. Việc tiếp theo

1. Bạn trả lời thẻ API 7 (nơi lưu cấu hình) khi tiện; bảng `policy_configs` trong khung đang theo đề xuất.
2. Bạn tạo repo GitHub trống và gửi danh sách thành viên.
3. Claude chia P1 thành việc cho từng người (GitHub Issues).
