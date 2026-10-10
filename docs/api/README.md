# Hợp đồng API và sự kiện

Nhóm chọn cách **code trước, sinh tài liệu**: không viết file OpenAPI bằng tay. Thư mục này chỉ giữ:

| Nội dung | Ở đâu |
| --- | --- |
| Quy ước chung (đường dẫn, đăng nhập, lỗi, phân trang) | File này, mục 1 |
| Danh sách API từng phase và quy tắc chính của mỗi API | File này, mục 2 (P1), mục 3 (P2), mục 4 (P3) |
| Sự kiện giữa các service qua RabbitMQ | `events.md` + kiểu TypeScript trong `packages/shared/src/events` |
| Chi tiết từng API (trường, kiểu, mã lỗi) | Tự sinh từ code, xem mục 5 |

Muốn thêm hoặc đổi API so với danh sách ở mục 2–4, hoặc đổi sự kiện: sửa file này / `events.md` trong cùng Pull Request và báo người phụ trách các service bị ảnh hưởng.

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
| GET `/shops/me` | Đã đăng nhập | SHP-01, SHP-03 | Trạng thái shop: `NONE` (chưa nộp), `PENDING`, `REJECTED` (kèm lý do), `ACTIVE`, `SUSPENDED` (từ P2, kèm `shop.suspendReason`); phiên bản hiện tại; yêu cầu đổi thông tin đang chờ (nếu có). |
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
| GET `/admin/categories` | `MODERATION` | CAT-01 | Cả danh mục ẩn, kèm số sản phẩm của từng danh mục (mọi trạng thái; danh mục cấp 1 là tổng của các con). Dạng cây như `GET /categories`. |
| POST `/admin/categories` | `MODERATION` | CAT-01 | `name`, `slug` (chữ thường không dấu, gạch nối; trùng → 409 `SLUG_TAKEN`), `parentId` (trống = cấp 1; cha phải là cấp 1 → 400 `INVALID_PARENT`), `icon`, `sort`. Ghi nhật ký. |
| PATCH `/admin/categories/{categoryId}` | `MODERATION` | CAT-01 | Sửa tên, slug, icon, thứ tự, `hidden`, chuyển danh mục cấp 2 sang cấp 1 khác. Danh mục cấp 1 đang có con không đổi thành cấp 2 (409 `CATEGORY_HAS_CHILDREN`); `parentId: null` đưa danh mục cấp 2 lên cấp 1, chỉ khi chưa có sản phẩm gắn (409 `CATEGORY_IN_USE`). Ghi nhật ký. |
| DELETE `/admin/categories/{categoryId}` | `MODERATION` | CAT-01 | Chỉ xóa được khi không có danh mục con và chưa sản phẩm nào gắn (409 `CATEGORY_IN_USE`, gợi ý ẩn thay vì xóa). Ghi nhật ký. |

**Sản phẩm của seller**

| Phương thức, đường dẫn | Ai gọi | Mã | Quy tắc chính |
| --- | --- | --- | --- |
| POST `/uploads/product-image` | Chủ shop | CAT-02 | Như logo shop (JPG/PNG/WebP nhận theo nội dung file) nhưng tối đa 5 MB, lưu ở `product-images/<userId>/...`, trả `{ url }`. Khi lưu sản phẩm, mọi ảnh phải nằm trong thư mục của chính người đó (400 `INVALID_IMAGE_URL`). |
| GET `/shops/me/products` | Chủ shop | CAT-02 | Lọc `status`, `categoryId`, `q` (tên), phân trang, mới sửa lên đầu. Mỗi dòng có ảnh đầu, khoảng giá, tổng tồn, tổng còn bán được, số biến thể, `soldCount`. |
| POST `/shops/me/products` | Chủ shop | CAT-02, CAT-03 | Tên (5–120 ký tự), mô tả (20–5.000), `categoryId` (cấp 2, chưa ẩn → 400 `INVALID_CATEGORY`), khối lượng (g), `option1Name`/`option2Name`, `variants` (`option1Value`, `option2Value`, `price`, `originalPrice` lớn hơn `price` nếu có, `stock` ban đầu), `images` (`url`, `option1Value` nếu là ảnh theo màu). Tạo xong là `ACTIVE` (bán ngay). |
| GET `/shops/me/products/{productId}` | Chủ shop | CAT-02 | Đầy đủ, kể cả `stock`, `reserved` của từng biến thể đang bán (biến thể đã bỏ không trả). Sản phẩm shop khác → 404. |
| PUT `/shops/me/products/{productId}` | Chủ shop | CAT-02, CAT-03 | Gửi lại toàn bộ như khi tạo; biến thể cũ nhận ra bằng `id`. Không đổi tồn của biến thể cũ ở đây (trường `stock` của biến thể có `id` bị bỏ qua; dùng API điều chỉnh tồn). Biến thể mới (không `id`) bắt buộc `stock`. Biến thể bị bỏ: xem quy tắc chung; biến thể không `id` trùng tổ hợp của dòng cũ thì dùng lại dòng đó (giữ tồn cũ). Đổi tên lựa chọn thành đúng tổ hợp của biến thể đã bỏ → 409 `DUPLICATE_VARIANT` (gửi tổ hợp đó không kèm `id` để bật lại). Sai quy tắc nhóm/lựa chọn/ảnh/giá hoặc `id` không thuộc sản phẩm → 400 `VALIDATION_ERROR` (`details.fields`). |
| PATCH `/shops/me/products/{productId}/status` | Chủ shop | CAT-02 | `ACTIVE` ↔ `HIDDEN`. Ẩn không xóa gì; dòng giỏ của người khác hiện "Không còn bán". |
| POST `/shops/me/products/{productId}/variants/{variantId}/stock` | Chủ shop | INV-01 | `change` (số nguyên khác 0, âm là giảm), `reason` (bắt buộc, ví dụ "Nhập thêm lô tháng 10"). Cập nhật bằng một câu SQL có điều kiện nên hai người sửa cùng lúc không làm sai số. Tồn mới < lượng đang giữ (kể cả tồn âm) → 409 `STOCK_BELOW_RESERVED`; vượt 999.999 → 400 `STOCK_TOO_LARGE`. Trả `{ variantId, stock, reserved, available }`. |
| GET `/shops/me/products/{productId}/stock-history` | Chủ shop | INV-01 | Lọc `variantId`, phân trang, mới nhất lên đầu: thay đổi, tồn sau thay đổi, lý do, người làm, lúc nào. |

