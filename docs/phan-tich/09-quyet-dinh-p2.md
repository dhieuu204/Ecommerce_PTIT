# Quyết định đã chốt ở P2: hàng và giỏ (10/10/2026)

File này gồm những gì chốt ở vòng **P2**. Các vòng trước nằm ở `02` đến `08`. API của P2 ở `docs/api/README.md` mục 3, sự kiện ở `docs/api/events.md` mục 3, cột bảng ở `docs/erd/README.md`.

Phạm vi P2: SHP-04 đình chỉ/khôi phục shop, CAT-01 danh mục, CAT-02 sản phẩm và ảnh, CAT-03 phân loại hàng, INV-01 điều chỉnh tồn và lịch sử, CAT-04 trang sản phẩm/trang shop, SRC-01 tìm kiếm, CRT-01 giỏ nhiều shop, VCH-01 tạo voucher.

## 1. Quyết định của chủ đồ án

| # | Chủ đề | Quyết định |
| --- | --- | --- |
| 1 | Bộ danh mục | Đồ công nghệ là chính, thêm vài ngành khác: Thời trang, Nhà cửa, Làm đẹp (34 danh mục, 2 cấp). |
| 2 | Duyệt sản phẩm | **Đăng là bán ngay**, không qua admin duyệt. |
| 3 | Voucher ở P2 | **Chỉ tạo và hiện**; người mua áp voucher khi đặt hàng ở P3. |
| 4 | Loại voucher | Giảm số tiền cố định, hoặc giảm % có mức giảm tối đa. |
| 5 | Khách chưa đăng nhập bấm thêm vào giỏ | Phải đăng nhập, xong quay lại đúng sản phẩm. |
| 6 | Shop bị đình chỉ | Hàng của shop ẩn khỏi sàn, dòng trong giỏ thành "không còn bán"; seller **vẫn sửa được** sản phẩm, tồn kho, voucher. |

## 2. Điểm Claude tự chọn (chủ đồ án có thể đổi)

| # | Điểm |
| --- | --- |
| 1 | Admin có bộ quyền Kiểm duyệt quản lý danh mục và đình chỉ shop; bộ quyền Tài chính tạo voucher sàn (sàn chịu tiền giảm). |
| 2 | Tên chủ shop ở trang admin lấy từ hồ sơ mở shop đã duyệt (approval-service); marketplace chỉ lưu mã chủ shop. |
| 3 | Không có API xóa sản phẩm; seller chỉ ẩn, để đơn cũ (từ P3) vẫn trỏ được tới sản phẩm. |
| 4 | Giỏ chưa có nút Đặt hàng (P3 mới có). |
| 5 | Tìm kiếm chỉ dò trong tên sản phẩm (PostgreSQL full-text + `unaccent`, cột `products.search_vector`). Tên sản phẩm demo bắt đầu bằng loại hàng ("Điện thoại Apple iPhone 16…") để gõ "dien thoai" ra kết quả. |
| 6 | Mỗi phân loại (ví dụ màu + dung lượng) có giá bán, giá gốc, tồn riêng; tối đa 2 nhóm phân loại. Thẻ sản phẩm hiện giá thấp nhất và nhãn -% của phân loại rẻ nhất. |
| 7 | Banner trang chủ/danh mục vẽ bằng CSS; ảnh sản phẩm demo là hình minh họa tự vẽ (`services/marketplace-service/seed`). |
| 8 | Dữ liệu demo: `pnpm seed:demo` tạo 2 shop (Táo Xanh Mobile, Galaxy Hub), 23 sản phẩm, voucher TAOXANH500, GALAXY10, SAN50K và 4 tài khoản mật khẩu `demo12345`: `buyer@`, `taoxanh@`, `galaxyhub@`, `admin@example.com`. |
