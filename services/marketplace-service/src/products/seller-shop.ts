import { AppError } from '@san/nest-common';
import type { PrismaService } from '../prisma.service';
import type { Prisma, Shop } from '../../generated/prisma';

/**
 * Shop của người gọi khi dùng API seller (P2): shop phải đã được duyệt (ACTIVE) hoặc đang bị
 * đình chỉ (SUSPENDED, vẫn sửa hàng được). Chưa có shop hoặc chưa được duyệt → 409 SHOP_NOT_ACTIVE.
 */
export async function requireSellerShop(
  db: PrismaService | Prisma.TransactionClient,
  userId: string,
): Promise<Shop> {
  const shop = await db.shop.findUnique({ where: { ownerId: userId } });
  if (!shop || (shop.status !== 'ACTIVE' && shop.status !== 'SUSPENDED')) {
    throw new AppError(
      409,
      'SHOP_NOT_ACTIVE',
      'Shop của bạn chưa được duyệt nên chưa dùng được chức năng này.',
    );
  }
  return shop;
}
