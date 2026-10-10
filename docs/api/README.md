# Hợp đồng API và sự kiện

Nhóm chọn cách **code trước, sinh tài liệu**: không viết file OpenAPI bằng tay. Thư mục này chỉ giữ:

| Nội dung | Ở đâu |
| --- | --- |
| Quy ước chung (đường dẫn, đăng nhập, lỗi, phân trang) | File này, mục 1 |
| Danh sách API từng phase và quy tắc chính của mỗi API | File này, mục 2 (P1), mục 3 (P2) |
| Sự kiện giữa các service qua RabbitMQ | `events.md` + kiểu TypeScript trong `packages/shared/src/events` |
| Chi tiết từng API (trường, kiểu, mã lỗi) | Tự sinh từ code, xem mục 4 |

Muốn thêm hoặc đổi API so với danh sách ở mục 2–3, hoặc đổi sự kiện: sửa file này / `events.md` trong cùng Pull Request và báo người phụ trách các service bị ảnh hưởng.

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
- JWT ký bằng **RS256**. Khóa công khai ở `GET /api/user/v1/.well-known/jwks.json`; các service tải ở lần kiểm vé đầu tiên, lưu lại, gặp mã khóa (`kid`) lạ thì tải lại. Code kiểm vé có sẵn trong `packages/nest-common`.
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
| 500 `INTERNAL_ERROR` | Lỗi trong code; chi tiết chỉ ghi vào log kèm `X-Correlation-Id`, không trả ra ngoài |

### Danh sách dài

Query `page` (từ 1) và `pageSize` (mặc định 20, tối đa 100). Trả về (kiểu `Page<T>`):

```json
{ "items": [], "page": 1, "pageSize": 20, "total": 57 }
```

### Con số cấu hình

Các con số trong quy tắc P1 (hạn mã 10 phút, sai tối đa 5 lần, khóa đăng nhập 15 phút, gửi lại mã sau 60 giây, tối đa 10 địa chỉ, logo tối đa 2 MB…) đọc từ file `.env` của service, có giá trị mặc định trong code và được liệt kê trong `.env.example`. Từ P3 các con số về đơn và tiền chuyển vào bảng `settings` để admin sửa trên web (quyết định 09/10, `docs/phan-tich/08-quyet-dinh-chot-p1.md`).

### Chống gửi lặp

API tạo hồ sơ (nộp hồ sơ shop, yêu cầu đổi thông tin) nhận header `Idempotency-Key` (UUID do web sinh mỗi lần bấm nút). Key được lưu vào cột `request_key` của hồ sơ; gửi lại cùng key thì trả lại hồ sơ đã tạo, không tạo bản mới. Thiếu key → 400 `IDEMPOTENCY_KEY_REQUIRED`; key đã dùng cho người khác → 409 `IDEMPOTENCY_KEY_REUSED`.

### Nhật ký thao tác admin

Mỗi service tự lưu nhật ký thao tác admin của mình (bảng `audit_log`, cùng các cột ở cả 4 service) và có `GET /admin/audit-logs` (bộ quyền `SYSTEM`, lọc `from`, `to`, `actorId`, `action`). Trang admin của web gọi cả các service rồi gộp theo thời gian.

## 2. Danh sách API P1

Mã chức năng (ACC, SHP, ADM) theo kế hoạch trong `docs/ke-hoach`.

### user-service (`/api/user/v1`)