**Xem hàng (công khai)**

| Phương thức, đường dẫn | Ai gọi | Mã | Quy tắc chính |
| --- | --- | --- | --- |
| GET `/products` | Mọi người | SRC-01, CAT-04 | Tìm và lọc hàng đang bán. `q` (gõ có dấu hay không dấu đều ra, khớp đầu từ: "ip" ra "iPhone"), `categoryId` (cấp 1 thì gồm mọi danh mục con), `minPrice`, `maxPrice` (theo giá thấp nhất của sản phẩm), `shopId`, `sort` = `relevance` (mặc định khi có `q`) \| `newest` (mặc định) \| `price_asc` \| `price_desc` \| `best_selling`, phân trang. Mỗi thẻ có ảnh, tên, giá thấp nhất, giá gốc tương ứng (để hiện nhãn -%), các lựa chọn nhóm 1 (ô chọn phiên bản trên thẻ), `soldCount`, còn hàng hay không, tên shop. |
| GET `/products/{productId}` | Mọi người | CAT-04, CAT-03 | Chi tiết hàng đang bán: ảnh, danh mục (cả cấp 1), các nhóm lựa chọn, từng biến thể với giá, giá gốc, số còn bán được; thông tin shop (tên, logo, số sản phẩm, ngày tham gia). |
| GET `/shops/{shopId}` | Mọi người | CAT-04 | Trang shop: tên, logo, mô tả, tỉnh lấy hàng, số sản phẩm đang bán (0 khi bị đình chỉ), ngày tham gia (lúc hồ sơ mở shop được duyệt), `status` (`ACTIVE` hoặc `SUSPENDED`) và `suspended` (true = hiện "Shop đang tạm ngừng bán"). Shop chưa được duyệt → 404. Danh sách hàng của shop dùng `GET /products?shopId=`. |
| GET `/shops/{shopId}/vouchers` | Mọi người | VCH-01 | Voucher shop đang chạy và còn lượt, để hiện trên trang shop và trang sản phẩm. P2 chỉ hiện, lưu và áp voucher có ở P3. |

**Giỏ hàng** (phải đăng nhập)

| Phương thức, đường dẫn | Ai gọi | Mã | Quy tắc chính |
| --- | --- | --- | --- |
| GET `/cart` | Đã đăng nhập | CRT-01 | Giỏ chia theo shop. Mỗi dòng có ảnh (ưu tiên ảnh theo màu), tên, lựa chọn, giá hiện tại, giá gốc, số còn bán được, `selected` và `state`: `OK`, `NOT_ENOUGH_STOCK` (số lượng trong giỏ > còn bán được), `OUT_OF_STOCK`, `UNAVAILABLE` (sản phẩm ẩn, biến thể bị bỏ hoặc shop bị đình chỉ). Kèm tổng tiền (`selectedTotal`) và số dòng (`selectedCount`) của các dòng đang chọn có `state = OK`. Nhóm shop có dòng mới thêm gần nhất đứng trước, trong nhóm dòng mới thêm trước. Giá trong giỏ luôn là giá hiện tại; checkout (P3) kiểm lại lần nữa. |
| GET `/cart/count` | Đã đăng nhập | CRT-01 | `{ count }` = số dòng trong giỏ, cho biểu tượng giỏ trên header. |
| POST `/cart/items` | Đã đăng nhập | CRT-01 | `variantId`, `quantity`. Đã có dòng của biến thể đó thì cộng thêm. Tổng vượt số còn bán được → 409 `NOT_ENOUGH_STOCK` kèm `details.available`; hàng không còn bán → 409 `PRODUCT_UNAVAILABLE`; hàng của shop mình → 409 `OWN_PRODUCT`; giỏ đã đủ 100 dòng → 409 `CART_FULL`; biến thể không có → 404. Trả `{ itemId, quantity, count }`. |
| PATCH `/cart/items/{itemId}` | Đã đăng nhập | CRT-01 | Đổi `quantity` (≥ 1, kiểm như trên), `selected`, hoặc đổi sang biến thể khác của cùng sản phẩm (`variantId`; trùng dòng có sẵn thì gộp; biến thể của sản phẩm khác → 400 `INVALID_VARIANT`). Dòng của người khác → 404. Trả giỏ mới (như GET `/cart`); DELETE và hai API dưới cũng vậy. |
| DELETE `/cart/items/{itemId}` | Đã đăng nhập | CRT-01 | |
| POST `/cart/selection` | Đã đăng nhập | CRT-01 | `{ itemIds, selected }`: chọn/bỏ chọn nhiều dòng (cả shop, cả giỏ). |
| POST `/cart/items/remove` | Đã đăng nhập | CRT-01 | `{ itemIds }`: xóa nhiều dòng một lần (nút "Xóa các mục đã chọn", "Xóa hàng không còn bán"). |

