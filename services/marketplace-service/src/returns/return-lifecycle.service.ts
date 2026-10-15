import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventBus, SettingsService } from '@san/nest-common';
import {
  DISPUTE_OPENED,
  RETURN_REQUESTED,
  RETURN_RESOLVED,
  type BankAccount,
  type DisputeDecidedPayload,
  type DisputeStage,
  type DisputeStatement,
} from '@san/shared';
import {
  OrderLifecycle,
  SYSTEM,
  SYSTEM_USER_ID,
  type Actor,
} from '../orders/order-lifecycle.service';
import { MarketSetting } from '../settings';
import { ShipmentsService, type ReturnShipmentEvent } from '../shipping/shipments.service';
import type {
  Prisma,
  ReturnReason,
  ReturnRequest,
  ReturnStatus,
  Shipment,
} from '../../generated/prisma';
import { withHistory } from './return-state';

type Tx = Prisma.TransactionClient;

/** Yêu cầu trả hàng kèm các món trả */
export type ReturnRow = Prisma.ReturnRequestGetPayload<{ include: { items: true } }>;

/** Dữ liệu một yêu cầu mới (ReturnsService đã kiểm và tính tiền) */
export interface NewReturn {
  code: string;
  shopOrderId: string;
  orderId: string;
  shopId: string;
  buyerId: string;
  reason: ReturnReason;
  description: string;
  images: string[];
  refundAmount: number;
  sellerBase: number;
  bankAccount: BankAccount | null;
  requestKey: string;
  items: Array<{ orderItemId: string; quantity: number; refundAmount: number; sellerBase: number }>;
}

/** Vận đơn trả chưa được GHN lấy hàng: người mua còn hủy yêu cầu được */
/**
 * Vận đơn trả bị GHN từ chối và đã quá hạn giao hàng trả: chờ admin hỗ trợ hủy yêu cầu hoặc hoàn tiền
 * không cần gửi trả.
 */
export function isFailedShipmentOverdue(
  ret: Pick<ReturnRequest, 'status' | 'deadline'>,
  shipment: Pick<Shipment, 'status'> | null,
  now = new Date(),
): boolean {
  return (
    ret.status === 'SHIPPING_BACK' &&
    shipment?.status === 'CREATE_FAILED' &&
    !!ret.deadline &&
    ret.deadline <= now
  );
}

export const RETURN_SHIPMENT_UNPICKED = [
  'CREATING',
  'UNKNOWN',
  'CREATE_FAILED',
  'READY_TO_PICK',
  'CANCELLED',
] as const;

const hour = 3_600_000;
const day = 86_400_000;
const money = (n: number) => `${n.toLocaleString('vi-VN')}đ`;

/**
 * Các bước của yêu cầu trả hàng (STATE-03, docs/phan-tich/12-quyet-dinh-p5.md mục 3). Mọi hàm chạy trong
 * giao dịch của người gọi, sau khi đã khóa theo đơn (`load`), và kiểm lại trạng thái: hai việc cùng lúc
 * (shop chấp nhận và job quá hạn, GHN báo lấy hàng và người mua hủy...) chạy lần lượt, chỉ một bên thắng.
 * Hàm trả false khi trạng thái hiện tại không cho bước đó.
 */
@Injectable()
export class ReturnLifecycle implements OnModuleInit {
  private readonly logger = new Logger(ReturnLifecycle.name);

  constructor(
    private readonly events: EventBus,
    private readonly settings: SettingsService,
    private readonly orders: OrderLifecycle,
    private readonly shipments: ShipmentsService,
  ) {}

  onModuleInit(): void {
    this.shipments.setReturnHandler((tx, sh, event, at, note) =>
      this.onShipmentEvent(tx, sh, event, at, note),
    );
  }

  /** Khóa theo đơn rồi đọc lại yêu cầu */
  async load(tx: Tx, returnId: string): Promise<ReturnRow | null> {
    const r0 = await tx.returnRequest.findUnique({
      where: { id: returnId },
      select: { orderId: true },
    });
    if (!r0) return null;
    await this.orders.lock(tx, r0.orderId);
    return tx.returnRequest.findUnique({ where: { id: returnId }, include: { items: true } });
  }