| Phương thức, đường dẫn | Ai gọi | Mã | Quy tắc chính |
| --- | --- | --- | --- |
| POST `/auth/register` | Guest | ACC-01 | Nhập họ tên, email, mật khẩu (**từ 8 ký tự, không bắt buộc chữ hoa/số/ký tự đặc biệt**; tối đa 72). Tạo tài khoản `UNVERIFIED`, gửi mã 6 số qua email (hạn 10 phút, sai tối đa 5 lần). Email đã xác minh → 409 `EMAIL_TAKEN`. Email chưa xác minh → cập nhật và gửi mã mới. Không gửi được mail → 503 `MAIL_SEND_FAILED` (tài khoản vẫn tạo, bấm gửi lại mã). |
| POST `/auth/verify-email` | Guest | ACC-01 | Đúng mã → `ACTIVE` và đăng nhập luôn. Sai → 400 `CODE_INVALID` kèm `attemptsLeft`. Hết hạn hoặc sai 5 lần → 400 `CODE_EXPIRED`. |
| POST `/auth/resend-verification` | Guest | ACC-01 | Luôn trả 202 (không lộ email có tồn tại không). Cách nhau ít nhất 60 giây. |
| POST `/auth/login` | Guest | ACC-02 | Sai → 401 `INVALID_CREDENTIALS` kèm `attemptsLeft`. Sai 5 lần liên tiếp → khóa 15 phút (423 `LOGIN_LOCKED`). Chưa xác minh → 403 `EMAIL_NOT_VERIFIED`. Bị admin khóa → 403 `ACCOUNT_LOCKED`. |
| GET `/auth/google/start` → `/auth/google/callback` | Guest | ACC-01, ACC-02 | Email Google đã có tài khoản → tự gộp, đăng nhập được cả hai cách. Chưa có → tạo tài khoản `ACTIVE`, họ tên lấy từ Google. Gộp vào tài khoản chưa xác minh thì xóa mật khẩu cũ (người đặt chưa chứng minh là chủ email). Đặt cookie refresh rồi chuyển về web (`returnTo`); lỗi thì về `/dang-nhap?error=...`. Chưa cấu hình Google → 503 `GOOGLE_NOT_CONFIGURED`. |
| POST `/auth/refresh` | Web (cookie) | ACC-02 | Trả access token mới và đổi luôn refresh token (dùng một lần). Mỗi phiên là 1 dòng bảng `sessions`; refresh token cũ dùng lại → 401. |
| POST `/auth/logout` | Đã đăng nhập | ACC-02 | Thu hồi refresh token hiện tại, xóa cookie. |
| POST `/auth/forgot-password` | Guest | ACC-03 | Luôn trả 202. Gửi mã 6 số, quy tắc như mã xác minh. |
| POST `/auth/reset-password` | Guest | ACC-03 | Email + mã + mật khẩu mới. Thành công → thu hồi mọi phiên (đăng xuất mọi nơi). |
| GET, PATCH `/me` | Đã đăng nhập | ACC-04 | Sửa họ tên, SĐT (`0` + 9 số), ngày sinh, giới tính. Không sửa email ở P1. |
| POST `/me/password` | Đã đăng nhập | ACC-03 | Cần mật khẩu hiện tại (sai → 400 `WRONG_PASSWORD`); tài khoản chỉ có Google thì bỏ trống để đặt lần đầu. Thu hồi các phiên khác (vé mang mã phiên `sid`). |
| GET, POST `/me/addresses` | Đã đăng nhập | ACC-04 | Tối đa 10 địa chỉ (409 `ADDRESS_LIMIT`). Mã tỉnh/huyện/xã kiểm qua marketplace-service (không gọi được → 503 `LOCATION_SERVICE_UNAVAILABLE`). Địa chỉ đầu tiên tự thành mặc định. |
| PATCH, DELETE `/me/addresses/{addressId}` | Đã đăng nhập | ACC-04 | Xóa địa chỉ mặc định → địa chỉ mới nhất còn lại thành mặc định. |
| POST `/me/addresses/{addressId}/default` | Đã đăng nhập | ACC-04 | |
| GET `/admin/users`, `/admin/users/{userId}` | `SYSTEM` | ACC-05 | Lọc theo email/tên, trạng thái, bộ quyền. |
| PUT `/admin/users/{userId}/permissions` | `SYSTEM` | ACC-05 | Gửi danh sách đầy đủ + lý do. Không tự bỏ `SYSTEM` của mình (409 `CANNOT_REMOVE_OWN_SYSTEM`). Bỏ quyền → thu hồi refresh token người đó. Ghi nhật ký. |
| POST `/admin/users/{userId}/lock`, `/unlock` | `SYSTEM` | ACC-05 | Bắt buộc lý do. Khóa → thu hồi mọi phiên. Không tự khóa mình (409 `CANNOT_LOCK_SELF`); khóa lại tài khoản đang khóa → 409 `ALREADY_LOCKED`, mở khóa tài khoản không bị khóa → 409 `NOT_LOCKED`. Ghi nhật ký. |
| GET `/admin/audit-logs` | `SYSTEM` | ADM-02 | Xem mục 1. |
| GET `/.well-known/jwks.json` | Các service | ACC-02 | Khóa công khai, không cần đăng nhập. |

