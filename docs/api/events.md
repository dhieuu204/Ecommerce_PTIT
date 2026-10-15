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

## 4. Sự kiện P3

Kiểu: `packages/shared/src/events/order.ts` (đơn, kiểm tra đơn) và `payment.ts` (thanh toán, hoàn tiền).

| Sự kiện | Gửi → nhận | Khi nào |
| --- | --- | --- |
| `order.placed` | marketplace → payment, approval | Buyer đặt hàng thành công (ORD-01) |
| `order_check.decided` | approval → marketplace | Đơn qua kiểm tra (tự động hoặc admin duyệt), bị từ chối hoặc quá hạn duyệt (RSK-01) |
| `payment.succeeded` | payment → marketplace | Tiền của đơn tổng đã về (PAY-02) |
| `payment.expired` | payment → marketplace | Hết hạn thanh toán hoặc hết số lần thử mà không có tiền (ORD-04) |
| `shop_order.cancelled` | marketplace → payment, approval | Một đơn con bị hủy (ORD-05) |
| `refund.updated` | payment → marketplace | Khoản hoàn của một đơn con đổi trạng thái (REF-01) |

### `order.placed` (version 1)

| Trường | Ý nghĩa |
| --- | --- |
| `orderId`, `code` | Đơn tổng |
| `buyer` | `userId`, `name`, `email` (từ JWT lúc đặt) |
| `paymentMethod` | `VNPAY` (P4 thêm `COD`) |
| `total` | Tổng buyer phải trả (đồng) |
| `payBefore` | Hạn thanh toán |
| `shippingProvince` | Tên tỉnh nhận hàng (admin xem khi duyệt) |
| `shopOrders` | Mỗi đơn con: `shopOrderId`, `code`, `shopId`, `shopName`, `ownerId` (chủ shop, để chặn tự duyệt), `subtotal`, `shopDiscount`, `platformDiscount`, `shippingFee`, `total`, `items` (`name`, `variant`, `price`, `quantity`) |
| `placedAt` | Lúc đặt |

payment-service lưu mỗi đơn con thành một dòng `seller_earnings` (chụp phí sàn đang dùng) để biết số tiền cần thu; approval-service chạy luật kiểm tra đơn. Nhận trùng thì bỏ qua (khóa `shop_order_id` / `order_id`).

### `order_check.decided` (version 1)

| Trường | Ý nghĩa |
| --- | --- |
| `orderId`, `checkId` | |
| `result` | `PASSED` (qua), `REJECTED` (admin từ chối), `TIMEOUT` (quá hạn chưa duyệt) |
| `reason` | Lý do (bắt buộc khi `REJECTED`/`TIMEOUT`) |
| `decidedBy` | `userId`, `name` của admin; `null` khi tự động |
| `decidedAt` | |

marketplace chỉ áp khi đơn còn `checkStatus = PENDING`. `PASSED` và đã trả → các đơn con `PENDING` sang `TO_CONFIRM`. `REJECTED`/`TIMEOUT` → hủy mọi đơn con chưa hủy (`SYSTEM`), đã trả thì kéo theo hoàn tiền.

### `payment.succeeded` (version 1)

| Trường | Ý nghĩa |
| --- | --- |
| `orderId`, `paymentId`, `amount`, `paidAt` | |
| `shopOrders` | Mỗi đơn con: `shopOrderId`, `platformFeeRate` (500 = 5%), `platformFee`, `sellerAmount` (seller dự kiến nhận) |

Chỉ phát cho lần thanh toán **được áp vào đơn** (đơn còn chưa trả). marketplace: đơn chưa trả và chưa hủy → `paymentStatus = PAID`, chốt tồn, lưu phí sàn vào đơn con; đã qua kiểm tra thì các đơn con sang `TO_CONFIRM`. Đơn đã bị hủy (ví dụ hết giữ tồn trước khi tin tới) → bỏ qua; payment-service tự hoàn khi nhận `shop_order.cancelled`.

### `payment.expired` (version 1)

| Trường | Ý nghĩa |
| --- | --- |
| `orderId` | |
| `reason` | `TIMEOUT` (hết hạn) hoặc `ATTEMPTS_EXHAUSTED` (hết số lần thử) |
| `expiredAt` | |

