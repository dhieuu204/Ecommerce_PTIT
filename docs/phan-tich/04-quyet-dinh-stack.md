# Quyết định mới chốt: chọn stack (06/10/2026, 10:20–10:28)

File này chỉ gồm 10 điểm chốt ở vòng chọn stack. Các vòng trước nằm ở `02-quyet-dinh-da-chot.md` và `03-quyet-dinh-moi-state-arch.md`. Cột "Sửa ở đâu trong kế hoạch" chỉ chỗ tương ứng trong `Ke-hoach-san-TMDT-day-du.md`.

## 1. Mười điểm đã chốt

| # | Chủ đề | Quyết định | Vì sao | Sửa ở đâu trong kế hoạch |
| --- | --- | --- | --- | --- |
| 1 | Ngôn ngữ backend | **Node.js + TypeScript** cho cả 4 service. | Cùng ngôn ngữ với frontend; kiểm tra kiểu giúp bắt lỗi sớm ở luồng tiền và trạng thái. | §2 (đang ghi "framework còn phải chọn") |
| 2 | Framework backend | **NestJS.** | 4 service cùng một cấu trúc; có sẵn guard kiểm JWT, OpenAPI, nối RabbitMQ. | §2 |
| 3 | Truy cập database | **Prisma** (schema và migration riêng cho từng service). Câu lệnh đặc biệt, ví dụ "chỉ trừ tồn khi còn đủ", được viết SQL trực tiếp. | Dễ đọc, migration rõ, kiểu dữ liệu tự sinh. | §2 "Quy tắc chia trách nhiệm"; §8 |
| 4 | Frontend | **React + Vite (SPA)**: một app có khu buyer, seller, admin; build ra file tĩnh, phục vụ bằng NGINX. | Đồ án không cần SEO thật; triển khai đơn giản nhất. | §1; §2 |
| 5 | Chạy Kubernetes | **Docker Compose khi code hằng ngày; k3s (file k8s thật) khi chạy thử và demo** trên máy 24 GB. | Code nhanh mà vẫn có môi trường Kubernetes thật. | §2 (đang ghi "phương án Kubernetes/k3s còn phải chọn"); §9.3 |
| 6 | Lưu file (ảnh sản phẩm, bằng chứng, biên lai chi trả) | **MinIO** (kho file kiểu S3) chạy trong cụm. Sau muốn dùng S3 thật chỉ cần đổi cấu hình. | Miễn phí, chạy offline được, nhiều pod dùng chung được. | §5.2 CAT; §5.6 RET/DIS; §5.7 FIN-06 |
| 7 | Chat và thông báo thời gian thực | **Socket.IO** trong marketplace-service, dùng **Redis adapter** để tin tới đúng người khi chạy nhiều pod. | Cách phổ biến nhất, đáp ứng yêu cầu nhiều pod ở §8 mục 10. | §5.8 MSG/ENG; §8 mục 10 |
| 8 | Job hẹn giờ (hết 15 phút, quá 24/48 giờ, 7 ngày, đối soát, thử lại hoàn tiền) | **pg-boss**: hàng đợi job nằm trong database Postgres của chính service; nhiều pod thì mỗi job vẫn chỉ một pod nhận. | Không thêm hạ tầng; job nằm cùng dữ liệu nên dễ chạy đúng một lần. | §5.3 ORD-04; §8 mục 10 |
| 9 | Tìm kiếm sản phẩm | **PostgreSQL full-text + unaccent** (gõ có dấu hay không dấu đều ra) trong market_db. Sau cần thì chuyển sang Meilisearch. | Đủ cho dữ liệu đồ án, không thêm thành phần. | §5.2 SRC |
| 10 | Tổ chức code | **Monorepo + pnpm workspaces**: một repo chứa 4 service, frontend, file k8s và thư viện dùng chung (kiểm JWT, outbox, kiểu sự kiện). | Đơn giản cho nhóm nhỏ; sửa hợp đồng sự kiện một chỗ là cả 4 service thấy. | §9.1 |

## 2. Hệ quả cần ghi vào kế hoạch

- **Redis có trong hệ thống**, nhưng chỉ làm một việc: chuyển tin realtime giữa các pod (thẻ 7). Job không dùng Redis (thẻ 8).
- **Danh sách hạ tầng** (không tính là service nghiệp vụ):
  - PostgreSQL (4 database)
  - RabbitMQ
  - Redis
  - MinIO
  - Hộp thư giả khi dev
  - NGINX Ingress
- **Đối tác ở môi trường dev:** VNPay sandbox, GHN môi trường dev.
- **Thư viện dùng chung trong monorepo** (dự kiến):
  - kiểm JWT và quyền
  - bảng outbox/inbox và tiến trình đẩy sự kiện
  - kiểu dữ liệu của sự kiện và API
- **Repo GitHub** chưa được tạo. Mình sẽ hỏi bạn trước khi tạo hoặc đẩy code.

## 3. Bước tiếp theo theo kế hoạch §9.2

1. Hợp đồng API và sự kiện: tên sự kiện, nội dung, ai phát, ai nhận; các API REST chính.
2. ERD cho từng service (ERD-U, ERD-M, ERD-P, ERD-A).
3. Tạo khung repo.
4. STATE-03 (trả hàng và tranh chấp): chốt trước P5.
