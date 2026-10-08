# Hợp đồng API và sự kiện

Nhóm chọn cách **code trước, sinh tài liệu**: không viết file OpenAPI bằng tay. Thư mục này chỉ giữ:

| Nội dung | Ở đâu |
| --- | --- |
| Quy ước chung (đường dẫn, đăng nhập, lỗi, phân trang) | File này, mục 1 |
| Danh sách API từng phase và quy tắc chính của mỗi API | File này, mục 2 |
| Sự kiện giữa các service qua RabbitMQ | `events.md` + kiểu TypeScript trong `packages/shared/src/events` |
| Chi tiết từng API (trường, kiểu, mã lỗi) | Tự sinh từ code, xem mục 3 |

Muốn thêm hoặc đổi API so với danh sách ở mục 2, hoặc đổi sự kiện: sửa file này / `events.md` trong cùng Pull Request và báo người phụ trách các service bị ảnh hưởng.

## 1. Quy ước chung

### Đường dẫn

Mỗi service một tiền tố, Ingress NGINX chuyển theo tiền tố:

| Tiền tố | Service | Cổng khi chạy local |
| --- | --- | --- |
| `/api/user/v1` | user-service | 3001 |
| `/api/market/v1` | marketplace-service | 3002 |
| `/api/payment/v1` | payment-service | 3003 |
| `/api/approval/v1` | approval-service | 3004 |

- Tiền tố được đặt sẵn trong `src/main.ts` của mỗi service (`setGlobalPrefix`); controller chỉ khai phần sau, ví dụ `@Controller('auth')`. Riêng `GET /health` nằm ngoài tiền tố để Kubernetes kiểm tra.
- Tài nguyên của chính người đang đăng nhập dùng `me` (ví dụ `/api/user/v1/me/addresses`, `/api/market/v1/shops/me`).
- API cho admin nằm dưới `/admin/...` của từng service.
- Web chạy local: Vite proxy chuyển `/api/user` → `localhost:3001`, `/api/market` → `3002`, `/api/payment` → `3003`, `/api/approval` → `3004`.

### Đăng nhập và quyền

- Đăng nhập xong, web nhận **access token** (JWT, sống 15 phút) trong body và **refresh token** (7 ngày) trong cookie `httpOnly` chỉ gửi tới `/api/user/v1/auth`.
- Mọi API cần đăng nhập gửi header `Authorization: Bearer <access token>`. Hết hạn (401 `TOKEN_EXPIRED`) thì web gọi `POST /api/user/v1/auth/refresh` lấy vé mới rồi gọi lại.
- JWT ký bằng **RS256**. Khóa công khai ở `GET /api/user/v1/.well-known/jwks.json`; các service tải khi khởi động và lưu lại.
- Nội dung JWT: kiểu `JwtClaims` trong `packages/shared/src/auth.ts`.

```json
{
  "iss": "user-service",
  "aud": "san",
  "sub": "0192f1c4-…",
  "email": "an@gmail.com",
  "name": "Nguyễn Văn An",
  "perms": ["MODERATION"],
  "iat": 1760000000,
  "exp": 1760000900
}
```

- `sub` là userId. `perms` là bộ quyền admin, rỗng nếu không phải admin: `MODERATION` (kiểm duyệt), `SUPPORT` (hỗ trợ), `FINANCE` (tài chính/rủi ro), `SYSTEM` (quản trị hệ thống).
- Thu hồi quyền có hiệu lực khi vé hiện tại hết hạn (tối đa 15 phút), vì user-service thu hồi luôn refresh token của người đó.
- "Seller" không phải một quyền trong JWT: marketplace-service tự biết ai là chủ shop nào và shop đang ở trạng thái nào.

### Dữ liệu

- Mã định danh: UUID (chuỗi). Mã GHN giữ đúng kiểu của GHN (`provinceId`, `districtId` là số; `wardCode` là chuỗi).
- Thời gian: chuỗi ISO 8601 giờ UTC, ví dụ `2026-10-08T15:47:13Z`. Web tự đổi sang giờ Việt Nam khi hiển thị.
- Tiền: số nguyên đồng (VND).
- Tên trường JSON: `camelCase`.

### Lỗi

Mọi lỗi trả cùng một dạng (kiểu `ErrorBody` trong `packages/shared/src/http.ts`), `message` bằng tiếng Việt để web hiển thị thẳng:

```json
{
  "code": "LOGIN_LOCKED",
  "message": "Bạn đã nhập sai 5 lần. Thử lại sau 15 phút.",
  "details": { "retryAfterSeconds": 840 }
}
```

| HTTP | Khi nào |
| --- | --- |
| 400 `VALIDATION_ERROR` | Dữ liệu gửi lên sai; `details.fields` liệt kê từng trường sai |
| 401 `UNAUTHENTICATED` / `TOKEN_EXPIRED` | Chưa đăng nhập / vé hết hạn |
| 403 `FORBIDDEN` | Đăng nhập rồi nhưng không có quyền |
| 404 `NOT_FOUND` | Không có hoặc không được phép biết là có |
| 409 | Xung đột trạng thái (mã cụ thể theo từng API, ghi ở mục 2) |
| 423, 429 | Bị khóa tạm / thử quá nhiều lần (`details.retryAfterSeconds`) |

### Danh sách dài

Query `page` (từ 1) và `pageSize` (mặc định 20, tối đa 100). Trả về (kiểu `Page<T>`):

```json
{ "items": [], "page": 1, "pageSize": 20, "total": 57 }
```

### Chống gửi lặp

API tạo hồ sơ (nộp hồ sơ shop, yêu cầu đổi thông tin) nhận header `Idempotency-Key` (UUID do web sinh mỗi lần bấm nút). Gửi lại cùng key thì trả lại kết quả lần đầu, không tạo bản mới.

### Nhật ký thao tác admin

Mỗi service tự lưu nhật ký thao tác admin của mình (bảng `audit_log`, cùng các cột ở cả 4 service) và có `GET /admin/audit-logs` (bộ quyền `SYSTEM`, lọc `from`, `to`, `actorId`, `action`). Trang admin của web gọi cả các service rồi gộp theo thời gian.

## 2. Danh sách API P1

Mã chức năng (ACC, SHP, ADM) theo kế hoạch trong `docs/ke-hoach`.

### user-service (`/api/user/v1`)

| Phương thức, đường dẫn | Ai gọi | Mã | Quy tắc chính |
| --- | --- | --- | --- |
| POST `/auth/register` | Guest | ACC-01 | Nhập họ tên, email, mật khẩu (**từ 8 ký tự, không bắt buộc chữ hoa/số/ký tự đặc biệt**; tối đa 72). Tạo tài khoản `UNVERIFIED`, gửi mã 6 số qua email (hạn 10 phút, sai tối đa 5 lần). Email đã xác minh → 409 `EMAIL_TAKEN`. Email chưa xác minh → cập nhật và gửi mã mới. |
| POST `/auth/verify-email` | Guest | ACC-01 | Đúng mã → `ACTIVE` và đăng nhập luôn. Sai → 400 `CODE_INVALID` kèm `attemptsLeft`. Hết hạn hoặc sai 5 lần → 400 `CODE_EXPIRED`. |
| POST `/auth/resend-verification` | Guest | ACC-01 | Luôn trả 202 (không lộ email có tồn tại không). Cách nhau ít nhất 60 giây. |
| POST `/auth/login` | Guest | ACC-02 | Sai → 401 `INVALID_CREDENTIALS` kèm `attemptsLeft`. Sai 5 lần liên tiếp → khóa 15 phút (423 `LOGIN_LOCKED`). Chưa xác minh → 403 `EMAIL_NOT_VERIFIED`. Bị admin khóa → 403 `ACCOUNT_LOCKED`. |
| GET `/auth/google/start` → `/auth/google/callback` | Guest | ACC-01, ACC-02 | Email Google đã có tài khoản → tự gộp, đăng nhập được cả hai cách. Chưa có → tạo tài khoản `ACTIVE`, họ tên lấy từ Google. Đặt cookie refresh rồi chuyển về web (`returnTo`). |
| POST `/auth/refresh` | Web (cookie) | ACC-02 | Trả access token mới và đổi luôn refresh token (dùng một lần). Refresh token cũ bị dùng lại → thu hồi cả chuỗi phiên đó. |
| POST `/auth/logout` | Đã đăng nhập | ACC-02 | Thu hồi refresh token hiện tại, xóa cookie. |
| POST `/auth/forgot-password` | Guest | ACC-03 | Luôn trả 202. Gửi mã 6 số, quy tắc như mã xác minh. |
| POST `/auth/reset-password` | Guest | ACC-03 | Email + mã + mật khẩu mới. Thành công → thu hồi mọi phiên (đăng xuất mọi nơi). |
| GET, PATCH `/me` | Đã đăng nhập | ACC-04 | Sửa họ tên, SĐT (`0` + 9 số), ngày sinh, giới tính. Không sửa email ở P1. |
| POST `/me/password` | Đã đăng nhập | ACC-03 | Cần mật khẩu hiện tại; tài khoản chỉ có Google thì bỏ trống để đặt lần đầu. Thu hồi các phiên khác. |
| GET, POST `/me/addresses` | Đã đăng nhập | ACC-04 | Tối đa 10 địa chỉ. Mã tỉnh/huyện/xã kiểm qua marketplace-service. Địa chỉ đầu tiên tự thành mặc định. |
| PATCH, DELETE `/me/addresses/{addressId}` | Đã đăng nhập | ACC-04 | Xóa địa chỉ mặc định → địa chỉ mới nhất còn lại thành mặc định. |
| POST `/me/addresses/{addressId}/default` | Đã đăng nhập | ACC-04 | |
| GET `/admin/users`, `/admin/users/{userId}` | `SYSTEM` | ACC-05 | Lọc theo email/tên, trạng thái, bộ quyền. |
| PUT `/admin/users/{userId}/permissions` | `SYSTEM` | ACC-05 | Gửi danh sách đầy đủ + lý do. Không tự bỏ `SYSTEM` của mình (409 `CANNOT_REMOVE_OWN_SYSTEM`). Bỏ quyền → thu hồi refresh token người đó. Ghi nhật ký. |
| POST `/admin/users/{userId}/lock`, `/unlock` | `SYSTEM` | ACC-05 | Bắt buộc lý do. Khóa → thu hồi mọi phiên. Ghi nhật ký. |
| GET `/admin/audit-logs` | `SYSTEM` | ADM-02 | Xem mục 1. |
| GET `/.well-known/jwks.json` | Các service | ACC-02 | Khóa công khai, không cần đăng nhập. |