### marketplace-service (`/api/market/v1`)

| Phương thức, đường dẫn | Ai gọi | Mã | Quy tắc chính |
| --- | --- | --- | --- |
| GET `/locations/provinces` | Mọi người, user-service | SHP-03, ACC-04 | Danh sách tỉnh/huyện/xã lấy từ GHN, lưu trong market_db, việc định kỳ (pg-boss) cập nhật mỗi ngày. Không cần đăng nhập. Trả mảng `[{ id, name }]` (huyện cũng vậy, xã là `[{ code, name }]`); user-service dùng dạng này để kiểm địa chỉ. |
| GET `/locations/provinces/{provinceId}/districts` | Mọi người | SHP-03, ACC-04 | |
| GET `/locations/districts/{districtId}/wards` | Mọi người | SHP-03, ACC-04 | |
| POST `/uploads/shop-logo` | Đã đăng nhập | SHP-01 | Gửi file dạng multipart. Chỉ JPG/PNG/WebP (nhận diện theo nội dung file), tối đa 2 MB: sai → 400 `INVALID_IMAGE` / `FILE_TOO_LARGE` / `FILE_REQUIRED`; MinIO lỗi → 503 `STORAGE_UNAVAILABLE`. Lưu vào MinIO trong thư mục riêng của người tải (`shop-logos/<userId>/...`), trả `{ url }`. Khi nộp hồ sơ, marketplace kiểm `logoUrl` nằm trong thư mục của chính người đó. |
| GET `/shops/me` | Đã đăng nhập | SHP-01, SHP-03 | Trạng thái shop: `NONE` (chưa nộp), `PENDING`, `REJECTED` (kèm lý do), `ACTIVE`; phiên bản hiện tại; yêu cầu đổi thông tin đang chờ (nếu có). |
| POST `/shops/me/applications` | Đã đăng nhập | SHP-01 | Có `Idempotency-Key`. Hồ sơ đủ: tên, mô tả, logo, SĐT, địa chỉ lấy hàng (mã GHN), tài khoản ngân hàng. Tạo phiên bản mới `PENDING` (thay bản đang chờ nếu có), phát `shop_application.submitted`. Shop đã `ACTIVE` → 409 `SHOP_ALREADY_ACTIVE`. Tên trùng shop khác (không phân biệt hoa thường) → 409 `SHOP_NAME_TAKEN`. |
| PATCH `/shops/me` | Chủ shop `ACTIVE` | SHP-03 | Mô tả, logo, SĐT, địa chỉ lấy hàng: áp dụng ngay. Ghi nhật ký. Shop chưa hoạt động → 409 `SHOP_NOT_ACTIVE`. |
| POST `/shops/me/change-requests` | Chủ shop `ACTIVE` | SHP-03 | Có `Idempotency-Key`. Đổi tên shop và/hoặc tài khoản ngân hàng phải duyệt lại; shop vẫn bán bằng thông tin cũ. Phát `shop_application.submitted` loại `CHANGE`. Đang có yêu cầu chờ → bản mới thay bản cũ. Không khác thông tin hiện tại → 400 `NOTHING_TO_CHANGE`. |
| GET `/admin/audit-logs` | `SYSTEM` | ADM-02 | Xem mục 1. |

### approval-service (`/api/approval/v1`)

