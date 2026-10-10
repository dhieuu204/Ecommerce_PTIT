import { Injectable } from '@nestjs/common';
import { AppError, skipTake, toPage, writeAudit, type AuthUser } from '@san/nest-common';
import type { Page } from '@san/shared';
import { PaymentClient, type PaymentLink } from '../clients/payment.client';
import { PrismaService } from '../prisma.service';
import { requireSellerShop } from '../products/seller-shop';
import type { Prisma, ShopOrderStatus } from '../../generated/prisma';
import type {
  AdminOrdersQuery,
  BuyerOrdersQuery,
  BuyerTab,
  ShopOrdersQuery,
} from './dto/orders.dto';
import { OrderLifecycle, type Actor } from './order-lifecycle.service';

// ----- dữ liệu trả cho web -----

export interface OrderItemView {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  image: string | null;
  price: number;
  originalPrice: number | null;
  quantity: number;
}

export interface HistoryView {
  fromStatus: ShopOrderStatus | null;
  toStatus: ShopOrderStatus;
  actorType: string;
  actorName: string | null;
  note: string | null;
  createdAt: Date;
}

/** Đơn con trong đơn của buyer/admin */
export interface ShopOrderView {
  id: string;
  code: string;
  shop: { id: string; name: string; logoUrl: string | null };
  status: ShopOrderStatus;
  subtotal: number;
  shopVoucherCode: string | null;
  shopDiscount: number;
  platformDiscount: number;
  shippingFee: number;
  shippingFeeSource: string;
  total: number;
  confirmBefore: Date | null;
  confirmedAt: Date | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  cancelledAt: Date | null;
  cancelRequestReason: string | null;
  cancelRequestUsed: boolean;
  refundStatus: string;
  /** Buyer làm được gì: NOW = hủy ngay, REQUEST = gửi yêu cầu hủy, null = không hủy được */
  cancelAction: 'NOW' | 'REQUEST' | null;
  items: OrderItemView[];
  /** Chỉ có ở trang chi tiết */
  history?: HistoryView[];
}

export interface OrderView {
  id: string;
  code: string;
  /** Trạng thái chung tính từ các đơn con */
  status: 'PROCESSING' | 'CANCELLED';
  paymentMethod: string;
  paymentStatus: 'UNPAID' | 'PAID';
  checkStatus: 'PENDING' | 'PASSED' | 'REJECTED';
  payBefore: Date;
  paidAt: Date | null;
  createdAt: Date;
  /** Còn trả tiền được (chưa trả, chưa hủy, còn hạn) */
  canPay: boolean;
  /** Hủy cả đơn tổng được (chỉ khi chưa trả) */
  canCancel: boolean;
  receiver: { name: string; phone: string; address: string };
  platformVoucherCode: string | null;
  subtotal: number;
  shopDiscount: number;
  platformDiscount: number;
  shippingFee: number;
  total: number;
  shopOrders: ShopOrderView[];
  /** Chỉ admin thấy */
  buyer?: { id: string; name: string; email: string };
}

/** Đơn con nhìn từ Kênh người bán */
export interface SellerOrderView {
  id: string;
  code: string;
  orderId: string;
  orderCode: string;
  status: ShopOrderStatus;
  createdAt: Date;
  paymentStatus: 'UNPAID' | 'PAID';
  paidAt: Date | null;
  checkStatus: 'PENDING' | 'PASSED' | 'REJECTED';
  buyerName: string;
  receiver: { name: string; phone: string; address: string };
  items: OrderItemView[];
  subtotal: number;
  shopVoucherCode: string | null;
  /** Shop chịu */
  shopDiscount: number;
  shippingFee: number;
  shippingFeeSource: string;
  /** Có khi đơn đã trả (payment-service tính) */
  platformFeeRate: number | null;
  platformFee: number | null;
  sellerAmount: number | null;
  confirmBefore: Date | null;
  confirmedAt: Date | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  cancelledAt: Date | null;
  cancelRequestReason: string | null;
  cancelRequestedAt: Date | null;
  refundStatus: string;
  history?: HistoryView[];
}

