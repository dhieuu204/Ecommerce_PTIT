import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventBus } from '@san/nest-common';
import { SHOP_APPLICATION_SUBMITTED, type ShopApplicationSubmittedPayload } from '@san/shared';
import type { Prisma } from '../../generated/prisma';

/**
 * Nhận hồ sơ shop từ marketplace-service (sự kiện shop_application.submitted) và lưu thành hồ sơ chờ duyệt.
 * Chạy trong giao dịch của EventBus (cùng bản ghi inbox), nên mỗi sự kiện chỉ được lưu một lần.
 */
@Injectable()
export class ShopApprovalEvents implements OnModuleInit {
  constructor(private readonly events: EventBus) {}

  onModuleInit(): void {
    this.events.subscribe(SHOP_APPLICATION_SUBMITTED, (payload, tx: Prisma.TransactionClient) =>
      this.handleSubmitted(payload, tx),
    );
  }

  /**
   * Lưu một phiên bản hồ sơ. Sự kiện có thể tới không đúng thứ tự, nên:
   * - Phiên bản này đã lưu rồi → bỏ qua (return, không ném lỗi vì ném lỗi = thử lại).
   * - Đã có phiên bản mới hơn của shop → lưu luôn là REPLACED (admin không cần xét bản cũ).
   * - Còn lại → bản đang chờ cũ hơn của shop chuyển thành REPLACED, bản này là PENDING.
   * Hai sự kiện của cùng shop xử lý cùng lúc: chỉ mục "mỗi shop tối đa 1 hồ sơ PENDING" (migration p1_init)
   * làm một bên lỗi, sự kiện đó được thử lại và lần sau thấy đúng dữ liệu.
   */
  async handleSubmitted(
    payload: ShopApplicationSubmittedPayload,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const { shopId, version } = payload;
    const existing = await tx.shopApproval.findUnique({
      where: { shopId_version: { shopId, version } },
      select: { id: true },
    });
    if (existing) return;

    const newer = await tx.shopApproval.findFirst({
      where: { shopId, version: { gt: version } },
      select: { id: true },
    });
    if (!newer) {
      await tx.shopApproval.updateMany({
        where: { shopId, status: 'PENDING', version: { lt: version } },
        data: { status: 'REPLACED' },
      });
    }

    await tx.shopApproval.create({
      data: {
        shopId,
        version,
        type: payload.type,
        status: newer ? 'REPLACED' : 'PENDING',
        ownerId: payload.owner.userId,
        ownerName: payload.owner.fullName,
        ownerEmail: payload.owner.email,
        data: payload.data as unknown as Prisma.InputJsonValue,
        change: (payload.change ?? undefined) as Prisma.InputJsonValue | undefined,
        submittedAt: new Date(payload.submittedAt),
      },
    });
  }
}
