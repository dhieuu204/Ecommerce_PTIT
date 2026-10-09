# CLAUDE.md: hướng dẫn cho Claude (và AI khác) khi code dự án này

File này giúp Claude của mọi thành viên làm việc giống nhau. Đọc hết file này trước khi viết code. Khi file này và một tài liệu khác nói khác nhau, theo thứ tự: **lời chủ đồ án** > `docs/phan-tich/02-quyet-dinh-da-chot.md` > file này > `docs/ke-hoach/`.

Trả lời thành viên bằng **tiếng Việt**, dễ hiểu; giải thích thuật ngữ khi dùng lần đầu.

## 1. Dự án là gì

Đồ án môn học: **sàn thương mại điện tử nhiều shop** (giống Shopee thu nhỏ). Có đủ vòng đời mua, bán và vận hành: đăng ký, mở shop, đăng sản phẩm, giỏ hàng, voucher, đặt hàng nhiều shop một lần, thanh toán VNPay hoặc COD, giao hàng qua GHN, trả hàng, tranh chấp, chat, thông báo, đánh giá, tiền của seller và rút tiền.

Kiến trúc: **4 backend service + 1 frontend**. Trong lúc làm các phase chạy bằng Docker (hạ tầng trong Docker Compose, service chạy `pnpm dev`; cuối P1 có Dockerfile). **Kubernetes (k3s) để sau khi xong các phase**, trước buổi demo: không tự viết file k8s.

Trạng thái hiện tại: **có khung repo, danh sách API và sự kiện của P1** (`docs/api`), **khung ERD cả dự án và bảng P1 đầy đủ cột** (`docs/erd`, `services/*/prisma`), **nền tảng chung đã gắn vào 4 service** (`packages/nest-common`: đăng nhập/quyền, dạng lỗi, phân trang, sự kiện outbox/inbox, nhật ký admin), **khung màn hình P1** (`docs/so-do/13-ui-man-hinh-p1`). Chưa có code nghiệp vụ. Xem mục 9 để biết điều gì chưa được chốt.

Cách làm: **cuốn chiếu theo phase**. Phân tích tổng thể đã xong cho cả P1–P6. Trước mỗi phase mới viết chi tiết của phase đó (API, bảng dữ liệu, màn hình), rồi code, demo, sang phase sau. Không tự làm trước API hay bảng của phase chưa tới.

## 2. Đọc gì trước khi làm một việc

1. `docs/ke-hoach/Ke-hoach-san-TMDT-day-du.md`: phạm vi, danh sách chức năng có mã (ACC-01, SHP-02, ORD-03…) và tiêu chí hoàn thành ở mục 5; các giai đoạn P0–P6 ở mục 4.
2. `docs/phan-tich/02-quyet-dinh-da-chot.md`: **mọi quy tắc nghiệp vụ đã chốt**. Đây là luật, không tự đổi.
3. `docs/phan-tich/04-quyet-dinh-stack.md` và `05-quyet-dinh-ui-flow01.md`: công nghệ và giao diện đã chốt.
4. Sơ đồ trong `docs/so-do/` (.png để xem, .excalidraw để sửa trên excalidraw.com). Sơ đồ liên quan theo việc:
   - Đăng ký, đăng nhập, mở shop: `08-flow01-dang-ky-va-mo-shop`
   - Giỏ hàng, checkout nhiều shop: `02-flow02-checkout-nhieu-shop`
   - Thanh toán trả trước, kiểm tra đơn: `03-flow03-tra-truoc-va-kiem-tra-don`
   - Trạng thái đơn con, vận đơn: `04-state01-vong-doi-don-con`
   - Thanh toán, hoàn tiền, tiền seller, rút tiền: `05-state02-thanh-toan-hoan-tien-tien-seller`
   - Service nào gọi service nào, sự kiện: `06-arch01-kien-truc-4-service`
   - Khung giao diện (header, footer, menu 3 khu) và màn hình đăng nhập/đăng ký: `07-ui-khung-chung`
   - Màn hình P1 (hồ sơ, sổ địa chỉ, mở shop, Hồ sơ shop, admin duyệt shop, người dùng và quyền, nhật ký): `13-ui-man-hinh-p1`
   - Bảng dữ liệu từng service: `09-erd-u-…`, `10-erd-m-…`, `11-erd-p-…`, `12-erd-a-…`