export interface SellerOrderPage extends Page<SellerOrderView> {
  /** Số đơn theo từng trạng thái (cho các tab) */
  counts: Record<ShopOrderStatus, number>;
}

const orderInclude = (history: boolean) =>
  ({
    shopOrders: {
      orderBy: { code: 'asc' },
      include: {
        shop: { select: { id: true, name: true, logoUrl: true } },
        items: { orderBy: { id: 'asc' } },
        ...(history ? { history: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } } : {}),
      },
    },
  }) satisfies Prisma.OrderInclude;

type OrderRow = Prisma.OrderGetPayload<{ include: ReturnType<typeof orderInclude> }>;
type ShopOrderRow = OrderRow['shopOrders'][number] & {
  history?: Prisma.OrderHistoryGetPayload<object>[];
};

const sellerInclude = (history: boolean) =>
  ({
    order: true,
    items: { orderBy: { id: 'asc' } },
    ...(history ? { history: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } } : {}),
  }) satisfies Prisma.ShopOrderInclude;

type SellerRow = Prisma.ShopOrderGetPayload<{ include: ReturnType<typeof sellerInclude> }> & {
  history?: Prisma.OrderHistoryGetPayload<object>[];
};

const CANCEL_NOW: ShopOrderStatus[] = ['PENDING', 'TO_CONFIRM'];