  /** Người mua gửi yêu cầu (RET-01): chờ shop trả lời; payment-service giữ tiền seller của đơn con */
  async request(tx: Tx, input: NewReturn, actor: Actor): Promise<ReturnRow> {
    const hours = await this.settings.get(MarketSetting.returnResponseHours);
    const now = new Date();
    const { items, bankAccount, ...data } = input;
    const ret = await tx.returnRequest.create({
      data: {
        ...data,
        bankName: bankAccount?.bankName ?? null,
        bankAccountNumber: bankAccount?.accountNumber ?? null,
        bankAccountName: bankAccount?.accountName ?? null,
        status: 'REQUESTED',
        deadline: new Date(now.getTime() + hours * hour),
        history: withHistory(
          { history: [] },
          { ...who(actor), status: 'REQUESTED', note: 'Người mua gửi yêu cầu trả hàng', at: now },
        ),
        items: { create: items },
      },
      include: { items: true },
    });
    await this.events.publish(tx, RETURN_REQUESTED, {
      returnId: ret.id,
      code: ret.code,
      orderId: ret.orderId,
      shopOrderId: ret.shopOrderId,
      refundAmount: ret.refundAmount,
      requestedAt: now.toISOString(),
    });
    return ret;
  }

  /**
   * Shop chấp nhận (hoặc quá hạn tự chấp nhận): gửi hàng về qua GHN, hoặc hoàn tiền ngay không cần gửi
   * trả. Trả 'SHIPPING' khi vừa chuẩn bị vận đơn trả (người gọi gọi GHN sau giao dịch).
   */
  async accept(
    tx: Tx,
    ret: ReturnRow,
    actor: Actor,
    refundWithoutReturn: boolean,
    note?: string,
  ): Promise<'SHIPPING' | 'REFUNDING' | false> {
    if (ret.status !== 'REQUESTED') return false;
    if (refundWithoutReturn) {
      await this.resolveRefund(tx, ret, actor, ret.refundAmount, {
        refundWithoutReturn: true,
        note: note ?? 'Shop chấp nhận, hoàn tiền không cần gửi trả hàng',
      });
      return 'REFUNDING';
    }
    await this.startShipping(
      tx,
      ret,
      actor,
      note ?? 'Shop chấp nhận trả hàng, GHN sẽ tới lấy hàng',
    );
    return 'SHIPPING';
  }

  /** Shop từ chối có lý do: người mua còn khiếu nại được tới hạn */
  async reject(
    tx: Tx,
    ret: ReturnRow,
    actor: Actor,
    reason: string,
    images: string[],
  ): Promise<boolean> {
    if (ret.status !== 'REQUESTED') return false;
    const hours = await this.settings.get(MarketSetting.returnDisputeHours);
    const now = new Date();
    await tx.returnRequest.update({
      where: { id: ret.id },
      data: {
        status: 'REJECTED',
        sellerNote: reason,
        sellerImages: images,
        deadline: new Date(now.getTime() + hours * hour),
        history: withHistory(ret, {
          ...who(actor),
          status: 'REJECTED',
          note: `Shop từ chối: ${reason}`,
        }),
      },
    });
    return true;
  }

  /** Người mua khiếu nại khi shop từ chối (DIS-01, giai đoạn 1) */
  async dispute(
    tx: Tx,
    ret: ReturnRow,
    actor: Actor,
    statement: string,
    images: string[],
  ): Promise<boolean> {
    if (ret.status !== 'REJECTED' || !ret.deadline || ret.deadline <= new Date()) return false;
    await this.openDispute(
      tx,
      ret,
      'REQUEST_REJECTED',
      actor,
      { text: statement, images },
      { text: ret.sellerNote ?? '', images: ret.sellerImages },
      { disputeNote: statement, disputeImages: images },
      `Người mua khiếu nại: ${statement}`,
    );
    return true;
  }

