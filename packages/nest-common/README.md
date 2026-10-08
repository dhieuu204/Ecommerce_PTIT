# @san/nest-common: nền tảng chung của 4 service

Gói này gom những việc service nào cũng cần, để mỗi người chỉ viết nghiệp vụ. Nó **đã được gắn sẵn** vào cả 4 service (`SanCommonModule.forRoot` trong `src/app.module.ts`, `setupApp` trong `src/main.ts`), nên khi viết một module mới bạn không phải cấu hình gì thêm.

| Việc                                      | Có sẵn                                                  | Mục |
| ----------------------------------------- | ------------------------------------------------------- | --- |
| Kiểm đăng nhập và bộ quyền admin          | `@Public()`, `@CurrentUser()`, `@RequirePermissions()`  | 1   |
| Trả lỗi cùng một dạng                     | `AppError`, lỗi kiểm dữ liệu DTO tự đổi sang tiếng Việt | 2   |
| Phân trang                                | `PageQuery`, `skipTake`, `toPage`                       | 3   |
| Kết nối database                          | `PrismaService` của service (inject ở mọi module)       | 4   |
| Gửi và nhận sự kiện (outbox/inbox)        | `EventBus.publish`, `EventBus.subscribe`                | 5   |
| Nhật ký thao tác admin                    | `writeAudit`                                            | 6   |
| Mã lần vết một thao tác qua nhiều service | Header `X-Correlation-Id`, tự truyền sang sự kiện       | 7   |
| Tài liệu API tự sinh                      | `/api/<service>/v1/docs`                                |     |

Quy ước API (đường dẫn, mã lỗi, dạng trang) ở `docs/api/README.md`; quy ước sự kiện ở `docs/api/events.md`. Gói này chỉ là code làm theo các quy ước đó.

## 1. Đăng nhập và quyền

**Mặc định mọi API đều cần đăng nhập.** Không có vé hoặc vé sai trả 401 `UNAUTHENTICATED`, vé hết hạn trả 401 `TOKEN_EXPIRED` (web sẽ tự làm mới vé).

```ts
import { CurrentUser, Public, RequirePermissions, type AuthUser } from '@san/nest-common';

@ApiTags('Shop')
@Controller('shops')
export class ShopController {
  @Public() // không cần đăng nhập
  @Get(':shopId')
  findOne(@Param('shopId') shopId: string) { ... }

  @ApiBearerAuth()
  @Get('me') // cần đăng nhập, lấy người gọi bằng @CurrentUser
  mine(@CurrentUser() user: AuthUser) {
    return this.shops.findByOwner(user.id);
  }
}

@ApiBearerAuth()
@RequirePermissions('MODERATION') // admin có bộ quyền MODERATION (nhiều bộ: có một trong số đó là qua)
@Controller('admin/shop-approvals')
export class ShopApprovalAdminController { ... }
```

- `AuthUser` gồm `id`, `email`, `name`, `permissions`.
- **Quyền theo chủ sở hữu** (chỉ chủ shop sửa shop, chỉ người mua xem đơn của mình) không kiểm ở đây: service tự kiểm và trả 404 `NOT_FOUND` nếu không phải của người đó.
- API công khai vẫn đọc được `@CurrentUser()` nếu người gọi có gửi vé (ví dụ để biết đã theo dõi shop chưa); không có vé thì là `undefined`.
- Chỉ user-service ký vé: inject khóa bằng `@Inject(JWT_SIGNING_KEY) key: KeyObject` rồi gọi `signAccessToken(user, key)`. 3 service còn lại tự tải khóa công khai từ `/api/user/v1/.well-known/jwks.json` ở lần kiểm vé đầu tiên.

## 2. Báo lỗi

Ném `AppError` với mã lỗi đã ghi trong `docs/api/README.md` và câu tiếng Việt để web hiển thị thẳng:

```ts
import { AppError } from '@san/nest-common';

throw new AppError(409, 'SHOP_NAME_TAKEN', 'Tên shop đã có người dùng.');
throw new AppError(423, 'LOGIN_LOCKED', 'Bạn đã nhập sai 5 lần. Thử lại sau 15 phút.', {
  retryAfterSeconds: 840,
});
```

Trả về `{ "code": "SHOP_NAME_TAKEN", "message": "Tên shop đã có người dùng." }`.

- Dữ liệu gửi lên sai DTO tự trả 400 `VALIDATION_ERROR` với `details.fields = { tênTrường: 'câu báo lỗi' }`, kể cả trường lồng nhau (`pickupAddress.wardCode`). Câu báo lỗi viết trong DTO: `@MinLength(8, { message: 'Mật khẩu cần ít nhất 8 ký tự.' })`.
- Trường lạ không khai trong DTO bị bỏ đi (người gọi không gửi lén được `status`, `isAdmin`...).
- Lỗi bất ngờ trong code trả 500 `INTERNAL_ERROR` với câu chung; chi tiết chỉ ghi vào log kèm mã lần vết, không lộ ra ngoài.
- `NotFoundException`, `ForbiddenException`... của NestJS vẫn dùng được, tự đổi sang mã chung (`NOT_FOUND`, `FORBIDDEN`).

## 3. Phân trang

```ts
import { PageQuery, skipTake, toPage } from '@san/nest-common';

export class ListApprovalsQuery extends PageQuery {
  @IsOptional() @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'REPLACED'])
  status?: string;
}

async list(q: ListApprovalsQuery) {
  const where = { status: q.status };
  const [items, total] = await this.prisma.$transaction([
    this.prisma.shopApproval.findMany({ where, ...skipTake(q), orderBy: { submittedAt: 'asc' } }),
    this.prisma.shopApproval.count({ where }),
  ]);
  return toPage(items, total, q); // { items, page, pageSize, total }
}
```