### marketplace-service (`/api/market/v1`)

| Phương thức, đường dẫn | Ai gọi | Mã | Quy tắc chính |
| --- | --- | --- | --- |
| GET `/locations/provinces` | Mọi người, user-service | SHP-03, ACC-04 | Danh sách tỉnh/huyện/xã lấy từ GHN, lưu trong market_db, việc định kỳ (pg-boss) cập nhật mỗi ngày. Không cần đăng nhập. |
| GET `/locations/provinces/{provinceId}/districts` | Mọi người | SHP-03, ACC-04 | |
| GET `/locations/districts/{districtId}/wards` | Mọi người | SHP-03, ACC-04 | |
| POST `/uploads/shop-logo` | Đã đăng nhập | SHP-01 | Gửi file dạng multipart. Chỉ JPG/PNG/WebP, tối đa 2 MB. Lưu vào MinIO, trả `{ logoKey, url }`. |
| GET `/shops/me` | Đã đăng nhập | SHP-01, SHP-03 | Trạng thái shop: `NONE` (chưa nộp), `PENDING`, `REJECTED` (kèm lý do), `ACTIVE`; phiên bản hiện tại; yêu cầu đổi thông tin đang chờ (nếu có). |
| POST `/shops/me/applications` | Đã đăng nhập | SHP-01 | Có `Idempotency-Key`. Hồ sơ đủ: tên, mô tả, logo, SĐT, địa chỉ lấy hàng (mã GHN), tài khoản ngân hàng. Tạo phiên bản mới `PENDING` (thay bản đang chờ nếu có), phát `shop.application_submitted`. Shop đã `ACTIVE` → 409 `SHOP_ALREADY_ACTIVE`. |
| PATCH `/shops/me` | Chủ shop `ACTIVE` | SHP-03 | Mô tả, logo, SĐT, địa chỉ lấy hàng: áp dụng ngay. Ghi nhật ký. |
| POST `/shops/me/change-requests` | Chủ shop `ACTIVE` | SHP-03 | Có `Idempotency-Key`. Đổi tên shop và/hoặc tài khoản ngân hàng phải duyệt lại; shop vẫn bán bằng thông tin cũ. Phát `shop.application_submitted` loại `CHANGE`. Đang có yêu cầu chờ → bản mới thay bản cũ. |
| GET `/admin/audit-logs` | `SYSTEM` | ADM-02 | Xem mục 1. |

