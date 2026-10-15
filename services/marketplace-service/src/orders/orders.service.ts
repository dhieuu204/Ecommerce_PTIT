import { Injectable } from '@nestjs/common';
import { AppError, skipTake, toPage, writeAudit, type AuthUser } from '@san/nest-common';
import type { Page } from '@san/shared';
import { PaymentClient, type PaymentLink } from '../clients/payment.client';
import { PrismaService } from '../prisma.service';
import { requireSellerShop } from '../products/seller-shop';
import { OPEN_RETURN_STATUSES } from '../returns/return-state';
import { ShipmentsService } from '../shipping/shipments.service';
import type { Prisma, ReturnStatus, ShopOrderStatus } from '../../generated/prisma';
import type {
  AdminOrdersQuery,
  BuyerOrdersQuery,
  BuyerTab,
  ShopOrdersQuery,
} from './dto/orders.dto';
import { FINAL_STATUSES, OrderLifecycle, type Actor } from './order-lifecycle.service';

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

/** Vận đơn của đơn con (SHIP-03) */
export interface ShipmentView {
  ghnCode: string | null;
  status: string;
  failedAttempts: number;
  /** Phí GHN tính cho vận đơn */
  fee: number | null;
  /** true = vận đơn MÔ PHỎNG (chưa nối GHN thật) */
  simulated: boolean;
  lastError: string | null;
  /** Các mốc vận chuyển, mới nhất trước (chỉ ở trang chi tiết) */
  tracking?: Array<{ ghnStatus: string; note: string | null; happenedAt: Date }>;
}

/** Yêu cầu trả hàng của đơn con, tóm tắt cho trang đơn (P5) */
export interface ReturnSummary {
  id: string;
  code: string;
  status: ReturnStatus;
  /** Số hoàn tối đa người mua yêu cầu */
  refundAmount: number;
  /** Số đã quyết hoàn (null khi chưa quyết) */
  decidedRefund: number | null;
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
  /** Số GHN thu hộ (COD) */
  codAmount: number;
  confirmBefore: Date | null;
  confirmedAt: Date | null;
  deliveredAt: Date | null;
  /** Tự hoàn tất lúc này nếu chưa bấm "Đã nhận" */
  completeBefore: Date | null;
  completedAt: Date | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  cancelledAt: Date | null;
  cancelRequestReason: string | null;
  cancelRequestUsed: boolean;
  refundStatus: string;
  incidentNote: string | null;
  /** Buyer làm được gì: NOW = hủy ngay, REQUEST = gửi yêu cầu hủy, null = không hủy được */
  cancelAction: 'NOW' | 'REQUEST' | null;
  /** Buyer bấm được "Đã nhận hàng" (đã giao, không có yêu cầu trả hàng đang mở) */
  canConfirmReceived: boolean;
  /** Buyer gửi được yêu cầu trả hàng: đã giao, còn hạn, chưa có yêu cầu (P5) */
  canRequestReturn: boolean;
  returnRequest: ReturnSummary | null;
  shipment: ShipmentView | null;
  items: OrderItemView[];
  /** Chỉ có ở trang chi tiết */
  history?: HistoryView[];
}

export type OrderStatusView = 'PROCESSING' | 'COMPLETED' | 'PARTIALLY_COMPLETED' | 'CANCELLED';

export interface OrderView {
  id: string;
  code: string;
  /** Trạng thái chung tính từ các đơn con */
  status: OrderStatusView;
  paymentMethod: 'VNPAY' | 'COD';
  paymentStatus: 'UNPAID' | 'PAID' | 'COD';
  checkStatus: 'PENDING' | 'PASSED' | 'REJECTED';
  /** Trống với COD */
  payBefore: Date | null;
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
  paymentMethod: 'VNPAY' | 'COD';
  paymentStatus: 'UNPAID' | 'PAID' | 'COD';
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
  codAmount: number;
  /** Payment-service tính khi nhận đơn */
  platformFeeRate: number | null;
  platformFee: number | null;
  sellerAmount: number | null;
  confirmBefore: Date | null;
  confirmedAt: Date | null;
  /** Hạn bàn giao cho GHN */
  handoverBefore: Date | null;
  pickedAt: Date | null;
  deliveredAt: Date | null;
  completeBefore: Date | null;
  completedAt: Date | null;
  returnedAt: Date | null;
  returnCloseBefore: Date | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  cancelledAt: Date | null;
  cancelRequestReason: string | null;
  cancelRequestedAt: Date | null;
  refundStatus: string;
  incidentNote: string | null;
  returnRequest: ReturnSummary | null;
  shipment: ShipmentView | null;
  history?: HistoryView[];
}