**Voucher** (P2 chỉ tạo và quản lý; áp vào đơn, lưu voucher, trừ lượt có ở P3)

| Phương thức, đường dẫn | Ai gọi | Mã | Quy tắc chính |
| --- | --- | --- | --- |
| GET, POST `/shops/me/vouchers` | Chủ shop | VCH-01 | Danh sách lọc theo `state` (`UPCOMING` sắp diễn ra, `RUNNING` đang chạy, `ENDED` đã kết thúc; tính từ thời gian, không lưu). Tạo: `code` (4–20 chữ in hoa hoặc số, không trùng mã nào trên sàn → 409 `VOUCHER_CODE_TAKEN`), `name`, `discountType` = `AMOUNT` (giảm số tiền) hoặc `PERCENT` (giảm %, 1–90, bắt buộc `maxDiscount`), `value`, `minOrder`, `startAt` (từ bây giờ trở đi), `endAt` (sau `startAt`, dài tối đa 180 ngày), `quantity`, `perUserLimit`. Voucher shop do shop chịu. |
| PUT `/shops/me/vouchers/{voucherId}` | Chủ shop | VCH-01 | Chưa bắt đầu: sửa mọi trường. Đang chạy: chỉ lùi `endAt` về sau và tăng `quantity`, đổi trường khác → 409 `VOUCHER_STARTED`. Đã kết thúc → 409 `VOUCHER_ENDED`. |
| POST `/shops/me/vouchers/{voucherId}/end` | Chủ shop | VCH-01 | Kết thúc sớm (đặt `endAt` = bây giờ; voucher chưa bắt đầu thì `startAt` cũng về bây giờ). Đã kết thúc → 409 `VOUCHER_ENDED`. |
| DELETE `/shops/me/vouchers/{voucherId}` | Chủ shop | VCH-01 | Chỉ xóa voucher chưa bắt đầu (đang chạy → 409 `VOUCHER_STARTED`, đã kết thúc → 409 `VOUCHER_ENDED`). |
| GET, POST `/admin/vouchers`; PUT, DELETE `/admin/vouchers/{voucherId}`; POST `/admin/vouchers/{voucherId}/end` | `FINANCE` | VCH-01 | Voucher sàn (`shop_id` trống), cùng quy tắc như voucher shop. Sàn chịu chi phí. Ghi nhật ký. |

**Shop (admin)**

| Phương thức, đường dẫn | Ai gọi | Mã | Quy tắc chính |
| --- | --- | --- | --- |
| GET `/admin/shops` | `MODERATION` | SHP-04 | Chỉ shop đã duyệt (`ACTIVE`, `SUSPENDED`). Lọc `status`, `q` (tên shop), phân trang, mới nhất trước: tên, logo, mã chủ shop (`ownerId`; marketplace không lưu tên chủ shop), trạng thái, số sản phẩm, ngày duyệt, lý do đình chỉ. |
| GET `/admin/shops/{shopId}` | `MODERATION` | SHP-04 | Thông tin shop đang dùng (số tài khoản chỉ hiện 4 số cuối) + số sản phẩm theo trạng thái. Shop chưa duyệt → 404. Lịch sử đình chỉ lấy từ approval-service. |

### approval-service (`/api/approval/v1`)

| Phương thức, đường dẫn | Ai gọi | Mã | Quy tắc chính |
| --- | --- | --- | --- |
| POST `/admin/shops/{shopId}/suspend` | `MODERATION` | SHP-04 | `reason` bắt buộc (5–500 ký tự). approval-service biết shop qua hồ sơ đã duyệt (bảng `shop_approvals`), không gọi sang marketplace: shop chưa từng được duyệt → 404. Admin là chủ shop → 403 `SELF_MODERATION_FORBIDDEN`. Đang bị đình chỉ → 409 `ALREADY_SUSPENDED`. Lưu một dòng `violations`, phát `shop_suspension.decided`, ghi nhật ký (cùng một giao dịch, khóa theo shop nên hai admin bấm cùng lúc chỉ một người được). Trả như GET `violations`. |
| POST `/admin/shops/{shopId}/restore` | `MODERATION` | SHP-04 | Như trên; shop không bị đình chỉ → 409 `NOT_SUSPENDED`. |
| GET `/admin/shops/{shopId}/violations` | `MODERATION` | SHP-04 | Lịch sử đình chỉ/khôi phục của shop, mới nhất lên đầu, kèm trạng thái hiện tại (`suspended`). |

