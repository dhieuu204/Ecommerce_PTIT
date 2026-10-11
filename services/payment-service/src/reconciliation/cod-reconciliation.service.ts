import { Injectable, Logger } from '@nestjs/common';
import {
  AppError,
  skipTake,
  toPage,
  writeAudit,
  type AuthUser,
  type PageQuery,
} from '@san/nest-common';
import type { Page } from '@san/shared';
import { createHash, randomUUID } from 'node:crypto';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma.service';
import { ReceiptStorage } from '../refunds/receipt-storage.service';
import { WalletService } from '../wallet/wallet.service';
import {
  Prisma,
  type CodReconciliation,
  type CodReconciliationItem,
  type ReconcileResult,
} from '../../generated/prisma';
import { buildCodFile, CodFileError, readCodFile, type CodFileRow } from './cod-file';

type Tx = Prisma.TransactionClient;

export const COD_FILE_MAX_MB = 5;

export interface ReconciliationView {
  id: string;
  fileName: string;
  uploadedByName: string;
  totalRows: number;
  matched: number;
  mismatched: number;
  duplicated: number;
  notFound: number;
  notDelivered: number;
  totalCod: number;
  createdAt: Date;
}

export interface ReconciliationItemView {
  id: string;
  rowNumber: number;
  ghnCode: string;
  shopOrderId: string | null;
  shopOrderCode: string | null;
  /** Theo file GHN */
  codAmount: number;
  shipFee: number;
  returnFee: number;
  /** Theo sàn */
  expectedCod: number | null;
  buyerShippingFee: number | null;
  /** Tiền COD theo GHN trừ theo sàn (khác 0 = lệch) */
  codDifference: number | null;
  /** Phí ship đã thu của người mua trừ phí GHN và phí hoàn: âm = sàn chịu phần chênh */
  shippingDifference: number | null;
  result: ReconcileResult;
  resolution: CodReconciliationItem['resolution'];
  note: string | null;
  resolvedAt: Date | null;
}

export interface ReconciliationDetail extends ReconciliationView {
  items: ReconciliationItemView[];
}

/**
 * Đối soát COD với GHN (COD-02, SHIP-05). Admin tài chính tải file GHN chuyển tiền; mỗi dòng khớp mã vận
 * đơn và số tiền thì tiền COD của đơn con coi là đã về sàn và được xét chuyển sang khả dụng. Mỗi file chỉ
 * nhập một lần; vận đơn đã đối soát thì ghi "trùng", không cộng lần nữa.
 */
@Injectable()
export class CodReconciliationService {
  private readonly logger = new Logger(CodReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly wallet: WalletService,
    private readonly storage: ReceiptStorage,
  ) {}

  async upload(
    admin: AuthUser,
    file: { originalname: string; buffer: Buffer; size: number },
  ): Promise<ReconciliationDetail> {
    if (file.size > COD_FILE_MAX_MB * 1024 * 1024) {
      throw new AppError(400, 'FILE_TOO_LARGE', `File tối đa ${COD_FILE_MAX_MB} MB.`);
    }
    const ext = file.originalname.toLowerCase().split('.').pop();
    if (ext !== 'xlsx' && ext !== 'csv') {
      throw new AppError(400, 'INVALID_RECONCILIATION_FILE', 'Chỉ nhận file .xlsx hoặc .csv.');
    }
    let rows: CodFileRow[];
    try {
      rows = await readCodFile(file.buffer);
    } catch (e) {
      if (e instanceof CodFileError) {
        throw new AppError(400, 'INVALID_RECONCILIATION_FILE', e.message);
      }
      throw e;
    }
    const fileHash = createHash('sha256').update(file.buffer).digest('hex');
    if (await this.prisma.codReconciliation.findUnique({ where: { fileHash } })) {
      throw alreadyImported();
    }
    const fileKey = `cod-reconciliations/${randomUUID()}.${ext}`;
    try {
      await this.storage.put(
        fileKey,
        file.buffer,
        ext === 'csv'
          ? 'text/csv'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    } catch (e) {
      this.logger.error(`Không lưu được file đối soát: ${(e as Error).message}`);
      throw new AppError(503, 'STORAGE_UNAVAILABLE', 'Chưa lưu được file, bạn thử lại sau.');
    }

    try {
      const id = await this.prisma.$transaction(
        (tx) => this.importRows(tx, admin, file.originalname, fileKey, fileHash, rows),
        { timeout: 120_000 },
      );
      return this.detail(id);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw alreadyImported();
      }
      throw e;
    }
  }