5. `docs/api/README.md` (quy ước API, danh sách API của phase kèm quy tắc) và `docs/api/events.md` (sự kiện).
6. `docs/erd/README.md` (khung bảng cả dự án, quy ước bảng/cột, cách tạo migration) và `prisma/schema.prisma` của service.
7. `packages/nest-common/README.md`: cách dùng nền tảng chung (đăng nhập, lỗi, phân trang, sự kiện, nhật ký admin). **Dùng cái có sẵn, không tự viết lại.**
8. `README.md` của service mình sắp sửa.

## 3. Bốn service và chủ dữ liệu

| Service                        | Mã  | Cổng local | Database      | Sở hữu                                                                                                                                                |
| ------------------------------ | --- | ---------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `services/user-service`        | U   | 3001       | `user_db`     | Tài khoản, đăng nhập, cấp JWT, hồ sơ, sổ địa chỉ, role và bộ quyền admin                                                                              |
| `services/marketplace-service` | M   | 3002       | `market_db`   | Shop, danh mục, sản phẩm/SKU, tồn kho, tìm kiếm, giỏ, voucher, checkout, đơn hàng, vận chuyển GHN, trả hàng, đánh giá, theo dõi shop, chat, thông báo |
| `services/payment-service`     | P   | 3003       | `payment_db`  | Giao dịch VNPay, phân bổ tiền, hoàn tiền, sổ tiền seller, phí sàn, đối soát, khóa tiền rút, chi trả                                                   |
| `services/approval-service`    | A   | 3004       | `approval_db` | Hồ sơ duyệt shop và vi phạm, kiểm tra đơn theo luật, quyết định tranh chấp, duyệt rút tiền                                                            |
| `apps/web`                     |     | 5173       |               | Một app React có 3 khu: mua hàng, Kênh người bán, quản trị                                                                                            |

`packages/shared`: kiểu dữ liệu dùng chung cả web và service (tên service, bộ quyền, nội dung JWT, dạng lỗi, kiểu sự kiện).
`packages/nest-common`: nền tảng chung cho 4 service NestJS (kiểm JWT và quyền, dạng lỗi, phân trang, gửi/nhận sự kiện, nhật ký admin). Sửa gói này ảnh hưởng cả 4 service, phải báo cả nhóm.

## 4. Luật kiến trúc (không được vi phạm)

1. **Mỗi service chỉ đọc/ghi database của mình.** Cần dữ liệu của service khác thì gọi REST của service đó hoặc giữ bản sao nhận qua sự kiện. Không join chéo database, không dùng chung tài khoản database.
2. **approval-service chỉ lưu quyết định** (duyệt/từ chối, lý do, người duyệt, phiên bản). marketplace-service và payment-service nhận quyết định qua sự kiện rồi tự áp dụng.
3. **Gọi đồng bộ:** REST/JSON, tài liệu OpenAPI tự sinh từ code (Swagger). **Việc không cần chờ kết quả:** sự kiện qua RabbitMQ.
4. **Phát sự kiện bằng outbox:** ghi sự kiện vào bảng outbox trong cùng transaction với dữ liệu; tiến trình riêng đẩy lên RabbitMQ. **Nhận sự kiện bằng inbox:** lưu mã sự kiện đã xử lý, gặp lại thì bỏ qua. Không giả định sự kiện tới đúng thứ tự.
5. **Đăng nhập:** user-service cấp JWT có chữ ký. Mỗi service tự kiểm chữ ký bằng khóa công khai và **tự kiểm quyền** (đúng user, đúng shop, đúng bộ quyền admin). Không tin vào việc frontend đã ẩn nút.
6. **Chống làm lặp (idempotency):** checkout, thanh toán, callback VNPay, hoàn tiền, tạo vận đơn, ghi tiền và chi trả đều phải có mã tham chiếu; gửi lại cùng mã thì trả kết quả cũ, không tạo tác động mới.
7. **Tiền:** lưu số nguyên đồng (VND, không dùng số thực). Không bao giờ ghi "đã hoàn"/"đã chi" khi mới gửi lệnh; kết quả không rõ thì tra cứu, không gửi lại mù quáng. Số dư seller không được âm.
8. **Job hẹn giờ** (hết 15 phút, quá 24/48 giờ, 7 ngày, đối soát, thử lại) dùng pg-boss trong database của chính service; nhiều pod vẫn chỉ một pod chạy mỗi job.
9. **Bí mật** (mật khẩu, khóa VNPay, khóa GHN, khóa Google OAuth, khóa ký JWT) chỉ nằm trong file `.env` (không commit) hoặc Secret của k8s. Không ghi ra log.
10. **Môi trường thử phải ghi nhãn:** VNPay sandbox, GHN môi trường dev, hộp thư giả. Phần nào mô phỏng thì giao diện và log ghi rõ là mô phỏng.