Đơn hàng có từ P3, nên ở P2 đình chỉ shop chưa phải xử lý đơn cũ. Cách xử lý đơn đang chạy khi shop bị đình chỉ (SHP-04 "các đơn cũ có cách tiếp tục/hủy") sẽ chốt cùng API P3.

### Luồng P2 dùng các API trên

1. Admin `MODERATION` dựng danh mục (có sẵn bộ danh mục mẫu chạy bằng lệnh seed).
2. Seller tải ảnh, tạo sản phẩm có biến thể (Màu × Dung lượng), nhập tồn ban đầu → hàng lên sàn ngay. Điều chỉnh tồn khi nhập thêm; xem lịch sử.
3. Buyer (hoặc khách) chọn danh mục trên menu hoặc gõ tìm "dien thoai", lọc giá, sắp xếp → mở trang sản phẩm, chọn màu/dung lượng thấy giá và tồn từng biến thể → đăng nhập → thêm vào giỏ. Làm vậy với hàng của shop thứ hai → giỏ hiện 2 nhóm shop.
4. Seller và admin `FINANCE` tạo voucher shop/sàn; voucher shop hiện trên trang shop và trang sản phẩm.
5. Admin đình chỉ một shop (approval-service) → marketplace nhận `shop_suspension.decided`, shop thành `SUSPENDED`, hàng biến mất khỏi tìm kiếm, dòng giỏ thành "Không còn bán". Khôi phục thì hàng hiện lại.

## 4. Danh sách API P3

P3 (đặt hàng và trả trước): ORD-01..05, INV-02, VCH-02, VCH-03 (hủy theo đơn con), SHIP-01, RSK-01, PAY-01..04, REF-01, FIN-03 (chụp phí sàn), ADM-01 (cấu hình chính sách). Mục tiêu: một lần checkout → hai đơn con → trả trước → hủy một đơn con không ảnh hưởng đơn còn lại. Quyết định của vòng này: `docs/phan-tich/10-quyet-dinh-p3.md` (chỉ trả trước VNPay, COD ở P4; hạn bàn giao 48 giờ ở P4; chưa trả thì chỉ hủy cả đơn tổng; shop bị đình chỉ thì hủy đơn chưa bàn giao; không có bước lưu voucher).

### Quy tắc chung của P3

- **Đơn tổng** (`orders`, mã `261011ABC123`) là một lần đặt; **đơn con** (`shop_orders`, mã `261011ABC123-1`, `-2`) là phần của từng shop, mỗi đơn con một vòng đời.
- **Trạng thái đơn con** (STATE-01, phần P3):

  | Trạng thái | Nghĩa | Sang |
  | --- | --- | --- |
  | `PENDING` | Chờ thanh toán và kiểm tra đơn (S1) | `TO_CONFIRM` khi đơn tổng đã trả **và** đã qua kiểm tra; `CANCELLED` |
  | `TO_CONFIRM` | Chờ shop xác nhận, hạn `confirm_hours` (S2) | `CONFIRMED`, `CANCELLED` |
  | `CONFIRMED` | Shop đã xác nhận, chờ giao hàng (S3; P4 nối GHN) | `CANCEL_REQUESTED`, `CANCELLED` |
  | `CANCEL_REQUESTED` | Buyer xin hủy, chờ shop trả lời | `CANCELLED` (shop đồng ý), `CONFIRMED` (shop từ chối) |
  | `CANCELLED` | Đã hủy (kèm `cancelledBy`: `BUYER`, `SELLER`, `ADMIN`, `SYSTEM` và lý do) | |

