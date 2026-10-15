import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppError, SettingsService } from '@san/nest-common';
import { PrismaService } from '../prisma.service';
import { OrderLifecycle } from '../orders/order-lifecycle.service';
import { MarketSetting } from '../settings';
import type {
  EventSource,
  Prisma,
  Shipment,
  ShipmentStatus,
  ShipmentType,
} from '../../generated/prisma';
import { CarrierRejectedError, SHIPPING_CARRIER, type ShippingCarrier } from './carrier';
import {
  mapGhnStatus,
  nextSimulatorEvents,
  SIMULATOR_EVENTS,
  type SimulatorEvent,
} from './ghn-status';

type Tx = Prisma.TransactionClient;

/** Kết quả áp một tin trạng thái của đơn vị vận chuyển */
export type ApplyResult = 'APPLIED' | 'DUPLICATE' | 'UNKNOWN_SHIPMENT';

/** Mốc của vận đơn trả hàng báo cho phần trả hàng (P5, RET-03) */
export type ReturnShipmentEvent = 'PICKED' | 'DELIVERED' | 'LOST';

/**
 * Phần trả hàng đăng ký hàm nhận mốc vận đơn trả (đăng ký thay vì inject để tránh hai service phụ
 * thuộc vòng tròn). Chạy trong giao dịch của tin GHN, đã khóa theo đơn.
 */
export type ReturnShipmentHandler = (
  tx: Tx,
  shipment: Shipment,
  event: ReturnShipmentEvent,
  at: Date,
  note: string | null,
) => Promise<void>;

/** Vận đơn trên bảng GHN mô phỏng */
export interface SimulatorRow {
  id: string;
  /** DELIVERY: giao cho người mua; RETURN: hàng trả của người mua gửi về shop (P5) */
  type: ShipmentType;
  ghnCode: string | null;
  status: ShipmentStatus;
  failedAttempts: number;
  shopOrderId: string;
  shopOrderCode: string;
  shopName: string;
  /** Người nhận và địa chỉ giao tới (vận đơn trả: shop) */
  receiverName: string;
  address: string;
  codAmount: number;
  createdAt: Date;
  /** Các nút bấm được */
  actions: SimulatorEvent[];
}

const ACTIVE: ShipmentStatus[] = ['READY_TO_PICK', 'PICKED', 'RETURNING'];

/** Vận đơn tạo xong mà chưa gọi được GHN quá chừng này thì job gọi lại (tránh trùng lần gọi đang chạy) */
const CREATING_STALE_MS = 60_000;

/**
 * Vận đơn (SHIP-02..04, RET-03). Tạo vận đơn sau khi shop xác nhận (hoặc khi yêu cầu trả hàng được chấp
 * nhận); nhận trạng thái GHN qua webhook (hoặc bảng mô phỏng) và chuyển trạng thái đơn con qua
 * OrderLifecycle, yêu cầu trả hàng qua hàm đã đăng ký. Một đơn con một vận đơn mỗi loại; tạo bị lỗi mạng
 * thì ghi "chưa rõ" và tra cứu theo mã gửi GHN, không gửi lại mù quáng.
 */
