import { Injectable, Logger } from '@nestjs/common';
import { AppError, EventBus, skipTake, toPage, writeAudit, type AuthUser } from '@san/nest-common';
import {
  ADJUSTMENT_APPROVED,
  type AdjustmentExecutedPayload,
  type BankAccount,
  type Page,
  type PlacedShopOrder,
} from '@san/shared';
import { PrismaService } from '../prisma.service';
import { Prisma, type Dispute, type DisputeStatus, type OrderCheck } from '../../generated/prisma';
import type {
  AdjustmentsQuery,
  ApprovalDecisionDto,
  CreateAdjustmentDto,
} from './dto/disputes.dto';

type Tx = Prisma.TransactionClient;

export interface AdjustmentView {
  id: string;
  orderCode: string;
  shopOrderCode: string;
  shop: { id: string; name: string };
  buyer: { id: string; name: string };
  /** Cộng (dương) / trừ (âm) ngăn khả dụng của shop */
  sellerChange: number;
  /** Hoàn thêm cho người mua bằng chuyển khoản */
  buyerRefund: number;
  bankAccount: BankAccount | null;
  reason: string;
  status: DisputeStatus;
  /** Admin lập đề nghị (không được tự duyệt) */
  createdById: string;
  createdByName: string;
  createdAt: Date;
  decisionNote: string | null;
  decidedByName: string | null;
  decidedAt: Date | null;
  /** Kết quả payment-service thực thi (lý do khi không thực thi được) */
  executionNote: string | null;
  executedAt: Date | null;
}

/**
 * Điều chỉnh tiền sau giải ngân (DIS-02): admin tài chính lập đề nghị cho một đơn con (cộng/trừ ngăn khả
 * dụng của shop, hoàn thêm cho người mua), một admin tài chính KHÁC duyệt. approval-service chỉ lưu đề nghị
 * và quyết định; payment-service thực thi nếu còn đủ điều kiện rồi báo lại kết quả. Đơn con, shop, chủ shop,
 * người mua tra từ dữ liệu đơn đã nhận qua order.placed (bảng order_checks), không tin dữ liệu web gửi.
 */
@Injectable()
export class AdjustmentsService {
  private readonly logger = new Logger(AdjustmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBus,
  ) {}