/**
 * Xem và thao tác đơn (ORD-02, ORD-03, ORD-05). Quyền theo chủ sở hữu kiểm ở đây: buyer chỉ thấy đơn của
 * mình, seller chỉ thấy đơn con của shop mình (sai chủ → 404). Bước chuyển trạng thái nằm ở OrderLifecycle.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrderLifecycle,
    private readonly payments: PaymentClient,
  ) {}

  // ===== Người mua =====

  async buyerList(userId: string, q: BuyerOrdersQuery): Promise<Page<OrderView>> {
    return this.list({ buyerId: userId, ...tabWhere(q.tab) }, q, false);
  }

  async buyerDetail(userId: string, orderId: string): Promise<OrderView> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, buyerId: userId },
      include: orderInclude(true),
    });
    if (!order) throw notFound();
    return orderView(order);
  }

  /** Hủy cả đơn tổng: chỉ khi chưa trả (quyết định P3 số 7) */
  async buyerCancelOrder(user: AuthUser, orderId: string, reason: string): Promise<OrderView> {
    await this.prisma.$transaction(async (tx) => {
      await this.lifecycle.lock(tx, orderId);
      const order = await tx.order.findFirst({
        where: { id: orderId, buyerId: user.id },
        include: { shopOrders: { select: { status: true } } },
      });
      if (!order) throw notFound();
      if (order.paymentStatus === 'PAID') {
        throw new AppError(
          409,
          'ORDER_ALREADY_PAID',
          'Đơn đã thanh toán: bạn hủy từng đơn của shop, tiền sẽ được hoàn.',
        );
      }
      const n = await this.lifecycle.cancel(tx, orderId, 'ALL', buyerActor(user), reason);
      if (n === 0) throw notCancellable();
    });
    return this.buyerDetail(user.id, orderId);
  }

  /**
   * Hủy một đơn con sau khi đã trả: chưa xác nhận → hủy ngay và hoàn tiền; đã xác nhận → gửi yêu cầu
   * cho shop (mỗi đơn con 1 lần).
   */
  async buyerCancelShopOrder(
    user: AuthUser,
    orderId: string,
    shopOrderId: string,
    reason: string,
  ): Promise<OrderView> {
    await this.prisma.$transaction(async (tx) => {
      await this.lifecycle.lock(tx, orderId);
      const order = await tx.order.findFirst({ where: { id: orderId, buyerId: user.id } });
      const so = order && (await tx.shopOrder.findFirst({ where: { id: shopOrderId, orderId } }));
      if (!order || !so) throw notFound();
      if (order.paymentStatus !== 'PAID') {
        throw new AppError(
          409,
          'ORDER_NOT_PAID',
          'Đơn chưa thanh toán: bạn chỉ hủy được cả đơn hàng.',
        );
      }
      if (CANCEL_NOW.includes(so.status)) {
        await this.lifecycle.cancel(tx, orderId, [so.id], buyerActor(user), reason, CANCEL_NOW);
        return;
      }
      if (so.status !== 'CONFIRMED') throw notCancellable();
      if (so.cancelRequestUsed) {
        throw new AppError(
          409,
          'CANCEL_REQUEST_USED',
          'Bạn đã gửi yêu cầu hủy đơn này một lần và shop đã từ chối.',
        );
      }
      const now = new Date();
      await tx.shopOrder.update({
        where: { id: so.id },
        data: {
          status: 'CANCEL_REQUESTED',
          cancelRequestReason: reason,
          cancelRequestedAt: now,
          cancelRequestUsed: true,
        },
      });
      await this.lifecycle.history(
        tx,
        so.id,
        'CONFIRMED',
        'CANCEL_REQUESTED',
        buyerActor(user),
        reason,
      );
    });
    return this.buyerDetail(user.id, orderId);
  }

  /** Tạo (hoặc mở lại) lần thanh toán VNPay qua payment-service (PAY-01) */
  async pay(
    user: AuthUser,
    authorization: string,
    orderId: string,
    idempotencyKey: string | undefined,
    clientIp: string | undefined,
  ): Promise<PaymentLink & { payBefore: Date }> {
    if (!idempotencyKey) {
      throw new AppError(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Thiếu mã chống gửi lặp (Idempotency-Key).',
      );
    }
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, buyerId: user.id },
      include: { shopOrders: { select: { status: true } } },
    });
    if (!order) throw notFound();
    if (!canPay(order)) {
      throw new AppError(
        409,
        'ORDER_NOT_PAYABLE',
        order.paymentStatus === 'PAID'
          ? 'Đơn đã được thanh toán.'
          : 'Đơn đã hủy hoặc đã hết hạn thanh toán.',
      );
    }
    const link = await this.payments.createPayment(authorization, idempotencyKey, {
      orderId,
      clientIp,
    });
    return { ...link, payBefore: order.payBefore };
  }

  // ===== Người bán =====

  async sellerList(userId: string, q: ShopOrdersQuery): Promise<SellerOrderPage> {
    const shop = await requireSellerShop(this.prisma, userId);
    const where: Prisma.ShopOrderWhereInput = { shopId: shop.id };
    if (q.status) where.status = q.status;
    if (q.q) where.OR = [{ code: { startsWith: q.q.toUpperCase() } }];
    const [rows, total, grouped] = await Promise.all([
      this.prisma.shopOrder.findMany({
        where,
        include: sellerInclude(false),
        orderBy:
          q.status === 'TO_CONFIRM'
            ? [{ confirmBefore: 'asc' }, { id: 'asc' }]
            : [{ createdAt: 'desc' }, { id: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.shopOrder.count({ where }),
      this.prisma.shopOrder.groupBy({
        by: ['status'],
        where: { shopId: shop.id },
        _count: { _all: true },
      }),
    ]);
    const counts = Object.fromEntries(
      (['PENDING', 'TO_CONFIRM', 'CONFIRMED', 'CANCEL_REQUESTED', 'CANCELLED'] as const).map(
        (s) => [s, grouped.find((g) => g.status === s)?._count._all ?? 0],
      ),
    ) as Record<ShopOrderStatus, number>;
    return { ...toPage(rows.map(sellerView), total, q), counts };
  }

  async sellerDetail(userId: string, shopOrderId: string): Promise<SellerOrderView> {
    const shop = await requireSellerShop(this.prisma, userId);
    const row = await this.prisma.shopOrder.findFirst({
      where: { id: shopOrderId, shopId: shop.id },
      include: sellerInclude(true),
    });
    if (!row) throw notFound();
    return sellerView(row);
  }

  /** Shop xác nhận đơn (ORD-03): chỉ khi "Chờ xác nhận"; đua với job quá hạn thì chỉ một bên thắng */
  async sellerConfirm(user: AuthUser, shopOrderId: string): Promise<SellerOrderView> {
    await this.sellerAction(user, shopOrderId, async (tx, so) => {
      if (so.status !== 'TO_CONFIRM') {
        throw new AppError(
          409,
          'ORDER_NOT_CONFIRMABLE',
          'Đơn không còn ở trạng thái chờ xác nhận.',
        );
      }
      await tx.shopOrder.update({
        where: { id: so.id },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
      });
      await this.lifecycle.history(tx, so.id, 'TO_CONFIRM', 'CONFIRMED', sellerActor(user), null);
    });
    return this.sellerDetail(user.id, shopOrderId);
  }

  /** Shop hủy có lý do trước khi bàn giao; hoàn tiền, cộng lại tồn */
  async sellerCancel(
    user: AuthUser,
    shopOrderId: string,
    reason: string,
  ): Promise<SellerOrderView> {
    await this.sellerAction(user, shopOrderId, async (tx, so) => {
      const from: ShopOrderStatus[] = ['TO_CONFIRM', 'CONFIRMED', 'CANCEL_REQUESTED'];
      if (!from.includes(so.status)) throw notCancellable();
      await this.lifecycle.cancel(tx, so.orderId, [so.id], sellerActor(user), reason, from);
    });
    return this.sellerDetail(user.id, shopOrderId);
  }

  /** Shop đồng ý yêu cầu hủy của buyer */
  async acceptCancelRequest(user: AuthUser, shopOrderId: string): Promise<SellerOrderView> {
    await this.sellerAction(user, shopOrderId, async (tx, so) => {
      if (so.status !== 'CANCEL_REQUESTED') throw noRequest();
      const reason = `Buyer xin hủy: ${so.cancelRequestReason ?? ''}`.trim();
      await this.lifecycle.cancel(tx, so.orderId, [so.id], sellerActor(user), reason, [
        'CANCEL_REQUESTED',
      ]);
    });
    return this.sellerDetail(user.id, shopOrderId);
  }

  /** Shop từ chối yêu cầu hủy: đơn quay lại "Chờ giao hàng", buyer không gửi lại được */
  async declineCancelRequest(
    user: AuthUser,
    shopOrderId: string,
    reason: string,
  ): Promise<SellerOrderView> {
    await this.sellerAction(user, shopOrderId, async (tx, so) => {
      if (so.status !== 'CANCEL_REQUESTED') throw noRequest();
      await tx.shopOrder.update({ where: { id: so.id }, data: { status: 'CONFIRMED' } });
      await this.lifecycle.history(
        tx,
        so.id,
        'CANCEL_REQUESTED',
        'CONFIRMED',
        sellerActor(user),
        `Từ chối yêu cầu hủy: ${reason}`,
      );
    });
    return this.sellerDetail(user.id, shopOrderId);
  }

  // ===== Admin (SUPPORT) =====

  async adminList(q: AdminOrdersQuery): Promise<Page<OrderView>> {
    const where: Prisma.OrderWhereInput = tabWhere(q.tab);
    if (q.q) {
      const code = q.q.toUpperCase();
      where.OR = [{ code: { startsWith: code } }, { shopOrders: { some: { code } } }];
    }
    return this.list(where, q, true);
  }

  async adminDetail(orderId: string): Promise<OrderView> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: orderInclude(true),
    });
    if (!order) throw notFound();
    return { ...orderView(order), buyer: buyerOf(order) };
  }

  /** Admin hủy có lý do: chưa trả thì hủy cả đơn tổng, đã trả thì hủy đơn con. Ghi nhật ký */
  async adminCancel(
    admin: AuthUser,
    orderId: string,
    shopOrderId: string,
    reason: string,
  ): Promise<OrderView> {
    await this.prisma.$transaction(async (tx) => {
      await this.lifecycle.lock(tx, orderId);
      const order = await tx.order.findUnique({ where: { id: orderId } });
      const so = order && (await tx.shopOrder.findFirst({ where: { id: shopOrderId, orderId } }));
      if (!order || !so) throw notFound();
      const actor: Actor = { type: 'ADMIN', id: admin.id, name: admin.name };
      const n = await this.lifecycle.cancel(
        tx,
        orderId,
        order.paymentStatus === 'PAID' ? [so.id] : 'ALL',
        actor,
        reason,
      );
      if (n === 0) throw notCancellable();
      await writeAudit(tx, {
        actor: admin,
        action: 'CANCEL_ORDER',
        targetType: 'SHOP_ORDER',
        targetId: so.id,
        reason,
        before: { status: so.status, paid: order.paymentStatus === 'PAID' },
        after: { status: 'CANCELLED', wholeOrder: order.paymentStatus !== 'PAID' },
      });
    });
    return this.adminDetail(orderId);
  }

  // ----- phần dùng chung -----

  private async list(
    where: Prisma.OrderWhereInput,
    q: BuyerOrdersQuery,
    admin: boolean,
  ): Promise<Page<OrderView>> {
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: orderInclude(false),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.order.count({ where }),
    ]);
    return toPage(
      rows.map((o) => (admin ? { ...orderView(o), buyer: buyerOf(o) } : orderView(o))),
      total,
      q,
    );
  }

  private async sellerAction(
    user: AuthUser,
    shopOrderId: string,
    fn: (tx: Prisma.TransactionClient, so: Prisma.ShopOrderGetPayload<object>) => Promise<void>,
  ): Promise<void> {
    const shop = await requireSellerShop(this.prisma, user.id);
    const found = await this.prisma.shopOrder.findFirst({
      where: { id: shopOrderId, shopId: shop.id },
      select: { orderId: true },
    });
    if (!found) throw notFound();
    await this.prisma.$transaction(async (tx) => {
      await this.lifecycle.lock(tx, found.orderId);
      const so = await tx.shopOrder.findUniqueOrThrow({ where: { id: shopOrderId } });
      await fn(tx, so);
    });
  }
}