export interface SellerOrderPage extends Page<SellerOrderView> {
  /** Số đơn theo từng trạng thái (cho các tab) */
  counts: Record<ShopOrderStatus, number>;
}

const ALL_STATUSES: ShopOrderStatus[] = [
  'PENDING',
  'TO_CONFIRM',
  'CONFIRMED',
  'CANCEL_REQUESTED',
  'SHIPPING',
  'DELIVERED',
  'COMPLETED',
  'RETURNING',
  'RETURNED',
  'FAILED',
  'INCIDENT',
  'INCIDENT_RESOLVED',
  'CANCELLED',
];

const shipmentInclude = (detail: boolean) =>
  ({
    where: { type: 'DELIVERY' },
    ...(detail
      ? {
          include: {
            history: { orderBy: [{ happenedAt: 'desc' as const }, { createdAt: 'desc' as const }] },
          },
        }
      : {}),
  }) as const;

const returnSelect = {
  select: { id: true, code: true, status: true, refundAmount: true, decidedRefund: true },
} as const;

const orderInclude = (detail: boolean) =>
  ({
    shopOrders: {
      orderBy: { code: 'asc' },
      include: {
        shop: { select: { id: true, name: true, logoUrl: true } },
        items: { orderBy: { id: 'asc' } },
        shipments: shipmentInclude(detail),
        returnRequest: returnSelect,
        ...(detail ? { history: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } } : {}),
      },
    },
  }) satisfies Prisma.OrderInclude;

type OrderRow = Prisma.OrderGetPayload<{ include: ReturnType<typeof orderInclude> }>;
type ShipmentRow = Prisma.ShipmentGetPayload<object> & {
  history?: Prisma.ShipmentHistoryGetPayload<object>[];
};
type ShopOrderRow = Omit<OrderRow['shopOrders'][number], 'shipments'> & {
  shipments: ShipmentRow[];
  history?: Prisma.OrderHistoryGetPayload<object>[];
};

const sellerInclude = (detail: boolean) =>
  ({
    order: true,
    items: { orderBy: { id: 'asc' } },
    shipments: shipmentInclude(detail),
    returnRequest: returnSelect,
    ...(detail ? { history: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } } : {}),
  }) satisfies Prisma.ShopOrderInclude;

type SellerRow = Omit<
  Prisma.ShopOrderGetPayload<{ include: ReturnType<typeof sellerInclude> }>,
  'shipments'
> & {
  shipments: ShipmentRow[];
  history?: Prisma.OrderHistoryGetPayload<object>[];
};

const CANCEL_NOW: ShopOrderStatus[] = ['PENDING', 'TO_CONFIRM'];
/** Shop còn hủy được (trước khi GHN lấy hàng) */
const SELLER_CANCELLABLE: ShopOrderStatus[] = ['TO_CONFIRM', 'CONFIRMED', 'CANCEL_REQUESTED'];