  /**
   * Shop kiểm hàng trả (RET-03, RET-04): nhập lại kho các dòng chọn (độc lập với hoàn tiền). Hàng đúng →
   * hoàn toàn bộ; hàng không đúng → tranh chấp giai đoạn 2. Quá hạn kiểm hàng thì job gọi với OK, không kho.
   */
  async inspect(
    tx: Tx,
    ret: ReturnRow,
    actor: Actor,
    input: {
      result: 'OK' | 'PROBLEM';
      restockItemIds: string[];
      note: string | null;
      images: string[];
      /** Ghi chú thay cho câu mặc định (job quá hạn) */
      historyNote?: string;
    },
  ): Promise<boolean> {
    if (ret.status !== 'RECEIVED') return false;
    const restock = ret.items.filter((ri) => input.restockItemIds.includes(ri.orderItemId));
    for (const ri of restock) {
      const oi = await tx.orderItem.findUniqueOrThrow({ where: { id: ri.orderItemId } });
      const [row] = await tx.$queryRaw<Array<{ stock: number }>>`
        UPDATE product_variants SET stock = stock + ${ri.quantity}
        WHERE id = ${oi.variantId}::uuid RETURNING stock`;
      await tx.stockHistory.create({
        data: {
          variantId: oi.variantId,
          change: ri.quantity,
          stockAfter: row!.stock,
          reason: `Nhận hàng trả ${ret.code}`,
          createdBy: actor.id ?? SYSTEM_USER_ID,
          orderId: ret.orderId,
        },
      });
      await tx.returnItem.update({ where: { id: ri.id }, data: { restocked: true } });
    }
    const stock = restock.length
      ? `nhập lại kho ${restock.length}/${ret.items.length} dòng hàng`
      : 'không nhập lại kho';
    if (input.result === 'OK') {
      await this.resolveRefund(tx, ret, actor, ret.refundAmount, {
        note: input.historyNote ?? `Shop kiểm hàng: đúng như yêu cầu, ${stock}`,
      });
      return true;
    }
    await this.openDispute(
      tx,
      ret,
      'GOODS_PROBLEM',
      actor,
      { text: ret.description, images: ret.images },
      { text: input.note ?? '', images: input.images },
      { sellerNote: input.note, sellerImages: input.images },
      `Shop báo hàng trả về không đúng (${stock}): ${input.note ?? ''}`,
    );
    return true;
  }

  /**
   * Người mua hủy yêu cầu (trước khi GHN lấy hàng), hoặc quá hạn giao hàng trả. Vận đơn trả chưa lấy:
   * `carrierDone` = đã hủy được với GHN → CANCELLED; còn lại → CANCELLING (job báo hủy sau).
   */
  async cancel(
    tx: Tx,
    ret: ReturnRow,
    actor: Actor,
    note: string,
    carrierDone: boolean,
  ): Promise<boolean> {
    if (ret.status === 'SHIPPING_BACK') {
      const sh = await tx.shipment.findUnique({
        where: { shopOrderId_type: { shopOrderId: ret.shopOrderId, type: 'RETURN' } },
      });
      if (sh && !(RETURN_SHIPMENT_UNPICKED as readonly string[]).includes(sh.status)) return false;
      if (sh && sh.status !== 'CANCELLED') {
        const done = carrierDone || (!sh.ghnCode && sh.status === 'CREATE_FAILED');
        await tx.shipment.update({
          where: { id: sh.id },
          data: { status: done ? 'CANCELLED' : 'CANCELLING' },
        });
      }
    } else if (ret.status !== 'REQUESTED') {
      return false;
    }
    await this.finishNoRefund(tx, ret, 'CANCELLED', actor, note);
    return true;
  }

  /** Người mua không khiếu nại trong hạn sau khi shop từ chối: đóng, không hoàn */
  async closeUndisputed(tx: Tx, ret: ReturnRow, now = new Date()): Promise<boolean> {
    if (ret.status !== 'REJECTED' || !ret.deadline || ret.deadline >= now) return false;
    await this.finishNoRefund(
      tx,
      ret,
      'CLOSED',
      SYSTEM,
      'Người mua không khiếu nại trong hạn, yêu cầu đóng',
    );
    return true;
  }