Phát sau khi đã tra cứu VNPay lần cuối mà không có tiền. marketplace hủy cả đơn tổng nếu còn chưa trả (nhả tồn, trả lượt voucher).

### `shop_order.cancelled` (version 1)

| Trường | Ý nghĩa |
| --- | --- |
| `orderId`, `shopOrderId`, `code`, `shopId` | |
| `cancelledBy` | `BUYER`, `SELLER`, `ADMIN`, `SYSTEM` |
| `reason` | Lý do hủy |
| `orderCancelled` | `true` khi sau lần hủy này mọi đơn con của đơn tổng đều đã hủy |
| `cancelledAt` | |

payment-service: đơn con đã thu tiền → tạo khoản hoàn bằng số buyer đã trả cho đơn con đó (mỗi đơn con tối đa một khoản); chưa thu → chỉ đánh dấu hủy. approval-service: `orderCancelled` và kiểm tra còn chờ → `CANCELLED` (admin không phải duyệt nữa).

### `refund.updated` (version 1)

| Trường | Ý nghĩa |
| --- | --- |
| `refundId`, `orderId`, `shopOrderId` (`null` khi hoàn khoản trả trùng/trả muộn của cả đơn) | |
| `amount` | |
| `status` | `PROCESSING` (đang hoàn, kể cả đang thử lại), `NEEDS_MANUAL` (chờ admin hoàn tay), `SUCCEEDED` (VNPay báo đã hoàn), `MANUAL_DONE` (admin đã chuyển khoản, có chứng từ) |
| `updatedAt` | |

marketplace lưu vào `shop_orders.refund_status` để buyer, seller thấy; chỉ áp trạng thái mới hơn (`updatedAt`).

## 5. Sự kiện P4

Kiểu: `packages/shared/src/events/order.ts`. Sự kiện P3 `order.placed` thêm `paymentMethod = COD`; với đơn COD, `total` của đơn con là số GHN thu hộ.

| Sự kiện | Gửi → nhận | Khi nào |
| --- | --- | --- |
| `shop_order.delivered` | marketplace → payment | GHN báo giao thành công (SHIP-03) |
| `shop_order.completed` | marketplace → payment | Đơn con hoàn tất: người mua bấm "Đã nhận" hoặc hết hạn (FIN-02) |
| `shop_order.delivery_failed` | marketplace → payment | Giao thất bại lần cuối, bắt đầu hoàn kiện (SHIP-04) |
| `shop_order.incident_confirmed` | marketplace → payment | Admin xác nhận GHN làm mất/hỏng hàng (SHIP-04) |
| `seller_earnings.recorded` | payment → marketplace | Đã ghi tiền seller dự kiến của đơn (cả COD), kèm phí sàn |

### `shop_order.delivered` (version 1)

| Trường | Ý nghĩa |
| --- | --- |
| `orderId`, `shopOrderId` | |
| `paymentMethod` | `VNPAY` hoặc `COD` |
| `ghnCode` | Mã vận đơn (dùng để khớp file đối soát COD) |
| `codAmount` | Số GHN thu hộ (0 với trả trước) |
| `carrierFee` | Phí GHN tính cho vận đơn (để đối soát phí vận chuyển), `null` nếu chưa biết |
| `deliveredAt` | |

payment-service: đơn COD → ghi tiền seller vào ngăn đang giữ, lưu mã vận đơn và số thu hộ để chờ đối soát. Đơn trả trước → chỉ lưu mã vận đơn, phí GHN. Nhận trùng thì bỏ qua.

### `shop_order.completed` (version 1)

| Trường | Ý nghĩa |
| --- | --- |
| `orderId`, `shopOrderId` | |
| `completedBy` | `BUYER` (bấm "Đã nhận") hoặc `SYSTEM` (hết hạn) |
| `completedAt` | |

payment-service đánh dấu đơn con hoàn tất; nếu tiền đã về sàn (trả trước đã thu, COD đã đối soát) thì chuyển tiền seller từ đang giữ sang khả dụng. P5 thêm điều kiện "không có trả hàng/tranh chấp đang mở".

