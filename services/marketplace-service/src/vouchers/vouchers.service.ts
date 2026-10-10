import { Injectable } from '@nestjs/common';
import { AppError, skipTake, toPage, writeAudit, type AuthUser } from '@san/nest-common';
import type { Page } from '@san/shared';
import { AppConfig } from '../config';
import { PrismaService } from '../prisma.service';
import { Prisma, type Voucher } from '../../generated/prisma';
import type { ListVouchersQuery, VoucherDto, VoucherState } from './dto/voucher.dto';

/** Voucher trả cho web */
export interface VoucherView {
  id: string;
  /** null = voucher sàn */
  shopId: string | null;
  code: string;
  name: string;
  discountType: Voucher['discountType'];
  /** AMOUNT: số đồng; PERCENT: số % */
  value: number;
  /** Chỉ với PERCENT: giảm tối đa (đồng) */
  maxDiscount: number | null;
  minOrder: number;
  startAt: Date;
  endAt: Date;
  quantity: number;
  perUserLimit: number;
  usedCount: number;
  /** Tính từ thời gian, không lưu */
  state: VoucherState;
  createdAt: Date;
}

/** Cho phép giờ bắt đầu lệch về trước một chút (đồng hồ máy người dùng, thời gian gửi) */
const START_TOLERANCE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

export function voucherState(
  v: Pick<Voucher, 'startAt' | 'endAt'>,
  now = new Date(),
): VoucherState {
  if (now < v.startAt) return 'UPCOMING';
  if (now < v.endAt) return 'RUNNING';
  return 'ENDED';
}

function toView(v: Voucher, now = new Date()): VoucherView {
  return {
    id: v.id,
    shopId: v.shopId,
    code: v.code,
    name: v.name,
    discountType: v.discountType,
    value: v.value,
    maxDiscount: v.maxDiscount,
    minOrder: v.minOrder,
    startAt: v.startAt,
    endAt: v.endAt,
    quantity: v.quantity,
    perUserLimit: v.perUserLimit,
    usedCount: v.usedCount,
    state: voucherState(v, now),
    createdAt: v.createdAt,
  };
}

/** Các cột voucher lấy từ dữ liệu gửi lên (maxDiscount chỉ giữ với PERCENT) */
function columns(dto: VoucherDto) {
  return {
    code: dto.code,
    name: dto.name,
    discountType: dto.discountType,
    value: dto.value,
    maxDiscount: dto.discountType === 'PERCENT' ? (dto.maxDiscount ?? null) : null,
    minOrder: dto.minOrder,
    startAt: dto.startAt,
    endAt: dto.endAt,
    quantity: dto.quantity,
    perUserLimit: dto.perUserLimit,
  };
}

/** Phần "ai làm" của một thao tác: voucher shop (shopId) hoặc voucher sàn (shopId = null, ghi nhật ký) */
export interface VoucherScope {
  shopId: string | null;
  actor: AuthUser;
}

/**
 * Voucher shop và voucher sàn (VCH-01). P2 chỉ tạo và quản lý; áp vào đơn, trừ lượt có ở P3.
 * Trạng thái (sắp diễn ra / đang chạy / đã kết thúc) tính từ startAt, endAt.
 */