## 5. Công nghệ (đã chốt, không tự thêm thư viện lớn)

- Node.js 22 + TypeScript 5.9, quản lý gói bằng **pnpm** (monorepo pnpm workspaces).
- Backend: **NestJS 11**, **Prisma 6** (mỗi service schema và migration riêng, client sinh ra ở `services/<ten>/generated/prisma`). Câu lệnh đặc biệt (ví dụ "chỉ trừ tồn khi còn đủ") được viết SQL trực tiếp qua Prisma.
- Frontend: **React 19 + Vite + Tailwind CSS 4 + shadcn/ui**. Bảng và form lớn ở seller/admin có thể cần TanStack Table, react-hook-form: **hỏi chủ đồ án trước khi thêm**.
- Hạ tầng: PostgreSQL 16 (1 máy chủ, 4 database), RabbitMQ, Redis (chỉ làm Socket.IO adapter), MinIO (ảnh, bằng chứng, biên lai), Mailpit (hộp thư giả khi dev), Ingress NGINX.
- Realtime chat/thông báo: Socket.IO trong marketplace-service + Redis adapter.
- Tìm kiếm: PostgreSQL full-text + `unaccent` (gõ có dấu hay không dấu đều ra).
- Đối tác: VNPay sandbox, GHN môi trường dev, Google OAuth.

Muốn thêm thư viện mới: nói rõ để làm gì, có cách nào không cần thêm không, rồi **hỏi người giao việc** trước.

## 6. Giao diện

- **Chỉ tiếng Việt**, viết chữ thẳng trong code (không dùng thư viện đa ngôn ngữ).
- Bảng màu (đã khai báo trong `apps/web/src/index.css`, dùng qua class Tailwind, không viết mã màu thẳng):
  - `navy` #172554: màu chính, nút mua, điều hướng, header
  - `champagne` #C8A96B: điểm nhấn, nhãn, icon, đường viền
  - `ivory` #FAF9F6: nền trang; `card` #FFFFFF: thẻ sản phẩm; `ink` #1F2937: chữ chính
- Khu mua hàng theo bố cục onewaymobile.vn (header 1 thanh với ô tìm bo tròn, thanh danh mục có icon và mega menu, banner, thẻ sản phẩm có nhãn giảm giá và ô chọn phiên bản, footer nền sáng). Chi tiết ở `docs/so-do/07-ui-khung-chung.png`. Không dùng logo, hình ảnh của họ.
- **Cả 3 khu đều phải dùng được trên điện thoại.** Menu trái thành nút ☰; bảng thành thẻ hoặc cuộn ngang.
- Chức năng chưa tới giai đoạn thì ẩn, không hiện nút chết.

## 7. Quy ước code (mặc định do Claude đề xuất, chủ đồ án có thể đổi)

- Tên biến, hàm, bảng, cột, API: **tiếng Anh**. Comment, chữ trên giao diện, thông báo lỗi cho người dùng: **tiếng Việt**.
- NestJS: mỗi nhóm nghiệp vụ là một module trong `src/<ten-module>/` gồm `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`. Kiểm dữ liệu vào ở DTO.
- API theo cách **code trước, tài liệu tự sinh**: đường dẫn, quy tắc và mã lỗi phải khớp `docs/api/README.md`; dữ liệu vào/ra là class DTO có `class-validator` và chú thích tiếng Việt; controller có `@ApiTags`, API cần đăng nhập có `@ApiBearerAuth()`, mã lỗi riêng ghi bằng `@ApiResponse`. Xem tài liệu ở `/api/<service>/v1/docs` (chi tiết: `docs/api/README.md` mục 3).
- Mặc định mọi API cần đăng nhập; API công khai đánh dấu `@Public()`, API admin dùng `@RequirePermissions(...)`. Báo lỗi bằng `throw new AppError(status, 'MA_LOI', 'Câu tiếng Việt.')`. Danh sách dài dùng `PageQuery`/`toPage`. Tất cả trong `packages/nest-common`.
- Sự kiện: dùng đúng kiểu trong `packages/shared/src/events`, gửi bằng `EventBus.publish(tx, ...)` trong cùng giao dịch, nhận bằng `EventBus.subscribe` (`docs/api/events.md`, `packages/nest-common/README.md` mục 5).
- Bảng dữ liệu **ít và dễ hiểu** (chủ đồ án phải trình bày trước hội đồng): chỉ thêm bảng khi tính năng cần, bảng con nhỏ thì gộp thành cột, tên bảng/cột tiếng Anh thông dụng đọc là đoán được nghĩa. Thêm bảng ngoài khung `docs/erd` thì hỏi trước.
- Prisma: bảng `snake_case` số nhiều qua `@@map`, model `PascalCase`. Mỗi lần đổi schema tạo một migration có tên rõ (ví dụ `add_shop_profiles`). Không sửa migration đã đẩy lên `main`.
- Thời gian lưu UTC, hiển thị giờ Việt Nam (Asia/Ho_Chi_Minh).
- Mọi mốc thời gian và con số nghiệp vụ (15 phút, 24 giờ, 5%, 50.000đ…) là **cấu hình**, không viết cứng rải rác. P1: đọc từ `.env` của service (có giá trị mặc định trong code, ghi vào `.env.example`). Từ P3: bảng `settings`, admin sửa trên web.
- Thao tác của admin (duyệt, từ chối, cấp quyền, hoàn tay…) đều ghi nhật ký bằng `writeAudit(tx, ...)`: ai, lúc nào, đối tượng, lý do.
- Test: Jest cho backend (file `*.spec.ts` cạnh file code). Logic tiền, trạng thái và quyền **bắt buộc có test**.
- Định dạng bằng Prettier, kiểm bằng ESLint. Chạy `pnpm format` trước khi commit.

