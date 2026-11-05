# HK Shop — Bộ ảnh tham chiếu FE

Bản thiết kế đã chốt: nền trang xám nhạt, toàn bộ thẻ sản phẩm trắng liền mạch.

- 13 ảnh PNG được cắt trực tiếp từ bản đã chốt; không tạo lại hay chỉnh sửa giao diện.
- `00-homepage-approved.png`: ảnh gốc đầy đủ.
- `00-section-map.png`: sơ đồ đánh số và đường cắt để đối chiếu.
- `sections.json`: kích thước và tọa độ cắt chính xác.
- Các ảnh giữ nguyên chiều rộng 773 px và độ phân giải gốc; không phóng lớn giả.
- Bố cục tham chiếu là desktop 1440 px, content tối đa 1280 px. Kích thước ảnh cắt không phải kích thước CSS cố định; dựng layout bằng container/grid/flex responsive.
- Đây là ảnh tham chiếu giao diện, không phải các lớp Figma hay ảnh sản phẩm đã tách nền.

| Ảnh                        | Nội dung                  | Component gợi ý   | Kích thước gốc |
| -------------------------- | ------------------------- | ----------------- | -------------- |
| 01-header.png              | Header                    | `SiteHeader`      | 773 × 46 px    |
| 02-category-navigation.png | Thanh điều hướng danh mục | `CategoryNav`     | 773 × 36 px    |
| 03-hero-banner.png         | Banner chính              | `HeroBanner`      | 773 × 252 px   |
| 04-promotions-vouchers.png | Banner ưu đãi và voucher  | `PromoVouchers`   | 773 × 128 px   |
| 05-service-promises.png    | Cam kết dịch vụ           | `ServicePromises` | 773 × 61 px    |
| 06-category-grid.png       | Mua theo danh mục         | `CategoryGrid`    | 773 × 142 px   |
| 07-featured-phones.png     | Điện thoại nổi bật        | `FeaturedPhones`  | 773 × 262 px   |
| 08-deals.png               | Đang giảm giá             | `DealsSection`    | 773 × 272 px   |
| 09-featured-laptops.png    | Laptop nổi bật            | `FeaturedLaptops` | 773 × 215 px   |
| 10-featured-shops.png      | Shop nổi bật              | `FeaturedShops`   | 773 × 168 px   |
| 11-new-arrivals.png        | Hàng mới về               | `NewArrivals`     | 773 × 279 px   |
| 12-seller-banner.png       | Banner mở shop            | `SellerBanner`    | 773 × 64 px    |
| 13-footer.png              | Chân trang                | `SiteFooter`      | 773 × 108 px   |

Nên code theo thứ tự đánh số. Dùng cùng một component `ProductCard` cho điện thoại, giảm giá, laptop và hàng mới về.