@Injectable()
export class VouchersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  /** Shop của seller: phải đã được duyệt (đang hoạt động hoặc bị đình chỉ vẫn quản lý voucher được) */
  async sellerShopId(userId: string): Promise<string> {
    const shop = await this.prisma.shop.findUnique({
      where: { ownerId: userId },
      select: { id: true, status: true },
    });
    if (!shop || (shop.status !== 'ACTIVE' && shop.status !== 'SUSPENDED')) {
      throw new AppError(409, 'SHOP_NOT_ACTIVE', 'Shop của bạn chưa được duyệt.');
    }
    return shop.id;
  }

  async list(shopId: string | null, q: ListVouchersQuery): Promise<Page<VoucherView>> {
    const now = new Date();
    const where: Prisma.VoucherWhereInput = { shopId };
    if (q.state === 'UPCOMING') where.startAt = { gt: now };
    if (q.state === 'RUNNING') Object.assign(where, { startAt: { lte: now }, endAt: { gt: now } });
    if (q.state === 'ENDED') where.endAt = { lte: now };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.voucher.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.voucher.count({ where }),
    ]);
    return toPage(
      items.map((v) => toView(v, now)),
      total,
      q,
    );
  }

  /** Voucher đang chạy và còn lượt của một shop đang hoạt động (trang shop, trang sản phẩm) */
  async publicList(shopId: string): Promise<VoucherView[]> {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { status: true },
    });
    if (!shop || (shop.status !== 'ACTIVE' && shop.status !== 'SUSPENDED')) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy shop.');
    }
    if (shop.status !== 'ACTIVE') return [];
    const now = new Date();
    const items = await this.prisma.voucher.findMany({
      where: {
        shopId,
        startAt: { lte: now },
        endAt: { gt: now },
        usedCount: { lt: this.prisma.voucher.fields.quantity },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return items.map((v) => toView(v, now));
  }

  async create(scope: VoucherScope, dto: VoucherDto): Promise<VoucherView> {
    const data = columns(dto);
    this.validate(data, true);
    try {
      const v = await this.prisma.$transaction(async (tx) => {
        const created = await tx.voucher.create({
          data: { ...data, shopId: scope.shopId, createdBy: scope.actor.id },
        });
        await this.audit(tx, scope, 'CREATE_VOUCHER', created.id, undefined, data);
        return created;
      });
      return toView(v);
    } catch (e) {
      throw mapConflict(e);
    }
  }

  /**
   * Sửa voucher. Chưa bắt đầu: sửa mọi trường. Đang chạy: chỉ lùi giờ kết thúc về sau và tăng số lượt.
   * Đã kết thúc: không sửa. Cập nhật kèm điều kiện thời gian nên voucher vừa đổi trạng thái thì báo lỗi đúng.
   */
  async update(scope: VoucherScope, voucherId: string, dto: VoucherDto): Promise<VoucherView> {
    const v = await this.find(scope.shopId, voucherId);
    const now = new Date();
    const state = voucherState(v, now);
    if (state === 'ENDED') throw endedError();
    const data = columns(dto);

    if (state === 'UPCOMING') {
      this.validate(data, true);
    } else {
      const fixed = [
        'code',
        'name',
        'discountType',
        'value',
        'maxDiscount',
        'minOrder',
        'perUserLimit',
      ] as const;
      const changed =
        fixed.some((k) => data[k] !== v[k]) ||
        data.startAt.getTime() !== v.startAt.getTime() ||
        data.endAt < v.endAt ||
        data.quantity < v.quantity;
      if (changed) {
        throw new AppError(
          409,
          'VOUCHER_STARTED',
          'Voucher đang chạy: chỉ lùi được giờ kết thúc và tăng số lượt.',
        );
      }
      this.validate(data, false);
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.voucher.updateMany({
          where: {
            id: v.id,
            ...(state === 'UPCOMING' ? { startAt: { gt: now } } : { endAt: { gt: now } }),
          },
          data,
        });
        if (count === 0) throw state === 'UPCOMING' ? startedError() : endedError();
        const after = await tx.voucher.findUniqueOrThrow({ where: { id: v.id } });
        await this.audit(tx, scope, 'UPDATE_VOUCHER', v.id, snapshot(v), snapshot(after));
        return after;
      });
      return toView(updated);
    } catch (e) {
      throw mapConflict(e);
    }
  }

  /** Kết thúc sớm: endAt = bây giờ (voucher chưa bắt đầu thì startAt cũng về bây giờ) */
  async end(scope: VoucherScope, voucherId: string): Promise<VoucherView> {
    const v = await this.find(scope.shopId, voucherId);
    const now = new Date();
    if (voucherState(v, now) === 'ENDED') throw endedError();
    const updated = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.voucher.updateMany({
        where: { id: v.id, endAt: { gt: now } },
        data: { endAt: now, ...(v.startAt > now ? { startAt: now } : {}) },
      });
      if (count === 0) throw endedError();
      const after = await tx.voucher.findUniqueOrThrow({ where: { id: v.id } });
      await this.audit(
        tx,
        scope,
        'END_VOUCHER',
        v.id,
        { startAt: v.startAt, endAt: v.endAt },
        { startAt: after.startAt, endAt: after.endAt },
      );
      return after;
    });
    return toView(updated);
  }

  /** Chỉ xóa được voucher chưa bắt đầu */
  async remove(scope: VoucherScope, voucherId: string): Promise<void> {
    const v = await this.find(scope.shopId, voucherId);
    const now = new Date();
    const state = voucherState(v, now);
    if (state === 'RUNNING') throw startedError();
    if (state === 'ENDED') throw endedError();
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.voucher.deleteMany({ where: { id: v.id, startAt: { gt: now } } });
      if (count === 0) throw startedError();
      await this.audit(tx, scope, 'DELETE_VOUCHER', v.id, snapshot(v), undefined);
    });
  }

  // ----- phần dùng chung -----

  private async find(shopId: string | null, voucherId: string): Promise<Voucher> {
    const v = await this.prisma.voucher.findFirst({ where: { id: voucherId, shopId } });
    if (!v) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy voucher.');
    return v;
  }

  /** Kiểm các quy tắc liên quan nhiều trường; checkStart: giờ bắt đầu phải từ bây giờ trở đi */
  private validate(d: ReturnType<typeof columns>, checkStart: boolean): void {
    const fields: Record<string, string> = {};
    if (d.discountType === 'AMOUNT' && d.value < 1000) {
      fields.value = 'Mức giảm ít nhất 1.000đ.';
    }
    if (d.discountType === 'PERCENT' && d.value > 90) {
      fields.value = 'Giảm theo % chỉ từ 1 đến 90.';
    }
    if (checkStart && d.startAt.getTime() < Date.now() - START_TOLERANCE_MS) {
      fields.startAt = 'Thời gian bắt đầu phải từ bây giờ trở đi.';
    }
    const maxDays = this.config.voucherMaxDays;
    if (d.endAt <= d.startAt) {
      fields.endAt = 'Thời gian kết thúc phải sau lúc bắt đầu.';
    } else if (d.endAt.getTime() - d.startAt.getTime() > maxDays * DAY_MS) {
      fields.endAt = `Voucher chạy tối đa ${maxDays} ngày.`;
    }
    if (Object.keys(fields).length > 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu chưa hợp lệ.', { fields });
    }
  }

  /** Voucher sàn: ghi nhật ký admin. Voucher shop do chủ shop tự quản, không ghi */
  private async audit(
    tx: Prisma.TransactionClient,
    scope: VoucherScope,
    action: string,
    voucherId: string,
    before: object | undefined,
    after: object | undefined,
  ): Promise<void> {
    if (scope.shopId !== null) return;
    await writeAudit(tx, {
      actor: scope.actor,
      action,
      targetType: 'VOUCHER',
      targetId: voucherId,
      before,
      after,
    });
  }
}

/** Các trường voucher ghi vào nhật ký (before/after) */
function snapshot(v: Voucher) {
  return {
    code: v.code,
    name: v.name,
    discountType: v.discountType,
    value: v.value,
    maxDiscount: v.maxDiscount,
    minOrder: v.minOrder,
    startAt: v.startAt,
    endAt: v.endAt,
    quantity: v.quantity,
    perUserLimit: v.perUserLimit,
    usedCount: v.usedCount,
  };
}

function startedError(): AppError {
  return new AppError(409, 'VOUCHER_STARTED', 'Voucher đã bắt đầu chạy.');
}

function endedError(): AppError {
  return new AppError(409, 'VOUCHER_ENDED', 'Voucher đã kết thúc.');
}

function mapConflict(e: unknown): unknown {
  if (isUniqueViolation(e)) {
    return new AppError(409, 'VOUCHER_CODE_TAKEN', 'Mã voucher đã có trên sàn, bạn chọn mã khác.');
  }
  return e;
}