| Phương thức, đường dẫn | Ai gọi | Mã | Quy tắc chính |
| --- | --- | --- | --- |
| GET `/admin/shop-approvals` | `MODERATION` | SHP-02 | Lọc `status` (`PENDING`, `APPROVED`, `REJECTED`, `REPLACED`), `type` (`REGISTER`, `CHANGE`), `q` (tìm theo tên shop, tên hoặc email chủ shop), phân trang. Hồ sơ cũ nhất lên đầu. |
| GET `/admin/shop-approvals/{approvalId}` | `MODERATION` | SHP-02 | Hồ sơ nhận qua sự kiện, phần thay đổi (nếu là `CHANGE`), lịch sử các phiên bản của shop. |
| POST `/admin/shop-approvals/{approvalId}/decision` | `MODERATION` | SHP-02 | `decision` = `APPROVE` hoặc `REJECT`; `reason` bắt buộc khi từ chối. Admin là chủ shop đó → 403 `SELF_APPROVAL_FORBIDDEN`. Đã quyết → 409 `ALREADY_DECIDED`; shop đã nộp bản mới hơn → 409 `APPLICATION_REPLACED`. Phát `shop_application.decided`, ghi nhật ký. |
| GET `/admin/audit-logs` | `SYSTEM` | ADM-02 | Xem mục 1. |

payment-service chưa có API ở P1 (ngoài `/health`).

### Luồng P1 dùng các API trên

1. Guest đăng ký → nhận mã qua email → xác minh → đăng nhập (hoặc Google).
2. Vào "Shop của tôi": chọn tỉnh/huyện/xã (marketplace), tải logo, nộp hồ sơ → marketplace lưu phiên bản 1 "Chờ duyệt", phát `shop_application.submitted`.
3. approval-service nhận sự kiện, tạo hồ sơ duyệt. Admin `MODERATION` (không phải chủ shop) duyệt hoặc từ chối → phát `shop_application.decided`.
4. marketplace-service áp quyết định nếu đúng phiên bản đang chờ: duyệt thì shop "Đang hoạt động" (vào được Kênh người bán); từ chối thì "Bị từ chối" kèm lý do, seller sửa và nộp lại thành phiên bản mới.
5. Sau khi duyệt: sửa mô tả/logo/SĐT/địa chỉ lấy hàng bằng `PATCH /shops/me` (áp dụng ngay); đổi tên shop hoặc tài khoản ngân hàng bằng `POST /shops/me/change-requests` (đi lại bước 3–4).

Ở P1 seller xem kết quả duyệt trong trang "Shop của tôi"; thông báo trong app có ở P6 (MSG-02).

## 3. Danh sách API P2

P2 (hàng và giỏ): SHP-04, CAT-01..04, INV-01, SRC-01, CRT-01, VCH-01. Mục tiêu: hai shop có hàng; buyer tìm và thêm hàng của cả hai vào giỏ. Các lựa chọn của chủ đồ án (10/10): danh mục công nghệ + vài ngành khác; **đăng là bán ngay** (không duyệt sản phẩm); voucher **chỉ tạo ở P2, áp vào đơn ở P3**; voucher giảm **số tiền** hoặc **% có trần**; **phải đăng nhập** mới thêm vào giỏ; shop bị đình chỉ thì **ẩn hàng, seller vẫn sửa được**.

### Quy tắc chung của P2

