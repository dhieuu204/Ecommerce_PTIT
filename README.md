# Sàn TMĐT nhiều shop (đồ án)

Sàn thương mại điện tử nhiều shop, kiến trúc **4 microservice + 1 frontend**, chạy trên Kubernetes (k3s) khi demo.

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

pnpm dev                       # 4 service (cổng 3001–3004) + web (5173)
```

Kiểm tra: `http://localhost:3001/health` trả `{"status":"ok","service":"user-service"}`.

| Công cụ               | Địa chỉ                                    |
| --------------------- | ------------------------------------------ |
| Web                   | http://localhost:5173                      |
| RabbitMQ              | http://localhost:15672 (san / san)         |
| MinIO                 | http://localhost:9001 (minio / minio12345) |
| Hộp thư giả (Mailpit) | http://localhost:8025                      |

## Lệnh kiểm tra (CI chạy đúng các lệnh này)

```bash
pnpm format:check && pnpm lint && pnpm build && pnpm typecheck && pnpm test
```

## Làm việc nhóm

Xem [`CONTRIBUTING.md`](CONTRIBUTING.md).