  async create(
    admin: AuthUser,
    dto: CreateAdjustmentDto,
    requestKey: string | undefined,
  ): Promise<AdjustmentView> {
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
    const replay = await this.findReplay(admin, requestKey);
    if (replay) return replay;
    if (dto.sellerChange === 0 && dto.buyerRefund === 0) {
      throw invalid('sellerChange', 'Nhập số tiền cộng/trừ ví seller hoặc số tiền hoàn thêm.');
    }
    if (dto.buyerRefund > 0 && !dto.bankAccount) {
      throw invalid('bankAccount', 'Hoàn thêm cho người mua cần tài khoản ngân hàng nhận tiền.');
    }
    const found = await this.findShopOrder(dto.shopOrderCode);
    if (!found) {
      throw new AppError(404, 'SHOP_ORDER_NOT_FOUND', 'Không tìm thấy đơn con với mã này.');
    }
    const { check, so } = found;
    if (admin.id === so.ownerId || admin.id === check.buyerId) {
      throw new AppError(
        403,
        'SELF_APPROVAL_FORBIDDEN',
        'Bạn là người mua hoặc chủ shop của đơn này nên không được lập điều chỉnh.',
      );
    }
    let id: string;
    try {
      id = await this.createRow(admin, dto, requestKey, check, so);
    } catch (e) {
      // Bấm hai lần cùng lúc: lần sau đụng mã Idempotency-Key của lần trước thì trả lại kết quả cũ
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await this.findReplay(admin, requestKey);
        if (again) return again;
      }
      throw e;
    }
    return this.detail(id);
  }

  /** Đề nghị đã tạo bằng cùng mã chống gửi lặp (chỉ của chính admin này) */
  private async findReplay(admin: AuthUser, requestKey: string): Promise<AdjustmentView | null> {
    const replay = await this.prisma.dispute.findUnique({ where: { requestKey } });
    if (!replay) return null;
    if (replay.createdBy !== admin.id) {
      throw new AppError(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'Mã yêu cầu đã được dùng, bạn tải lại trang rồi thử lại.',
      );
    }
    return view(replay);
  }

  private async createRow(
    admin: AuthUser,
    dto: CreateAdjustmentDto,
    requestKey: string,
    check: OrderCheck,
    so: PlacedShopOrder,
  ): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const d = await tx.dispute.create({
        data: {
          type: 'ADJUSTMENT',
          orderId: check.orderId,
          orderCode: check.orderCode,
          shopOrderId: so.shopOrderId,
          shopOrderCode: so.code,
          shopId: so.shopId,
          shopName: so.shopName,
          ownerId: so.ownerId,
          buyerId: check.buyerId,
          buyerName: check.buyerName,
          sellerChange: dto.sellerChange,
          refundAmount: dto.buyerRefund,
          bankAccount: dto.buyerRefund > 0 ? { ...dto.bankAccount! } : Prisma.JsonNull,
          reason: dto.reason,
          createdBy: admin.id,
          createdByName: admin.name,
          requestKey,
        },
      });
      await writeAudit(tx, {
        actor: admin,
        action: 'CREATE_ADJUSTMENT',
        targetType: 'SHOP_ORDER',
        targetId: so.shopOrderId,
        reason: dto.reason,
        after: { sellerChange: dto.sellerChange, buyerRefund: dto.buyerRefund },
      });
      return d.id;
    });
  }

  async list(q: AdjustmentsQuery): Promise<Page<AdjustmentView>> {
    const where: Prisma.DisputeWhereInput = { type: 'ADJUSTMENT' };
    if (q.status) where.status = q.status;
    const [rows, total] = await Promise.all([
      this.prisma.dispute.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.dispute.count({ where }),
    ]);
    return toPage(rows.map(view), total, q);
  }

  async detail(id: string): Promise<AdjustmentView> {
    const d = await this.prisma.dispute.findFirst({ where: { id, type: 'ADJUSTMENT' } });
    if (!d) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy đề nghị điều chỉnh.');
    return view(d);
  }

  /** Admin tài chính thứ hai duyệt/từ chối; duyệt thì gửi payment-service thực thi. Ghi nhật ký */
  async decide(admin: AuthUser, id: string, dto: ApprovalDecisionDto): Promise<AdjustmentView> {
    if (dto.decision === 'REJECT' && !dto.reason?.trim()) {
      throw invalid('reason', 'Vui lòng nhập lý do không duyệt.');
    }
    await this.prisma.$transaction(async (tx) => {
      const d = await tx.dispute.findFirst({ where: { id, type: 'ADJUSTMENT' } });
      if (!d) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy đề nghị điều chỉnh.');
      if (d.createdBy === admin.id) {
        throw new AppError(
          403,
          'SAME_ADMIN_FORBIDDEN',
          'Người lập đề nghị không được tự duyệt; cần một admin tài chính khác.',
        );
      }
      if (d.ownerId === admin.id || d.buyerId === admin.id) {
        throw new AppError(
          403,
          'SELF_APPROVAL_FORBIDDEN',
          'Bạn là người mua hoặc chủ shop của đơn này nên không được duyệt.',
        );
      }
      const approve = dto.decision === 'APPROVE';
      const now = new Date();
      const { count } = await tx.dispute.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: approve ? 'APPROVED' : 'REJECTED',
          decision: approve ? 'APPROVE' : 'REJECT',
          decisionNote: dto.reason?.trim() || null,
          decidedBy: admin.id,
          decidedByName: admin.name,
          decidedAt: now,
        },
      });
      if (count === 0) throw new AppError(409, 'ALREADY_DECIDED', 'Đề nghị này đã được xử lý.');
      await writeAudit(tx, {
        actor: admin,
        action: approve ? 'APPROVE_ADJUSTMENT' : 'REJECT_ADJUSTMENT',
        targetType: 'SHOP_ORDER',
        targetId: d.shopOrderId,
        reason: dto.reason ?? d.reason,
        before: { status: 'PENDING' },
        after: { status: approve ? 'APPROVED' : 'REJECTED' },
      });
      if (!approve) return;
      await this.events.publish(tx, ADJUSTMENT_APPROVED, {
        adjustmentId: d.id,
        orderId: d.orderId,
        shopOrderId: d.shopOrderId,
        shopOrderCode: d.shopOrderCode,
        shopId: d.shopId,
        sellerChange: d.sellerChange ?? 0,
        buyerRefund: d.refundAmount ?? 0,
        bankAccount: (d.bankAccount as BankAccount | null) ?? null,
        reason: d.reason ?? '',
        createdBy: { userId: d.createdBy!, name: d.createdByName ?? '' },
        approvedBy: { userId: admin.id, name: admin.name },
        approvedAt: now.toISOString(),
      });
    });
    return this.detail(id);
  }

  /** Kết quả thực thi từ payment-service (adjustment.executed) */
  async onExecuted(p: AdjustmentExecutedPayload, tx: Tx): Promise<void> {
    const { count } = await tx.dispute.updateMany({
      where: { id: p.adjustmentId, type: 'ADJUSTMENT', status: 'APPROVED' },
      data: {
        status: p.result === 'APPLIED' ? 'EXECUTED' : 'FAILED',
        executionNote: p.message?.slice(0, 500) ?? null,
        executedAt: new Date(p.executedAt),
      },
    });
    if (count && p.result === 'FAILED') {
      this.logger.warn(`Điều chỉnh ${p.adjustmentId} không thực thi được: ${p.message}`);
    }
  }

  /** Đơn con theo mã, tra trong dữ liệu đơn đã nhận qua order.placed */
  private async findShopOrder(code: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM order_checks
      WHERE data->'shopOrders' @> ${JSON.stringify([{ code }])}::jsonb
      LIMIT 1`;
    if (!rows[0]) return null;
    const check = await this.prisma.orderCheck.findUniqueOrThrow({ where: { id: rows[0].id } });
    const shopOrders = (check.data as { shopOrders?: PlacedShopOrder[] }).shopOrders ?? [];
    const so = shopOrders.find((s) => s.code === code);
    return so ? { check, so } : null;
  }
}

function view(d: Dispute): AdjustmentView {
  return {
    id: d.id,
    orderCode: d.orderCode,
    shopOrderCode: d.shopOrderCode,
    shop: { id: d.shopId, name: d.shopName },
    buyer: { id: d.buyerId, name: d.buyerName },
    sellerChange: d.sellerChange ?? 0,
    buyerRefund: d.refundAmount ?? 0,
    bankAccount: (d.bankAccount as BankAccount | null) ?? null,
    reason: d.reason ?? '',
    status: d.status,
    createdById: d.createdBy ?? '',
    createdByName: d.createdByName ?? '',
    createdAt: d.createdAt,
    decisionNote: d.decisionNote,
    decidedByName: d.decidedByName,
    decidedAt: d.decidedAt,
    executionNote: d.executionNote,
    executedAt: d.executedAt,
  };
}

function invalid(field: string, message: string): AppError {
  return new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu chưa hợp lệ.', {
    fields: { [field]: message },
  });
}
