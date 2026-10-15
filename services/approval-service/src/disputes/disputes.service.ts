import { Injectable, Logger } from '@nestjs/common';
import {
  AppError,
  EventBus,
  SettingsService,
  skipTake,
  toPage,
  writeAudit,
  type AuthUser,
} from '@san/nest-common';
import {
  DISPUTE_DECIDED,
  type DisputeOpenedPayload,
  type Page,
  type PaymentMethod,
  type ReturnReason,
} from '@san/shared';
import { PrismaService } from '../prisma.service';
import { ApprovalSetting } from '../settings';
import type { Dispute, DisputeDecision, DisputeStatus, Prisma } from '../../generated/prisma';
import type { DisputeDecisionDto, DisputesQuery } from './dto/disputes.dto';

type Tx = Prisma.TransactionClient;

/** Hồ sơ trả hàng nhận qua dispute.opened (cột data) */
export interface ReturnData {
  paymentMethod: PaymentMethod;
  reason: ReturnReason;
  description: string;
  images: string[];
  items: DisputeOpenedPayload['items'];
}

export interface DisputeView {
  id: string;
  returnId: string;
  returnCode: string;
  stage: 'REQUEST_REJECTED' | 'GOODS_PROBLEM';
  orderCode: string;
  shopOrderCode: string;
  shop: { id: string; name: string; ownerId: string };
  buyer: { id: string; name: string };
  status: DisputeStatus;
  decision: DisputeDecision | null;
  /** Số hoàn tối đa */
  maxRefund: number;
  /** Số hoàn đã quyết */
  refundAmount: number | null;
  /** Hạn phân xử (chỉ để nhắc) */
  deadline: Date | null;
  overdue: boolean;
  decisionNote: string | null;
  decidedByName: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  /** Chỉ ở trang chi tiết */
  returnData?: ReturnData;
  buyerStatement?: { text: string; images: string[] };
  sellerStatement?: { text: string; images: string[] };
}

/**
 * Tranh chấp trả hàng (DIS-01). approval-service chỉ lưu hồ sơ và quyết định; marketplace nhận
 * dispute.decided rồi tự áp lên yêu cầu trả hàng. Không bao giờ tự quyết khi quá hạn (hạn chỉ để nhắc).
 * Admin là người mua hoặc chủ shop của hồ sơ thì không được quyết.
 */