- **Hàng đang bán** = sản phẩm `ACTIVE` của shop `ACTIVE`. Mọi API công khai chỉ trả hàng đang bán; sản phẩm khác trả 404.
- **Còn bán được** của một biến thể = `stock - reserved` (`reserved` là lượng đang giữ cho đơn trả trước chưa thanh toán, có từ P3). API công khai chỉ trả số còn bán được, không trả `reserved`.
- **Danh mục 2 cấp**, sản phẩm gắn danh mục cấp 2. Danh mục ẩn không hiện trên menu và không chọn được cho sản phẩm mới; sản phẩm đã gắn vẫn bán bình thường.
- **Biến thể**: tối đa 2 nhóm (ví dụ Màu, Dung lượng) × 10 lựa chọn, mỗi tổ hợp là một SKU có giá và tồn riêng, không trùng tổ hợp (409 `DUPLICATE_VARIANT`). Sản phẩm không có nhóm nào thì có đúng 1 SKU.
- **Ảnh**: bộ ảnh chung tối đa 9 + mỗi lựa chọn của nhóm 1 được 1 ảnh riêng (ảnh theo màu).
- **Bỏ một biến thể** khi sửa sản phẩm: nếu đang có lượng giữ cho đơn → 409 `VARIANT_RESERVED`; ngược lại biến thể chuyển `active = false` (không xóa dòng, để đơn cũ còn tham chiếu). Thêm lại đúng tổ hợp đó thì bật lại dòng cũ.
- **Tồn kho** chỉ đổi qua API điều chỉnh tồn (mỗi lần một dòng `stock_history`), trừ tồn ban đầu khi tạo biến thể mới (cũng ghi lịch sử "Nhập ban đầu"). Tồn sau điều chỉnh không được nhỏ hơn lượng đang giữ (409 `STOCK_BELOW_RESERVED`).
- **Shop bị đình chỉ** (`SUSPENDED`): hàng biến mất khỏi tìm kiếm, trang sản phẩm 404, dòng giỏ hiện "Không còn bán". Trang shop vẫn mở được và ghi "Shop đang tạm ngừng bán". Seller vẫn vào Kênh người bán, sửa sản phẩm, tồn, voucher. Shop chưa được duyệt dùng API seller → 409 `SHOP_NOT_ACTIVE`.
- **Con số cấu hình** (đọc từ `.env` của marketplace, có mặc định trong code): ảnh sản phẩm tối đa 5 MB, 9 ảnh chung; 2 nhóm × 10 lựa chọn; giá 1.000đ–500.000.000đ; khối lượng 1–30.000 g; tồn mỗi biến thể tối đa 999.999; giỏ tối đa 100 dòng; voucher dài tối đa 180 ngày.

### marketplace-service (`/api/market/v1`)

**Danh mục**

| Phương thức, đường dẫn | Ai gọi | Mã | Quy tắc chính |
| --- | --- | --- | --- |
| GET `/categories` | Mọi người | CAT-01 | Cây danh mục chưa ẩn: cấp 1 kèm `children` (cấp 2), theo `sort`. Mỗi mục có `id`, `name`, `slug`, `icon` (tên icon lucide). Không cần đăng nhập. |
| GET `/admin/categories` | `MODERATION` | CAT-01 | Cả danh mục ẩn, kèm số sản phẩm của từng danh mục. |
| POST `/admin/categories` | `MODERATION` | CAT-01 | `name`, `slug` (chữ thường không dấu, gạch nối; trùng → 409 `SLUG_TAKEN`), `parentId` (trống = cấp 1; cha phải là cấp 1 → 400 `INVALID_PARENT`), `icon`, `sort`. Ghi nhật ký. |
| PATCH `/admin/categories/{categoryId}` | `MODERATION` | CAT-01 | Sửa tên, slug, icon, thứ tự, `hidden`, chuyển danh mục cấp 2 sang cấp 1 khác. Danh mục cấp 1 đang có con không đổi thành cấp 2 (409 `CATEGORY_HAS_CHILDREN`). Ghi nhật ký. |
| DELETE `/admin/categories/{categoryId}` | `MODERATION` | CAT-01 | Chỉ xóa được khi không có danh mục con và chưa sản phẩm nào gắn (409 `CATEGORY_IN_USE`, gợi ý ẩn thay vì xóa). Ghi nhật ký. |

**Sản phẩm của seller**

