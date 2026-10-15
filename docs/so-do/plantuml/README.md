# Sơ đồ PlantUML

Mã nguồn các sơ đồ UML viết bằng PlantUML. Ảnh `.png` xuất ra nằm ở thư mục cha `docs/so-do`.

| File | Sơ đồ |
| --- | --- |
| `14-usecase-tong-quat.puml` | Use case tổng quát |
| `14a-usecase-nguoi-mua.puml` | Use case phân rã: khách vãng lai, người mua |
| `14b-usecase-nguoi-ban.puml` | Use case phân rã: người bán |
| `14c-usecase-quan-tri.puml` | Use case phân rã: quản trị viên, hệ thống |
| `15-sequence-dat-hang-thanh-toan.puml` | Tuần tự: đặt hàng và thanh toán |
| `16-state03-tra-hang-tranh-chap.puml` | Trạng thái STATE-03: yêu cầu trả hàng và tranh chấp (P5) |
| `style.iuml` | Màu và phông chữ dùng chung (navy/champagne) |

## Xuất lại ảnh sau khi sửa

Cần Docker (không cần cài Java). Chạy ở thư mục gốc của repo:

```bash
docker run --rm -v "$PWD/docs/so-do/plantuml:/data" plantuml/plantuml -tpng -charset UTF-8 "/data/*.puml"
mv docs/so-do/plantuml/*.png docs/so-do/
```

Trên Windows (Git Bash), nếu đường dẫn repo có dấu tiếng Việt mà Docker báo lỗi gắn thư mục, chép các file `.puml` và `style.iuml` sang một thư mục không dấu rồi chạy lệnh trên ở đó.

Có thể xem trước khi sửa bằng tiện ích PlantUML của VS Code.