  /**
   * Admin hỗ trợ phân xử (dispute.decided). Chỉ áp khi yêu cầu còn tranh chấp đúng giai đoạn (tin trùng,
   * tin cho giai đoạn cũ bỏ qua). Trả 'SHIPPING' khi vừa chuẩn bị vận đơn trả.
   */
  async applyDisputeDecision(
    tx: Tx,
    p: DisputeDecidedPayload,
  ): Promise<'SHIPPING' | 'DONE' | 'IGNORED'> {
    const ret = await this.load(tx, p.returnId);
    if (!ret) throw new Error(`Chưa có yêu cầu trả hàng ${p.returnId}`);
    if (ret.status !== 'DISPUTED' || ret.disputeStage !== p.stage) {
      this.logger.warn(
        `Bỏ qua quyết định tranh chấp ${p.disputeId}: yêu cầu ${ret.code} đã ${ret.status}.`,
      );
      return 'IGNORED';
    }
    const actor: Actor = { type: 'ADMIN', id: p.decidedBy.userId, name: p.decidedBy.name };
    const note = (what: string) => `Admin phân xử: ${what}. ${p.note}`;
    if (p.decision === 'ACCEPT_RETURN') {
      if (p.stage !== 'REQUEST_REJECTED') {
        this.logger.error(
          `Quyết định ACCEPT_RETURN không hợp lệ ở giai đoạn ${p.stage} (${ret.code}).`,
        );
        return 'IGNORED';
      }
      await this.startShipping(tx, ret, actor, note('chấp nhận trả hàng, người mua gửi hàng về'));
      return 'SHIPPING';
    }
    const amount = p.decision === 'REFUND' ? Math.min(p.refundAmount ?? 0, ret.refundAmount) : 0;
    if (amount <= 0) {
      await this.finishNoRefund(tx, ret, 'CLOSED', actor, note('không hoàn tiền'));
      return 'DONE';
    }
    await this.resolveRefund(tx, ret, actor, amount, {
      refundWithoutReturn: p.stage === 'REQUEST_REJECTED' ? true : ret.refundWithoutReturn,
      note: note(
        amount === ret.refundAmount
          ? `hoàn toàn bộ ${money(amount)}`
          : `hoàn một phần ${money(amount)}`,
      ),
    });
    return 'DONE';
  }

  /**
   * Admin hỗ trợ xác nhận kiện trả bị GHN làm thất lạc/hư hỏng: người mua được hoàn toàn bộ, seller không
   * bị trừ (sàn chịu, tự khiếu nại GHN), giống STATE-01 số 8.
   */
  async confirmLost(tx: Tx, ret: ReturnRow, actor: Actor, note: string): Promise<boolean> {
    if (ret.status !== 'SHIPPING_BACK') return false;
    const sh = await tx.shipment.findUnique({
      where: { shopOrderId_type: { shopOrderId: ret.shopOrderId, type: 'RETURN' } },
    });
    if (sh?.status !== 'LOST') return false;
    await this.resolveRefund(tx, ret, actor, ret.refundAmount, {
      platformCovers: true,
      note: `Admin xác nhận kiện trả thất lạc: ${note}. Sàn chịu, seller không bị trừ tiền`,
    });
    return true;
  }

  /**
   * Vận đơn trả bị GHN từ chối, người mua không tạo lại mà đã quá hạn giao hàng trả: admin hỗ trợ xử lý
   * (quyết định của chủ đồ án, không có luật tự động). CANCEL: hủy yêu cầu, đơn hoàn tất, seller nhận
   * tiền. REFUND: hoàn tiền không cần gửi trả (seller bị trừ như khi shop tự chọn cách này).
   */
  async resolveFailedShipment(
    tx: Tx,
    ret: ReturnRow,
    actor: Actor,
    result: 'CANCEL' | 'REFUND',
    note: string,
    now = new Date(),
  ): Promise<boolean> {
    if (!isFailedShipmentOverdue(ret, await this.returnShipment(tx, ret), now)) return false;
    if (result === 'CANCEL') {
      return this.cancel(
        tx,
        ret,
        actor,
        `Admin hủy yêu cầu (vận đơn trả lỗi quá hạn): ${note}`,
        true,
      );
    }
    await tx.shipment.update({
      where: { shopOrderId_type: { shopOrderId: ret.shopOrderId, type: 'RETURN' } },
      data: { status: 'CANCELLED' },
    });
    await this.resolveRefund(tx, ret, actor, ret.refundAmount, {
      refundWithoutReturn: true,
      note: `Admin hoàn tiền không cần gửi trả (vận đơn trả lỗi quá hạn): ${note}`,
    });
    return true;
  }

  private returnShipment(tx: Tx, ret: ReturnRow): Promise<Shipment | null> {
    return tx.shipment.findUnique({
      where: { shopOrderId_type: { shopOrderId: ret.shopOrderId, type: 'RETURN' } },
    });
  }

  // ----- mốc vận đơn trả (gọi từ ShipmentsService, đã khóa theo đơn) -----

