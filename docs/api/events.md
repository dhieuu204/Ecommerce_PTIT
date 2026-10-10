# Sự kiện giữa các service

Sự kiện là tin một service báo "việc này đã xảy ra" cho service khác, đi qua RabbitMQ, không chờ trả lời. Kiểu dữ liệu nằm trong `packages/shared/src/events`; code gửi và nhận phải dùng đúng các kiểu đó. Mọi cơ chế dưới đây (outbox, inbox, thử lại, hàng lỗi) đã có sẵn trong `EventBus` của `packages/nest-common`: chỉ cần gọi `publish` và `subscribe` (cách dùng ở `packages/nest-common/README.md` mục 5).

## 1. Cách gửi và nhận

- **Exchange** `san.events` kiểu topic. Routing key = tên sự kiện (`type`).
- **Hàng đợi**: mỗi bên nhận một hàng đợi cho mỗi sự kiện, tên `<service nhận>.<tên sự kiện>`, ví dụ `approval-service.shop_application.submitted`.
- **Gửi (outbox)**: không gửi thẳng lên RabbitMQ. Ghi sự kiện vào bảng `outbox` trong **cùng giao dịch DB** với thay đổi dữ liệu; một tiến trình relay đọc bảng này và đẩy lên RabbitMQ. Nhờ vậy không có chuyện dữ liệu đã lưu mà sự kiện bị mất (hoặc ngược lại).
- **Nhận (inbox)**: trong cùng giao dịch xử lý, lưu `eventId` vào bảng `inbox`. Gặp `eventId` đã có thì bỏ qua (RabbitMQ có thể giao một tin hai lần).
- **Lỗi**: xử lý lỗi thì thử lại 3 lần (cách 10 giây, 1 phút, 5 phút), vẫn lỗi thì chuyển vào hàng đợi lỗi (dead-letter) `<hàng đợi>.dlq` để người xem.
- Tên sự kiện dạng `<thực thể>.<động từ quá khứ>`. Đổi payload kiểu không tương thích thì tăng `version`, bên nhận xử lý được cả hai bản trong lúc chuyển.

### Vỏ chung (`EventEnvelope`)

```json
{
  "eventId": "0192f1d0-…",
  "type": "shop_application.submitted",
  "version": 1,
  "occurredAt": "2026-10-08T15:47:13Z",
  "producer": "marketplace-service",
  "correlationId": "0192f1cf-…",
  "payload": {}
}
```

`correlationId` lấy từ request gốc (header `X-Correlation-Id`, không có thì sinh mới) và truyền tiếp qua mọi sự kiện sinh ra từ nó, để lần theo một thao tác qua nhiều service.

## 2. Sự kiện P1

| Sự kiện | Gửi → nhận | Khi nào |
| --- | --- | --- |
| `shop_application.submitted` | marketplace → approval | Seller nộp hồ sơ mở shop, nộp lại sau khi bị từ chối, hoặc gửi yêu cầu đổi tên shop / tài khoản ngân hàng |
| `shop_application.decided` | approval → marketplace | Admin duyệt hoặc từ chối một hồ sơ |

### `shop_application.submitted` (version 1)

Kiểu: `ShopApplicationSubmittedPayload` trong `packages/shared/src/events/shop.ts`.

| Trường | Ý nghĩa |
| --- | --- |
| `shopId` | Mã shop |
| `version` | Số phiên bản hồ sơ, tăng dần từ 1 |
| `type` | `REGISTER` (mở shop) hoặc `CHANGE` (đổi thông tin sau khi đã duyệt) |
| `owner` | `userId`, `email`, `fullName` của chủ shop, lấy từ JWT lúc nộp |
| `data` | **Hồ sơ đầy đủ** lúc nộp: tên, mô tả, `logoUrl`, SĐT, địa chỉ lấy hàng (mã GHN kèm tên), tài khoản ngân hàng. Với `CHANGE` là hồ sơ hiện tại đã gộp phần muốn đổi |
| `change` | Chỉ có với `CHANGE`: `fields` (các mục muốn đổi: `name`, `bankAccount`) và `old` (giá trị cũ) |
| `submittedAt` | Thời điểm nộp |

approval-service lưu nguyên hồ sơ này (bảng `shop_approvals`) để admin xem, không gọi ngược sang marketplace. Hồ sơ cũ hơn của cùng shop đang chờ thì chuyển thành `REPLACED`; sự kiện tới sai thứ tự (đã có phiên bản mới hơn) thì lưu luôn là `REPLACED`; nhận trùng phiên bản thì bỏ qua.

### `shop_application.decided` (version 1)

Kiểu: `ShopApplicationDecidedPayload`.

| Trường | Ý nghĩa |
| --- | --- |
| `shopId`, `version`, `type` | Hồ sơ được quyết |
| `decision` | `APPROVED` hoặc `REJECTED` |
| `reason` | Lý do, bắt buộc khi `REJECTED` |
| `decidedBy` | `userId`, `name` của admin |
| `decidedAt` | Thời điểm quyết |

marketplace-service chỉ áp quyết định khi `version` đúng bằng phiên bản đang chờ; khác thì bỏ qua (seller đã nộp bản mới hơn). Duyệt `REGISTER` → shop `ACTIVE`; duyệt `CHANGE` → thay tên / tài khoản ngân hàng; từ chối → giữ nguyên thông tin cũ, lưu lý do để seller xem.

## 3. Sự kiện P2

| Sự kiện | Gửi → nhận | Khi nào |
| --- | --- | --- |
| `shop_suspension.decided` | approval → marketplace | Admin đình chỉ hoặc khôi phục shop (SHP-04) |

### `shop_suspension.decided` (version 1)

Kiểu: `ShopSuspensionDecidedPayload` trong `packages/shared/src/events/shop.ts`.

| Trường | Ý nghĩa |
| --- | --- |
| `shopId` | Mã shop |
| `action` | `SUSPEND` (đình chỉ) hoặc `RESTORE` (khôi phục) |
| `reason` | Lý do, luôn có |
| `decidedBy` | `userId`, `name` của admin |
| `decidedAt` | Thời điểm quyết |

marketplace-service lưu thời điểm quyết định đã áp vào cột `shops.moderated_at` và chỉ áp sự kiện có `decidedAt` mới hơn (sự kiện cũ tới sau thì bỏ qua). `SUSPEND` → shop `SUSPENDED`, lưu lý do vào `suspend_reason`; `RESTORE` → shop `ACTIVE`, xóa lý do. Nếu marketplace chưa kịp áp quyết định duyệt mở shop (shop chưa `ACTIVE`/`SUSPENDED`) thì ném lỗi để sự kiện được gửi lại sau.

## 4. Thêm sự kiện mới

1. Khai báo tên và kiểu payload trong file theo chủ đề ở `packages/shared/src/events/`, thêm một dòng vào `EventPayloads` trong `index.ts`.
2. Thêm một mục vào file này (bảng ở mục 2 và bảng trường).
3. Cả hai việc nằm trong cùng Pull Request với code gửi sự kiện; báo người phụ trách service nhận.