  private async importRows(
    tx: Tx,
    admin: AuthUser,
    fileName: string,
    fileKey: string,
    fileHash: string,
    rows: CodFileRow[],
  ): Promise<string> {
    const rec = await tx.codReconciliation.create({
      data: {
        fileName: fileName.slice(0, 200),
        fileKey,
        fileHash,
        uploadedBy: admin.id,
        uploadedByName: admin.name.slice(0, 100),
        totalRows: rows.length,
        matched: 0,
        mismatched: 0,
        duplicated: 0,
        notFound: 0,
        notDelivered: 0,
        totalCod: rows.reduce((a, r) => a + r.codAmount, 0),
      },
    });
    const counts: Record<ReconcileResult, number> = {
      MATCHED: 0,
      MISMATCHED: 0,
      DUPLICATE: 0,
      NOT_FOUND: 0,
      NOT_DELIVERED: 0,
    };
    const seen = new Set<string>();
    const now = new Date();
    for (const r of rows) {
      const e0 = await tx.sellerEarning.findFirst({ where: { ghnCode: r.ghnCode } });
      if (e0) await this.payments.lock(tx, e0.orderId);
      const e = e0 && (await tx.sellerEarning.findUniqueOrThrow({ where: { id: e0.id } }));
      let result: ReconcileResult;
      if (!e) result = 'NOT_FOUND';
      else if (!e.deliveredAt) result = 'NOT_DELIVERED';
      else if (seen.has(r.ghnCode) || (await this.reconciledBefore(tx, e, r.ghnCode))) {
        result = 'DUPLICATE';
      } else if (r.codAmount === e.codAmount) result = 'MATCHED';
      else result = 'MISMATCHED';
      seen.add(r.ghnCode);
      counts[result]++;

      await tx.codReconciliationItem.create({
        data: {
          reconciliationId: rec.id,
          rowNumber: r.rowNumber,
          ghnCode: r.ghnCode,
          codAmount: r.codAmount,
          shipFee: r.shipFee,
          returnFee: r.returnFee,
          shopOrderId: e?.shopOrderId ?? null,
          expectedCod: e?.codAmount ?? null,
          buyerShippingFee: e?.shippingFee ?? null,
          result,
        },
      });
      if (result === 'MATCHED' && e) await this.moneyReceived(tx, e.shopOrderId, now);
    }
    await tx.codReconciliation.update({
      where: { id: rec.id },
      data: {
        matched: counts.MATCHED,
        mismatched: counts.MISMATCHED,
        duplicated: counts.DUPLICATE,
        notFound: counts.NOT_FOUND,
        notDelivered: counts.NOT_DELIVERED,
      },
    });
    await writeAudit(tx, {
      actor: admin,
      action: 'IMPORT_COD_RECONCILIATION',
      targetType: 'COD_RECONCILIATION',
      targetId: rec.id,
      reason: null,
      after: { fileName, totalRows: rows.length, ...counts },
    });
    return rec.id;
  }

  /** Vận đơn đã được đối soát ở file trước (dòng khớp hoặc dòng lệch đã chấp nhận), hoặc tiền COD đã về */
  private async reconciledBefore(
    tx: Tx,
    e: { paymentMethod: string; moneyReceivedAt: Date | null },
    ghnCode: string,
  ): Promise<boolean> {
    if (e.paymentMethod === 'COD' && e.moneyReceivedAt) return true;
    const prior = await tx.codReconciliationItem.findFirst({
      where: { ghnCode, OR: [{ result: 'MATCHED' }, { resolution: 'ACCEPTED' }] },
      select: { id: true },
    });
    return Boolean(prior);
  }

  /** Tiền COD của đơn con đã về sàn: ghi mốc, xét chuyển sang khả dụng (đơn trả trước không đổi gì) */
  private async moneyReceived(tx: Tx, shopOrderId: string, at: Date): Promise<void> {
    const { count } = await tx.sellerEarning.updateMany({
      where: { shopOrderId, paymentMethod: 'COD', moneyReceivedAt: null },
      data: { moneyReceivedAt: at },
    });
    if (count > 0) await this.wallet.tryRelease(tx, shopOrderId, at);
  }

  /** Xử lý dòng lệch: chấp nhận số GHN (coi tiền đã về) hoặc chỉ ghi chú. Ghi nhật ký */
  async resolve(
    admin: AuthUser,
    itemId: string,
    dto: { accept: boolean; note: string },
  ): Promise<ReconciliationItemView> {
    const item0 = await this.prisma.codReconciliationItem.findUnique({ where: { id: itemId } });
    if (!item0) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy dòng đối soát.');
    await this.prisma.$transaction(async (tx) => {
      const e = item0.shopOrderId
        ? await tx.sellerEarning.findUnique({ where: { shopOrderId: item0.shopOrderId } })
        : null;
      if (e) await this.payments.lock(tx, e.orderId);
      const item = await tx.codReconciliationItem.findUniqueOrThrow({ where: { id: itemId } });
      if (item.result !== 'MISMATCHED' || item.resolution === 'ACCEPTED') {
        throw new AppError(
          409,
          'ITEM_NOT_MISMATCHED',
          'Dòng này không lệch hoặc đã được chấp nhận.',
        );
      }
      const now = new Date();
      await tx.codReconciliationItem.update({
        where: { id: itemId },
        data: {
          resolution: dto.accept ? 'ACCEPTED' : 'NOTED',
          note: dto.note,
          resolvedBy: admin.id,
          resolvedAt: now,
        },
      });
      if (dto.accept && e) await this.moneyReceived(tx, e.shopOrderId, now);
      await writeAudit(tx, {
        actor: admin,
        action: 'RESOLVE_COD_ITEM',
        targetType: 'COD_RECONCILIATION_ITEM',
        targetId: itemId,
        reason: dto.note,
        before: { resolution: item.resolution },
        after: {
          resolution: dto.accept ? 'ACCEPTED' : 'NOTED',
          ghnCode: item.ghnCode,
          codAmount: item.codAmount,
          expectedCod: item.expectedCod,
        },
      });
    });
    const item = await this.prisma.codReconciliationItem.findUniqueOrThrow({
      where: { id: itemId },
    });
    return (await this.itemViews([item]))[0]!;
  }

