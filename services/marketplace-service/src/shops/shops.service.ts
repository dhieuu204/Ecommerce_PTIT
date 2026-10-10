import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { AppError, EventBus, writeAudit, type AuthUser } from '@san/nest-common';
import {
  SHOP_APPLICATION_DECIDED,
  SHOP_APPLICATION_SUBMITTED,
  type BankAccount,
  type GhnAddress,
  type ShopApplicationData,
  type ShopApplicationDecidedPayload,
  type ShopApplicationSubmittedPayload,
} from '@san/shared';
import { LocationsService } from '../locations/locations.service';
import { PrismaService } from '../prisma.service';
import { StorageService } from '../uploads/storage.service';
import { shopLogoPrefix } from '../uploads/uploads.controller';
import { Prisma, type Shop, type ShopApplication } from '../../generated/prisma';
import type {
  ChangeRequestDto,
  PickupAddressDto,
  ShopApplicationDto,
  UpdateShopDto,
} from './dto/shop.dto';

/** Thông tin shop đang dùng */
export interface ShopView {
  id: string;
  status: Shop['status'];
  name: string | null;
  description: string | null;
  logoUrl: string | null;
  phone: string | null;
  pickupAddress: {
    provinceId: number;
    districtId: number;
    wardCode: string;
    street: string;
    /** Địa chỉ đầy đủ bằng chữ */
    fullText: string;
  } | null;
  /** Chỉ chủ shop xem; web chỉ hiện 4 số cuối */
  bankAccount: BankAccount | null;
  createdAt: Date;
}

/** Một hồ sơ đã nộp, rút gọn cho trang "Shop của tôi" */
export interface ApplicationView {
  version: number;
  type: ShopApplication['type'];
  status: ShopApplication['status'];
  rejectReason: string | null;
  submittedAt: Date;
  decidedAt: Date | null;
  /** Chỉ với CHANGE: các mục muốn đổi và giá trị mới */
  change?: { fields: Array<'name' | 'bankAccount'>; name?: string; bankAccount?: BankAccount };
}

/** Trang "Shop của tôi" (SHP-01, SHP-03) */
export interface MyShop {
  /** NONE: chưa nộp hồ sơ */
  status: 'NONE' | Shop['status'];
  shop: ShopView | null;
  /** Hồ sơ mở shop mới nhất (kèm lý do nếu bị từ chối) */
  application: ApplicationView | null;
  /** Yêu cầu đổi tên/tài khoản ngân hàng mới nhất (đang chờ, đã duyệt hoặc bị từ chối) */
  changeRequest: ApplicationView | null;
}

/** Dữ liệu lưu trong cột data của hồ sơ CHANGE: hồ sơ đầy đủ + phần muốn đổi */
interface StoredChange {
  fields: Array<'name' | 'bankAccount'>;
  old: { name?: string; bankAccount?: BankAccount };
}
type StoredData = ShopApplicationData & { change?: StoredChange };

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/**
 * Mở shop và hồ sơ shop (SHP-01, SHP-03), áp quyết định duyệt từ approval-service (SHP-02).
 * Mỗi lần nộp là một phiên bản mới; bản mới thay bản cũ đang chờ (REPLACED).
 */
@Injectable()
export class ShopsService implements OnModuleInit {
  private readonly logger = new Logger(ShopsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBus,
    private readonly locations: LocationsService,
    private readonly storage: StorageService,
  ) {}

  onModuleInit(): void {
    this.events.subscribe(SHOP_APPLICATION_DECIDED, (payload, tx: Prisma.TransactionClient) =>
      this.applyDecision(payload, tx),
    );
  }

  async myShop(userId: string): Promise<MyShop> {
    const shop = await this.prisma.shop.findUnique({ where: { ownerId: userId } });
    if (!shop) return { status: 'NONE', shop: null, application: null, changeRequest: null };
    const latest = (type: ShopApplication['type']) =>
      this.prisma.shopApplication.findFirst({
        where: { shopId: shop.id, type },
        orderBy: { version: 'desc' },
      });
    const [application, changeRequest] = await Promise.all([latest('REGISTER'), latest('CHANGE')]);
    return {
      status: shop.status,
      shop: this.view(shop),
      application: application && this.applicationView(application),
      changeRequest: changeRequest && this.applicationView(changeRequest),
    };
  }