### approval-service (`/api/approval/v1`)

| Phương thức, đường dẫn | Ai gọi | Mã | Quy tắc chính |
| --- | --- | --- | --- |
| GET `/admin/shop-reviews` | `MODERATION` | SHP-02 | Lọc `status` (`PENDING`, `APPROVED`, `REJECTED`, `SUPERSEDED`), `kind` (`REGISTRATION`, `CHANGE`), phân trang. Hồ sơ cũ nhất lên đầu. |
| GET `/admin/shop-reviews/{reviewId}` | `MODERATION` | SHP-02 | Bản chụp hồ sơ nhận qua sự kiện, phần thay đổi (nếu là `CHANGE`), lịch sử các phiên bản của shop. |
| POST `/admin/shop-reviews/{reviewId}/decision` | `MODERATION` | SHP-02 | `decision` = `APPROVE` hoặc `REJECT`; `reason` bắt buộc khi từ chối. Admin là chủ shop đó → 403 `SELF_REVIEW_FORBIDDEN`. Đã quyết → 409 `REVIEW_ALREADY_DECIDED`; có bản mới hơn → 409 `REVIEW_SUPERSEDED`. Phát `shop_review.decided`, ghi nhật ký. |
| GET `/admin/audit-logs` | `SYSTEM` | ADM-02 | Xem mục 1. |

payment-service chưa có API ở P1 (ngoài `/health`).

### Luồng P1 dùng các API trên

1. Guest đăng ký → nhận mã qua email → xác minh → đăng nhập (hoặc Google).
2. Vào "Shop của tôi": chọn tỉnh/huyện/xã (marketplace), tải logo, nộp hồ sơ → marketplace lưu phiên bản 1 "Chờ duyệt", phát `shop.application_submitted`.
3. approval-service nhận sự kiện, tạo hồ sơ duyệt. Admin `MODERATION` (không phải chủ shop) duyệt hoặc từ chối → phát `shop_review.decided`.
4. marketplace-service áp quyết định nếu đúng phiên bản đang chờ: duyệt thì shop "Đang hoạt động" (vào được Kênh người bán); từ chối thì "Bị từ chối" kèm lý do, seller sửa và nộp lại thành phiên bản mới.
5. Sau khi duyệt: sửa mô tả/logo/SĐT/địa chỉ lấy hàng bằng `PATCH /shops/me` (áp dụng ngay); đổi tên shop hoặc tài khoản ngân hàng bằng `POST /shops/me/change-requests` (đi lại bước 3–4).

Ở P1 seller xem kết quả duyệt trong trang "Shop của tôi"; thông báo trong app có ở P6 (MSG-02).

## 3. Tài liệu API tự sinh (Swagger)

Mỗi service đã cài `@nestjs/swagger`. Chạy service rồi mở:

| Service | Giao diện tài liệu | File OpenAPI (cho công cụ khác) |
| --- | --- | --- |
| user-service | http://localhost:3001/api/user/v1/docs | `/api/user/v1/docs-json` |
| marketplace-service | http://localhost:3002/api/market/v1/docs | `/api/market/v1/docs-json` |
| payment-service | http://localhost:3003/api/payment/v1/docs | `/api/payment/v1/docs-json` |
| approval-service | http://localhost:3004/api/approval/v1/docs | `/api/approval/v1/docs-json` |

Để tài liệu đủ cho người làm frontend:

- Dữ liệu vào và ra viết bằng **class DTO** (không dùng `any` hay object trơn). Trường vào kiểm bằng `class-validator` (`@IsEmail()`, `@MinLength(8)`...). Plugin Swagger trong `nest-cli.json` tự đọc kiểu và chú thích `/** ... */` của từng trường, nên viết chú thích tiếng Việt cho trường nào không tự giải thích.
- Mỗi controller có `@ApiTags(...)`; API cần đăng nhập có `@ApiBearerAuth()`.
- Mỗi mã lỗi riêng của API (ví dụ `EMAIL_TAKEN`) ghi bằng `@ApiResponse({ status: 409, description: 'EMAIL_TAKEN: ...' })`.
- Frontend chờ API của phase có trên Swagger rồi mới nối thật; trong lúc chờ, dựng giao diện với dữ liệu giả theo bảng ở mục 2.