@Injectable()
export class ShipmentsService {
  private readonly logger = new Logger(ShipmentsService.name);
  private returnHandler: ReturnShipmentHandler | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrderLifecycle,
    private readonly settings: SettingsService,
    @Inject(SHIPPING_CARRIER) private readonly carrier: ShippingCarrier,
  ) {}

  get simulated(): boolean {
    return this.carrier.kind === 'MOCK';
  }

  /** Phần trả hàng gọi lúc khởi động để nhận mốc của vận đơn trả */
  setReturnHandler(handler: ReturnShipmentHandler): void {
    this.returnHandler = handler;
  }

  /** Tạo dòng vận đơn "đang tạo" trong giao dịch xác nhận đơn (gọi GHN sau khi giao dịch xong) */
  async prepare(tx: Tx, shopOrderId: string): Promise<void> {
    const so = await tx.shopOrder.findUniqueOrThrow({
      where: { id: shopOrderId },
      include: { items: true },
    });
    await tx.shipment.upsert({
      where: { shopOrderId_type: { shopOrderId, type: 'DELIVERY' } },
      create: {
        shopOrderId,
        carrier: this.carrier.kind,
        clientCode: so.code,
        codAmount: so.codAmount,
        weight: Math.max(
          1,
          so.items.reduce((a, i) => a + i.weight * i.quantity, 0),
        ),
      },
      update: {},
    });
  }

  /**
   * Vận đơn trả hàng (P5): mã gửi GHN là mã yêu cầu trả hàng, không thu hộ. Gọi trong giao dịch chấp nhận
   * trả hàng; GHN được gọi sau (người gọi gọi `create`, hoặc job `syncCreating`).
   */
  async prepareReturn(
    tx: Tx,
    input: { shopOrderId: string; code: string; weight: number },
  ): Promise<void> {
    await tx.shipment.upsert({
      where: { shopOrderId_type: { shopOrderId: input.shopOrderId, type: 'RETURN' } },
      create: {
        shopOrderId: input.shopOrderId,
        type: 'RETURN',
        carrier: this.carrier.kind,
        clientCode: input.code,
        codAmount: 0,
        weight: Math.max(1, input.weight),
      },
      update: {},
    });
  }

  /**
   * Gọi GHN tạo vận đơn (vận đơn đang CREATING). GHN từ chối → CREATE_FAILED (tạo lại bằng tay);
   * lỗi mạng → UNKNOWN (job tra cứu theo mã gửi GHN). Vận đơn trả hàng: lấy ở địa chỉ nhận hàng của
   * người mua, giao về địa chỉ lấy hàng của shop.
   */
  async create(shopOrderId: string, type: ShipmentType = 'DELIVERY'): Promise<Shipment> {
    const sh = await this.prisma.shipment.findUniqueOrThrow({
      where: { shopOrderId_type: { shopOrderId, type } },
      include: { shopOrder: { include: { items: true, order: true, shop: true } } },
    });
    if (sh.status !== 'CREATING') return sh;
    const so = sh.shopOrder;
    const shop = {
      name: so.shop.name ?? so.shopName,
      phone: so.shop.phone ?? '',
      address: so.shop.pickupAddress ?? '',
      districtId: so.shop.pickupDistrictId ?? 0,
      wardCode: so.shop.pickupWardCode ?? '',
    };
    const buyer = {
      name: so.order.receiverName,
      phone: so.order.receiverPhone,
      address: so.order.address,
      districtId: so.order.districtId,
      wardCode: so.order.wardCode,
    };
    let items = so.items.map((i) => ({
      name: [i.productName, i.variantName].filter(Boolean).join(' - ').slice(0, 100),
      quantity: i.quantity,
      weight: i.weight,
    }));
    if (type === 'RETURN') {
      const ret = await this.prisma.returnRequest.findUniqueOrThrow({
        where: { shopOrderId },
        include: { items: true },
      });
      items = ret.items.map((ri) => {
        const i = so.items.find((x) => x.id === ri.orderItemId)!;
        return {
          name: [i.productName, i.variantName].filter(Boolean).join(' - ').slice(0, 100),
          quantity: ri.quantity,
          weight: i.weight,
        };
      });
    }
    try {
      const created = await this.carrier.createOrder({
        clientCode: sh.clientCode,
        from: type === 'RETURN' ? buyer : shop,
        to: type === 'RETURN' ? shop : buyer,
        codAmount: sh.codAmount,
        weight: sh.weight,
        items,
      });
      return this.linkCreated(sh.id, created.ghnCode, created.fee);
    } catch (e) {
      const rejected = e instanceof CarrierRejectedError;
      this.logger.warn(`Tạo vận đơn ${sh.clientCode} lỗi: ${(e as Error).message}`);
      // Chỉ ghi lỗi khi vận đơn vẫn đang chờ tạo: lần gọi khác (job tra cứu) có thể đã tạo xong,
      // hoặc đơn/yêu cầu trả hàng đã bị hủy trong lúc chờ GHN.
      await this.prisma.shipment.updateMany({
        where: { id: sh.id, status: { in: ['CREATING', 'UNKNOWN'] } },
        data: {
          status: rejected ? 'CREATE_FAILED' : 'UNKNOWN',
          lastError: (e as Error).message.slice(0, 500),
        },
      });
      return this.prisma.shipment.findUniqueOrThrow({ where: { id: sh.id } });
    }
  }

  /** "Tạo lại vận đơn" khi GHN đã từ chối lần trước */
  async retry(shopOrderId: string, type: ShipmentType = 'DELIVERY'): Promise<Shipment> {
    const { count } = await this.prisma.shipment.updateMany({
      where: { shopOrderId, type, status: 'CREATE_FAILED' },
      data: { status: 'CREATING', lastError: null },
    });
    if (count === 0) {
      throw new AppError(409, 'SHIPMENT_NOT_RETRYABLE', 'Vận đơn không ở trạng thái tạo lại được.');
    }
    return this.create(shopOrderId, type);
  }

  /**
   * Hủy vận đơn với GHN trước khi hủy đơn (người dùng bấm hủy). Trả true nếu đã hủy được với GHN hoặc
   * không có gì phải hủy; false nếu vận đơn còn đang tạo/chưa rõ (job sẽ báo hủy sau).
   */
  async cancelAtCarrier(shopOrderId: string, type: ShipmentType = 'DELIVERY'): Promise<boolean> {
    const sh = await this.prisma.shipment.findUnique({
      where: { shopOrderId_type: { shopOrderId, type } },
    });
    if (!sh || sh.status === 'CREATE_FAILED' || sh.status === 'CANCELLED') return true;
    if (sh.status !== 'READY_TO_PICK' || !sh.ghnCode) {
      if (sh.status === 'CREATING' || sh.status === 'UNKNOWN') return false;
      throw new AppError(409, 'ALREADY_PICKED_UP', 'GHN đã lấy hàng, không còn hủy được.');
    }
    let result: 'CANCELLED' | 'ALREADY_PICKED';
    try {
      result = await this.carrier.cancelOrder(sh.ghnCode);
    } catch (e) {
      this.logger.warn(`Hủy vận đơn ${sh.ghnCode} lỗi: ${(e as Error).message}`);
      throw new AppError(
        503,
        'CARRIER_UNAVAILABLE',
        'Chưa hủy được vận đơn với GHN, bạn thử lại sau ít phút.',
      );
    }
    if (result === 'ALREADY_PICKED') {
      throw new AppError(409, 'ALREADY_PICKED_UP', 'GHN đã lấy hàng, không còn hủy được.');
    }
    return true;
  }

  // ----- nhận trạng thái từ GHN (webhook) hoặc bảng mô phỏng -----

  /**
   * Áp một tin trạng thái. Tin trùng (cùng mã vận đơn, mã trạng thái, thời điểm) bỏ qua; tin cũ tới sau chỉ
   * ghi lịch sử, không làm trạng thái đi lùi (mỗi bước chỉ chuyển từ đúng trạng thái trước nó).
   */
  async applyCarrierEvent(input: {
    ghnCode: string;
    status: string;
    at: Date;
    source: EventSource;
    fee?: number | null;
    note?: string;
  }): Promise<ApplyResult> {
    const sh0 = await this.prisma.shipment.findUnique({ where: { ghnCode: input.ghnCode } });
    if (!sh0) {
      this.logger.warn(`Tin GHN cho vận đơn lạ ${input.ghnCode}, bỏ qua.`);
      return 'UNKNOWN_SHIPMENT';
    }
    const so0 = await this.prisma.shopOrder.findUniqueOrThrow({ where: { id: sh0.shopOrderId } });
    const max = await this.settings.get(MarketSetting.maxDeliveryAttempts);
    return this.prisma.$transaction(async (tx) => {
      await this.lifecycle.lock(tx, so0.orderId);
      const result = await this.applyInTx(tx, sh0.id, input, max);
      return result;
    });
  }

  private async applyInTx(
    tx: Tx,
    shipmentId: string,
    input: {
      ghnCode: string;
      status: string;
      at: Date;
      source: EventSource;
      fee?: number | null;
      note?: string;
    },
    maxAttempts: number,
  ): Promise<ApplyResult> {
    const sh = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    const event = mapGhnStatus(input.status);
    const eventKey = `${input.ghnCode}:${input.status}:${input.at.toISOString()}`.slice(0, 120);
    const { count } = await tx.shipmentHistory.createMany({
      data: [
        {
          shipmentId,
          ghnStatus: input.status.slice(0, 40),
          status: sh.status,
          source: input.source,
          eventKey,
          note: input.note?.slice(0, 300) ?? null,
          happenedAt: input.at,
        },
      ],
      skipDuplicates: true,
    });
    if (count === 0) return 'DUPLICATE';

    const data: Prisma.ShipmentUpdateInput = {};
    if (input.fee !== undefined && input.fee !== null) data.fee = input.fee;
    if (!sh.lastEventAt || sh.lastEventAt < input.at) data.lastEventAt = input.at;
    const status =
      sh.type === 'RETURN'
        ? await this.applyReturnEvent(tx, sh, event, input, data)
        : await this.applyDeliveryEvent(tx, sh, event, input, data, maxAttempts);
    data.status = status;
    await tx.shipment.update({ where: { id: shipmentId }, data });
    // Lịch sử ghi trạng thái vận đơn sau khi áp tin (tin cũ tới muộn thì trạng thái giữ nguyên)
    if (status !== sh.status) {
      await tx.shipmentHistory.update({ where: { eventKey }, data: { status } });
    }
    return 'APPLIED';
  }

  /** Vận đơn giao cho người mua (P4): chuyển trạng thái đơn con */
  private async applyDeliveryEvent(
    tx: Tx,
    sh: Shipment,
    event: ReturnType<typeof mapGhnStatus>,
    input: {
      ghnCode: string;
      status: string;
      at: Date;
      source: EventSource;
      fee?: number | null;
      note?: string;
    },
    data: Prisma.ShipmentUpdateInput,
    maxAttempts: number,
  ): Promise<ShipmentStatus> {
    const so = await tx.shopOrder.findUniqueOrThrow({ where: { id: sh.shopOrderId } });
    let status = sh.status;
    switch (event) {
      case 'PICKED':
        if (status === 'READY_TO_PICK') {
          status = 'PICKED';
          data.pickedAt = input.at;
          await this.lifecycle.onPicked(tx, so, input.at);
        } else if (status === 'CANCELLING' || status === 'CANCELLED') {
          this.logger.error(
            `GHN báo lấy hàng ${sh.ghnCode} nhưng đơn ${so.code} đã hủy: cần xử lý tay.`,
          );
          data.lastError = 'GHN báo đã lấy hàng sau khi đơn bị hủy';
        }
        break;
      case 'DELIVERY_FAILED':
        if (status === 'PICKED') {
          const attempts = sh.failedAttempts + 1;
          data.failedAttempts = attempts;
          // GHN thật tự báo hoàn hàng; bản mô phỏng tự hoàn khi thất bại đủ số lần cấu hình
          if (input.source === 'MOCK' && attempts >= maxAttempts) {
            status = 'RETURNING';
            await this.lifecycle.onReturning(tx, so, input.at);
          }
        }
        break;
      case 'DELIVERED':
        if (status === 'READY_TO_PICK' || status === 'PICKED') {
          if (status === 'READY_TO_PICK') {
            data.pickedAt = input.at;
            await this.lifecycle.onPicked(tx, so, input.at);
          }
          status = 'DELIVERED';
          data.deliveredAt = input.at;
          const fresh = await tx.shopOrder.findUniqueOrThrow({ where: { id: so.id } });
          await this.lifecycle.onDelivered(
            tx,
            fresh,
            { ghnCode: sh.ghnCode, fee: input.fee ?? sh.fee },
            input.at,
          );
        }
        break;
      case 'RETURNING':
        if (status === 'PICKED') {
          status = 'RETURNING';
          await this.lifecycle.onReturning(tx, so, input.at);
        }
        break;
      case 'RETURNED':
        if (status === 'PICKED' || status === 'RETURNING') {
          if (status === 'PICKED') await this.lifecycle.onReturning(tx, so, input.at);
          status = 'RETURNED';
          data.returnedAt = input.at;
          const fresh = await tx.shopOrder.findUniqueOrThrow({ where: { id: so.id } });
          await this.lifecycle.onReturned(tx, fresh, input.at);
        }
        break;
      case 'INCIDENT':
        if (status === 'PICKED' || status === 'RETURNING') {
          status = 'LOST';
          await this.lifecycle.onIncident(
            tx,
            so,
            `GHN báo sự cố (${input.status}): ${input.note ?? 'thất lạc hoặc hư hỏng'}`,
          );
        }
        break;
      case 'CANCELLED':
        if (status === 'CANCELLING' || status === 'READY_TO_PICK') {
          if (status === 'READY_TO_PICK') data.lastError = 'GHN tự hủy vận đơn';
          status = 'CANCELLED';
        }
        break;
      default:
        break;
    }
    return status;
  }

  /**
   * Vận đơn trả hàng (P5): GHN lấy ở nhà người mua rồi giao về shop. Chỉ các mốc lấy hàng, đã giao tới
   * shop, thất lạc có tác động (báo phần trả hàng); GHN tự hủy thì để job hết hạn xử lý; các mốc khác
   * (giao shop thất bại, hoàn về người mua) chỉ ghi lịch sử để admin xử lý tay.
   */
  private async applyReturnEvent(
    tx: Tx,
    sh: Shipment,
    event: ReturnType<typeof mapGhnStatus>,
    input: { status: string; at: Date; note?: string },
    data: Prisma.ShipmentUpdateInput,
  ): Promise<ShipmentStatus> {
    let status = sh.status;
    const notify = async (e: ReturnShipmentEvent) => {
      if (this.returnHandler) await this.returnHandler(tx, sh, e, input.at, input.note ?? null);
      else this.logger.error(`Chưa có nơi nhận mốc vận đơn trả ${sh.clientCode} (${e}).`);
    };
    switch (event) {
      case 'PICKED':
        if (status === 'READY_TO_PICK') {
          status = 'PICKED';
          data.pickedAt = input.at;
          await notify('PICKED');
        }
        break;
      case 'DELIVERED':
        if (status === 'READY_TO_PICK' || status === 'PICKED') {
          if (status === 'READY_TO_PICK') {
            data.pickedAt = input.at;
            await notify('PICKED');
          }
          status = 'DELIVERED';
          data.deliveredAt = input.at;
          await notify('DELIVERED');
        }
        break;
      case 'INCIDENT':
        if (status === 'PICKED') {
          status = 'LOST';
          await notify('LOST');
        }
        break;
      case 'CANCELLED':
        if (status === 'CANCELLING' || status === 'READY_TO_PICK') {
          if (status === 'READY_TO_PICK') data.lastError = 'GHN tự hủy vận đơn trả';
          status = 'CANCELLED';
        }
        break;
      default:
        if (event) {
          this.logger.warn(`Vận đơn trả ${sh.clientCode} nhận mốc ${input.status}: cần xử lý tay.`);
          data.lastError = `GHN báo ${input.status}: cần xử lý tay`;
        }
        break;
    }
    return status;
  }

  // ----- bảng GHN mô phỏng (admin SUPPORT) -----

  async simulatorList(): Promise<SimulatorRow[]> {
    this.requireMock();
    const rows = await this.prisma.shipment.findMany({
      where: { status: { in: ACTIVE } },
      include: { shopOrder: { include: { order: true, shop: true } } },
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
    });
    return rows.map((s) => {
      const ret = s.type === 'RETURN';
      const so = s.shopOrder;
      return {
        id: s.id,
        type: s.type,
        ghnCode: s.ghnCode,
        status: s.status,
        failedAttempts: s.failedAttempts,
        shopOrderId: s.shopOrderId,
        shopOrderCode: so.code,
        shopName: so.shopName,
        receiverName: ret ? (so.shop.name ?? so.shopName) : so.order.receiverName,
        address: ret ? (so.shop.pickupAddress ?? '') : so.order.address,
        codAmount: s.codAmount,
        createdAt: s.createdAt,
        actions: nextSimulatorEvents(s.status, s.type),
      };
    });
  }

  /** Bấm một bước trên bảng mô phỏng: đi đúng đường xử lý như tin GHN thật */
  async simulate(shipmentId: string, event: SimulatorEvent): Promise<SimulatorRow | null> {
    this.requireMock();
    const sh = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
    if (!sh?.ghnCode) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy vận đơn.');
    if (!nextSimulatorEvents(sh.status, sh.type).includes(event)) {
      throw new AppError(
        409,
        'INVALID_CARRIER_EVENT',
        'Vận đơn đang ở trạng thái không bấm được bước này.',
      );
    }
    // Mỗi lần bấm một thời điểm riêng (khác mili giây) để không bị coi là tin trùng
    const at = new Date(Math.max(Date.now(), (sh.lastEventAt?.getTime() ?? 0) + 1));
    await this.applyCarrierEvent({
      ghnCode: sh.ghnCode,
      status: SIMULATOR_EVENTS[event],
      at,
      source: 'MOCK',
      note: event === 'LOST' ? 'Thất lạc hoặc hư hỏng (MÔ PHỎNG)' : 'MÔ PHỎNG',
    });
    const rows = await this.simulatorList();
    return rows.find((r) => r.id === shipmentId) ?? null;
  }

  // ----- việc chạy nền -----

  /** Vận đơn "chưa rõ": tra GHN theo mã gửi GHN; có thì gắn mã, chưa có thì tạo lại an toàn */
  async syncUnknown(): Promise<number> {
    const rows = await this.prisma.shipment.findMany({ where: { status: 'UNKNOWN' }, take: 50 });
    for (const sh of rows) {
      try {
        const found = await this.carrier.findByClientCode(sh.clientCode);
        if (found) await this.linkCreated(sh.id, found.ghnCode, found.fee);
        else {
          // Chỉ gửi lại khi vận đơn vẫn "không rõ" (đơn có thể vừa bị hủy trong lúc tra cứu)
          const { count } = await this.prisma.shipment.updateMany({
            where: { id: sh.id, status: 'UNKNOWN' },
            data: { status: 'CREATING' },
          });
          if (count) await this.create(sh.shopOrderId, sh.type);
        }
      } catch (e) {
        this.logger.warn(`Tra cứu vận đơn ${sh.clientCode} lỗi: ${(e as Error).message}`);
      }
    }
    return rows.length;
  }

  /**
   * Vận đơn còn "đang tạo" quá 1 phút: chưa gọi được GHN (vận đơn trả tạo từ sự kiện/job, hoặc tiến trình
   * dừng giữa chừng). Tra GHN theo mã trước để không tạo vận đơn thứ hai.
   */
  async syncCreating(now = new Date()): Promise<number> {
    const rows = await this.prisma.shipment.findMany({
      where: { status: 'CREATING', updatedAt: { lt: new Date(now.getTime() - CREATING_STALE_MS) } },
      take: 50,
    });
    for (const sh of rows) {
      try {
        const found = await this.carrier.findByClientCode(sh.clientCode);
        if (found) await this.linkCreated(sh.id, found.ghnCode, found.fee);
        else await this.create(sh.shopOrderId, sh.type);
      } catch (e) {
        this.logger.warn(`Tạo vận đơn ${sh.clientCode} lỗi: ${(e as Error).message}`);
      }
    }
    return rows.length;
  }

  /** Vận đơn của đơn đã hủy phía sàn: báo hủy với GHN */
  async syncCancelling(): Promise<number> {
    const rows = await this.prisma.shipment.findMany({ where: { status: 'CANCELLING' }, take: 50 });
    for (const sh of rows) {
      try {
        let code = sh.ghnCode;
        if (!code) code = (await this.carrier.findByClientCode(sh.clientCode))?.ghnCode ?? null;
        let note: string | null = null;
        if (code && (await this.carrier.cancelOrder(code)) === 'ALREADY_PICKED') {
          note = 'GHN đã lấy hàng, không hủy được vận đơn: cần xử lý tay';
          this.logger.error(`${note} (${code})`);
        }
        await this.prisma.shipment.updateMany({
          where: { id: sh.id, status: 'CANCELLING' },
          data: { status: 'CANCELLED', ghnCode: code, lastError: note },
        });
      } catch (e) {
        this.logger.warn(`Báo hủy vận đơn ${sh.clientCode} lỗi: ${(e as Error).message}`);
      }
    }
    return rows.length;
  }

  /**
   * Ghi mã GHN vừa tạo. Chỉ chuyển sang READY_TO_PICK khi vận đơn vẫn đang chờ tạo. Đơn hoặc yêu cầu
   * trả hàng đã bị hủy trong lúc chờ GHN (CANCELLING/CANCELLED) thì giữ mã và để job `syncCancelling`
   * hủy vận đơn vừa tạo ở GHN, không để vận đơn sống tiếp.
   */
  private async linkCreated(id: string, ghnCode: string, fee: number | null): Promise<Shipment> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.shipment.updateMany({
        where: { id, status: { in: ['CREATING', 'UNKNOWN', 'CREATE_FAILED'] } },
        data: { ghnCode, fee, status: 'READY_TO_PICK', lastError: null },
      });
      if (count === 0) {
        const cur = await tx.shipment.findUniqueOrThrow({ where: { id } });
        if (cur.status !== 'CANCELLING' && cur.status !== 'CANCELLED') return cur;
        if (cur.ghnCode === ghnCode && cur.status === 'CANCELLED') return cur;
        this.logger.warn(`Vận đơn ${cur.clientCode} tạo xong sau khi đã hủy: báo hủy ${ghnCode}`);
        return tx.shipment.update({
          where: { id },
          data: { ghnCode, fee, status: 'CANCELLING' },
        });
      }
      const sh = await tx.shipment.findUniqueOrThrow({ where: { id } });
      await tx.shipmentHistory.createMany({
        data: [
          {
            shipmentId: id,
            ghnStatus: 'ready_to_pick',
            status: 'READY_TO_PICK',
            source: this.carrier.kind,
            eventKey: `${ghnCode}:created`,
            note: this.simulated ? 'Tạo vận đơn (MÔ PHỎNG)' : 'Tạo vận đơn GHN',
            happenedAt: new Date(),
          },
        ],
        skipDuplicates: true,
      });
      return sh;
    });
  }

  private requireMock(): void {
    if (!this.simulated) {
      throw new AppError(404, 'NOT_FOUND', 'Đang dùng GHN thật, không có bảng mô phỏng.');
    }
  }
}