- **Trạng thái đơn tổng** không lưu, tính từ các đơn con: còn đơn con chưa kết thúc → "Đang xử lý" (`PROCESSING`); tất cả hủy → "Đã hủy" (`CANCELLED`). P4 thêm "Hoàn tất", "Hoàn tất một phần". Đơn tổng lưu riêng `paymentStatus` (`UNPAID`, `PAID`) và `checkStatus` (`PENDING`, `PASSED`, `REJECTED`).
- **Tiền** (số nguyên đồng): tiền hàng của đơn con `subtotal` → trừ voucher shop `shopDiscount` → trừ phần voucher sàn `platformDiscount` → cộng `shippingFee` = `total` (buyer trả). Đơn tổng `total` = tổng các đơn con. Voucher sàn chia theo tỉ lệ tiền hàng sau voucher shop, làm tròn xuống, phần dư vào đơn con lớn nhất. Phí ship không được giảm.
- **Tồn kho** (INV-02): đặt hàng giữ tồn (`reserved += số lượng`, câu SQL có điều kiện "còn bán được ≥ số lượng" nên hai người tranh SKU cuối chỉ một người được); thanh toán xong chốt (`stock -= số lượng`, `reserved -= số lượng`, ghi `stock_history` kèm mã đơn, tăng `soldCount`); hết hạn hoặc hủy trước khi trả thì nhả giữ; hủy sau khi trả thì cộng lại tồn (ghi `stock_history`). Mỗi bước kèm điều kiện trạng thái nên chạy lại không trừ/hoàn hai lần.
- **Voucher** (VCH-02, VCH-03): mỗi đơn con tối đa 1 voucher shop, cả đơn tổng tối đa 1 voucher sàn. Đặt hàng giữ lượt (`used_count + 1` có điều kiện còn lượt, đang chạy; giới hạn mỗi người đếm trên `voucher_usages` chưa trả). Hủy đơn con → trả lượt voucher shop của đơn đó; hủy cả đơn tổng → trả thêm voucher sàn; voucher đã hết hạn thì không trả.
- **Hạn** (cấu hình ở bảng `settings`, xem `docs/phan-tich/10-quyet-dinh-p3.md` mục 3): thanh toán 15 phút, giữ tồn 20 phút, shop xác nhận 24 giờ (tính từ lúc đơn con sang `TO_CONFIRM`), admin duyệt đơn 24 giờ. Job mỗi phút quét đơn quá hạn: chưa trả quá hạn giữ tồn → hủy cả đơn tổng; quá hạn xác nhận → hủy đơn con, hoàn tiền.
- **Ai được hủy** (ORD-05): đơn tổng chưa trả → buyer hoặc admin hủy **cả đơn tổng**. Đã trả: đơn con `PENDING` (đang chờ duyệt) hoặc `TO_CONFIRM` → buyer hủy ngay; `CONFIRMED` → buyer gửi yêu cầu (1 lần), shop đồng ý hoặc từ chối có lý do. Shop hủy có lý do khi `TO_CONFIRM`, `CONFIRMED`, `CANCEL_REQUESTED`. Admin `SUPPORT` hủy mọi đơn con chưa bàn giao (bắt buộc lý do, ghi nhật ký). Hủy đơn con đã trả → payment-service hoàn đúng số buyer đã trả cho đơn con đó.
- **Shop bị đình chỉ** (SHP-04): mọi đơn con chưa bàn giao của shop bị hủy (`SYSTEM`, lý do "Shop tạm ngừng bán"); đơn tổng chưa trả thì hủy cả đơn tổng.
- **Thanh toán** (PAY-01..03): tối đa `max_payment_attempts` lần trong hạn, mỗi lần một mã giao dịch riêng (`vnp_TxnRef`). Còn lần đang chờ (buyer đóng tab VNPay) → bấm lại trả **đúng link cũ**; lần trước "không rõ" → không tạo lần mới (409 `PAYMENT_UNKNOWN`). Chỉ ghi "đã trả" khi IPN hợp lệ (đúng chữ ký, đúng số tiền) hoặc tra cứu VNPay báo thành công; trang web báo thành công không đủ. Tiền về sau khi đơn đã hết hạn/hủy, hoặc trả trùng → tự tạo khoản hoàn.
- **Chế độ VNPay**: `services/payment-service/.env` có `VNPAY_TMN_CODE` và `VNPAY_HASH_SECRET` → VNPay sandbox. Không có → **MÔ PHỎNG**: link thanh toán trỏ về trang `/thanh-toan/mo-phong` của web, mọi màn hình và log ghi "MÔ PHỎNG".
- **Phí ship** (SHIP-01): có `GHN_TOKEN` → gọi API phí của GHN cho từng đơn con (khối lượng = tổng `weight × số lượng`, từ địa chỉ lấy hàng của shop tới địa chỉ nhận); GHN lỗi → `shipping_fixed_fee` và `shippingFeeSource = FALLBACK` ("phí dự phòng", sàn chịu chênh lệch). Không có token → `shipping_fixed_fee`, `shippingFeeSource = FIXED` ("Phí cố định (chưa nối GHN)"). Phí chốt ở bước xem trước và chép vào đơn con.
- **Chống làm lặp**: xem trước tạo `checkoutId`; đặt hàng gửi lại cùng `checkoutId` trả đơn đã tạo. Tạo lần thanh toán nhận `Idempotency-Key`. IPN/callback trùng, sự kiện trùng không ghi tiền hai lần. Lệnh hoàn có mã riêng, kết quả không rõ thì tra cứu, không gửi lại mù quáng.

### Cấu hình chính sách (cả marketplace, payment, approval)

Mỗi service có cùng 3 API (code chung `SettingsModule` trong `packages/nest-common`) trên bảng `settings` của chính nó:

| Phương thức, đường dẫn | Ai gọi | Mã | Quy tắc chính |
| --- | --- | --- | --- |
| GET `/admin/settings` | `SYSTEM`, `FINANCE` | ADM-01 | Mọi con số của service: `key`, tên tiếng Việt, đơn vị, giới hạn `min`/`max`, giá trị đang dùng, phiên bản, lúc có hiệu lực, người sửa. Chưa sửa lần nào thì phiên bản 0 = mặc định trong code. |
| PUT `/admin/settings/{key}` | `SYSTEM` | ADM-01 | `{ value, reason }`. Tạo phiên bản mới có hiệu lực ngay (không sửa dòng cũ), ghi nhật ký. Khóa lạ → 404; ngoài giới hạn → 400 `VALIDATION_ERROR`; bằng giá trị đang dùng → 400 `NOTHING_TO_CHANGE`. Đơn đã đặt giữ con số đã chụp. |
| GET `/admin/settings/{key}/history` | `SYSTEM`, `FINANCE` | ADM-01 | Các phiên bản, mới nhất trước. |