| Phương thức, đường dẫn | Ai gọi | Mã | Quy tắc chính |
| --- | --- | --- | --- |
| POST `/uploads/product-image` | Chủ shop | CAT-02 | Như logo shop (JPG/PNG/WebP nhận theo nội dung file) nhưng tối đa 5 MB, lưu ở `product-images/<userId>/...`, trả `{ url }`. Khi lưu sản phẩm, mọi ảnh phải nằm trong thư mục của chính người đó (400 `INVALID_IMAGE_URL`). |
| GET `/shops/me/products` | Chủ shop | CAT-02 | Lọc `status`, `categoryId`, `q` (tên), phân trang, mới sửa lên đầu. Mỗi dòng có ảnh đầu, khoảng giá, tổng tồn, tổng còn bán được, số biến thể, `soldCount`. |
| POST `/shops/me/products` | Chủ shop | CAT-02, CAT-03 | Tên (5–120 ký tự), mô tả (20–5.000), `categoryId` (cấp 2, chưa ẩn → 400 `INVALID_CATEGORY`), khối lượng (g), `option1Name`/`option2Name`, `variants` (`option1Value`, `option2Value`, `price`, `originalPrice` lớn hơn `price` nếu có, `stock` ban đầu), `images` (`url`, `option1Value` nếu là ảnh theo màu). Tạo xong là `ACTIVE` (bán ngay). |
| GET `/shops/me/products/{productId}` | Chủ shop | CAT-02 | Đầy đủ, kể cả `stock`, `reserved` của từng biến thể. Sản phẩm shop khác → 404. |
| PUT `/shops/me/products/{productId}` | Chủ shop | CAT-02, CAT-03 | Gửi lại toàn bộ như khi tạo; biến thể cũ nhận ra bằng `id`. Không đổi tồn của biến thể cũ ở đây (dùng API điều chỉnh tồn). Biến thể bị bỏ: xem quy tắc chung. |
| PATCH `/shops/me/products/{productId}/status` | Chủ shop | CAT-02 | `ACTIVE` ↔ `HIDDEN`. Ẩn không xóa gì; dòng giỏ của người khác hiện "Không còn bán". |
| POST `/shops/me/products/{productId}/variants/{variantId}/stock` | Chủ shop | INV-01 | `change` (số nguyên khác 0, âm là giảm), `reason` (bắt buộc, ví dụ "Nhập thêm lô tháng 10"). Cập nhật bằng một câu SQL có điều kiện nên hai người sửa cùng lúc không làm sai số. Tồn mới < lượng đang giữ → 409 `STOCK_BELOW_RESERVED`; vượt 999.999 → 400 `STOCK_TOO_LARGE`. |
| GET `/shops/me/products/{productId}/stock-history` | Chủ shop | INV-01 | Lọc `variantId`, phân trang, mới nhất lên đầu: thay đổi, tồn sau thay đổi, lý do, người làm, lúc nào. |

**Xem hàng (công khai)**

| Phương thức, đường dẫn | Ai gọi | Mã | Quy tắc chính |
| --- | --- | --- | --- |
| GET `/products` | Mọi người | SRC-01, CAT-04 | Tìm và lọc hàng đang bán. `q` (gõ có dấu hay không dấu đều ra, khớp đầu từ: "ip" ra "iPhone"), `categoryId` (cấp 1 thì gồm mọi danh mục con), `minPrice`, `maxPrice` (theo giá thấp nhất của sản phẩm), `shopId`, `sort` = `relevance` (mặc định khi có `q`) \| `newest` (mặc định) \| `price_asc` \| `price_desc` \| `best_selling`, phân trang. Mỗi thẻ có ảnh, tên, giá thấp nhất, giá gốc tương ứng (để hiện nhãn -%), các lựa chọn nhóm 1 (ô chọn phiên bản trên thẻ), `soldCount`, còn hàng hay không, tên shop. |
| GET `/products/{productId}` | Mọi người | CAT-04, CAT-03 | Chi tiết hàng đang bán: ảnh, danh mục (cả cấp 1), các nhóm lựa chọn, từng biến thể với giá, giá gốc, số còn bán được; thông tin shop (tên, logo, số sản phẩm, ngày tham gia). |
| GET `/shops/{shopId}` | Mọi người | CAT-04 | Trang shop: tên, logo, mô tả, tỉnh lấy hàng, số sản phẩm đang bán, ngày tham gia, `status` (`ACTIVE` hoặc `SUSPENDED`). Shop chưa được duyệt → 404. Danh sách hàng của shop dùng `GET /products?shopId=`. |
| GET `/shops/{shopId}/vouchers` | Mọi người | VCH-01 | Voucher shop đang chạy và còn lượt, để hiện trên trang shop và trang sản phẩm. P2 chỉ hiện, lưu và áp voucher có ở P3. |

