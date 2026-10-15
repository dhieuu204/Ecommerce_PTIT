import { Injectable } from '@nestjs/common';
import {
  AppError,
  SettingsService,
  skipTake,
  toPage,
  writeAudit,
  type AuthUser,
} from '@san/nest-common';
import type { Page } from '@san/shared';
import { AppConfig } from '../config';
import { OrderLifecycle, type Actor } from '../orders/order-lifecycle.service';
import { PrismaService } from '../prisma.service';
import { requireSellerShop } from '../products/seller-shop';
import { MarketSetting } from '../settings';
import { ShipmentsService } from '../shipping/shipments.service';
import {
  Prisma,
  type ReturnReason,
  type ReturnStatus,
  type ShipmentStatus,
} from '../../generated/prisma';
import type {
  AcceptReturnDto,
  CreateReturnDto,
  DisputeReturnDto,
  InspectReturnDto,
  RejectReturnDto,
  ResolveFailedShipmentDto,
  ReturnsQuery,
} from './dto/returns.dto';
import { returnAmounts } from './return-money';
import {
  RETURN_SHIPMENT_UNPICKED,
  isFailedShipmentOverdue,
  ReturnLifecycle,
  type ReturnRow,
} from './return-lifecycle.service';
import type { ReturnHistoryEntry } from './return-state';

// ----- dữ liệu trả cho web -----

export interface ReturnItemView {
  orderItemId: string;
  productName: string;
  variantName: string;
  image: string | null;
  price: number;
  /** Số đã mua */
  purchasedQuantity: number;
  /** Số trả */
  quantity: number;
  /** Người mua đã trả cho số món trả */
  refundAmount: number;
  /** Shop đã chọn nhập lại kho */
  restocked: boolean;
}

/** Vận đơn trả hàng (GHN lấy ở nhà người mua, giao về shop) */
export interface ReturnShipmentView {
  ghnCode: string | null;
  status: ShipmentStatus;
  fee: number | null;
  /** true = vận đơn MÔ PHỎNG (chưa nối GHN thật) */
  simulated: boolean;
  lastError: string | null;
  /** Các mốc vận chuyển, mới nhất trước (chỉ ở trang chi tiết) */
  tracking?: Array<{ ghnStatus: string; note: string | null; happenedAt: Date }>;
}

export interface ReturnView {
  id: string;
  /** Mã đơn con + "-TH" */
  code: string;
  status: ReturnStatus;
  reason: ReturnReason;
  description: string;
  /** Khóa ảnh bằng chứng; xem qua GET /return-images/{khóa} */
  images: string[];
  orderId: string;
  orderCode: string;
  shopOrderId: string;
  shopOrderCode: string;
  shop: { id: string; name: string; logoUrl: string | null };
  /** Shop và admin thấy */
  buyer?: { id: string; name: string };
  paymentMethod: 'VNPAY' | 'COD';
  items: ReturnItemView[];
  /** Số hoàn tối đa (tổng số người mua đã trả cho các món trả) */
  refundAmount: number;
  /** Số đã quyết hoàn; null khi chưa quyết */
  decidedRefund: number | null;
  refundWithoutReturn: boolean;
  /** Sàn chịu (kiện trả thất lạc), seller không bị trừ */
  platformCovers: boolean;
  refundStatus: string;
  /** Tài khoản nhận tiền hoàn (đơn COD); shop và admin chỉ thấy 4 số cuối */
  bankAccount: { bankName: string; accountNumber: string; accountName: string } | null;
  sellerNote: string | null;
  sellerImages: string[];
  disputeNote: string | null;
  disputeImages: string[];
  disputeStage: 'REQUEST_REJECTED' | 'GOODS_PROBLEM' | null;
  /** Hạn của bước đang chờ */
  deadline: Date | null;
  createdAt: Date;
  resolvedAt: Date | null;
  shipment: ReturnShipmentView | null;
  /** Chỉ ở trang chi tiết: các bước đã qua */
  history?: ReturnHistoryEntry[];
  /** Nút người xem bấm được */
  actions: {
    /** Người mua: hủy yêu cầu */
    canCancel: boolean;
    /** Người mua: khiếu nại khi shop từ chối */
    canDispute: boolean;
    /** Người mua: tạo lại vận đơn trả khi GHN từ chối */
    canRetryShipment: boolean;
    /** Shop: chấp nhận / từ chối */
    canRespond: boolean;
    /** Shop: kiểm hàng trả */
    canInspect: boolean;
    /** Admin hỗ trợ: xác nhận kiện trả thất lạc */
    canConfirmLost: boolean;
    /** Admin hỗ trợ: vận đơn trả lỗi quá hạn, hủy yêu cầu hoặc hoàn tiền không cần gửi trả */
    canResolveFailedShipment: boolean;
  };
}