  async list(q: PageQuery): Promise<Page<ReconciliationView>> {
    const [rows, total] = await Promise.all([
      this.prisma.codReconciliation.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.codReconciliation.count(),
    ]);
    return toPage(rows.map(view), total, q);
  }

  async detail(id: string): Promise<ReconciliationDetail> {
    const rec = await this.prisma.codReconciliation.findUnique({
      where: { id },
      include: { items: { orderBy: { rowNumber: 'asc' } } },
    });
    if (!rec) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy lần đối soát.');
    return { ...view(rec), items: await this.itemViews(rec.items) };
  }

  /** File Excel mẫu: các cột hệ thống đọc được, một dòng ví dụ */
  async template(): Promise<Buffer> {
    return buildCodFile(
      [
        {
          ghnCode: 'GHNVIDU01',
          clientCode: '261011ABC123-1',
          codAmount: 250_000,
          shipFee: 22_000,
          returnFee: 0,
          deliveredAt: null,
        },
      ],
      'FILE MẪU đối soát COD (xóa dòng ví dụ trước khi dùng)',
    );
  }

  /** File MÔ PHỎNG "GHN chuyển tiền": các đơn COD đã giao chưa đối soát, để demo khi chưa có file thật */
  async simulatedFile(): Promise<Buffer> {
    const rows = await this.prisma.sellerEarning.findMany({
      where: {
        paymentMethod: 'COD',
        deliveredAt: { not: null },
        moneyReceivedAt: null,
        ghnCode: { not: null },
      },
      orderBy: { deliveredAt: 'asc' },
      take: 1000,
    });
    return buildCodFile(
      rows.map((e) => ({
        ghnCode: e.ghnCode!,
        clientCode: e.shopOrderCode,
        codAmount: e.codAmount,
        shipFee: e.carrierFee ?? e.shippingFee,
        returnFee: 0,
        deliveredAt: e.deliveredAt,
      })),
      `MÔ PHỎNG - GHN chuyển tiền COD (${new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })})`,
    );
  }

  private async itemViews(items: CodReconciliationItem[]): Promise<ReconciliationItemView[]> {
    const ids = items.flatMap((i) => (i.shopOrderId ? [i.shopOrderId] : []));
    const codes = new Map(
      (
        await this.prisma.sellerEarning.findMany({
          where: { shopOrderId: { in: ids } },
          select: { shopOrderId: true, shopOrderCode: true },
        })
      ).map((e) => [e.shopOrderId, e.shopOrderCode]),
    );
    return items.map((i) => ({
      id: i.id,
      rowNumber: i.rowNumber,
      ghnCode: i.ghnCode,
      shopOrderId: i.shopOrderId,
      shopOrderCode: i.shopOrderId ? (codes.get(i.shopOrderId) ?? null) : null,
      codAmount: i.codAmount,
      shipFee: i.shipFee,
      returnFee: i.returnFee,
      expectedCod: i.expectedCod,
      buyerShippingFee: i.buyerShippingFee,
      codDifference: i.expectedCod === null ? null : i.codAmount - i.expectedCod,
      shippingDifference:
        i.buyerShippingFee === null ? null : i.buyerShippingFee - i.shipFee - i.returnFee,
      result: i.result,
      resolution: i.resolution,
      note: i.note,
      resolvedAt: i.resolvedAt,
    }));
  }
}

function view(r: CodReconciliation): ReconciliationView {
  return {
    id: r.id,
    fileName: r.fileName,
    uploadedByName: r.uploadedByName,
    totalRows: r.totalRows,
    matched: r.matched,
    mismatched: r.mismatched,
    duplicated: r.duplicated,
    notFound: r.notFound,
    notDelivered: r.notDelivered,
    totalCod: r.totalCod,
    createdAt: r.createdAt,
  };
}

function alreadyImported(): AppError {
  return new AppError(409, 'FILE_ALREADY_IMPORTED', 'File này đã được nhập trước đó.');
}
