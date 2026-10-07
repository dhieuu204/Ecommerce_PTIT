# Quyết định mới chốt: giao diện chung và FLOW-01 (07/10/2026, 02:50–03:18)

File này chỉ gồm những gì chốt ở vòng **giao diện chung** và vòng **FLOW-01 (đăng ký tài khoản và mở shop)**. Các vòng trước nằm ở `02-quyet-dinh-da-chot.md`, `03-quyet-dinh-moi-state-arch.md`, `04-quyet-dinh-stack.md`. Cột "Sửa ở đâu trong kế hoạch" chỉ chỗ tương ứng trong `Ke-hoach-san-TMDT-day-du.md`.

Sơ đồ đi kèm: `so-do/07-ui-khung-chung` (khung header, footer, menu các khu) và `so-do/08-flow01-dang-ky-va-mo-shop` (.excalidraw và .png).

## 1. Giao diện chung (4 điểm)

| # | Chủ đề | Quyết định | Sửa ở đâu trong kế hoạch |
| --- | --- | --- | --- |
| 1 | Bộ giao diện | **Tailwind CSS + shadcn/ui.** | §2 (dòng frontend); §1 |
| 2 | Bảng màu (bạn chọn lúc 03:40, thay cho "xanh dương") | **Màu chính navy #172554** (nút mua, điều hướng, header); **điểm nhấn champagne #C8A96B** (nhãn, icon, đường viền); **nền trang trắng ngà #FAF9F6**; **thẻ sản phẩm trắng #FFFFFF**; **chữ chính #1F2937**. Khai báo một lần làm màu chủ đề. | §1 |
| 2b | Kiểu giao diện khu mua hàng | **Theo bố cục onewaymobile.vn** (chỉ học bố cục, không dùng logo/hình của họ): thanh trên mỏng; header có ô tìm lớn, tra cứu đơn, tài khoản, giỏ; thanh danh mục ngang có mega menu; banner lớn + 2 banner phụ; mỗi khu sản phẩm có tiêu đề, nút lọc nhanh, "Xem tất cả". Thẻ sản phẩm thêm tên shop và nơi gửi vì là sàn nhiều shop. | §1 |
| 3 | Responsive | **Cả 3 khu đều dùng được trên điện thoại** (buyer, Kênh người bán, trang admin). Trên điện thoại, menu bên trái thành nút ☰ mở ngăn kéo; bảng thành thẻ hoặc cuộn ngang. | §1; §10 (nghiệm thu) |
| 4 | Ngôn ngữ giao diện | **Chỉ tiếng Việt**, viết chữ thẳng trong code, không dùng thư viện đa ngôn ngữ. | §1 |

## 2. FLOW-01: tài khoản, phiên đăng nhập, mở shop (9 điểm)

| # | Chủ đề | Quyết định | Sửa ở đâu trong kế hoạch |
| --- | --- | --- | --- |
| 1 | Cách đăng nhập | **Email + mật khẩu, và "Đăng nhập bằng Google".** Google coi như đã xác minh email. | §5.1 ACC-01, ACC-02 |
| 2 | Google trùng email đã có | **Tự gộp vào tài khoản cũ** (ghi liên kết Google); từ đó đăng nhập được cả hai cách. | §5.1 ACC-01, ACC-02 |
| 3 | Phiên đăng nhập | **Vé truy cập 15 phút + refresh 7 ngày** trong cookie an toàn (httpOnly). Đăng xuất, đổi mật khẩu hoặc admin khóa tài khoản thì thu hồi refresh; người đó mất quyền trong tối đa 15 phút. | §5.1 ACC-02 |
| 4 | Giới hạn thử | **Mã xác minh 6 số, hạn 10 phút, sai 5 lần** phải xin mã mới. **Đăng nhập sai 5 lần thì khóa 15 phút.** | §5.1 ACC-01, ACC-02 (thay câu "Kênh xác minh cần chọn") |
| 5 | Hồ sơ đăng ký shop | **Tên shop, mô tả, logo, SĐT, địa chỉ lấy hàng (mã tỉnh/huyện/xã của GHN), tài khoản ngân hàng nhận tiền.** Không cần giấy tờ tùy thân. | §5.1 SHP-01, SHP-03 |
| 6 | Shop bị từ chối | Seller **sửa theo lý do và nộp lại**; mỗi lần nộp là một phiên bản hồ sơ mới; không giới hạn số lần. | §5.1 SHP-01, SHP-02 |
| 7 | Sửa hồ sơ sau khi duyệt | Mô tả, logo, SĐT, địa chỉ lấy hàng **sửa xong dùng ngay**. **Đổi tên shop hoặc tài khoản ngân hàng phải admin duyệt lại**; trong lúc chờ, shop vẫn bán bằng thông tin cũ. | §5.1 SHP-02, SHP-03 |
| 8 | Shop đang chờ duyệt | Seller **chỉ xem và sửa hồ sơ**, chưa vào được Kênh người bán. | §5.1 SHP-01; §3 |
| 9 | Tạo tài khoản admin | **Admin hệ thống đầu tiên tạo bằng lệnh seed khi cài.** Sau đó admin hệ thống cấp hoặc thu hồi bộ quyền cho tài khoản đã đăng ký; mọi lần cấp/thu hồi đều ghi nhật ký. | §3; §5.1 ACC-05; §5.8 ADM-02 |

## 3. Hệ quả của các lựa chọn khác với gợi ý ban đầu

Bạn chọn khác gợi ý ở 3 chỗ. Không sai, chỉ thêm việc như sau:

| Lựa chọn | Thêm việc gì |
| --- | --- |
| Tailwind + shadcn/ui (thay Ant Design) | Bảng và form nhiều cột ở seller/admin cần thêm thư viện, dự kiến **TanStack Table** (bảng: lọc, sắp xếp, phân trang) và **react-hook-form** (form và kiểm tra dữ liệu). Mình sẽ hỏi lại trước khi thêm. |
| Màu báo lỗi và thành công (Claude tự điền) | Bảng màu chưa có màu đỏ/xanh lá cho lỗi và thành công; tạm dùng mặc định của shadcn/ui. Nhãn giảm giá dùng champagne thay cho đỏ như bản gốc. Bạn muốn khác thì báo. |
| Cả 3 khu đều responsive (thay chỉ khu buyer) | Mỗi màn seller/admin phải vẽ và kiểm thêm bản điện thoại. Sơ đồ khung chung đã có thêm khung C' và D' (seller, admin trên điện thoại). |
| Có đăng nhập Google | Phải tạo ứng dụng Google OAuth (Google Cloud Console) và giữ khóa bí mật ngoài Git. user-service thêm bảng liên kết Google. |

## 4. Bước tiếp theo trước khi code P1

1. Hợp đồng API và sự kiện cho P1 (đăng ký, đăng nhập, hồ sơ shop, duyệt shop, cấp quyền admin).
2. ERD cho P1: user-service, phần shop của marketplace-service, hồ sơ duyệt của approval-service.
3. Danh sách màn hình P1 và wireframe (trên khung chung đã có).
4. Khung repo: monorepo, Compose, 4 service NestJS rỗng, CI, k3s cơ bản. Cần bạn tạo repo GitHub trống; mình hỏi trước khi đẩy code.