## 8. Quy trình Git (mặc định do Claude đề xuất, chủ đồ án có thể đổi)

- Nhánh chính `main` luôn chạy được. Không push thẳng vào `main`.
- Mỗi việc một nhánh: `feat/<MA>-<mo-ta-ngan>`, ví dụ `feat/ACC-01-dang-ky-email`. Sửa lỗi: `fix/<MA>-...`. Việc chung: `chore/...`, `docs/...`.
- Commit theo Conventional Commits, có mã chức năng: `feat(user): ACC-01 đăng ký bằng email`.
- Mở Pull Request theo mẫu `.github/pull_request_template.md`. CI phải xanh và có **1 người duyệt** mới được merge.
- Việc đụng tới **hợp đồng API/sự kiện hoặc database của service người khác**: báo người phụ trách service đó trong PR.

Trước khi push, chạy ở máy mình:

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## 9. Chưa chốt: không tự quyết, phải hỏi người

- API và sự kiện **của P2 trở đi** (P1 đã chốt trong `docs/api`). Tên sự kiện trong sơ đồ ARCH-01 chỉ là dự kiến; tên đúng nằm trong `docs/api/events.md`.
- **Chi tiết cột của bảng P2 trở đi.** Khung (tên bảng, cột chính) đã có trong `docs/erd`; chi tiết viết trước khi bắt đầu phase đó.
- **STATE-03**: quy tắc trả hàng và tranh chấp (lý do, bằng chứng, hạn xử lý, lúc hoàn tiền). Chốt trước P5.
- Thư viện điều hướng trang (router) và cách gọi API ở frontend.

Gặp điểm chưa chốt: dừng phần đó, ghi rõ câu hỏi kèm 2–3 phương án và phương án đề xuất, rồi hỏi người giao việc. Không tự chọn rồi code luôn.

## 10. Một việc thế nào là xong

- Đạt tiêu chí của mã chức năng trong `docs/ke-hoach` (mục 5) và đúng quy tắc trong `docs/phan-tich/02-quyet-dinh-da-chot.md`.
- Có test cho logic chính; `pnpm lint`, `typecheck`, `test`, `build` đều qua.
- Không vi phạm luật ở mục 4.
- Đổi API, sự kiện hoặc schema thì cập nhật tài liệu trong `docs/`.
- PR đã được duyệt và merge vào `main`.

## 11. Lệnh hay dùng

```bash
pnpm install                     # cài thư viện
cp .env.example .env             # biến cho Docker Compose
pnpm infra:up                    # bật PostgreSQL, RabbitMQ, Redis, MinIO, Mailpit
cp services/user-service/.env.example services/user-service/.env   # làm tương tự cho service khác
pnpm dev                         # chạy 4 service + web
pnpm --filter @san/user-service dev        # chỉ chạy một service
pnpm --filter @san/user-service prisma:migrate   # tạo migration sau khi sửa schema
node scripts/gen-jwt-key.mjs     # tạo khóa ký JWT cố định cho services/user-service/.env (không commit)
pnpm --filter @san/nest-common build   # build lại nền tảng chung sau khi sửa (pnpm dev tự làm)
```
