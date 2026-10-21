# Tổng kết P6: trải nghiệm và hoàn thiện

Ngày 21/10/2026. Code trên nhánh `feat/P6-trai-nghiem-va-hoan-thien`. Quyết định và quy tắc: `docs/phan-tich/13-quyet-dinh-p6.md` (mục 7 là các điểm Claude tự chọn lúc code). API: `docs/api/README.md` mục 7. Sự kiện: `docs/api/events.md` mục 7. Bảng: `docs/erd/README.md`.

## 1. Trạng thái

- `pnpm lint`, `typecheck`, `build`, `test` đều qua. Có **555 test** (P5 có 431): marketplace 302, payment 88, approval 72, user 64, nest-common 29.
- `pnpm test:e2e` (kiểm thử tổng hợp chạy thật qua 4 service) qua đủ 18 bước, chạy lại nhiều lần vẫn qua.
- Hai migration mới: `20261021033100_p6_engagement_chat` (marketplace), `20261021033000_p6_reports` (approval). Không sửa migration cũ.

## 2. Chức năng đã làm

| Mã | Chức năng | Service |
| --- | --- | --- |
| ENG-01 | Đánh giá 1–5 sao, nội dung, tối đa 5 ảnh, sau khi đơn con hoàn tất, trong `review_days` ngày, sửa 1 lần; sao sản phẩm và shop cộng dồn bằng số nguyên | M, web |
| ENG-02 | Shop trả lời đánh giá, lọc theo sao và đã/chưa trả lời | M, web |
| ENG-03 | Theo dõi shop, thả tim sản phẩm, danh sách của tôi | M, web |
| SRC-01 | Lọc "Từ 4/3 sao", sắp xếp "Đánh giá cao" ở tìm kiếm, danh mục, trang shop | M, web |
| MSG-01 | Chat người mua với shop: chữ, ảnh, thẻ sản phẩm, thẻ đơn; realtime Socket.IO (Redis khi nhiều bản); chống gửi lặp | M, web |
| MSG-02 | Thông báo trong app (chuông, trang Thông báo, realtime) và email cho việc quan trọng; 28 loại ở `13-quyet-dinh-p6.md` mục 3 | M, P, U, web |
| MOD-01 | Báo cáo vi phạm sản phẩm/shop; admin Kiểm duyệt gỡ sản phẩm, đình chỉ shop hoặc bác; khôi phục sản phẩm về "ẩn" | A, M, web |
| RPT-01 | Báo cáo vận hành của shop và của sàn: đơn, giá trị, doanh số, tỉ lệ hủy/trả, bán chạy, voucher, shop hàng đầu | M, web |
| RPT-02 | Báo cáo tài chính của shop và của sàn: giá trị đơn, thực thu, hoàn tiền, phí sàn, tiền seller, đã chi | P, web |

## 3. Thay đổi theo phần

- **marketplace**: module mới `reviews`, `follows`, `chat`, `realtime`, `notifications`, `moderation`, `reports`. Thông báo được tạo ở mọi chỗ đổi trạng thái đơn con, trả hàng, hoàn tiền, duyệt/đình chỉ shop, rút tiền.
- **payment**: module `reports`; phát thêm sự kiện `withdrawal.updated`.
- **approval**: module `reports` (báo cáo vi phạm), gọi `GET /products/{id}` của marketplace để biết sản phẩm, phát `product_moderation.decided`.
- **user**: nhận `notification.created` và gửi email.
- **nest-common**: sửa lỗi có từ P1, nhiều yêu cầu tới cùng lúc khi service vừa chạy thì yêu cầu sau bị báo chưa đăng nhập (`13-quyet-dinh-p6.md` mục 7 số 15). Sửa gói này ảnh hưởng cả 4 service.
- **web**: thêm thư viện `recharts` (biểu đồ, đã được duyệt) và `socket.io-client`; trang mới ở mục 5.
- **hạ tầng**: `infra/docker-compose.yml` thêm `REDIS_URL` cho marketplace, `MARKETPLACE_API_URL` cho approval; NGINX và Vite chuyển tiếp kết nối Socket.IO.

## 4. Biến `.env` mới

Có giá trị mặc định, chỉ cần chép khi muốn đổi (xem `.env.example` của từng service):

- marketplace: `REDIS_URL`, `REVIEW_IMAGE_MAX_MB`, `REVIEW_MAX_IMAGES`, `CHAT_IMAGE_MAX_MB`, `REPORT_IMAGE_MAX_MB`, `REPORT_MAX_IMAGES`.
- approval: `MARKETPLACE_API_URL`, `REPORT_MAX_IMAGES`.
- Bảng `settings`: `review_days` (Hạn đánh giá sản phẩm, mặc định 30 ngày), sửa ở Quản trị › Cấu hình chính sách.

## 5. Trang cần mở xem (không chạy trình duyệt tự động theo `CLAUDE.md`)

- **Người mua**: trang sản phẩm (khối đánh giá, nút tim, Chat với shop, Báo cáo); trang shop (sao, Theo dõi, tab Đánh giá); tìm kiếm và danh mục (lọc sao, "Đánh giá cao"); chuông và icon tin nhắn trên header; `/tin-nhan`; Tài khoản › Đánh giá của tôi, Sản phẩm yêu thích, Shop đang theo dõi, Thông báo, Báo cáo vi phạm; chi tiết đơn (nút Đánh giá, Chat với shop).
- **Seller**: Kênh người bán › Tin nhắn, Đánh giá, Báo cáo; Sản phẩm (nhãn và tab "Bị gỡ").
- **Admin**: Quản trị › Báo cáo vi phạm và trang chi tiết; Báo cáo (tab Tài chính chỉ với bộ quyền Tài chính); chi tiết shop (số sản phẩm bị gỡ).

## 6. Việc bạn cần làm

1. Xem và quyết có merge nhánh vào `main` không.
2. Xem lại 15 điểm Claude tự chọn ở `13-quyet-dinh-p6.md` mục 7 (hội đồng có thể hỏi).
3. Sau khi kéo code: `pnpm install`, `pnpm db:migrate`, rồi `pnpm dev`. Thử cả vòng bằng `pnpm test:e2e`.

## 7. Còn để sau

Kubernetes (k3s, DEPLOY-01) cho buổi demo; chi trả bằng API ngân hàng; thông báo đẩy ra điện thoại và tùy chọn tắt email.