export interface SellerReturnPage extends Page<ReturnView> {
  /** Số yêu cầu theo từng trạng thái (cho các tab) */
  counts: Record<ReturnStatus, number>;
}

type Viewer = 'BUYER' | 'SELLER' | 'ADMIN';

const STATUSES: ReturnStatus[] = [
  'REQUESTED',
  'REJECTED',
  'DISPUTED',
  'SHIPPING_BACK',
  'RECEIVED',
  'REFUNDING',
  'REFUNDED',
  'CLOSED',
  'CANCELLED',
];

/** Khóa ảnh bằng chứng: return-images/<userId>/<uuid>.<đuôi> */
const IMAGE_KEY = /^return-images\/([0-9a-f-]{36})\/[0-9a-f-]{36}\.(jpg|png|webp)$/;
const IMAGE_FILE = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const include = (detail: boolean) =>
  ({
    items: { include: { orderItem: true }, orderBy: { id: 'asc' } },
    shopOrder: {
      include: {
        order: {
          select: { id: true, code: true, buyerId: true, buyerName: true, paymentMethod: true },
        },
        shop: { select: { id: true, name: true, logoUrl: true, ownerId: true } },
        shipments: {
          where: { type: 'RETURN' },
          ...(detail
            ? {
                include: {
                  history: {
                    orderBy: [{ happenedAt: 'desc' as const }, { createdAt: 'desc' as const }],
                  },
                },
              }
            : {}),
        },
      },
    },
  }) satisfies Prisma.ReturnRequestInclude;

type Row = Prisma.ReturnRequestGetPayload<{ include: ReturnType<typeof include> }>;
type ShipmentRow = Prisma.ShipmentGetPayload<object> & {
  history?: Prisma.ShipmentHistoryGetPayload<object>[];
};

/**
 * Yêu cầu trả hàng cho người mua, shop và admin (RET-01..04, DIS-01). Quyền theo chủ sở hữu kiểm ở đây:
 * người mua chỉ thấy yêu cầu của mình, shop chỉ thấy yêu cầu của shop mình (sai chủ → 404). Các bước chuyển
 * trạng thái nằm ở ReturnLifecycle; vận đơn trả ở ShipmentsService.
 */