`page` từ 1, `pageSize` mặc định 20, tối đa 100.

## 4. Database

Mỗi service có `src/prisma.service.ts` (kế thừa Prisma client sinh riêng cho service đó). Inject ở bất kỳ module nào, không cần import thêm:

```ts
constructor(private readonly prisma: PrismaService) {}
```

Prisma tự kết nối ở truy vấn đầu tiên, nên service vẫn khởi động được khi database chưa bật (`/health` vẫn trả ok). Khi build, `prisma.service.ts` tự kiểm 3 bảng kỹ thuật (`audit_logs`, `outbox_events`, `inbox_events`) còn khớp với gói này; ai sửa lệch thì build báo lỗi.

## 5. Sự kiện

**Gửi**: gọi `publish` **trong cùng giao dịch** với dữ liệu. Giao dịch lỗi thì sự kiện cũng không được gửi.

```ts
import { EventBus } from '@san/nest-common';
import { SHOP_APPLICATION_SUBMITTED } from '@san/shared';

await this.prisma.$transaction(async (tx) => {
  const app = await tx.shopApplication.create({ data: ... });
  await this.events.publish(tx, SHOP_APPLICATION_SUBMITTED, { shopId, version: app.version, ... });
});
```

Sự kiện được ghi vào bảng `outbox_events`; mỗi giây gói này đẩy các dòng chưa gửi lên RabbitMQ (exchange `san.events`). TypeScript bắt lỗi nếu payload sai kiểu khai trong `packages/shared/src/events`.

**Nhận**: đăng ký trong `onModuleInit` của module nhận. Ghi dữ liệu bằng `tx` để đi cùng bản ghi inbox.

```ts
@Injectable()
export class ShopApprovalEvents implements OnModuleInit {
  constructor(private readonly events: EventBus) {}

  onModuleInit() {
    this.events.subscribe(SHOP_APPLICATION_SUBMITTED, async (payload, tx: Prisma.TransactionClient) => {
      await tx.shopApproval.create({ data: { shopId: payload.shopId, ... } });
    });
  }
}
```

- **Mỗi sự kiện chỉ được xử lý một lần**: mã sự kiện lưu vào `inbox_events` trong cùng giao dịch; RabbitMQ giao lại thì bỏ qua.
- **Ném lỗi = thử lại**: giao dịch bị hoàn tác, tin quay lại sau 10 giây, 1 phút, 5 phút; vẫn lỗi thì vào hàng đợi `<service>.<sự kiện>.dlq` (xem ở http://localhost:15672). Vì vậy trường hợp nghiệp vụ "bỏ qua" (ví dụ quyết định cho phiên bản hồ sơ cũ) thì `return`, đừng ném lỗi.
- Không giả định sự kiện tới đúng thứ tự. Mỗi service một loại sự kiện chỉ có một handler.
- Chưa đặt `RABBITMQ_URL` (ví dụ khi chạy test) thì không gửi/nhận, sự kiện nằm chờ trong outbox.

## 6. Nhật ký admin

Mọi thao tác của admin (duyệt, từ chối, cấp quyền, khóa tài khoản...) ghi một dòng `audit_logs`, trong cùng giao dịch:

```ts
await this.prisma.$transaction(async (tx) => {
  await tx.user.update({ where: { id }, data: { permissions } });
  await writeAudit(tx, {
    actor: admin, // @CurrentUser()
    action: 'SET_PERMISSIONS',
    targetType: 'USER',
    targetId: id,
    reason: dto.reason,
    before: { permissions: old.permissions },
    after: { permissions },
  });
});
```

## 7. Mã lần vết (correlation id)

Mỗi request có header `X-Correlation-Id` (web gửi lên hoặc tự sinh, trả lại trong response). Sự kiện sinh ra từ request mang cùng mã, và handler nhận sự kiện cũng chạy với mã đó, nên tìm một mã trong log của 4 service là lần ra cả thao tác. Lấy mã hiện tại: `currentCorrelationId()`.

## Biến môi trường

| Biến              | Service           | Ý nghĩa                                                                                                                                                                                           |
| ----------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RABBITMQ_URL`    | cả 4              | Địa chỉ RabbitMQ. Trống thì không gửi/nhận sự kiện                                                                                                                                                |
| `JWT_PRIVATE_KEY` | user-service      | Khóa riêng ký vé (PEM). Trống khi dev thì dùng khóa tạm, mỗi lần khởi động lại phải đăng nhập lại. Tạo khóa cố định: `node scripts/gen-jwt-key.mjs`. **Bí mật: không commit, không gửi qua chat** |
| `JWKS_URL`        | 3 service còn lại | Nơi tải khóa công khai, mặc định `http://localhost:3001/api/user/v1/.well-known/jwks.json`                                                                                                        |

## Test

- Test API cần đăng nhập: tạo vé giả bằng `signAccessToken(user, key)` với `key = createPrivateKey(generateDevPrivateKey())` và truyền `jwtPrivateKey` vào `SanCommonModule.forRoot`. Ví dụ đầy đủ: `src/platform.e2e.spec.ts`.
- Chạy cả app như thật (không cần database, RabbitMQ): `services/*/test/app.e2e.spec.ts`.

## Sửa gói này

- Gói được build thành `dist/` khi `pnpm install` và trước `pnpm dev`. Sửa gói trong lúc service đang chạy thì build lại: `pnpm --filter @san/nest-common build`.
- Gói ảnh hưởng cả 4 service: PR sửa gói phải chạy `pnpm test` toàn repo và báo cả nhóm.
- Thư viện gói dùng: `jsonwebtoken` (ký và kiểm JWT), `amqplib` (kết nối RabbitMQ).