// ----- hàm phụ -----

function tabWhere(tab: BuyerTab): Prisma.OrderWhereInput {
  switch (tab) {
    case 'UNPAID':
      return { paymentStatus: 'UNPAID', shopOrders: { some: { status: { not: 'CANCELLED' } } } };
    case 'PROCESSING':
      return {
        paymentStatus: 'PAID',
        shopOrders: { some: { status: { in: ['PENDING', 'TO_CONFIRM'] } } },
      };
    case 'TO_SHIP':
      return { shopOrders: { some: { status: { in: ['CONFIRMED', 'CANCEL_REQUESTED'] } } } };
    case 'CANCELLED':
      return { shopOrders: { every: { status: 'CANCELLED' } } };
    default:
      return {};
  }
}

function canPay(o: {
  paymentStatus: string;
  checkStatus: string;
  payBefore: Date;
  shopOrders: Array<{ status: ShopOrderStatus }>;
}): boolean {
  return (
    o.paymentStatus === 'UNPAID' &&
    o.checkStatus !== 'REJECTED' &&
    o.payBefore > new Date() &&
    o.shopOrders.some((so) => so.status !== 'CANCELLED')
  );
}

function itemView(i: Prisma.OrderItemGetPayload<object>): OrderItemView {
  return {
    id: i.id,
    productId: i.productId,
    variantId: i.variantId,
    productName: i.productName,
    variantName: i.variantName,
    image: i.image,
    price: i.price,
    originalPrice: i.originalPrice,
    quantity: i.quantity,
  };
}