@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: ReturnLifecycle,
    private readonly orders: OrderLifecycle,
    private readonly shipments: ShipmentsService,
    private readonly settings: SettingsService,
    private readonly config: AppConfig,
  ) {}

  // ===== Người mua =====

  /**
   * Gửi yêu cầu trả hàng cho một đơn con đã giao, còn hạn (RET-01). Header Idempotency-Key: gửi lại cùng
   * mã thì trả lại yêu cầu đã tạo. Mỗi đơn con tối đa một yêu cầu.
   */
  async create(
    user: AuthUser,
    orderId: string,
    shopOrderId: string,
    dto: CreateReturnDto,
    requestKey: string | undefined,
  ): Promise<ReturnView> {
    if (!requestKey) {
      throw new AppError(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Thiếu mã chống gửi lặp (Idempotency-Key).',
      );
    }
    if (requestKey.length > 64) {
      throw invalid('Idempotency-Key', 'Mã chống gửi lặp dài tối đa 64 ký tự.');
    }
    const replay = await this.findReplay(user.id, requestKey);
    if (replay) return this.buyerDetail(user.id, replay);
    const images = this.checkImages(user, dto.images, 1);
    const picks = dto.items;
    if (new Set(picks.map((p) => p.orderItemId)).size !== picks.length) {
      throw invalid('items', 'Mỗi món chỉ chọn một lần.');
    }
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        await this.orders.lock(tx, orderId);
        const so = await tx.shopOrder.findFirst({
          where: { id: shopOrderId, orderId, order: { buyerId: user.id } },
          include: { order: true, items: true, returnRequest: { select: { id: true } } },
        });
        if (!so) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy đơn hàng.');
        if (so.returnRequest) {
          throw new AppError(
            409,
            'RETURN_EXISTS',
            'Đơn này đã có yêu cầu trả hàng (mỗi đơn chỉ gửi một lần).',
          );
        }
        if (so.status !== 'DELIVERED') {
          throw new AppError(409, 'ORDER_NOT_DELIVERED', 'Đơn chưa giao xong hoặc đã hoàn tất.');
        }
        if (!so.completeBefore || so.completeBefore <= new Date()) {
          throw new AppError(
            409,
            'RETURN_WINDOW_CLOSED',
            'Đã hết hạn yêu cầu trả hàng cho đơn này.',
          );
        }
        for (const p of picks) {
          const line = so.items.find((i) => i.id === p.orderItemId);
          if (!line) throw invalid('items', 'Món hàng không thuộc đơn này.');
          if (p.quantity > line.quantity - line.returnedQuantity) {
            throw invalid(
              'items',
              `"${line.productName}" chỉ trả tối đa ${line.quantity - line.returnedQuantity} món.`,
            );
          }
        }
        const cod = so.order.paymentMethod === 'COD';
        if (cod && !dto.bankAccount) {
          throw invalid(
            'bankAccount',
            'Đơn thanh toán khi nhận hàng: vui lòng nhập tài khoản nhận tiền hoàn.',
          );
        }
        const amounts = returnAmounts(
          so.items.map((i) => ({
            id: i.id,
            price: i.price,
            quantity: i.quantity,
            discount: i.discount,
          })),
          so.shopDiscount,
          picks,
        );
        const ret = await this.lifecycle.request(
          tx,
          {
            code: `${so.code}-TH`,
            shopOrderId: so.id,
            orderId: so.orderId,
            shopId: so.shopId,
            buyerId: user.id,
            reason: dto.reason,
            description: dto.description,
            images,
            refundAmount: amounts.refundAmount,
            sellerBase: amounts.sellerBase,
            bankAccount: cod ? dto.bankAccount! : null,
            requestKey,
            items: amounts.items,
          },
          buyerActor(user),
        );
        return ret.id;
      });
    } catch (e) {
      // Bấm hai lần cùng lúc: lần sau đụng mã Idempotency-Key của lần trước
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await this.findReplay(user.id, requestKey);
        if (again) return this.buyerDetail(user.id, again);
      }
      throw e;
    }
    return this.buyerDetail(user.id, id);
  }

  async buyerList(user: AuthUser, q: ReturnsQuery): Promise<Page<ReturnView>> {
    const where: Prisma.ReturnRequestWhereInput = { buyerId: user.id, ...filter(q) };
    return this.page(where, q, 'BUYER', [{ createdAt: 'desc' }, { id: 'desc' }]);
  }

  async buyerDetail(userId: string, returnId: string): Promise<ReturnView> {
    const row = await this.prisma.returnRequest.findFirst({
      where: { id: returnId, buyerId: userId },
      include: include(true),
    });
    if (!row) throw notFound();
    return view(row, 'BUYER', true);
  }

  /** Hủy yêu cầu khi shop chưa trả lời, hoặc khi GHN chưa lấy hàng trả (hủy vận đơn trả trước) */
  async buyerCancel(user: AuthUser, returnId: string): Promise<ReturnView> {
    const ret = await this.prisma.returnRequest.findFirst({
      where: { id: returnId, buyerId: user.id },
    });
    if (!ret) throw notFound();
    if (ret.status !== 'REQUESTED' && ret.status !== 'SHIPPING_BACK') throw notCancellable();
    const carrierDone =
      ret.status === 'SHIPPING_BACK'
        ? await this.shipments.cancelAtCarrier(ret.shopOrderId, 'RETURN')
        : false;
    await this.prisma.$transaction(async (tx) => {
      const fresh = await this.lifecycle.load(tx, returnId);
      const done =
        fresh &&
        (await this.lifecycle.cancel(
          tx,
          fresh,
          buyerActor(user),
          'Người mua hủy yêu cầu trả hàng',
          carrierDone,
        ));
      if (!done) throw notCancellable();
    });
    return this.buyerDetail(user.id, returnId);
  }

  /** Khiếu nại khi shop từ chối (DIS-01): còn hạn, gửi lời trình bày và ảnh cho admin hỗ trợ */
  async buyerDispute(user: AuthUser, returnId: string, dto: DisputeReturnDto): Promise<ReturnView> {
    const images = this.checkImages(user, dto.images ?? [], 0);
    await this.buyerAction(user, returnId, async (tx, ret) => {
      if (!(await this.lifecycle.dispute(tx, ret, buyerActor(user), dto.statement, images))) {
        throw new AppError(
          409,
          'RETURN_NOT_DISPUTABLE',
          'Yêu cầu không ở trạng thái khiếu nại được hoặc đã hết hạn khiếu nại.',
        );
      }
    });
    return this.buyerDetail(user.id, returnId);
  }

  /** Tạo lại vận đơn trả khi GHN đã từ chối; tính lại hạn giao hàng trả từ lúc này */
  async buyerRetryShipment(user: AuthUser, returnId: string): Promise<ReturnView> {
    const days = await this.settings.get(MarketSetting.returnShipDays);
    const ret = await this.buyerAction(user, returnId, async (tx, r) => {
      const sh = await tx.shipment.findUnique({
        where: { shopOrderId_type: { shopOrderId: r.shopOrderId, type: 'RETURN' } },
      });
      if (r.status !== 'SHIPPING_BACK' || sh?.status !== 'CREATE_FAILED') {
        throw new AppError(
          409,
          'SHIPMENT_NOT_RETRYABLE',
          'Vận đơn không ở trạng thái tạo lại được.',
        );
      }
      await tx.returnRequest.update({
        where: { id: r.id },
        data: { deadline: new Date(Date.now() + days * 86_400_000) },
      });
    });
    await this.shipments.retry(ret.shopOrderId, 'RETURN');
    return this.buyerDetail(user.id, returnId);
  }

  // ===== Người bán =====

  async sellerList(user: AuthUser, q: ReturnsQuery): Promise<SellerReturnPage> {
    const shop = await requireSellerShop(this.prisma, user.id);
    const where: Prisma.ReturnRequestWhereInput = { shopId: shop.id, ...filter(q) };
    const orderBy: Prisma.ReturnRequestOrderByWithRelationInput[] =
      q.status === 'REQUESTED' || q.status === 'RECEIVED'
        ? [{ deadline: 'asc' }, { id: 'asc' }]
        : [{ createdAt: 'desc' }, { id: 'desc' }];
    const [page, grouped] = await Promise.all([
      this.page(where, q, 'SELLER', orderBy),
      this.prisma.returnRequest.groupBy({
        by: ['status'],
        where: { shopId: shop.id },
        _count: { _all: true },
      }),
    ]);
    const counts = Object.fromEntries(
      STATUSES.map((s) => [s, grouped.find((g) => g.status === s)?._count._all ?? 0]),
    ) as Record<ReturnStatus, number>;
    return { ...page, counts };
  }

  async sellerDetail(user: AuthUser, returnId: string): Promise<ReturnView> {
    const shop = await requireSellerShop(this.prisma, user.id);
    const row = await this.prisma.returnRequest.findFirst({
      where: { id: returnId, shopId: shop.id },
      include: include(true),
    });
    if (!row) throw notFound();
    return view(row, 'SELLER', true);
  }

  /** Chấp nhận: tạo vận đơn trả (gọi GHN sau giao dịch), hoặc hoàn tiền ngay không cần gửi trả */
  async sellerAccept(user: AuthUser, returnId: string, dto: AcceptReturnDto): Promise<ReturnView> {
    let shipping = false;
    const ret = await this.sellerAction(user, returnId, async (tx, r) => {
      const result = await this.lifecycle.accept(tx, r, sellerActor(user), dto.refundWithoutReturn);
      if (!result) throw notPending();
      shipping = result === 'SHIPPING';
    });
    if (shipping) await this.shipments.create(ret.shopOrderId, 'RETURN');
    return this.sellerDetail(user, returnId);
  }

  /** Từ chối có lý do (và ảnh nếu có): người mua còn khiếu nại được tới hạn */
  async sellerReject(user: AuthUser, returnId: string, dto: RejectReturnDto): Promise<ReturnView> {
    const images = this.checkImages(user, dto.images ?? [], 0);
    await this.sellerAction(user, returnId, async (tx, r) => {
      if (!(await this.lifecycle.reject(tx, r, sellerActor(user), dto.reason, images))) {
        throw notPending();
      }
    });
    return this.sellerDetail(user, returnId);
  }

  /** Kiểm hàng trả: chọn dòng nhập lại kho; hàng đúng → hoàn tiền, không đúng → khiếu nại */
  async sellerInspect(
    user: AuthUser,
    returnId: string,
    dto: InspectReturnDto,
  ): Promise<ReturnView> {
    const problem = dto.result === 'PROBLEM';
    const images = this.checkImages(user, dto.images ?? [], problem ? 1 : 0);
    if (problem && (!dto.note || dto.note.length < 10)) {
      throw invalid('note', 'Vui lòng mô tả hàng trả về không đúng thế nào (ít nhất 10 ký tự).');
    }
    await this.sellerAction(user, returnId, async (tx, r) => {
      const ids = new Set(r.items.map((i) => i.orderItemId));
      if (dto.restockItemIds.some((id) => !ids.has(id))) {
        throw invalid('restockItemIds', 'Chỉ chọn nhập kho các món có trong yêu cầu trả hàng.');
      }
      const done = await this.lifecycle.inspect(tx, r, sellerActor(user), {
        result: dto.result,
        restockItemIds: dto.restockItemIds,
        note: problem ? dto.note! : null,
        images: problem ? images : [],
      });
      if (!done) {
        throw new AppError(
          409,
          'RETURN_NOT_RECEIVED',
          'Hàng trả chưa về tới shop hoặc đã kiểm xong.',
        );
      }
    });
    return this.sellerDetail(user, returnId);
  }

  // ===== Admin (SUPPORT) =====

  async adminList(q: ReturnsQuery): Promise<Page<ReturnView>> {
    return this.page(filter(q), q, 'ADMIN', [{ createdAt: 'desc' }, { id: 'desc' }]);
  }

  async adminDetail(returnId: string): Promise<ReturnView> {
    const row = await this.prisma.returnRequest.findUnique({
      where: { id: returnId },
      include: include(true),
    });
    if (!row) throw notFound();
    return view(row, 'ADMIN', true);
  }

  /** Xác nhận kiện trả bị GHN làm thất lạc: người mua được hoàn đủ, seller không bị trừ. Ghi nhật ký */
  async adminConfirmLost(admin: AuthUser, returnId: string, note: string): Promise<ReturnView> {
    await this.prisma.$transaction(async (tx) => {
      const ret = await this.lifecycle.load(tx, returnId);
      if (!ret) throw notFound();
      const actor: Actor = { type: 'ADMIN', id: admin.id, name: admin.name };
      if (!(await this.lifecycle.confirmLost(tx, ret, actor, note))) {
        throw new AppError(
          409,
          'RETURN_SHIPMENT_NOT_LOST',
          'Vận đơn trả của yêu cầu này không bị GHN báo thất lạc.',
        );
      }
      await writeAudit(tx, {
        actor: admin,
        action: 'CONFIRM_RETURN_LOST',
        targetType: 'RETURN',
        targetId: ret.id,
        reason: note,
        before: { status: ret.status },
        after: { status: 'REFUNDING', refund: ret.refundAmount, platformCovers: true },
      });
    });
    return this.adminDetail(returnId);
  }

  /**
   * Vận đơn trả lỗi quá hạn mà người mua không tạo lại: admin hủy yêu cầu hoặc hoàn tiền không cần gửi
   * trả. Ghi nhật ký
   */
  async adminResolveFailedShipment(
    admin: AuthUser,
    returnId: string,
    dto: ResolveFailedShipmentDto,
  ): Promise<ReturnView> {
    await this.prisma.$transaction(async (tx) => {
      const ret = await this.lifecycle.load(tx, returnId);
      if (!ret) throw notFound();
      const actor: Actor = { type: 'ADMIN', id: admin.id, name: admin.name };
      if (!(await this.lifecycle.resolveFailedShipment(tx, ret, actor, dto.result, dto.note))) {
        throw new AppError(
          409,
          'RETURN_SHIPMENT_NOT_STUCK',
          'Yêu cầu này không có vận đơn trả lỗi đã quá hạn giao hàng.',
        );
      }
      await writeAudit(tx, {
        actor: admin,
        action: 'RESOLVE_RETURN_SHIPMENT_FAILED',
        targetType: 'RETURN',
        targetId: ret.id,
        reason: dto.note,
        before: { status: ret.status },
        after:
          dto.result === 'CANCEL'
            ? { status: 'CANCELLED' }
            : { status: 'REFUNDING', refund: ret.refundAmount },
      });
    });
    return this.adminDetail(returnId);
  }

  // ===== Ảnh bằng chứng =====

  /**
   * Khóa ảnh nếu người gọi được xem: người tải lên, người mua hoặc chủ shop của yêu cầu có ảnh đó, admin
   * hỗ trợ. Người khác → 404 (không lộ là có ảnh).
   */
  async imageKey(user: AuthUser, ownerId: string, file: string): Promise<string> {
    if (!UUID.test(ownerId) || !IMAGE_FILE.test(file)) throw imageNotFound();
    const key = `return-images/${ownerId}/${file}`;
    if (ownerId === user.id || user.permissions.includes('SUPPORT')) return key;
    const ret = await this.prisma.returnRequest.findFirst({
      where: {
        OR: [
          { images: { has: key } },
          { sellerImages: { has: key } },
          { disputeImages: { has: key } },
        ],
        AND: [{ OR: [{ buyerId: user.id }, { shopOrder: { shop: { ownerId: user.id } } }] }],
      },
      select: { id: true },
    });
    if (!ret) throw imageNotFound();
    return key;
  }

  // ----- phần dùng chung -----

  private async page(
    where: Prisma.ReturnRequestWhereInput,
    q: ReturnsQuery,
    viewer: Viewer,
    orderBy: Prisma.ReturnRequestOrderByWithRelationInput[],
  ): Promise<Page<ReturnView>> {
    const [rows, total] = await Promise.all([
      this.prisma.returnRequest.findMany({
        where,
        include: include(false),
        orderBy,
        ...skipTake(q),
      }),
      this.prisma.returnRequest.count({ where }),
    ]);
    return toPage(
      rows.map((r) => view(r, viewer)),
      total,
      q,
    );
  }

  /** Kiểm khóa ảnh: đúng dạng, nằm trong thư mục của chính người gửi, số ảnh trong giới hạn */
  private checkImages(user: AuthUser, keys: string[], min: number): string[] {
    const list = [...new Set(keys)];
    const max = this.config.returnMaxImages;
    if (list.length < min || list.length > max) {
      throw invalid(
        'images',
        min > 0 ? `Vui lòng gửi từ ${min} đến ${max} ảnh.` : `Tối đa ${max} ảnh.`,
      );
    }
    for (const key of list) {
      const m = IMAGE_KEY.exec(key);
      if (!m || m[1] !== user.id) {
        throw new AppError(400, 'INVALID_IMAGE_KEY', 'Ảnh không hợp lệ, bạn tải lại ảnh.');
      }
    }
    return list;
  }

  private async findReplay(userId: string, requestKey: string): Promise<string | null> {
    const found = await this.prisma.returnRequest.findUnique({ where: { requestKey } });
    if (!found) return null;
    if (found.buyerId !== userId) {
      throw new AppError(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'Mã yêu cầu đã được dùng, bạn tải lại trang rồi thử lại.',
      );
    }
    return found.id;
  }

  private async buyerAction(
    user: AuthUser,
    returnId: string,
    fn: (tx: Prisma.TransactionClient, ret: ReturnRow) => Promise<void>,
  ): Promise<ReturnRow> {
    const found = await this.prisma.returnRequest.findFirst({
      where: { id: returnId, buyerId: user.id },
      select: { id: true },
    });
    if (!found) throw notFound();
    return this.prisma.$transaction(async (tx) => {
      const ret = (await this.lifecycle.load(tx, returnId))!;
      await fn(tx, ret);
      return ret;
    });
  }

  private async sellerAction(
    user: AuthUser,
    returnId: string,
    fn: (tx: Prisma.TransactionClient, ret: ReturnRow) => Promise<void>,
  ): Promise<ReturnRow> {
    const shop = await requireSellerShop(this.prisma, user.id);
    const found = await this.prisma.returnRequest.findFirst({
      where: { id: returnId, shopId: shop.id },
      select: { id: true },
    });
    if (!found) throw notFound();
    return this.prisma.$transaction(async (tx) => {
      const ret = (await this.lifecycle.load(tx, returnId))!;
      await fn(tx, ret);
      return ret;
    });
  }
}