@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBus,
    private readonly settings: SettingsService,
  ) {}

  /** Nhận hồ sơ tranh chấp (dispute.opened). Nhận trùng (cùng yêu cầu, cùng giai đoạn) thì bỏ qua */
  async onOpened(p: DisputeOpenedPayload, tx: Tx): Promise<void> {
    const hours = await this.settings.get(ApprovalSetting.disputeSlaHours);
    const openedAt = new Date(p.openedAt);
    const data: ReturnData = {
      paymentMethod: p.paymentMethod,
      reason: p.reason,
      description: p.description,
      images: p.images,
      items: p.items,
    };
    const { count } = await tx.dispute.createMany({
      data: [
        {
          type: 'RETURN',
          returnId: p.returnId,
          returnCode: p.returnCode,
          stage: p.stage,
          orderId: p.orderId,
          orderCode: p.orderCode,
          shopOrderId: p.shopOrderId,
          shopOrderCode: p.shopOrderCode,
          shopId: p.shop.shopId,
          shopName: p.shop.name,
          ownerId: p.shop.ownerId,
          buyerId: p.buyer.userId,
          buyerName: p.buyer.name,
          data: data as unknown as Prisma.InputJsonValue,
          buyerStatement: p.buyerStatement.text.slice(0, 1000),
          buyerImages: p.buyerStatement.images,
          sellerStatement: p.sellerStatement.text.slice(0, 1000),
          sellerImages: p.sellerStatement.images,
          maxRefund: p.maxRefundAmount,
          deadline: new Date(openedAt.getTime() + hours * 3_600_000),
        },
      ],
      skipDuplicates: true,
    });
    if (count) this.logger.log(`Tranh chấp mới cho yêu cầu trả hàng ${p.returnCode} (${p.stage}).`);
  }

  async list(q: DisputesQuery): Promise<Page<DisputeView>> {
    const status = q.status ?? 'PENDING';
    const where: Prisma.DisputeWhereInput = { type: 'RETURN', status };
    const [rows, total] = await Promise.all([
      this.prisma.dispute.findMany({
        where,
        // Đang chờ: hạn sớm nhất (quá hạn) lên đầu; đã quyết: mới nhất trước
        orderBy:
          status === 'PENDING'
            ? [{ deadline: 'asc' }, { id: 'asc' }]
            : [{ decidedAt: 'desc' }, { id: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.dispute.count({ where }),
    ]);
    return toPage(
      rows.map((d) => view(d, false)),
      total,
      q,
    );
  }

  async detail(id: string): Promise<DisputeView> {
    const d = await this.prisma.dispute.findFirst({ where: { id, type: 'RETURN' } });
    if (!d) throw notFound();
    return view(d, true);
  }

  /**
   * Admin hỗ trợ phân xử: chấp nhận trả hàng (chỉ giai đoạn shop từ chối), hoàn toàn bộ/một phần, hoặc
   * không hoàn. Cập nhật có điều kiện nên hai admin bấm cùng lúc chỉ một người được. Ghi nhật ký.
   */
  async decide(admin: AuthUser, id: string, dto: DisputeDecisionDto): Promise<DisputeView> {
    await this.prisma.$transaction(async (tx) => {
      const d = await tx.dispute.findFirst({ where: { id, type: 'RETURN' } });
      if (!d) throw notFound();
      if (d.buyerId === admin.id || d.ownerId === admin.id) {
        throw new AppError(
          403,
          'SELF_APPROVAL_FORBIDDEN',
          'Bạn là người mua hoặc chủ shop trong hồ sơ này nên không được tự quyết.',
        );
      }
      if (dto.decision === 'ACCEPT_RETURN' && d.stage !== 'REQUEST_REJECTED') {
        throw invalid('decision', 'Hàng đã về shop: chỉ chọn hoàn tiền hoặc không hoàn.');
      }
      let refundAmount: number | null = null;
      if (dto.decision === 'REFUND') {
        const max = d.maxRefund ?? 0;
        if (!dto.refundAmount || dto.refundAmount > max) {
          throw invalid('refundAmount', `Số tiền hoàn từ 1 tới ${max.toLocaleString('vi-VN')}đ.`);
        }
        refundAmount = dto.refundAmount;
      }
      const now = new Date();
      const { count } = await tx.dispute.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'RESOLVED',
          decision: dto.decision,
          refundAmount,
          decisionNote: dto.note,
          decidedBy: admin.id,
          decidedByName: admin.name,
          decidedAt: now,
        },
      });
      if (count === 0) throw new AppError(409, 'ALREADY_DECIDED', 'Hồ sơ này đã được xử lý.');
      await writeAudit(tx, {
        actor: admin,
        action: 'DECIDE_DISPUTE',
        targetType: 'RETURN',
        targetId: d.returnId!,
        reason: dto.note,
        before: { status: 'PENDING', stage: d.stage },
        after: { decision: dto.decision, refundAmount },
      });
      await this.events.publish(tx, DISPUTE_DECIDED, {
        disputeId: d.id,
        returnId: d.returnId!,
        stage: d.stage!,
        decision: dto.decision,
        refundAmount,
        note: dto.note,
        decidedBy: { userId: admin.id, name: admin.name },
        decidedAt: now.toISOString(),
      });
    });
    return this.detail(id);
  }
}

function view(d: Dispute, detail: boolean): DisputeView {
  return {
    id: d.id,
    returnId: d.returnId!,
    returnCode: d.returnCode ?? '',
    stage: d.stage!,
    orderCode: d.orderCode,
    shopOrderCode: d.shopOrderCode,
    shop: { id: d.shopId, name: d.shopName, ownerId: d.ownerId },
    buyer: { id: d.buyerId, name: d.buyerName },
    status: d.status,
    decision: d.decision,
    maxRefund: d.maxRefund ?? 0,
    refundAmount: d.refundAmount,
    deadline: d.deadline,
    overdue: d.status === 'PENDING' && !!d.deadline && d.deadline < new Date(),
    decisionNote: d.decisionNote,
    decidedByName: d.decidedByName,
    decidedAt: d.decidedAt,
    createdAt: d.createdAt,
    ...(detail
      ? {
          returnData: d.data as unknown as ReturnData,
          buyerStatement: { text: d.buyerStatement ?? '', images: d.buyerImages },
          sellerStatement: { text: d.sellerStatement ?? '', images: d.sellerImages },
        }
      : {}),
  };
}

function invalid(field: string, message: string): AppError {
  return new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu chưa hợp lệ.', {
    fields: { [field]: message },
  });
}

function notFound(): AppError {
  return new AppError(404, 'NOT_FOUND', 'Không tìm thấy hồ sơ tranh chấp.');
}