  /**
   * Nộp hồ sơ mở shop (lần đầu hoặc nộp lại sau khi bị từ chối). Thông tin ghi luôn vào shop
   * (chưa hoạt động nên không ảnh hưởng gì) để giữ tên shop không cho shop khác lấy.
   */
  async submitApplication(
    user: AuthUser,
    dto: ShopApplicationDto,
    requestKey: string,
  ): Promise<MyShop> {
    const replay = await this.findReplay(user.id, requestKey);
    if (replay) return replay;

    this.checkLogo(user.id, dto.logoUrl);
    const pickup = await this.resolvePickup(dto.pickupAddress, 'pickupAddress.');
    const data: ShopApplicationData = {
      name: dto.name,
      description: dto.description,
      logoUrl: dto.logoUrl,
      phone: dto.phone,
      pickupAddress: pickup,
      bankAccount: dto.bankAccount,
    };

    try {
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.shop.findUnique({ where: { ownerId: user.id } });
        // Shop bị đình chỉ cũng đã được duyệt: không nộp lại hồ sơ mở shop để thoát đình chỉ
        if (existing?.status === 'ACTIVE' || existing?.status === 'SUSPENDED') {
          throw new AppError(409, 'SHOP_ALREADY_ACTIVE', 'Shop của bạn đã hoạt động.');
        }
        await this.ensureNameFree(tx, dto.name, existing?.id);
        const fields = {
          status: 'PENDING' as const,
          ...this.shopColumns(data),
        };
        const shop = existing
          ? await tx.shop.update({ where: { id: existing.id }, data: fields })
          : await tx.shop.create({ data: { ownerId: user.id, ...fields } });
        await this.createApplication(tx, user, shop.id, 'REGISTER', data, requestKey);
      });
    } catch (e) {
      throw this.mapConflict(e);
    }
    return this.myShop(user.id);
  }

  /** Sửa mô tả, logo, SĐT, địa chỉ lấy hàng: dùng ngay, ghi nhật ký (SHP-03) */
  async update(user: AuthUser, dto: UpdateShopDto): Promise<MyShop> {
    const shop = await this.activeShop(user.id);
    if (dto.logoUrl) this.checkLogo(user.id, dto.logoUrl);
    const changes: Prisma.ShopUpdateInput = {
      description: dto.description,
      logoUrl: dto.logoUrl,
      phone: dto.phone,
    };
    if (dto.pickupAddress) {
      const p = await this.resolvePickup(dto.pickupAddress, 'pickupAddress.');
      Object.assign(changes, this.pickupColumns(p));
    }
    const changed = Object.keys(changes).filter(
      (k) => changes[k as keyof typeof changes] !== undefined,
    ) as Array<keyof Shop>;
    if (changed.length === 0) return this.myShop(user.id);

    await this.prisma.$transaction(async (tx) => {
      const after = await tx.shop.update({ where: { id: shop.id }, data: changes });
      await writeAudit(tx, {
        actor: user,
        action: 'UPDATE_SHOP',
        targetType: 'SHOP',
        targetId: shop.id,
        before: Object.fromEntries(changed.map((k) => [k, shop[k]])),
        after: Object.fromEntries(changed.map((k) => [k, after[k]])),
      });
    });
    return this.myShop(user.id);
  }

  /**
   * Yêu cầu đổi tên shop và/hoặc tài khoản ngân hàng (SHP-03): phải duyệt lại, shop vẫn bán bằng
   * thông tin cũ. Đang có yêu cầu chờ thì bản mới thay bản cũ.
   */
  async requestChange(user: AuthUser, dto: ChangeRequestDto, requestKey: string): Promise<MyShop> {
    const replay = await this.findReplay(user.id, requestKey);
    if (replay) return replay;

    const shop = await this.activeShop(user.id);
    const current = await this.currentData(shop);
    const fields: StoredChange['fields'] = [];
    const old: StoredChange['old'] = {};
    if (dto.name !== undefined && dto.name !== shop.name) {
      fields.push('name');
      old.name = current.name;
    }
    if (dto.bankAccount && !sameBank(dto.bankAccount, current.bankAccount)) {
      fields.push('bankAccount');
      old.bankAccount = current.bankAccount;
    }
    if (fields.length === 0) {
      throw new AppError(
        400,
        'NOTHING_TO_CHANGE',
        'Bạn chưa đổi tên shop hay tài khoản ngân hàng.',
      );
    }
    const data: StoredData = {
      ...current,
      ...(fields.includes('name') ? { name: dto.name! } : {}),
      ...(fields.includes('bankAccount') ? { bankAccount: dto.bankAccount! } : {}),
      change: { fields, old },
    };

    try {
      await this.prisma.$transaction(async (tx) => {
        if (fields.includes('name')) await this.ensureNameFree(tx, data.name, shop.id);
        await this.createApplication(tx, user, shop.id, 'CHANGE', data, requestKey);
      });
    } catch (e) {
      throw this.mapConflict(e);
    }
    return this.myShop(user.id);
  }

  /**
   * Nhận quyết định từ approval-service. Chỉ áp khi đúng phiên bản đang chờ; khác thì bỏ qua
   * (seller đã nộp bản mới hơn, hoặc sự kiện tới lần hai). Không ném lỗi cho trường hợp nghiệp vụ.
   */
  async applyDecision(
    p: ShopApplicationDecidedPayload,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const app = await tx.shopApplication.findUnique({
      where: { shopId_version: { shopId: p.shopId, version: p.version } },
    });
    if (!app || app.status !== 'PENDING') {
      this.logger.log(`Bỏ qua quyết định shop ${p.shopId} v${p.version}: không còn chờ duyệt.`);
      return;
    }
    let status = p.decision;
    let reason = p.reason;
    const data = app.data as unknown as StoredData;

    if (app.type === 'REGISTER') {
      await tx.shop.update({
        where: { id: p.shopId },
        data: { status: status === 'APPROVED' ? 'ACTIVE' : 'REJECTED' },
      });
    } else if (status === 'APPROVED') {
      const fields = data.change?.fields ?? [];
      const nameTaken =
        fields.includes('name') &&
        (await tx.shop.findFirst({
          where: { id: { not: p.shopId }, name: { equals: data.name, mode: 'insensitive' } },
        }));
      if (nameTaken) {
        // Hiếm: trong lúc chờ duyệt, shop khác đã lấy tên này
        status = 'REJECTED';
        reason = 'Tên shop đã có shop khác dùng trong lúc chờ duyệt. Bạn hãy chọn tên khác.';
        this.logger.warn(`Không áp được tên mới cho shop ${p.shopId}: tên đã có người dùng.`);
      } else {
        await tx.shop.update({
          where: { id: p.shopId },
          data: {
            ...(fields.includes('name') ? { name: data.name } : {}),
            ...(fields.includes('bankAccount') ? this.bankColumns(data.bankAccount) : {}),
          },
        });
      }
    }
    await tx.shopApplication.update({
      where: { id: app.id },
      data: {
        status,
        rejectReason: status === 'REJECTED' ? reason : null,
        decidedAt: new Date(p.decidedAt),
      },
    });
  }

  // ----- phần dùng chung -----

  private async createApplication(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    shopId: string,
    type: ShopApplication['type'],
    data: StoredData,
    requestKey: string,
  ): Promise<void> {
    // Khóa dòng shop: hai lần nộp cùng lúc không lấy trùng số phiên bản
    await tx.$queryRaw`SELECT id FROM shops WHERE id = ${shopId}::uuid FOR UPDATE`;
    const last = await tx.shopApplication.findFirst({
      where: { shopId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (last?.version ?? 0) + 1;
    await tx.shopApplication.updateMany({
      where: { shopId, type, status: 'PENDING' },
      data: { status: 'REPLACED' },
    });
    const app = await tx.shopApplication.create({
      data: { shopId, version, type, data: data as unknown as Prisma.InputJsonObject, requestKey },
    });
    const { change, ...application } = data;
    const payload: ShopApplicationSubmittedPayload = {
      shopId,
      version,
      type,
      owner: { userId: user.id, email: user.email, fullName: user.name },
      data: application,
      ...(change ? { change } : {}),
      submittedAt: app.createdAt.toISOString(),
    };
    await this.events.publish(tx, SHOP_APPLICATION_SUBMITTED, payload);
  }

  /** Gửi lại cùng Idempotency-Key: trả kết quả cũ, không tạo hồ sơ mới */
  private async findReplay(userId: string, requestKey: string): Promise<MyShop | null> {
    const app = await this.prisma.shopApplication.findUnique({
      where: { requestKey },
      include: { shop: { select: { ownerId: true } } },
    });
    if (!app) return null;
    if (app.shop.ownerId !== userId) {
      throw new AppError(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'Mã yêu cầu đã được dùng, bạn tải lại trang rồi thử lại.',
      );
    }
    return this.myShop(userId);
  }

  private async activeShop(userId: string): Promise<Shop> {
    const shop = await this.prisma.shop.findUnique({ where: { ownerId: userId } });
    if (!shop) throw new AppError(404, 'NOT_FOUND', 'Bạn chưa có shop.');
    if (shop.status !== 'ACTIVE') {
      throw new AppError(409, 'SHOP_NOT_ACTIVE', 'Shop chưa được duyệt nên chưa sửa được.');
    }
    return shop;
  }

  /** Tên shop không trùng (không phân biệt hoa thường) với shop khác */
  private async ensureNameFree(tx: Prisma.TransactionClient, name: string, myShopId?: string) {
    const other = await tx.shop.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(myShopId ? { id: { not: myShopId } } : {}),
      },
      select: { id: true },
    });
    if (other)
      throw new AppError(409, 'SHOP_NAME_TAKEN', 'Tên shop đã có người dùng, bạn chọn tên khác.');
  }

  /** Logo phải là ảnh chính người này đã tải lên (POST /uploads/shop-logo) */
  private checkLogo(userId: string, url: string): void {
    if (!url.startsWith(this.storage.publicUrl(shopLogoPrefix(userId)))) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu chưa hợp lệ.', {
        fields: { logoUrl: 'Logo phải là ảnh bạn tải lên ở bước chọn logo.' },
      });
    }
  }

  private async resolvePickup(dto: PickupAddressDto, prefix: string): Promise<GhnAddress> {
    const names = await this.locations.resolve(
      dto.provinceId,
      dto.districtId,
      dto.wardCode,
      prefix,
    );
    return { ...names, street: dto.street };
  }

  private mapConflict(e: unknown): unknown {
    if (isUniqueViolation(e)) {
      const target = String((e as Prisma.PrismaClientKnownRequestError).meta?.target ?? '');
      if (target.includes('name')) {
        return new AppError(
          409,
          'SHOP_NAME_TAKEN',
          'Tên shop đã có người dùng, bạn chọn tên khác.',
        );
      }
      return new AppError(409, 'CONFLICT', 'Có thao tác khác vừa chạy cùng lúc, bạn thử lại.');
    }
    return e;
  }

  private shopColumns(d: ShopApplicationData) {
    return {
      name: d.name,
      description: d.description,
      logoUrl: d.logoUrl,
      phone: d.phone,
      ...this.pickupColumns(d.pickupAddress),
      ...this.bankColumns(d.bankAccount),
    };
  }

  private pickupColumns(a: GhnAddress) {
    return {
      pickupProvinceId: a.provinceId,
      pickupDistrictId: a.districtId,
      pickupWardCode: a.wardCode,
      pickupStreet: a.street,
      pickupAddress: `${a.street}, ${a.wardName}, ${a.districtName}, ${a.provinceName}`,
    };
  }

  private bankColumns(b: BankAccount) {
    return {
      bankName: b.bankName,
      bankAccountNumber: b.accountNumber,
      bankAccountName: b.accountName,
    };
  }

  /** Hồ sơ hiện tại của shop đang hoạt động, dạng gửi trong sự kiện (tên tỉnh/huyện/xã tra lại) */
  private async currentData(shop: Shop): Promise<ShopApplicationData> {
    const pickup = await this.resolvePickup(
      {
        provinceId: shop.pickupProvinceId!,
        districtId: shop.pickupDistrictId!,
        wardCode: shop.pickupWardCode!,
        street: shop.pickupStreet ?? '',
      },
      'pickupAddress.',
    );
    return {
      name: shop.name!,
      description: shop.description ?? '',
      logoUrl: shop.logoUrl,
      phone: shop.phone ?? '',
      pickupAddress: pickup,
      bankAccount: {
        bankName: shop.bankName!,
        accountNumber: shop.bankAccountNumber!,
        accountName: shop.bankAccountName!,
      },
    };
  }

  private view(shop: Shop): ShopView {
    return {
      id: shop.id,
      status: shop.status,
      name: shop.name,
      description: shop.description,
      logoUrl: shop.logoUrl,
      phone: shop.phone,
      pickupAddress:
        shop.pickupProvinceId && shop.pickupDistrictId && shop.pickupWardCode
          ? {
              provinceId: shop.pickupProvinceId,
              districtId: shop.pickupDistrictId,
              wardCode: shop.pickupWardCode,
              street: shop.pickupStreet ?? '',
              fullText: shop.pickupAddress ?? '',
            }
          : null,
      bankAccount: shop.bankName
        ? {
            bankName: shop.bankName,
            accountNumber: shop.bankAccountNumber ?? '',
            accountName: shop.bankAccountName ?? '',
          }
        : null,
      createdAt: shop.createdAt,
    };
  }

  private applicationView(app: ShopApplication): ApplicationView {
    const data = app.data as unknown as StoredData;
    return {
      version: app.version,
      type: app.type,
      status: app.status,
      rejectReason: app.rejectReason,
      submittedAt: app.createdAt,
      decidedAt: app.decidedAt,
      ...(data.change
        ? {
            change: {
              fields: data.change.fields,
              ...(data.change.fields.includes('name') ? { name: data.name } : {}),
              ...(data.change.fields.includes('bankAccount')
                ? { bankAccount: data.bankAccount }
                : {}),
            },
          }
        : {}),
    };
  }
}

function sameBank(a: BankAccount, b: BankAccount): boolean {
  return (
    a.bankName === b.bankName &&
    a.accountNumber === b.accountNumber &&
    a.accountName === b.accountName
  );
}