### marketplace-service (`/api/market/v1`)

**Checkout và đặt hàng**

| Phương thức, đường dẫn | Ai gọi | Mã | Quy tắc chính |
| --- | --- | --- | --- |
| POST `/checkout/preview` | Đã đăng nhập | ORD-01, VCH-02, SHIP-01 | `{ itemIds, addressId?, shopVouchers?: [{ shopId, code }], platformVoucherCode? }`. `itemIds` là các dòng giỏ muốn mua (của chính người gọi). Địa chỉ lấy từ sổ địa chỉ ở user-service (không gửi `addressId` → địa chỉ mặc định; chưa có địa chỉ → 409 `ADDRESS_REQUIRED`; user-service lỗi → 503 `USER_SERVICE_UNAVAILABLE`). Trả bản xem trước chia theo shop: dòng hàng (giá hiện tại), tiền hàng, voucher shop đang áp và **danh sách voucher shop dùng được** (kèm lý do chưa dùng được, ví dụ "Mua thêm 50.000đ"), phí ship và nguồn phí, phần voucher sàn, tổng từng shop; danh sách voucher sàn, tổng cả đơn; `problems` (dòng hết hàng/không còn bán/vượt tồn), `voucherErrors` (mã sai, hết lượt, chưa đủ điều kiện: không áp, không lỗi cả trang); `canPlace`; `checkoutId` (mã phiên) và `expiresAt`. Lưu bản chụp vào `checkouts`. Không có dòng nào → 400 `EMPTY_CHECKOUT`. |
| POST `/orders` | Đã đăng nhập | ORD-01, INV-02, VCH-02 | `{ checkoutId }`. Trong **một giao dịch**: tính lại toàn bộ theo bản xem trước (phí ship và địa chỉ dùng đúng bản chụp), giữ tồn, giữ lượt voucher, tạo đơn tổng + đơn con + dòng hàng, xóa các dòng đã mua khỏi giỏ, phát `order.placed`. Bất kỳ shop nào lỗi → không tạo đơn nào: giá/tồn/voucher khác bản xem trước → 409 `CHECKOUT_CHANGED` (`details.problems`, buyer xem lại); phiên quá hạn → 409 `CHECKOUT_EXPIRED`; phiên của người khác → 404. Gửi lại cùng `checkoutId` (bấm 2 lần, mạng chập) → 200 trả đơn đã tạo. Thành công 201 `{ orderId, code, total, payBefore }`. |
| POST `/orders/{orderId}/pay` | Người mua | PAY-01 | Header `Idempotency-Key`. Đơn chưa trả, chưa hủy, còn hạn → gọi payment-service tạo (hoặc mở lại) lần thanh toán, trả `{ payUrl, attempt, maxAttempts, gateway: VNPAY \| MOCK, payBefore }`. Đã trả/đã hủy/hết hạn → 409 `ORDER_NOT_PAYABLE`; hết lượt → 409 `PAYMENT_ATTEMPTS_EXCEEDED`; lần trước chưa rõ → 409 `PAYMENT_UNKNOWN`; payment-service chưa nhận đơn → 409 `ORDER_NOT_READY` (web thử lại sau 1 giây); payment-service lỗi → 503 `PAYMENT_SERVICE_UNAVAILABLE`. |

**Đơn của người mua**

| Phương thức, đường dẫn | Ai gọi | Mã | Quy tắc chính |
| --- | --- | --- | --- |
| GET `/orders` | Đã đăng nhập | ORD-02 | Đơn của chính mình, mới nhất trước, phân trang. Lọc `tab` = `ALL` \| `UNPAID` (chưa trả) \| `PROCESSING` (đang chờ duyệt/xác nhận) \| `TO_SHIP` (chờ giao) \| `CANCELLED`. Mỗi đơn tổng kèm các đơn con (shop, dòng hàng, trạng thái, tổng). |
| GET `/orders/{orderId}` | Người mua | ORD-02 | Chi tiết: địa chỉ, tiền từng phần, trạng thái thanh toán/kiểm tra, hạn trả, lịch sử trạng thái từng đơn con, trạng thái hoàn tiền (`refundStatus`). Đơn người khác → 404. |
| POST `/orders/{orderId}/cancel` | Người mua | ORD-05 | `{ reason }`. Chỉ khi đơn tổng **chưa trả**: hủy cả đơn tổng, nhả tồn, trả lượt voucher. Đã trả → 409 `ORDER_ALREADY_PAID` (hủy từng đơn con). Đã hủy → 409 `ORDER_NOT_CANCELLABLE`. |
| POST `/orders/{orderId}/shop-orders/{shopOrderId}/cancel` | Người mua | ORD-05, REF-01 | `{ reason }`. Đơn tổng đã trả. Đơn con `PENDING`/`TO_CONFIRM` → hủy ngay, cộng lại tồn, trả lượt voucher shop, hoàn tiền đơn con đó. `CONFIRMED` → thành `CANCEL_REQUESTED` (chờ shop). Đã xin hủy một lần và bị từ chối → 409 `CANCEL_REQUEST_USED`; trạng thái khác → 409 `ORDER_NOT_CANCELLABLE`; đơn tổng chưa trả → 409 `ORDER_NOT_PAID` (hủy cả đơn). |

