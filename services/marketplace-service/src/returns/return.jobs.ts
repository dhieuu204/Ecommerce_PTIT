import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventBus, JobService } from '@san/nest-common';
import { DISPUTE_DECIDED } from '@san/shared';
import { SYSTEM } from '../orders/order-lifecycle.service';
import { PrismaService } from '../prisma.service';
import { ShipmentsService } from '../shipping/shipments.service';
import type { Prisma, ReturnStatus } from '../../generated/prisma';
import { ReturnLifecycle } from './return-lifecycle.service';

type Tx = Prisma.TransactionClient;

/**
 * Nhận quyết định tranh chấp từ approval-service và chạy các hạn của yêu cầu trả hàng (STATE-03) mỗi phút
 * bằng pg-boss (nhiều pod vẫn chỉ một pod chạy). Mỗi yêu cầu xử lý trong giao dịch riêng có khóa theo đơn
 * và kiểm lại trạng thái + hạn, nên chạy lại không có tác động mới và không đè lên việc vừa xảy ra.
 */
@Injectable()
export class ReturnJobs implements OnModuleInit {
  private readonly logger = new Logger(ReturnJobs.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobService,
    private readonly events: EventBus,
    private readonly lifecycle: ReturnLifecycle,
    private readonly shipments: ShipmentsService,
  ) {}

  onModuleInit(): void {
    // Vận đơn trả (khi admin quyết "chấp nhận trả hàng") được job shipments-sync gọi GHN tạo sau
    this.events.subscribe(DISPUTE_DECIDED, async (p, tx: Tx) => {
      await this.lifecycle.applyDisputeDecision(tx, p);
    });
    this.jobs.define('returns-timeouts', { cron: '* * * * *' }, async () => {
      await this.responseTimeout();
      await this.disputeTimeout();
      await this.inspectTimeout();
      await this.shipTimeout();
    });
  }

  /**
   * Shop không trả lời đúng hạn: tự chấp nhận và tạo vận đơn trả; lý do "thiếu hàng" thì hoàn tiền ngay
   * không cần gửi trả (không có gì để gửi).
   */
  async responseTimeout(now = new Date()): Promise<number> {
    let done = 0;
    for (const id of await this.due('REQUESTED', now)) {
      const result = await this.prisma.$transaction(async (tx) => {
        const ret = await this.lifecycle.load(tx, id);
        if (!ret || !ret.deadline || ret.deadline >= now) return false;
        return this.lifecycle.accept(
          tx,
          ret,
          SYSTEM,
          ret.reason === 'MISSING',
          ret.reason === 'MISSING'
            ? 'Shop không trả lời đúng hạn: tự chấp nhận, hoàn tiền không cần gửi trả (thiếu hàng)'
            : 'Shop không trả lời đúng hạn: tự chấp nhận, GHN sẽ tới lấy hàng',
        );
      });
      if (!result) continue;
      done++;
      if (result === 'SHIPPING') await this.createShipment(id);
    }
    if (done) this.logger.log(`Tự chấp nhận ${done} yêu cầu trả hàng quá hạn trả lời.`);
    return done;
  }

  /** Shop từ chối mà người mua không khiếu nại trong hạn: đóng, không hoàn */
  async disputeTimeout(now = new Date()): Promise<number> {
    let done = 0;
    for (const id of await this.due('REJECTED', now)) {
      const closed = await this.prisma.$transaction(async (tx) => {
        const ret = await this.lifecycle.load(tx, id);
        return !!ret && (await this.lifecycle.closeUndisputed(tx, ret, now));
      });
      if (closed) done++;
    }
    return done;
  }