### `shop_order.delivery_failed` (version 1)

| Trường | Ý nghĩa |
| --- | --- |
| `orderId`, `shopOrderId` | |
| `paymentMethod` | |
| `refundAmount` | Trả trước: tiền hàng sau voucher (`total - shippingFee`); COD: 0 |
| `failedAt` | |

payment-service: trừ lại tiền seller ở ngăn đang giữ (nếu có), đơn trả trước tạo khoản hoàn `refundAmount`.

### `shop_order.incident_confirmed` (version 1)

| Trường | Ý nghĩa |
| --- | --- |
| `orderId`, `shopOrderId` | |
| `paymentMethod` | |
| `refundAmount` | Trả trước: `total` (hoàn đủ); COD: 0. Mất lúc đang hoàn về (đã hoàn khi giao thất bại): 0 |
| `note` | Ghi chú của admin |
| `confirmedAt` | |

payment-service: trừ lại ngăn đang giữ (nếu có), ghi khoản đền `sellerAmount` thẳng vào ngăn khả dụng, đơn trả trước tạo khoản hoàn `refundAmount`.


### `seller_earnings.recorded` (version 1)

payment → marketplace. Kiểu ở `packages/shared/src/events/payment.ts`. Gửi khi payment-service nhận `order.placed` và đã ghi tiền seller dự kiến của các đơn con (cả trả trước lẫn COD). Đơn COD không có bước "thanh toán thành công" nên marketplace lấy phí sàn từ đây.

| Trường | Ý nghĩa |
| --- | --- |
| `orderId` | |
| `shopOrders[]` | `shopOrderId`, `platformFeeRate` (phần vạn), `platformFee`, `sellerAmount` (giống `payment.succeeded`) |

marketplace-service: lưu phí sàn và số seller dự kiến nhận vào đơn con. Nhận lại thì ghi đè cùng giá trị. Tới trước khi có đơn con (không thể xảy ra vì đơn tạo trước khi gửi `order.placed`) thì báo lỗi để thử lại.

## 6. Sự kiện P5

Kiểu: `packages/shared/src/events/return.ts` (trả hàng, tranh chấp) và `finance.ts` (rút tiền, điều chỉnh). Quyết định của vòng này: `docs/phan-tich/12-quyet-dinh-p5.md`.

| Sự kiện | Gửi → nhận | Khi nào |
| --- | --- | --- |
| `return.requested` | marketplace → payment | Người mua gửi yêu cầu trả hàng (RET-01) |
| `return.resolved` | marketplace → payment | Yêu cầu trả hàng có kết quả: hoàn tiền, đóng không hoàn, hoặc bị hủy (RET-04) |
| `dispute.opened` | marketplace → approval | Người mua khiếu nại khi shop từ chối, hoặc shop báo hàng trả về không đúng (DIS-01) |
| `dispute.decided` | approval → marketplace | Admin `SUPPORT` phân xử (DIS-01) |
| `withdrawal.requested` | payment → approval | Seller gửi yêu cầu rút, tiền đã khóa (FIN-04) |
| `withdrawal.cancelled` | payment → approval | Seller hủy yêu cầu khi chưa duyệt (FIN-04) |
| `withdrawal_approval.decided` | approval → payment | Admin `FINANCE` duyệt hoặc từ chối yêu cầu rút (FIN-05) |
| `adjustment.approved` | approval → payment | Admin `FINANCE` thứ hai duyệt đề nghị điều chỉnh (DIS-02) |
| `adjustment.executed` | payment → approval | payment-service đã thực thi (hoặc không thực thi được) điều chỉnh (DIS-02) |

Sự kiện cũ bổ sung trường (tương thích, bên nhận coi thiếu là `null`): `shop_order.completed` thêm `returnId`; `refund.updated` thêm `returnId`.

### `return.requested` (version 1)

| Trường | Ý nghĩa |
| --- | --- |
| `returnId`, `code` | Yêu cầu trả hàng (mã = mã đơn con + `-TH`) |
| `orderId`, `shopOrderId` | |
| `refundAmount` | Số hoàn tối đa người mua yêu cầu |
| `requestedAt` | |