**Giỏ hàng** (phải đăng nhập)

| Phương thức, đường dẫn | Ai gọi | Mã | Quy tắc chính |
| --- | --- | --- | --- |
| GET `/cart` | Đã đăng nhập | CRT-01 | Giỏ chia theo shop. Mỗi dòng có ảnh (ưu tiên ảnh theo màu), tên, lựa chọn, giá hiện tại, giá gốc, số còn bán được, `selected` và `state`: `OK`, `NOT_ENOUGH_STOCK` (số lượng trong giỏ > còn bán được), `OUT_OF_STOCK`, `UNAVAILABLE` (sản phẩm ẩn, biến thể bị bỏ hoặc shop bị đình chỉ). Kèm tổng tiền của các dòng đang chọn có `state = OK`. Giá trong giỏ luôn là giá hiện tại; checkout (P3) kiểm lại lần nữa. |
| GET `/cart/count` | Đã đăng nhập | CRT-01 | `{ count }` = số dòng trong giỏ, cho biểu tượng giỏ trên header. |
| POST `/cart/items` | Đã đăng nhập | CRT-01 | `variantId`, `quantity`. Đã có dòng của biến thể đó thì cộng thêm. Tổng vượt số còn bán được → 409 `NOT_ENOUGH_STOCK` kèm `details.available`; hàng không còn bán → 409 `PRODUCT_UNAVAILABLE`; hàng của shop mình → 409 `OWN_PRODUCT`; giỏ đã đủ 100 dòng → 409 `CART_FULL`. |
| PATCH `/cart/items/{itemId}` | Đã đăng nhập | CRT-01 | Đổi `quantity` (≥ 1, kiểm như trên), `selected`, hoặc đổi sang biến thể khác của cùng sản phẩm (`variantId`; trùng dòng có sẵn thì gộp). Dòng của người khác → 404. |
| DELETE `/cart/items/{itemId}` | Đã đăng nhập | CRT-01 | |
| POST `/cart/selection` | Đã đăng nhập | CRT-01 | `{ itemIds, selected }`: chọn/bỏ chọn nhiều dòng (cả shop, cả giỏ). |
| POST `/cart/items/remove` | Đã đăng nhập | CRT-01 | `{ itemIds }`: xóa nhiều dòng một lần (nút "Xóa các mục đã chọn", "Xóa hàng không còn bán"). |

**Voucher** (P2 chỉ tạo và quản lý; áp vào đơn, lưu voucher, trừ lượt có ở P3)

| Phương thức, đường dẫn | Ai gọi | Mã | Quy tắc chính |
| --- | --- | --- | --- |
| GET, POST `/shops/me/vouchers` | Chủ shop | VCH-01 | Danh sách lọc theo `state` (`UPCOMING` sắp diễn ra, `RUNNING` đang chạy, `ENDED` đã kết thúc; tính từ thời gian, không lưu). Tạo: `code` (4–20 chữ in hoa hoặc số, không trùng mã nào trên sàn → 409 `VOUCHER_CODE_TAKEN`), `name`, `discountType` = `AMOUNT` (giảm số tiền) hoặc `PERCENT` (giảm %, 1–90, bắt buộc `maxDiscount`), `value`, `minOrder`, `startAt` (từ bây giờ trở đi), `endAt` (sau `startAt`, dài tối đa 180 ngày), `quantity`, `perUserLimit`. Voucher shop do shop chịu. |
| PUT `/shops/me/vouchers/{voucherId}` | Chủ shop | VCH-01 | Chưa bắt đầu: sửa mọi trường. Đang chạy: chỉ lùi `endAt` về sau và tăng `quantity`, đổi trường khác → 409 `VOUCHER_STARTED`. Đã kết thúc → 409 `VOUCHER_ENDED`. |
| POST `/shops/me/vouchers/{voucherId}/end` | Chủ shop | VCH-01 | Kết thúc sớm (đặt `endAt` = bây giờ). |
| DELETE `/shops/me/vouchers/{voucherId}` | Chủ shop | VCH-01 | Chỉ xóa voucher chưa bắt đầu (409 `VOUCHER_STARTED`). |
| GET, POST `/admin/vouchers`; PUT, DELETE `/admin/vouchers/{voucherId}`; POST `/admin/vouchers/{voucherId}/end` | `FINANCE` | VCH-01 | Voucher sàn (`shop_id` trống), cùng quy tắc như voucher shop. Sàn chịu chi phí. Ghi nhật ký. |

