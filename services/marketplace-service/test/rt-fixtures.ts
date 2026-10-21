import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/prisma.service';
import type { ShopOrder, ShopOrderStatus } from '../generated/prisma';

/** Dọn thêm các bảng P6 của chat và thông báo (resetDb chung chưa có) */
export async function resetRealtime(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE notifications, messages, conversations CASCADE');
}

/** Đơn con của người mua ở một shop, ghi thẳng vào database (để thử thẻ đơn trong chat) */
export async function makeShopOrder(
  prisma: PrismaService,
  input: {
    buyerId: string;
    shopId: string;
    productId: string;
    variantId: string;
    status?: ShopOrderStatus;
  },
): Promise<ShopOrder> {
  const code = `261021${randomUUID().slice(0, 6).toUpperCase()}`;
  const order = await prisma.order.create({
    data: {
      code,
      buyerId: input.buyerId,
      buyerName: 'Người Mua',
      buyerEmail: 'mua@gmail.com',
      receiverName: 'Người Mua',
      receiverPhone: '0987654321',
      provinceId: 90001,
      districtId: 90101,
      wardCode: '9010101',
      address: '1 Điện Biên Phủ',
      subtotal: 200_000,
      shippingFee: 30_000,
      total: 230_000,
      paymentStatus: 'PAID',
      checkStatus: 'PASSED',
    },
  });
  return prisma.shopOrder.create({
    data: {
      code: `${code}-1`,
      orderId: order.id,
      shopId: input.shopId,
      shopName: 'Shop',
      status: input.status ?? 'DELIVERED',
      subtotal: 200_000,
      shippingFee: 30_000,
      shippingFeeSource: 'FIXED',
      total: 230_000,
      items: {
        create: [
          {
            productId: input.productId,
            variantId: input.variantId,
            productName: 'Áo thun',
            variantName: '',
            image: 'http://localhost:9000/san-public/product-images/a.png',
            price: 100_000,
            quantity: 2,
            weight: 300,
          },
        ],
      },
    },
  });
}
