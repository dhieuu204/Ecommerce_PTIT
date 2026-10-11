# Sàn TMĐT nhiều shop (đồ án)

Sàn thương mại điện tử nhiều shop, kiến trúc **4 microservice + 1 frontend**. Hiện chạy bằng Docker; Kubernetes (k3s) làm sau khi xong các phase.

| Thư mục                        | Nội dung                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| `apps/web`                     | Frontend React + Vite + Tailwind + shadcn/ui (khu mua hàng, Kênh người bán, quản trị) |
| `services/user-service`        | Tài khoản, đăng nhập, JWT, hồ sơ, sổ địa chỉ, quyền admin                             |
| `services/marketplace-service` | Shop, sản phẩm, tồn kho, giỏ, voucher, đơn hàng, GHN, trả hàng, chat, thông báo       |
| `services/payment-service`     | VNPay, hoàn tiền, sổ tiền seller, đối soát, chi trả                                   |
| `services/approval-service`    | Lưu quyết định duyệt: shop, kiểm tra đơn, tranh chấp, rút tiền                        |
| `packages/shared`              | Kiểu dữ liệu dùng chung (quyền, JWT, lỗi, sự kiện)                                    |
| `packages/nest-common`         | Nền tảng chung của 4 service: đăng nhập/quyền, lỗi, phân trang, sự kiện, nhật ký      |
| `infra/`                       | Docker Compose (code hằng ngày), k8s (demo)                                           |
| `docs/`                        | Kế hoạch, quyết định đã chốt, sơ đồ                                                   |

**Người mới và Claude/AI của bạn: đọc [`CLAUDE.md`](CLAUDE.md) trước.**

## Chạy trên máy

Cần: Node.js 22, pnpm 10 (`corepack enable`), Docker.

```bash
pnpm install
cp .env.example .env
pnpm infra:up                  # PostgreSQL, RabbitMQ, Redis, MinIO, Mailpit

# mỗi service một file .env
for s in services/*; do cp $s/.env.example $s/.env; done
node scripts/gen-jwt-key.mjs   # dán dòng in ra vào JWT_PRIVATE_KEY trong services/user-service/.env

pnpm db:migrate                # tạo bảng trong 4 database (chạy lại sau mỗi lần kéo code có migration mới)
pnpm dev                       # 4 service (cổng 3001–3004) + web (5173)
```

Kiểm tra: `http://localhost:3001/health` trả `{"status":"ok","service":"user-service"}`.

### Dữ liệu demo

Sau khi 4 service đã chạy ít nhất một lần (để có bảng và danh sách tỉnh/huyện/xã):

```bash
pnpm seed:demo
```

Lệnh nạp bộ danh mục, 2 shop đã duyệt (Táo Xanh Mobile, Galaxy Hub) với 23 sản phẩm có biến thể, vài voucher, và 3 tài khoản **demo** mật khẩu `demo12345`: `taoxanh@example.com`, `galaxyhub@example.com` (seller), `buyer@example.com` (buyer), `admin@example.com` (admin đủ 4 bộ quyền). Ảnh sản phẩm là ảnh minh hoạ tự vẽ, không phải ảnh thật. Chạy lại không tạo trùng. Chỉ nạp danh mục: `pnpm --filter @san/marketplace-service seed:categories`.

Đặt hàng (P3): chưa điền khóa VNPay vào `services/payment-service/.env` thì bấm Thanh toán sẽ mở **cổng MÔ PHỎNG** (không có tiền thật). Cách bật VNPay sandbox và nhận IPN bằng cloudflared: `services/payment-service/README.md`. Muốn thử hết hạn nhanh: đăng nhập admin, vào Quản trị › Cấu hình chính sách, giảm "Hạn thanh toán" và "Giữ tồn" xuống 1–2 phút.

Giao hàng và đối soát (P4): chưa điền `GHN_TOKEN` vào `services/marketplace-service/.env` thì vận đơn là **MÔ PHỎNG**: admin (bộ quyền Hỗ trợ) vào Quản trị › GHN mô phỏng để bấm "Đã lấy hàng", "Đã giao", "Giao thất bại"... thay cho GHN. Tiền COD về ví seller sau khi admin Tài chính nhập file ở Quản trị › Đối soát COD (chưa có file GHN thật thì bấm "Tải file MÔ PHỎNG" rồi tải lên lại).

| Công cụ               | Địa chỉ                                    |
| --------------------- | ------------------------------------------ |
| Web                   | http://localhost:5173                      |
| RabbitMQ              | http://localhost:15672 (san / san)         |
| MinIO                 | http://localhost:9001 (minio / minio12345) |
| Hộp thư giả (Mailpit) | http://localhost:8025                      |

## Chạy cả hệ thống trong Docker (giống lúc demo)

Khi code hằng ngày dùng `pnpm dev` như trên. Muốn chạy thử cả 4 service + web đóng gói sẵn (không cần Node trên máy):

```bash
cp .env.example .env
for s in services/*; do [ -f $s/.env ] || cp $s/.env.example $s/.env; done
node scripts/gen-jwt-key.mjs >> services/user-service/.env   # bắt buộc: khóa ký đăng nhập cố định
pnpm app:up                    # build image rồi bật infra + 4 service + web
```

Mở web ở http://localhost:8080 (đổi cổng bằng `WEB_PORT` trong `.env`). Mỗi service tự áp migration database khi khởi động. Tắt: `pnpm app:down`.

- Image: `services/Dockerfile` dùng chung cho 4 service (chọn bằng `--build-arg SERVICE=...`), `apps/web/Dockerfile` (NGINX phục vụ web và chuyển `/api/<service>` tới đúng service, file `apps/web/nginx.conf`).
- Biến bí mật (token GHN, Google, Gmail) vẫn đọc từ `services/<ten>/.env`; địa chỉ localhost được đổi sang tên container trong `infra/docker-compose.yml`.
- Đăng nhập Google khi chạy bản Docker: khai thêm redirect URI `http://localhost:8080/api/user/v1/auth/google/callback` trên Google Cloud.

## Lệnh kiểm tra (CI chạy đúng các lệnh này)

```bash
pnpm format:check && pnpm lint && pnpm build && pnpm typecheck && pnpm test
```

## Làm việc nhóm

Xem [`CONTRIBUTING.md`](CONTRIBUTING.md).