/**
 * Xem và thao tác đơn (ORD-02, ORD-03, ORD-05, SHIP-02..04). Quyền theo chủ sở hữu kiểm ở đây: buyer chỉ
 * thấy đơn của mình, seller chỉ thấy đơn con của shop mình (sai chủ → 404). Bước chuyển trạng thái nằm ở
 * OrderLifecycle; vận đơn ở ShipmentsService.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrderLifecycle,
    private readonly payments: PaymentClient,
    private readonly shipments: ShipmentsService,
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
    return this.orderView(order);
  }

  /** Hủy cả đơn tổng: chỉ khi đơn trả trước chưa trả (quyết định P3 số 7) */
  async buyerCancelOrder(user: AuthUser, orderId: string, reason: string): Promise<OrderView> {
    await this.prisma.$transaction(async (tx) => {
      await this.lifecycle.lock(tx, orderId);
      const order = await tx.order.findFirst({ where: { id: orderId, buyerId: user.id } });
      if (!order) throw notFound();
      if (order.paymentStatus !== 'UNPAID') {
        throw new AppError(
          409,
          'ORDER_ALREADY_PAID',
          'Đơn đã thanh toán hoặc là đơn COD: bạn hủy từng đơn của shop.',
        );
      }
      const n = await this.lifecycle.cancel(tx, orderId, 'ALL', buyerActor(user), reason);
      if (n === 0) throw notCancellable();
    });
    return this.buyerDetail(user.id, orderId);
  }

  /**
   * Hủy một đơn con của đơn đã trả hoặc COD: chưa xác nhận → hủy ngay (trả trước thì hoàn tiền); đã xác
   * nhận, chưa bàn giao → gửi yêu cầu cho shop (mỗi đơn con 1 lần).
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
      if (order.paymentStatus === 'UNPAID') {
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
      await tx.shopOrder.update({
        where: { id: so.id },
        data: {
          status: 'CANCEL_REQUESTED',
          cancelRequestReason: reason,
          cancelRequestedAt: new Date(),
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

  /** Người mua bấm "Đã nhận, không trả hàng": hoàn tất đơn con ngay */
  async buyerReceived(user: AuthUser, orderId: string, shopOrderId: string): Promise<OrderView> {
    const so = await this.prisma.shopOrder.findFirst({
      where: { id: shopOrderId, orderId, order: { buyerId: user.id } },
    });
    if (!so) throw notFound();
    await this.prisma.$transaction(async (tx) => {
      if (await this.lifecycle.complete(tx, so.id, buyerActor(user))) return;
      const ret = await tx.returnRequest.findUnique({ where: { shopOrderId: so.id } });
      if (ret && OPEN_RETURN_STATUSES.includes(ret.status)) {
        throw new AppError(
          409,
          'RETURN_IN_PROGRESS',
          'Đơn đang có yêu cầu trả hàng, chưa xác nhận đã nhận được.',
        );
      }
      throw new AppError(409, 'ORDER_NOT_DELIVERED', 'Đơn chưa giao xong hoặc đã hoàn tất.');
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
  ): Promise<PaymentLink & { payBefore: Date | null }> {
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
          : order.paymentStatus === 'COD'
            ? 'Đơn thanh toán khi nhận hàng, không cần trả trước.'
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
            : q.status === 'CONFIRMED'
              ? [{ handoverBefore: 'asc' }, { id: 'asc' }]
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
      ALL_STATUSES.map((s) => [s, grouped.find((g) => g.status === s)?._count._all ?? 0]),
    ) as Record<ShopOrderStatus, number>;
    return {
      ...toPage(
        rows.map((r) => this.sellerView(r)),
        total,
        q,
      ),
      counts,
    };
  }

  async sellerDetail(userId: string, shopOrderId: string): Promise<SellerOrderView> {
    const shop = await requireSellerShop(this.prisma, userId);
    const row = await this.prisma.shopOrder.findFirst({
      where: { id: shopOrderId, shopId: shop.id },
      include: sellerInclude(true),
    });
    if (!row) throw notFound();
    return this.sellerView(row);
  }

  /**
   * "Xác nhận và giao cho GHN" (ORD-03, SHIP-02): chỉ khi "Chờ xác nhận"; đua với job quá hạn thì chỉ một
   * bên thắng. Tạo vận đơn sau khi giao dịch xong; GHN lỗi thì đơn vẫn xác nhận, vận đơn chờ tạo lại.
   */
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
      await this.lifecycle.history(
        tx,
        so.id,
        'TO_CONFIRM',
        'CONFIRMED',
        sellerActor(user),
        'Xác nhận và giao cho GHN',
      );
      await this.shipments.prepare(tx, so.id);
    });
    await this.shipments.create(shopOrderId);
    return this.sellerDetail(user.id, shopOrderId);
  }

  /** Tạo lại vận đơn khi GHN đã từ chối lần trước */
  async sellerRetryShipment(user: AuthUser, shopOrderId: string): Promise<SellerOrderView> {
    await this.findSellerOrder(user, shopOrderId);
    await this.shipments.retry(shopOrderId);
    return this.sellerDetail(user.id, shopOrderId);
  }

  /** Shop hủy có lý do trước khi GHN lấy hàng; hủy vận đơn trước, rồi hoàn tiền, cộng lại tồn */
  async sellerCancel(
    user: AuthUser,
    shopOrderId: string,
    reason: string,
  ): Promise<SellerOrderView> {
    const so = await this.findSellerOrder(user, shopOrderId);
    if (!SELLER_CANCELLABLE.includes(so.status)) throw notCancellable();
    const carrierDone = await this.shipments.cancelAtCarrier(so.id);
    await this.sellerAction(user, shopOrderId, async (tx, fresh) => {
      if (!SELLER_CANCELLABLE.includes(fresh.status)) throw notCancellable();
      await this.lifecycle.cancel(
        tx,
        fresh.orderId,
        [fresh.id],
        sellerActor(user),
        reason,
        SELLER_CANCELLABLE,
        carrierDone ? new Set([fresh.id]) : new Set(),
      );
    });
    return this.sellerDetail(user.id, shopOrderId);
  }

  /** Shop đồng ý yêu cầu hủy của buyer (hủy vận đơn trước) */
  async acceptCancelRequest(user: AuthUser, shopOrderId: string): Promise<SellerOrderView> {
    const so = await this.findSellerOrder(user, shopOrderId);
    if (so.status !== 'CANCEL_REQUESTED') throw noRequest();
    const carrierDone = await this.shipments.cancelAtCarrier(so.id);
    await this.sellerAction(user, shopOrderId, async (tx, fresh) => {
      if (fresh.status !== 'CANCEL_REQUESTED') throw noRequest();
      const reason = `Buyer xin hủy: ${fresh.cancelRequestReason ?? ''}`.trim();
      await this.lifecycle.cancel(
        tx,
        fresh.orderId,
        [fresh.id],
        sellerActor(user),
        reason,
        ['CANCEL_REQUESTED'],
        carrierDone ? new Set([fresh.id]) : new Set(),
      );
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

  /** Shop xác nhận đã nhận kiện hoàn và chọn dòng hàng nhập lại kho (SHIP-04) */
  async sellerReturnReceived(
    user: AuthUser,
    shopOrderId: string,
    restockItemIds: string[],
  ): Promise<SellerOrderView> {
    await this.findSellerOrder(user, shopOrderId);
    const done = await this.prisma.$transaction((tx) =>
      this.lifecycle.closeReturn(tx, shopOrderId, sellerActor(user), restockItemIds),
    );
    if (!done) {
      throw new AppError(409, 'ORDER_NOT_RETURNED', 'Đơn chưa ở trạng thái chờ nhận kiện hoàn.');
    }
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
    return { ...this.orderView(order), buyer: buyerOf(order) };
  }

  /** Admin hủy có lý do: chưa trả thì hủy cả đơn tổng, còn lại hủy đơn con. Ghi nhật ký */
  async adminCancel(
    admin: AuthUser,
    orderId: string,
    shopOrderId: string,
    reason: string,
  ): Promise<OrderView> {
    const so0 = await this.prisma.shopOrder.findFirst({ where: { id: shopOrderId, orderId } });
    if (!so0) throw notFound();
    const carrierDone = SELLER_CANCELLABLE.includes(so0.status)
      ? await this.shipments.cancelAtCarrier(so0.id)
      : false;
    await this.prisma.$transaction(async (tx) => {
      await this.lifecycle.lock(tx, orderId);
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      const so = await tx.shopOrder.findUniqueOrThrow({ where: { id: shopOrderId } });
      const actor: Actor = { type: 'ADMIN', id: admin.id, name: admin.name };
      const whole = order.paymentStatus === 'UNPAID';
      const n = await this.lifecycle.cancel(
        tx,
        orderId,
        whole ? 'ALL' : [so.id],
        actor,
        reason,
        undefined,
        carrierDone ? new Set([so.id]) : new Set(),
      );
      if (n === 0) throw notCancellable();
      await writeAudit(tx, {
        actor: admin,
        action: 'CANCEL_ORDER',
        targetType: 'SHOP_ORDER',
        targetId: so.id,
        reason,
        before: { status: so.status, paymentStatus: order.paymentStatus },
        after: { status: 'CANCELLED', wholeOrder: whole },
      });
    });
    return this.adminDetail(orderId);
  }

  /** Admin hỗ trợ xác nhận GHN làm mất/hỏng hàng (SHIP-04). Ghi nhật ký */
  async adminResolveIncident(
    admin: AuthUser,
    orderId: string,
    shopOrderId: string,
    note: string,
  ): Promise<OrderView> {
    const so = await this.prisma.shopOrder.findFirst({ where: { id: shopOrderId, orderId } });
    if (!so) throw notFound();
    await this.prisma.$transaction(async (tx) => {
      const done = await this.lifecycle.resolveIncident(
        tx,
        so.id,
        { type: 'ADMIN', id: admin.id, name: admin.name },
        note,
      );
      if (!done) throw new AppError(409, 'NO_INCIDENT', 'Đơn không có sự cố chờ xác nhận.');
      await writeAudit(tx, {
        actor: admin,
        action: 'CONFIRM_INCIDENT',
        targetType: 'SHOP_ORDER',
        targetId: so.id,
        reason: note,
        before: { status: 'INCIDENT' },
        after: { status: 'INCIDENT_RESOLVED' },
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
      rows.map((o) => (admin ? { ...this.orderView(o), buyer: buyerOf(o) } : this.orderView(o))),
      total,
      q,
    );
  }

  private async findSellerOrder(user: AuthUser, shopOrderId: string) {
    const shop = await requireSellerShop(this.prisma, user.id);
    const so = await this.prisma.shopOrder.findFirst({
      where: { id: shopOrderId, shopId: shop.id },
    });
    if (!so) throw notFound();
    return so;
  }

  private async sellerAction(
    user: AuthUser,
    shopOrderId: string,
    fn: (tx: Prisma.TransactionClient, so: Prisma.ShopOrderGetPayload<object>) => Promise<void>,
  ): Promise<void> {
    const found = await this.findSellerOrder(user, shopOrderId);
    await this.prisma.$transaction(async (tx) => {
      await this.lifecycle.lock(tx, found.orderId);
      const so = await tx.shopOrder.findUniqueOrThrow({ where: { id: shopOrderId } });
      await fn(tx, so);
    });
  }

  private shipmentView(rows: ShipmentRow[]): ShipmentView | null {
    const s = rows[0];
    if (!s) return null;
    return {
      ghnCode: s.ghnCode,
      status: s.status,
      failedAttempts: s.failedAttempts,
      fee: s.fee,
      simulated: s.carrier === 'MOCK',
      lastError: s.lastError,
      ...(s.history
        ? {
            tracking: s.history.map((h) => ({
              ghnStatus: h.ghnStatus,
              note: h.note,
              happenedAt: h.happenedAt,
            })),
          }
        : {}),
    };
  }

  private orderView(o: OrderRow): OrderView {
    const unpaid = o.paymentStatus === 'UNPAID';
    const allCancelled = o.shopOrders.every((so) => so.status === 'CANCELLED');
    const now = new Date();
    return {
      id: o.id,
      code: o.code,
      status: orderStatus(o.shopOrders.map((so) => so.status)),
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      checkStatus: o.checkStatus,
      payBefore: o.payBefore,
      paidAt: o.paidAt,
      createdAt: o.createdAt,
      canPay: canPay(o),
      canCancel: unpaid && !allCancelled,
      receiver: { name: o.receiverName, phone: o.receiverPhone, address: o.address },
      platformVoucherCode: o.platformVoucherCode,
      subtotal: o.subtotal,
      shopDiscount: o.shopOrders.reduce((a, so) => a + so.shopDiscount, 0),
      platformDiscount: o.platformDiscount,
      shippingFee: o.shippingFee,
      total: o.total,
      shopOrders: (o.shopOrders as ShopOrderRow[]).map((so) => ({
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
        codAmount: so.codAmount,
        confirmBefore: so.confirmBefore,
        confirmedAt: so.confirmedAt,
        deliveredAt: so.deliveredAt,
        completeBefore: so.completeBefore,
        completedAt: so.completedAt,
        cancelledBy: so.cancelledBy,
        cancelReason: so.cancelReason,
        cancelledAt: so.cancelledAt,
        cancelRequestReason: so.cancelRequestReason,
        cancelRequestUsed: so.cancelRequestUsed,
        refundStatus: so.refundStatus,
        incidentNote: so.incidentNote,
        cancelAction: unpaid
          ? null
          : CANCEL_NOW.includes(so.status)
            ? 'NOW'
            : so.status === 'CONFIRMED' && !so.cancelRequestUsed
              ? 'REQUEST'
              : null,
        canConfirmReceived:
          so.status === 'DELIVERED' &&
          !(so.returnRequest && OPEN_RETURN_STATUSES.includes(so.returnRequest.status)),
        canRequestReturn:
          so.status === 'DELIVERED' &&
          !so.returnRequest &&
          !!so.completeBefore &&
          so.completeBefore > now,
        returnRequest: so.returnRequest,
        shipment: this.shipmentView(so.shipments),
        items: so.items.map(itemView),
        ...(so.history ? { history: so.history.map(historyView) } : {}),
      })),
    };
  }

  private sellerView(so: SellerRow): SellerOrderView {
    return {
      id: so.id,
      code: so.code,
      orderId: so.orderId,
      orderCode: so.order.code,
      status: so.status,
      createdAt: so.createdAt,
      paymentMethod: so.order.paymentMethod,
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
      codAmount: so.codAmount,
      platformFeeRate: so.platformFeeRate,
      platformFee: so.platformFee,
      sellerAmount: so.sellerAmount,
      confirmBefore: so.confirmBefore,
      confirmedAt: so.confirmedAt,
      handoverBefore: so.handoverBefore,
      pickedAt: so.pickedAt,
      deliveredAt: so.deliveredAt,
      completeBefore: so.completeBefore,
      completedAt: so.completedAt,
      returnedAt: so.returnedAt,
      returnCloseBefore: so.returnCloseBefore,
      cancelledBy: so.cancelledBy,
      cancelReason: so.cancelReason,
      cancelledAt: so.cancelledAt,
      cancelRequestReason: so.cancelRequestReason,
      cancelRequestedAt: so.cancelRequestedAt,
      refundStatus: so.refundStatus,
      incidentNote: so.incidentNote,
      returnRequest: so.returnRequest,
      shipment: this.shipmentView(so.shipments),
      ...(so.history ? { history: so.history.map(historyView) } : {}),
    };
  }
}

// ----- hàm phụ -----

/** Trạng thái đơn tổng tính từ các đơn con (STATE-01 số 6) */
export function orderStatus(statuses: ShopOrderStatus[]): OrderStatusView {
  if (statuses.some((s) => !FINAL_STATUSES.includes(s))) return 'PROCESSING';
  const completed = statuses.filter((s) => s === 'COMPLETED').length;
  if (completed === statuses.length) return 'COMPLETED';
  if (completed > 0) return 'PARTIALLY_COMPLETED';
  return 'CANCELLED';
}

function tabWhere(tab: BuyerTab): Prisma.OrderWhereInput {
  switch (tab) {
    case 'UNPAID':
      return { paymentStatus: 'UNPAID', shopOrders: { some: { status: { not: 'CANCELLED' } } } };
    case 'PROCESSING':
      return {
        paymentStatus: { in: ['PAID', 'COD'] },
        shopOrders: { some: { status: { in: ['PENDING', 'TO_CONFIRM'] } } },
      };
    case 'TO_SHIP':
      return { shopOrders: { some: { status: { in: ['CONFIRMED', 'CANCEL_REQUESTED'] } } } };
    case 'SHIPPING':
      return {
        shopOrders: {
          some: { status: { in: ['SHIPPING', 'DELIVERED', 'RETURNING', 'RETURNED', 'INCIDENT'] } },
        },
      };
    case 'COMPLETED':
      return { shopOrders: { some: { status: 'COMPLETED' } } };
    case 'CANCELLED':
      return { shopOrders: { every: { status: 'CANCELLED' } } };
    case 'INCIDENT':
      return { shopOrders: { some: { status: 'INCIDENT' } } };
    default:
      return {};
  }
}

function canPay(o: {
  paymentStatus: string;
  checkStatus: string;
  payBefore: Date | null;
  shopOrders: Array<{ status: ShopOrderStatus }>;
}): boolean {
  return (
    o.paymentStatus === 'UNPAID' &&
    o.checkStatus !== 'REJECTED' &&
    !!o.payBefore &&
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

function buyerOf(o: OrderRow): OrderView['buyer'] {
  return { id: o.buyerId, name: o.buyerName, email: o.buyerEmail };
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