// ----- hàm phụ -----

function filter(q: ReturnsQuery): Prisma.ReturnRequestWhereInput {
  const where: Prisma.ReturnRequestWhereInput = {};
  if (q.status) where.status = q.status;
  if (q.q) where.code = { startsWith: q.q.toUpperCase() };
  return where;
}

function maskAccount(n: string): string {
  return `•••• ${n.slice(-4)}`;
}

function shipmentView(rows: ShipmentRow[]): ReturnShipmentView | null {
  const s = rows[0];
  if (!s) return null;
  return {
    ghnCode: s.ghnCode,
    status: s.status,
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

function view(r: Row, viewer: Viewer, detail = false): ReturnView {
  const so = r.shopOrder;
  const shipment = shipmentView(so.shipments as ShipmentRow[]);
  const unpicked =
    !shipment || (RETURN_SHIPMENT_UNPICKED as readonly string[]).includes(shipment.status);
  const buyer = viewer === 'BUYER';
  return {
    id: r.id,
    code: r.code,
    status: r.status,
    reason: r.reason,
    description: r.description,
    images: r.images,
    orderId: so.order.id,
    orderCode: so.order.code,
    shopOrderId: so.id,
    shopOrderCode: so.code,
    shop: { id: so.shop.id, name: so.shop.name ?? so.shopName, logoUrl: so.shop.logoUrl },
    ...(buyer ? {} : { buyer: { id: so.order.buyerId, name: so.order.buyerName } }),
    paymentMethod: so.order.paymentMethod,
    items: r.items.map((ri) => ({
      orderItemId: ri.orderItemId,
      productName: ri.orderItem.productName,
      variantName: ri.orderItem.variantName,
      image: ri.orderItem.image,
      price: ri.orderItem.price,
      purchasedQuantity: ri.orderItem.quantity,
      quantity: ri.quantity,
      refundAmount: ri.refundAmount,
      restocked: ri.restocked,
    })),
    refundAmount: r.refundAmount,
    decidedRefund: r.decidedRefund,
    refundWithoutReturn: r.refundWithoutReturn,
    platformCovers: r.platformCovers,
    refundStatus: r.refundStatus,
    bankAccount:
      r.bankName && r.bankAccountNumber && r.bankAccountName
        ? {
            bankName: r.bankName,
            accountNumber: buyer ? r.bankAccountNumber : maskAccount(r.bankAccountNumber),
            accountName: r.bankAccountName,
          }
        : null,
    sellerNote: r.sellerNote,
    sellerImages: r.sellerImages,
    disputeNote: r.disputeNote,
    disputeImages: r.disputeImages,
    disputeStage: r.disputeStage,
    deadline: r.deadline,
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt,
    shipment,
    ...(detail ? { history: r.history as unknown as ReturnHistoryEntry[] } : {}),
    actions: {
      canCancel: buyer && (r.status === 'REQUESTED' || (r.status === 'SHIPPING_BACK' && unpicked)),
      canDispute: buyer && r.status === 'REJECTED' && !!r.deadline && r.deadline > new Date(),
      canRetryShipment:
        buyer && r.status === 'SHIPPING_BACK' && shipment?.status === 'CREATE_FAILED',
      canRespond: viewer === 'SELLER' && r.status === 'REQUESTED',
      canInspect: viewer === 'SELLER' && r.status === 'RECEIVED',
      canConfirmLost:
        viewer === 'ADMIN' && r.status === 'SHIPPING_BACK' && shipment?.status === 'LOST',
      canResolveFailedShipment: viewer === 'ADMIN' && isFailedShipmentOverdue(r, shipment ?? null),
    },
  };
}

const buyerActor = (u: AuthUser): Actor => ({ type: 'BUYER', id: u.id, name: u.name });
const sellerActor = (u: AuthUser): Actor => ({ type: 'SELLER', id: u.id, name: u.name });

function invalid(field: string, message: string): AppError {
  return new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu chưa hợp lệ.', {
    fields: { [field]: message },
  });
}

function notFound(): AppError {
  return new AppError(404, 'NOT_FOUND', 'Không tìm thấy yêu cầu trả hàng.');
}

function imageNotFound(): AppError {
  return new AppError(404, 'NOT_FOUND', 'Không tìm thấy ảnh.');
}

function notPending(): AppError {
  return new AppError(409, 'RETURN_NOT_PENDING', 'Yêu cầu không còn chờ shop trả lời.');
}

function notCancellable(): AppError {
  return new AppError(409, 'RETURN_NOT_CANCELLABLE', 'Yêu cầu này không còn hủy được.');
}