  private async onShipmentEvent(
    tx: Tx,
    sh: Shipment,
    event: ReturnShipmentEvent,
    at: Date,
    note: string | null,
  ): Promise<void> {
    const ret = await tx.returnRequest.findUnique({ where: { shopOrderId: sh.shopOrderId } });
    if (!ret) {
      this.logger.error(`Vận đơn trả ${sh.clientCode} không có yêu cầu trả hàng.`);
      return;
    }
    if (ret.status !== 'SHIPPING_BACK') {
      this.logger.warn(
        `Mốc ${event} của vận đơn trả ${sh.clientCode} tới khi yêu cầu đã ${ret.status}.`,
      );
      return;
    }
    const ghn: Actor = { type: 'SYSTEM', name: 'GHN' };
    if (event === 'PICKED') {
      // Đã giao hàng cho GHN: hết hạn "giao hàng trả", người mua không hủy được nữa
      await tx.returnRequest.update({
        where: { id: ret.id },
        data: {
          deadline: null,
          history: withHistory(ret, {
            ...who(ghn),
            status: 'SHIPPING_BACK',
            note: 'GHN đã lấy hàng trả ở nhà người mua',
            at,
          }),
        },
      });
      return;
    }
    if (event === 'DELIVERED') {
      const hours = await this.settings.get(MarketSetting.returnInspectHours);
      await tx.returnRequest.update({
        where: { id: ret.id },
        data: {
          status: 'RECEIVED',
          deadline: new Date(Date.now() + hours * hour),
          history: withHistory(ret, {
            ...who(ghn),
            status: 'RECEIVED',
            note: 'Hàng trả đã về tới shop, chờ shop kiểm hàng',
            at,
          }),
        },
      });
      return;
    }
    await tx.returnRequest.update({
      where: { id: ret.id },
      data: {
        deadline: null,
        history: withHistory(ret, {
          ...who(ghn),
          status: 'SHIPPING_BACK',
          note: `GHN báo kiện trả thất lạc/hư hỏng${note ? `: ${note}` : ''}. Chờ admin xác nhận`,
          at,
        }),
      },
    });
  }

  // ----- phần dùng chung -----

  /** Chấp nhận trả hàng: chờ GHN lấy hàng ở nhà người mua (hạn `return_ship_days`), chuẩn bị vận đơn trả */
  private async startShipping(tx: Tx, ret: ReturnRow, actor: Actor, note: string): Promise<void> {
    const days = await this.settings.get(MarketSetting.returnShipDays);
    const lines = await tx.orderItem.findMany({
      where: { id: { in: ret.items.map((i) => i.orderItemId) } },
      select: { id: true, weight: true },
    });
    const weight = ret.items.reduce(
      (a, ri) => a + (lines.find((l) => l.id === ri.orderItemId)?.weight ?? 0) * ri.quantity,
      0,
    );
    await tx.returnRequest.update({
      where: { id: ret.id },
      data: {
        status: 'SHIPPING_BACK',
        refundWithoutReturn: false,
        deadline: new Date(Date.now() + days * day),
        history: withHistory(ret, { ...who(actor), status: 'SHIPPING_BACK', note }),
      },
    });
    await this.shipments.prepareReturn(tx, {
      shopOrderId: ret.shopOrderId,
      code: ret.code,
      weight,
    });
  }

  /** Mở tranh chấp: chờ admin hỗ trợ phân xử, gửi hồ sơ (lời và ảnh hai bên) cho approval-service */
  private async openDispute(
    tx: Tx,
    ret: ReturnRow,
    stage: DisputeStage,
    actor: Actor,
    buyerStatement: DisputeStatement,
    sellerStatement: DisputeStatement,
    extra: Prisma.ReturnRequestUpdateInput,
    note: string,
  ): Promise<void> {
    const so = await tx.shopOrder.findUniqueOrThrow({
      where: { id: ret.shopOrderId },
      include: { order: true, shop: true, items: true },
    });
    const now = new Date();
    await tx.returnRequest.update({
      where: { id: ret.id },
      data: {
        ...extra,
        status: 'DISPUTED',
        disputeStage: stage,
        deadline: null,
        history: withHistory(ret, { ...who(actor), status: 'DISPUTED', note }),
      },
    });
    await this.events.publish(tx, DISPUTE_OPENED, {
      returnId: ret.id,
      returnCode: ret.code,
      stage,
      orderId: so.orderId,
      orderCode: so.order.code,
      shopOrderId: so.id,
      shopOrderCode: so.code,
      shop: { shopId: so.shopId, name: so.shop.name ?? so.shopName, ownerId: so.shop.ownerId },
      buyer: { userId: so.order.buyerId, name: so.order.buyerName },
      paymentMethod: so.order.paymentMethod,
      reason: ret.reason,
      description: ret.description,
      images: ret.images,
      items: ret.items.map((ri) => {
        const oi = so.items.find((i) => i.id === ri.orderItemId)!;
        return {
          name: oi.productName,
          variant: oi.variantName,
          price: oi.price,
          quantity: ri.quantity,
          refundAmount: ri.refundAmount,
        };
      }),
      maxRefundAmount: ret.refundAmount,
      buyerStatement,
      sellerStatement,
      openedAt: now.toISOString(),
    });
  }