**Đơn của shop** (Kênh người bán; shop đã duyệt, kể cả đang bị đình chỉ)

| Phương thức, đường dẫn | Ai gọi | Mã | Quy tắc chính |
| --- | --- | --- | --- |
| GET `/shops/me/orders` | Chủ shop | ORD-02 | Lọc `status` (`PENDING`, `TO_CONFIRM`, `CONFIRMED`, `CANCEL_REQUESTED`, `CANCELLED`), `q` (mã đơn), phân trang. Đơn `TO_CONFIRM` sắp hết hạn lên đầu. Kèm số đơn theo từng trạng thái (cho tab). |
| GET `/shops/me/orders/{shopOrderId}` | Chủ shop | ORD-02 | Dòng hàng, địa chỉ nhận, tiền (tiền hàng, voucher shop, **dự kiến nhận** sau phí sàn khi đã trả), hạn xác nhận, lịch sử. Không hiện voucher sàn như khoản trừ của shop (sàn chịu). Đơn shop khác → 404. |
| POST `/shops/me/orders/{shopOrderId}/confirm` | Chủ shop | ORD-03 | `TO_CONFIRM` → `CONFIRMED`. Trạng thái khác → 409 `ORDER_NOT_CONFIRMABLE` (cập nhật có điều kiện nên đua với job hết hạn chỉ một bên thắng). |
| POST `/shops/me/orders/{shopOrderId}/cancel` | Chủ shop | ORD-03, ORD-05 | `{ reason }`. Hủy khi `TO_CONFIRM`, `CONFIRMED`, `CANCEL_REQUESTED`; hoàn tiền, cộng lại tồn. Khác → 409 `ORDER_NOT_CANCELLABLE`. |
| POST `/shops/me/orders/{shopOrderId}/cancel-request/accept` | Chủ shop | ORD-05 | `CANCEL_REQUESTED` → `CANCELLED` (lý do = lý do buyer gửi), hoàn tiền. Khác → 409 `NO_CANCEL_REQUEST`. |
| POST `/shops/me/orders/{shopOrderId}/cancel-request/decline` | Chủ shop | ORD-05 | `{ reason }`. `CANCEL_REQUESTED` → `CONFIRMED`; buyer không gửi lại được. |

**Đơn (admin)**

| Phương thức, đường dẫn | Ai gọi | Mã | Quy tắc chính |
| --- | --- | --- | --- |
| GET `/admin/orders` | `SUPPORT` | ORD-02 | Mọi đơn tổng, lọc `q` (mã đơn tổng/đơn con), `tab` như buyer, phân trang. |
| GET `/admin/orders/{orderId}` | `SUPPORT` | ORD-02 | Như buyer xem, thêm mã người mua và lịch sử ai làm gì. Thanh toán/hoàn tiền xem ở payment-service. |
| POST `/admin/orders/{orderId}/shop-orders/{shopOrderId}/cancel` | `SUPPORT` | ORD-05 | `{ reason }` bắt buộc. Đơn tổng chưa trả → hủy cả đơn tổng; đã trả → hủy đơn con (mọi trạng thái chưa bàn giao). Ghi nhật ký. |

### payment-service (`/api/payment/v1`)

