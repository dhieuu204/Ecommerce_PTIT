import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventBus } from '@san/nest-common';
import { PRODUCT_MODERATION_DECIDED, type ProductModerationDecidedPayload } from '@san/shared';
import type { Prisma } from '../../generated/prisma';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Nhận quyết định gỡ/khôi phục sản phẩm từ approval-service (MOD-01). Sự kiện có thể tới sai thứ tự:
 * chỉ áp quyết định mới hơn quyết định đã áp (cột products.moderated_at). REMOVE → REMOVED kèm lý do
 * (biến mất khỏi sàn, seller không tự bật lại); RESTORE → HIDDEN (seller tự bật bán). Báo chủ shop.
 */
@Injectable()
export class ProductModerationEvents implements OnModuleInit {
  private readonly logger = new Logger(ProductModerationEvents.name);

  constructor(
    private readonly events: EventBus,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.events.subscribe(PRODUCT_MODERATION_DECIDED, (payload, tx: Prisma.TransactionClient) =>
      this.apply(payload, tx),
    );
  }

  async apply(p: ProductModerationDecidedPayload, tx: Prisma.TransactionClient): Promise<void> {
    const decidedAt = new Date(p.decidedAt);
    // Cập nhật có điều kiện: hai sự kiện xử lý cùng lúc thì chỉ quyết định mới hơn được giữ
    const { count } = await tx.product.updateMany({
      where: {
        id: p.productId,
        OR: [{ moderatedAt: null }, { moderatedAt: { lt: decidedAt } }],
      },
      data:
        p.action === 'REMOVE'
          ? { status: 'REMOVED', removedReason: p.reason, moderatedAt: decidedAt }
          : { status: 'HIDDEN', removedReason: null, moderatedAt: decidedAt },
    });
    if (count === 0) {
      this.logger.log(
        `Bỏ qua quyết định ${p.action} sản phẩm ${p.productId}: không có sản phẩm hoặc đã áp quyết định mới hơn.`,
      );
      return;
    }
    const product = await tx.product.findUniqueOrThrow({
      where: { id: p.productId },
      select: { name: true, shop: { select: { ownerId: true } } },
    });
    const link = `/kenh-nguoi-ban/san-pham/${p.productId}`;
    if (p.action === 'REMOVE') {
      await this.notifications.notify(tx, {
        userId: product.shop.ownerId,
        type: 'PRODUCT_REMOVED',
        title: 'Sản phẩm bị gỡ do vi phạm',
        content: `Sản phẩm "${product.name}" đã bị gỡ khỏi sàn. Lý do: ${p.reason}`,
        link,
      });
    } else {
      await this.notifications.notify(tx, {
        userId: product.shop.ownerId,
        type: 'PRODUCT_RESTORED',
        title: 'Sản phẩm được khôi phục',
        content: `Sản phẩm "${product.name}" đã được khôi phục và đang ở trạng thái ẩn. Bạn có thể bật bán lại.`,
        link,
      });
    }
  }
}
