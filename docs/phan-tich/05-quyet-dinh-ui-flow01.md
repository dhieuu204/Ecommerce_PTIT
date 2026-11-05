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

## 5. Tinh chỉnh giao diện khu mua hàng (24/10/2026)

| # | Chủ đề | Quyết định |
| --- | --- | --- |
| 1 | Font chữ | **Plus Jakarta Sans** cho toàn web (thay Be Vietnam Pro). |
| 2 | Màu | **Cam theo onewaymobile.vn** (25/10/2026, sau khi thử navy #172554, xanh hoàng gia #1E40AF, xanh tươi #2563EB đều chưa ưng): màu chính #FE4F00, nhấn vàng cam #FE9C13, header chuyển sắc #FDC884 → #FE9C13 → #FE4F00 (dải vàng chỉ ở màn từ 1536px để logo chữ trắng luôn nằm trên nền cam), nền #F5F5F7, chữ #333. Tên token `navy`/`champagne` giữ nguyên trong code. Chữ trên nền cam màu trắng. **27/10/2026:** chủ đồ án thấy #FE4F00 đậm quá, thử cam tươi #FF6A13 rồi chốt **màu cam của Shopee #EE4D2D**; header chuyển sắc dọc như Shopee #F53D2D → #FF6633. |
| 3 | Icon | **Tabler Icons** (`@tabler/icons-react`), nét 1.25 (onewaymobile.vn tự vẽ icon nét 1.2px bo tròn, không chép được nên chọn bộ cùng kiểu). Lúc đầu thử Phosphor nhưng chủ đồ án không ưng. Khu mua hàng đã chuyển; các trang còn lại chuyển dần. |
| 4 | Bố cục trang chủ | **Theo bản thiết kế đã chốt `HK-Shop-Homepage-Sections/`** (27/10/2026, thay bản bám ảnh onewaymobile.vn), máy tính trước, điện thoại làm sau. Thứ tự: header, thanh danh mục, banner chính bo góc, 2 thẻ ưu đãi + khung "Ưu đãi dành cho bạn" (voucher thật của shop, nút "Lưu" = sao chép mã), dải 4 cam kết, mua theo danh mục (9 ô trắng), điện thoại nổi bật, đang giảm giá (nền cam chuyển sắc), laptop nổi bật (ô quảng cáo + 4 thẻ), shop nổi bật (tối đa 3), hàng mới về (2 hàng thẻ gọn), băng mời mở shop, footer. Chỗ lệch có chủ ý so với ảnh: footer không có mạng xã hội và hotline (sàn chưa có), giữ link trang đã làm; thẻ sản phẩm không ghi tên shop. Nền trang khu mua hàng `page` #F5F5F7, lấy đúng biến `--gray-cl` trong CSS của onewaymobile.vn (bản thiết kế dùng #EDEEF0, chủ đồ án thấy hơi lệch màu nên đổi). Đã thử tinh chỉnh theo taste-skill (27/10/2026) nhưng chủ đồ án thấy không hợp, **đã quay lại bản theo thiết kế**; không dùng skill đó. |
| 5 | Tên sàn và logo | **HK Shop** (25/10/2026). Logo tự vẽ bằng SVG theo bản thiết kế: túi mua sắm **viền nét** bo góc có quai, chữ HK bên trong, cạnh chữ "HK Shop" (`apps/web/src/components/brand-logo.tsx`, favicon `apps/web/public/favicon.svg`). Trên header cam: túi và chữ trắng; trên nền sáng: túi cam, "HK" cam, "Shop" màu than; trên nền than (Quản trị): túi cam, "HK" cam, "Shop" trắng. |
| 6 | Nâng cấp trang chủ (27/10/2026) | Chủ đồ án chọn cả 4 hướng: (1) **ảnh**: `scripts/normalize-demo-images.mjs` chuẩn hóa ảnh demo để vật thể chiếm 80% khung và nằm giữa (trước đó lệch từ 23% tới 99%), banner thiết kế riêng bằng GPT Image (chờ chủ đồ án tạo ảnh); (2) **khối sản phẩm tiêu điểm** sau "Đang giảm giá": sản phẩm bán chạy nhất có nhiều màu, ảnh lớn nghiêng theo con trỏ, chọn màu/dung lượng đổi ảnh, giá theo dữ liệu thật, thêm vào giỏ tại chỗ; (3) **thẻ sản phẩm** rê chuột chỉ phóng nhẹ ảnh (đã thử đổi sang ảnh thứ hai, chủ đồ án thấy khó chịu nên bỏ), có chấm màu khi nhóm 1 là màu (`lib/color-swatch.ts`); **ô tìm kiếm** gợi ý 5 sản phẩm khi gõ, chọn bằng bàn phím, ô trống gợi ý danh mục; (4) **chuyển động**: chữ banner hiện so le, ảnh banner trượt vào, thẻ và ô danh mục hiện lần lượt khi cuộn tới, nút nhún khi nhấn; tất cả tắt khi người dùng chọn giảm chuyển động. **Đầu trang (27/10/2026, kiểu Shopee):** banner trượt 2/3 bên trái (chấm chọn banner, tự chuyển 6 giây, rê chuột thì dừng; đã thử hàng tab tên chương trình bên dưới nhưng chủ đồ án thấy mất cân đối nên bỏ), 2 banner nhỏ xếp chồng bên phải (COD, Một giỏ hàng); voucher thành dải ngang tối đa 4 mã ngay dưới. **Banner chỉ là ảnh có link** (chữ in sẵn trong ảnh, alt = nội dung chữ): ảnh ở `apps/web/public/home/banners` (lớn 1680×792, nhỏ 820×376), hiện là ảnh tạm tự dựng bằng `node scripts/render-home-banners.mjs` từ ảnh sản phẩm demo. Chủ đồ án cho phép mượn tạm ảnh banner trên mạng để xem bố cục, không đưa lên hội đồng (đang dùng banner sản phẩm của hãng lấy từ cellphones.com.vn, chọn loại không có logo/chương trình riêng của CellphoneS; khung banner tỉ lệ 23:10 theo các banner này): ảnh mượn để ở `apps/web/public/home/banners-temp` (**đã .gitignore, không commit**), code ưu tiên ảnh này và tự lùi về banner HK Shop khi máy không có file. Có ảnh thiết kế thật thì thay file trong `banners` và xóa thư mục tạm. |