function historyView(h: Prisma.OrderHistoryGetPayload<object>): HistoryView {
  return {
    fromStatus: h.fromStatus,
    toStatus: h.toStatus,
    actorType: h.actorType,
    actorName: h.actorName,
    note: h.note,
    createdAt: h.createdAt,
  };
}

function orderView(o: OrderRow): OrderView {
  const paid = o.paymentStatus === 'PAID';
  const allCancelled = o.shopOrders.every((so) => so.status === 'CANCELLED');
  return {
    id: o.id,
    code: o.code,
    status: allCancelled ? 'CANCELLED' : 'PROCESSING',
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    checkStatus: o.checkStatus,
    payBefore: o.payBefore,
    paidAt: o.paidAt,
    createdAt: o.createdAt,
    canPay: canPay(o),
    canCancel: !paid && !allCancelled,
    receiver: { name: o.receiverName, phone: o.receiverPhone, address: o.address },
    platformVoucherCode: o.platformVoucherCode,
    subtotal: o.subtotal,
    shopDiscount: o.shopOrders.reduce((a, so) => a + so.shopDiscount, 0),
    platformDiscount: o.platformDiscount,
    shippingFee: o.shippingFee,
    total: o.total,
    shopOrders: o.shopOrders.map((so: ShopOrderRow) => ({
      id: so.id,
      code: so.code,
      shop: { id: so.shop.id, name: so.shop.name ?? so.shopName, logoUrl: so.shop.logoUrl },
      status: so.status,
      subtotal: so.subtotal,
      shopVoucherCode: so.shopVoucherCode,
      shopDiscount: so.shopDiscount,
      platformDiscount: so.platformDiscount,
      shippingFee: so.shippingFee,
      shippingFeeSource: so.shippingFeeSource,
      total: so.total,
      confirmBefore: so.confirmBefore,
      confirmedAt: so.confirmedAt,
      cancelledBy: so.cancelledBy,
      cancelReason: so.cancelReason,
      cancelledAt: so.cancelledAt,
      cancelRequestReason: so.cancelRequestReason,
      cancelRequestUsed: so.cancelRequestUsed,
      refundStatus: so.refundStatus,
      cancelAction: !paid
        ? null
        : CANCEL_NOW.includes(so.status)
          ? 'NOW'
          : so.status === 'CONFIRMED' && !so.cancelRequestUsed
            ? 'REQUEST'
            : null,
      items: so.items.map(itemView),
      ...(so.history ? { history: so.history.map(historyView) } : {}),
    })),
  };
}