payment-service đánh dấu tiền seller của đơn con là "có trả hàng đang mở" (không chuyển sang khả dụng). Nhận sau `return.resolved` của cùng yêu cầu thì bỏ qua.

### `return.resolved` (version 1)

| Trường | Ý nghĩa |
| --- | --- |
| `returnId`, `code`, `orderId`, `shopOrderId` | |
| `outcome` | `REFUND` (hoàn tiền) hoặc `NO_REFUND` (đóng không hoàn, người mua hủy, quá hạn gửi hàng) |
| `refundAmount` | Số hoàn cho người mua (0 khi `NO_REFUND`) |
| `maxRefundAmount` | Số hoàn tối đa = tổng số người mua đã trả cho các món trả |
| `sellerBase` | Tiền hàng sau voucher shop của các món trả (phần tính trừ tiền seller khi hoàn toàn bộ) |
| `platformCovers` | `true` khi sàn chịu (kiện trả bị GHN làm thất lạc): không trừ tiền seller |
| `bankAccount` | Tài khoản nhận tiền hoàn của đơn COD (`bankName`, `accountNumber`, `accountName`); `null` với đơn trả trước (hoàn qua cổng) |
| `resolvedAt` | |

payment-service (khóa theo đơn, mỗi yêu cầu áp một lần):
- `REFUND`: tạo khoản hoàn `refundAmount` (đơn trả trước: qua cổng, hoàn một phần giao dịch; đơn COD: chuyển khoản tay, tạo ở `NEEDS_MANUAL`), không vượt `maxRefundAmount` và không cho tổng tiền hoàn của đơn con vượt số người mua đã trả. Phần seller bị trừ = `sellerBase` (hoàn toàn bộ) hoặc `⌊sellerBase × refundAmount / maxRefundAmount⌋` (hoàn một phần), 0 khi `platformCovers`. Phí sàn tính lại trên tiền hàng còn lại; trừ chênh lệch khỏi ngăn đang giữ (dòng `RETURN_DEDUCTED`). Tiền seller của đơn con còn lại 0 (trả hết mọi món) thì thành `REFUNDED`. Tiền không còn ở ngăn đang giữ (trường hợp không xảy ra khi marketplace khóa đúng) thì không ghi khoản trừ, ghi log lỗi để xử lý bằng điều chỉnh ví (DIS-02).
- Cả hai kết quả: bỏ đánh dấu "có trả hàng đang mở", xét chuyển phần còn lại sang khả dụng.

### `dispute.opened` (version 1)

| Trường | Ý nghĩa |
| --- | --- |
| `returnId`, `returnCode` | |
| `stage` | `REQUEST_REJECTED` (shop từ chối, người mua khiếu nại) hoặc `GOODS_PROBLEM` (shop báo hàng trả về không đúng) |
| `orderId`, `orderCode`, `shopOrderId`, `shopOrderCode` | |
| `shop` | `shopId`, `name`, `ownerId` (chặn admin là chủ shop tự quyết) |
| `buyer` | `userId`, `name` |
| `paymentMethod` | `VNPAY` hoặc `COD` |
| `reason`, `description`, `images` | Lý do, mô tả và ảnh (khóa file) của yêu cầu trả hàng |
| `items` | Mỗi món: `name`, `variant`, `price`, `quantity` (số trả), `refundAmount` |
| `maxRefundAmount` | Số hoàn tối đa |
| `buyerStatement`, `sellerStatement` | `text`, `images` của từng bên (giai đoạn 1: lời khiếu nại của người mua, lý do từ chối của shop; giai đoạn 2: mô tả gốc của người mua, ghi chú kiểm hàng của shop) |
| `openedAt` | |

approval-service tạo hồ sơ tranh chấp `PENDING` (hạn nhắc `dispute_sla_hours`). Nhận trùng (cùng yêu cầu, cùng giai đoạn) thì bỏ qua.

### `dispute.decided` (version 1)