  /**
   * Quyết hoàn tiền (REF-02): đang hoàn, báo payment-service (hoàn qua cổng hoặc chuyển khoản, trừ tiền
   * seller, tính lại phí sàn) rồi hoàn tất đơn con. Món được hoàn đủ tiền: tăng số đã trả, giảm "đã bán".
   */
  private async resolveRefund(
    tx: Tx,
    ret: ReturnRow,
    actor: Actor,
    amount: number,
    opts: { refundWithoutReturn?: boolean; platformCovers?: boolean; note: string },
  ): Promise<void> {
    const now = new Date();
    const full = amount >= ret.refundAmount;
    await tx.returnRequest.update({
      where: { id: ret.id },
      data: {
        status: 'REFUNDING',
        decidedRefund: amount,
        refundWithoutReturn: opts.refundWithoutReturn ?? ret.refundWithoutReturn,
        platformCovers: opts.platformCovers ?? false,
        deadline: null,
        resolvedAt: now,
        refundStatus: 'PROCESSING',
        refundUpdatedAt: now,
        history: withHistory(ret, { ...who(actor), status: 'REFUNDING', note: opts.note }),
      },
    });
    if (full) {
      for (const ri of ret.items) {
        const oi = await tx.orderItem.update({
          where: { id: ri.orderItemId },
          data: { returnedQuantity: { increment: ri.quantity } },
        });
        await tx.$executeRaw`
          UPDATE products SET sold_count = GREATEST(sold_count - ${ri.quantity}, 0)
          WHERE id = ${oi.productId}::uuid`;
      }
    }
    await this.publishResolved(tx, ret, 'REFUND', amount, opts.platformCovers ?? false, now);
    await this.orders.complete(
      tx,
      ret.shopOrderId,
      SYSTEM,
      'Yêu cầu trả hàng có kết quả, đơn hoàn tất',
    );
  }

  /** Kết thúc không hoàn tiền (đóng hoặc hủy): báo payment-service bỏ giữ tiền, hoàn tất đơn con */
  private async finishNoRefund(
    tx: Tx,
    ret: ReturnRow,
    status: Extract<ReturnStatus, 'CLOSED' | 'CANCELLED'>,
    actor: Actor,
    note: string,
  ): Promise<void> {
    const now = new Date();
    await tx.returnRequest.update({
      where: { id: ret.id },
      data: {
        status,
        deadline: null,
        resolvedAt: now,
        history: withHistory(ret, { ...who(actor), status, note }),
      },
    });
    await this.publishResolved(tx, ret, 'NO_REFUND', 0, false, now);
    await this.orders.complete(
      tx,
      ret.shopOrderId,
      SYSTEM,
      status === 'CANCELLED'
        ? 'Yêu cầu trả hàng đã hủy, đơn hoàn tất'
        : 'Yêu cầu trả hàng đã đóng, đơn hoàn tất',
    );
  }

  private async publishResolved(
    tx: Tx,
    ret: ReturnRow,
    outcome: 'REFUND' | 'NO_REFUND',
    amount: number,
    platformCovers: boolean,
    at: Date,
  ): Promise<void> {
    await this.events.publish(tx, RETURN_RESOLVED, {
      returnId: ret.id,
      code: ret.code,
      orderId: ret.orderId,
      shopOrderId: ret.shopOrderId,
      outcome,
      refundAmount: amount,
      maxRefundAmount: ret.refundAmount,
      sellerBase: ret.sellerBase,
      platformCovers,
      bankAccount:
        ret.bankName && ret.bankAccountNumber && ret.bankAccountName
          ? {
              bankName: ret.bankName,
              accountNumber: ret.bankAccountNumber,
              accountName: ret.bankAccountName,
            }
          : null,
      resolvedAt: at.toISOString(),
    });
  }
}

function who(actor: Actor): { actorType: Actor['type']; actorName: string | null } {
  return { actorType: actor.type, actorName: actor.name ?? null };
}