function buyerOf(o: OrderRow): OrderView['buyer'] {
  return { id: o.buyerId, name: o.buyerName, email: o.buyerEmail };
}

function sellerView(so: SellerRow): SellerOrderView {
  return {
    id: so.id,
    code: so.code,
    orderId: so.orderId,
    orderCode: so.order.code,
    status: so.status,
    createdAt: so.createdAt,
    paymentStatus: so.order.paymentStatus,
    paidAt: so.order.paidAt,
    checkStatus: so.order.checkStatus,
    buyerName: so.order.buyerName,
    receiver: {
      name: so.order.receiverName,
      phone: so.order.receiverPhone,
      address: so.order.address,
    },
    items: so.items.map(itemView),
    subtotal: so.subtotal,
    shopVoucherCode: so.shopVoucherCode,
    shopDiscount: so.shopDiscount,
    shippingFee: so.shippingFee,
    shippingFeeSource: so.shippingFeeSource,
    platformFeeRate: so.platformFeeRate,
    platformFee: so.platformFee,
    sellerAmount: so.sellerAmount,
    confirmBefore: so.confirmBefore,
    confirmedAt: so.confirmedAt,
    cancelledBy: so.cancelledBy,
    cancelReason: so.cancelReason,
    cancelledAt: so.cancelledAt,
    cancelRequestReason: so.cancelRequestReason,
    cancelRequestedAt: so.cancelRequestedAt,
    refundStatus: so.refundStatus,
    ...(so.history ? { history: so.history.map(historyView) } : {}),
  };
}

const buyerActor = (u: AuthUser): Actor => ({ type: 'BUYER', id: u.id, name: u.name });
const sellerActor = (u: AuthUser): Actor => ({ type: 'SELLER', id: u.id, name: u.name });

function notFound(): AppError {
  return new AppError(404, 'NOT_FOUND', 'Không tìm thấy đơn hàng.');
}

function notCancellable(): AppError {
  return new AppError(409, 'ORDER_NOT_CANCELLABLE', 'Đơn này không còn hủy được.');
}

function noRequest(): AppError {
  return new AppError(409, 'NO_CANCEL_REQUEST', 'Đơn không có yêu cầu hủy đang chờ.');
}