| Trường | Ý nghĩa |
| --- | --- |
| `disputeId`, `returnId`, `stage` | |
| `decision` | `ACCEPT_RETURN` (người mua gửi hàng về, chỉ giai đoạn `REQUEST_REJECTED`), `REFUND` (hoàn `refundAmount`), `REJECT` (không hoàn) |
| `refundAmount` | Có khi `REFUND`: từ 1 tới số hoàn tối đa |
| `note` | Lời giải thích của admin |
| `decidedBy` | `userId`, `name` |
| `decidedAt` | |

marketplace chỉ áp khi yêu cầu còn `DISPUTED` đúng giai đoạn: `ACCEPT_RETURN` → tạo vận đơn trả (`SHIPPING_BACK`); `REFUND` → `REFUNDING` (giai đoạn 1 không cần gửi hàng về), phát `return.resolved`; `REJECT` → `CLOSED`, phát `return.resolved` (`NO_REFUND`). Kết quả khác `ACCEPT_RETURN` thì đơn con hoàn tất.

### `withdrawal.requested` (version 1)

| Trường | Ý nghĩa |
| --- | --- |
| `withdrawalId`, `shopId`, `shopName` | |
| `owner` | `userId`, `name` của chủ shop (chặn tự duyệt) |
| `amount` | Số tiền rút (đã khóa) |
| `bankAccount` | `bankName`, `accountNumberMasked` (chỉ 4 số cuối), `accountName` |
| `wallet` | `pending`, `available`, `locked` sau khi khóa |
| `requestedAt` | |

approval-service tạo hồ sơ duyệt rút `PENDING`. Nhận trùng thì bỏ qua.

### `withdrawal.cancelled` (version 1)

`withdrawalId`, `cancelledAt`. approval-service: hồ sơ còn `PENDING` → `CANCELLED`; đã quyết thì để nguyên (payment-service bỏ qua quyết định tới sau khi đã hủy).

### `withdrawal_approval.decided` (version 1)

| Trường | Ý nghĩa |
| --- | --- |
| `withdrawalId`, `approvalId` | |
| `decision` | `APPROVED` hoặc `REJECTED` |
| `reason` | Bắt buộc khi `REJECTED` |
| `decidedBy` | `userId`, `name` |
| `decidedAt` | |

payment-service chỉ áp khi yêu cầu còn `PENDING`: `APPROVED` → chờ chuyển khoản; `REJECTED` → mở khóa (đúng một lần). Yêu cầu đã bị seller hủy thì bỏ qua.

### `adjustment.approved` (version 1)

| Trường | Ý nghĩa |
| --- | --- |
| `adjustmentId` | |
| `orderId`, `shopOrderId`, `shopOrderCode`, `shopId` | Đơn con được điều chỉnh (approval-service tra từ dữ liệu `order.placed`) |
| `sellerChange` | Cộng (dương) hoặc trừ (âm) ngăn khả dụng của shop; 0 = không đổi ví |
| `buyerRefund` | Hoàn thêm cho người mua bằng chuyển khoản; 0 = không |
| `bankAccount` | Tài khoản nhận của người mua khi `buyerRefund > 0` |
| `reason` | Lý do đề nghị |
| `createdBy`, `approvedBy` | `userId`, `name` của người lập và người duyệt |
| `approvedAt` | |

payment-service thực thi trong một giao dịch, **tất cả hoặc không**: đơn con phải thuộc shop; trừ ví chỉ khi số dư khả dụng đủ; hoàn thêm không vượt số người mua đã trả trừ các khoản đã hoàn. Ghi dòng ví `ADJUSTMENT`, khoản hoàn `ADJUSTMENT` (`NEEDS_MANUAL`). Rồi phát `adjustment.executed`.

### `adjustment.executed` (version 1)

`adjustmentId`, `result` (`APPLIED` hoặc `FAILED`), `message` (lý do khi `FAILED`), `executedAt`. approval-service ghi kết quả vào hồ sơ (`EXECUTED` / `FAILED`).

## 7. Thêm sự kiện mới

1. Khai báo tên và kiểu payload trong file theo chủ đề ở `packages/shared/src/events/`, thêm một dòng vào `EventPayloads` trong `index.ts`.
2. Thêm một mục vào file này (bảng sự kiện của phase và bảng trường).
3. Cả hai việc nằm trong cùng Pull Request với code gửi sự kiện; báo người phụ trách service nhận.