**Shop (admin)**

| Phương thức, đường dẫn | Ai gọi | Mã | Quy tắc chính |
| --- | --- | --- | --- |
| GET `/admin/shops` | `MODERATION` | SHP-04 | Lọc `status`, `q` (tên shop), phân trang: tên, chủ shop, trạng thái, số sản phẩm, ngày duyệt, lý do đình chỉ. |
| GET `/admin/shops/{shopId}` | `MODERATION` | SHP-04 | Thông tin shop đang dùng + số sản phẩm theo trạng thái. Lịch sử đình chỉ lấy từ approval-service. |

### approval-service (`/api/approval/v1`)

| Phương thức, đường dẫn | Ai gọi | Mã | Quy tắc chính |
| --- | --- | --- | --- |
| POST `/admin/shops/{shopId}/suspend` | `MODERATION` | SHP-04 | `reason` bắt buộc. approval-service biết shop qua hồ sơ đã duyệt (bảng `shop_approvals`), không gọi sang marketplace: shop chưa từng được duyệt → 404. Admin là chủ shop → 403 `SELF_MODERATION_FORBIDDEN`. Đang bị đình chỉ → 409 `ALREADY_SUSPENDED`. Lưu một dòng `violations`, phát `shop_suspension.decided`, ghi nhật ký. |
| POST `/admin/shops/{shopId}/restore` | `MODERATION` | SHP-04 | Như trên; shop không bị đình chỉ → 409 `NOT_SUSPENDED`. |
| GET `/admin/shops/{shopId}/violations` | `MODERATION` | SHP-04 | Lịch sử đình chỉ/khôi phục của shop, mới nhất lên đầu, kèm trạng thái hiện tại (`suspended`). |

Đơn hàng có từ P3, nên ở P2 đình chỉ shop chưa phải xử lý đơn cũ. Cách xử lý đơn đang chạy khi shop bị đình chỉ (SHP-04 "các đơn cũ có cách tiếp tục/hủy") sẽ chốt cùng API P3.

### Luồng P2 dùng các API trên

1. Admin `MODERATION` dựng danh mục (có sẵn bộ danh mục mẫu chạy bằng lệnh seed).
2. Seller tải ảnh, tạo sản phẩm có biến thể (Màu × Dung lượng), nhập tồn ban đầu → hàng lên sàn ngay. Điều chỉnh tồn khi nhập thêm; xem lịch sử.
3. Buyer (hoặc khách) chọn danh mục trên menu hoặc gõ tìm "dien thoai", lọc giá, sắp xếp → mở trang sản phẩm, chọn màu/dung lượng thấy giá và tồn từng biến thể → đăng nhập → thêm vào giỏ. Làm vậy với hàng của shop thứ hai → giỏ hiện 2 nhóm shop.
4. Seller và admin `FINANCE` tạo voucher shop/sàn; voucher shop hiện trên trang shop và trang sản phẩm.
5. Admin đình chỉ một shop (approval-service) → marketplace nhận `shop_suspension.decided`, shop thành `SUSPENDED`, hàng biến mất khỏi tìm kiếm, dòng giỏ thành "Không còn bán". Khôi phục thì hàng hiện lại.

## 4. Tài liệu API tự sinh (Swagger)

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
- Frontend chờ API của phase có trên Swagger rồi mới nối thật; trong lúc chờ, dựng giao diện với dữ liệu giả theo bảng ở mục 2–3.