  /** Hàng trả đã về mà shop chưa kiểm đúng hạn: tự hoàn tiền, không cộng kho */
  async inspectTimeout(now = new Date()): Promise<number> {
    let done = 0;
    for (const id of await this.due('RECEIVED', now)) {
      const ok = await this.prisma.$transaction(async (tx) => {
        const ret = await this.lifecycle.load(tx, id);
        if (!ret || !ret.deadline || ret.deadline >= now) return false;
        return this.lifecycle.inspect(tx, ret, SYSTEM, {
          result: 'OK',
          restockItemIds: [],
          note: null,
          images: [],
          historyNote: 'Shop chưa kiểm hàng đúng hạn: tự hoàn tiền (không nhập lại kho)',
        });
      });
      if (ok) done++;
    }
    if (done) this.logger.log(`Tự hoàn tiền ${done} yêu cầu trả hàng quá hạn kiểm hàng.`);
    return done;
  }

  /**
   * Quá hạn giao hàng trả mà GHN chưa lấy hàng (vận đơn đã tạo được, hoặc GHN đã hủy): hủy vận đơn với
   * GHN rồi hủy yêu cầu. Vận đơn chưa tạo được (lỗi GHN) thì không hủy: không phải lỗi người mua.
   */
  async shipTimeout(now = new Date()): Promise<number> {
    let done = 0;
    for (const id of await this.dueShippingBack(now)) {
      const ret = await this.prisma.returnRequest.findUniqueOrThrow({ where: { id } });
      const sh = await this.prisma.shipment.findUnique({
        where: { shopOrderId_type: { shopOrderId: ret.shopOrderId, type: 'RETURN' } },
      });
      if (sh && sh.status !== 'READY_TO_PICK' && sh.status !== 'CANCELLED') continue;
      let carrierDone: boolean;
      try {
        carrierDone = await this.shipments.cancelAtCarrier(ret.shopOrderId, 'RETURN');
      } catch (e) {
        this.logger.warn(`Chưa hủy được vận đơn trả ${ret.code}: ${(e as Error).message}`);
        continue;
      }
      const cancelled = await this.prisma.$transaction(async (tx) => {
        const fresh = await this.lifecycle.load(tx, id);
        if (!fresh || !fresh.deadline || fresh.deadline >= now) return false;
        return this.lifecycle.cancel(
          tx,
          fresh,
          SYSTEM,
          'Người mua chưa giao hàng trả cho GHN đúng hạn, yêu cầu tự hủy',
          carrierDone,
        );
      });
      if (cancelled) done++;
    }
    if (done) this.logger.log(`Hủy ${done} yêu cầu trả hàng quá hạn giao hàng trả.`);
    return done;
  }

  private async due(status: ReturnStatus, now: Date): Promise<string[]> {
    const rows = await this.prisma.returnRequest.findMany({
      where: { status, deadline: { lt: now } },
      select: { id: true },
      orderBy: { deadline: 'asc' },
      take: 200,
    });
    return rows.map((r) => r.id);
  }

  /**
   * Yêu cầu "chờ gửi hàng trả" quá hạn mà job hủy được: chưa có vận đơn trả, hoặc vận đơn đã tạo mà GHN
   * chưa lấy (hoặc GHN đã hủy). Lọc ngay trong câu truy vấn để các yêu cầu không hủy được (vận đơn lỗi,
   * đang tạo, đang trên đường về) không chiếm hết lượt 200 dòng mỗi lần chạy.
   */
  private async dueShippingBack(now: Date): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT r.id FROM returns r
      LEFT JOIN shipments s ON s.shop_order_id = r.shop_order_id AND s.type = 'RETURN'
      WHERE r.status = 'SHIPPING_BACK' AND r.deadline < ${now}
        AND (s.id IS NULL OR s.status IN ('READY_TO_PICK', 'CANCELLED'))
      ORDER BY r.deadline ASC
      LIMIT 200`;
    return rows.map((r) => r.id);
  }

  /** Gọi GHN tạo vận đơn trả sau khi giao dịch xong; lỗi thì để job shipments-sync thử lại */
  private async createShipment(returnId: string): Promise<void> {
    const ret = await this.prisma.returnRequest.findUniqueOrThrow({ where: { id: returnId } });
    try {
      await this.shipments.create(ret.shopOrderId, 'RETURN');
    } catch (e) {
      this.logger.warn(`Chưa tạo được vận đơn trả ${ret.code}: ${(e as Error).message}`);
    }
  }
}