| Phương thức, đường dẫn | Ai gọi | Mã | Quy tắc chính |
| --- | --- | --- | --- |
| POST `/payments` | marketplace (chuyển vé của buyer) | PAY-01 | `{ orderId, clientIp? }`, header `Idempotency-Key`. Số tiền lấy từ bản chép đơn nhận qua `order.placed` (đơn chưa tới → 409 `ORDER_NOT_READY`; không phải đơn của người gọi → 404). Tạo lần thanh toán mới (mã `vnp_TxnRef` riêng) hoặc trả lại lần đang chờ. Lỗi như `POST /orders/{orderId}/pay`. Hạn link VNPay = hạn thanh toán của đơn. |
| GET `/orders/{orderId}/payment` | Người mua | PAY-01 | `{ status: UNPAID \| PAID \| EXPIRED \| CANCELLED, attempts, maxAttempts, payBefore, gateway, lastAttempt }` cho trang kết quả thanh toán. |
| POST `/payments/return` | Người mua | PAY-02 | Web gửi lại các tham số VNPay gắn vào đường dẫn quay về. Kiểm chữ ký; báo thành công thì **tra cứu VNPay** trước khi ghi đã trả; buyer bấm Hủy/thanh toán lỗi → lần đó thất bại. Trả `{ orderId, status }`. Chữ ký sai → 400 `INVALID_SIGNATURE`. |
| GET `/webhooks/vnpay/ipn` | VNPay (công khai) | PAY-02, PAY-03 | Kiểm chữ ký, mã giao dịch, số tiền rồi mới ghi; trả `{ RspCode, Message }` theo tài liệu VNPay (`00` xác nhận, `01` không có giao dịch, `02` đã xử lý, `04` sai số tiền, `97` sai chữ ký). Gửi trùng → `02`, không ghi lại. |
| GET, POST `/mock-gateway/payments/{ref}` | Trang mô phỏng (công khai) | PAY-01 | **Chỉ khi chạy MÔ PHỎNG** (có khóa VNPay → 404). GET: số tiền, mã đơn. POST `{ result: SUCCESS \| FAILED \| PAID_NO_NOTICE }`: như VNPay báo thành công/thất bại, hoặc "trả tiền nhưng mất tin báo" để job tra cứu tự tìm ra. Trả `{ returnUrl }` để web chuyển buyer về trang kết quả. |
| GET `/admin/orders/{orderId}/payments` | `SUPPORT`, `FINANCE` | PAY-04, REF-01 | Các lần thanh toán, phân bổ tiền từng đơn con (buyer trả, phí sàn, seller nhận), các khoản hoàn. |
| GET `/admin/refunds` | `FINANCE` | REF-01 | Lọc `status` (`PENDING`, `FAILED`, `UNKNOWN`, `NEEDS_MANUAL`, `SUCCEEDED`, `MANUAL_DONE`), phân trang. Mặc định khoản cần hoàn tay lên đầu. |
| POST `/admin/uploads/refund-receipt` | `FINANCE` | REF-01 | Ảnh biên lai (JPG/PNG/WebP, tối đa 5 MB) lưu bucket riêng tư, trả `{ key }`. |
| GET `/admin/refunds/{refundId}/receipt` | `FINANCE` | REF-01 | Xem ảnh biên lai. |
| POST `/admin/refunds/{refundId}/manual` | `FINANCE` | REF-01 | `{ transferCode, receiptKey, note? }`. Chỉ khoản `NEEDS_MANUAL` → `MANUAL_DONE`, phát `refund.updated`, ghi nhật ký. Khác → 409 `REFUND_NOT_MANUAL`. |

### approval-service (`/api/approval/v1`)

| Phương thức, đường dẫn | Ai gọi | Mã | Quy tắc chính |
| --- | --- | --- | --- |
| GET `/admin/order-checks` | `FINANCE` | RSK-01 | Lọc `status` (`PENDING` mặc định, `PASSED`, `REJECTED`, `TIMEOUT`, `CANCELLED`), phân trang; đơn chờ lâu nhất lên đầu, kèm hạn tự hủy. |
| GET `/admin/order-checks/{checkId}` | `FINANCE` | RSK-01 | Đơn nhận qua `order.placed` (người mua, các shop, dòng hàng, tổng), luật đã chạm kèm ngưỡng lúc đó, **lịch sử mua của buyer** (số đơn, tổng tiền, số đơn bị từ chối). |
| POST `/admin/order-checks/{checkId}/decision` | `FINANCE` | RSK-01 | `{ decision: APPROVE \| REJECT, reason }` (lý do bắt buộc khi từ chối). Admin là người mua hoặc chủ một shop trong đơn → 403 `SELF_APPROVAL_FORBIDDEN`. Không còn chờ → 409 `ALREADY_DECIDED`. Phát `order_check.decided`, ghi nhật ký. Không bao giờ tự duyệt: quá `review_timeout_hours` → `TIMEOUT`, đơn bị hủy. |

### Luồng P3 dùng các API trên

1. Buyer chọn các dòng của shop A và shop B trong giỏ → **Mua hàng** → web gọi `POST /checkout/preview` (địa chỉ mặc định, voucher shop, voucher sàn) → xem tiền tách theo shop.
2. Bấm **Đặt hàng** → `POST /orders` → marketplace giữ tồn, giữ lượt voucher, tạo đơn tổng + 2 đơn con, phát `order.placed`.
3. approval-service chạy luật: đơn < 10 triệu → `order_check.decided` PASSED ngay; đơn lớn → chờ admin `FINANCE` duyệt (song song với thanh toán).
4. Web gọi `POST /orders/{id}/pay` → chuyển buyer sang VNPay (hoặc trang MÔ PHỎNG) → trả tiền → VNPay báo IPN / buyer quay về trang kết quả → payment-service xác minh, ghi đã trả, phát `payment.succeeded` (kèm phí sàn từng đơn con).
5. marketplace chốt tồn; đơn đã trả và đã qua kiểm tra → 2 đơn con thành **Chờ shop xác nhận** (hạn 24 giờ).
6. Buyer hủy đơn con của shop B → marketplace cộng lại tồn, trả lượt voucher shop B, phát `shop_order.cancelled` → payment-service hoàn đúng phần đơn con B → `refund.updated`. Đơn con A không đổi; shop A xác nhận → **Chờ giao hàng**.

## 5. Tài liệu API tự sinh (Swagger)

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
- Frontend chờ API của phase có trên Swagger rồi mới nối thật; trong lúc chờ, dựng giao diện với dữ liệu giả theo bảng ở mục 2–4.
