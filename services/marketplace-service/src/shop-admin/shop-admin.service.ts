import { Injectable } from '@nestjs/common';
import { AppError, skipTake, toPage } from '@san/nest-common';
import type { BankAccount, Page } from '@san/shared';
import type { Prisma, Shop } from '../../generated/prisma';
import { PrismaService } from '../prisma.service';
import type { ListAdminShopsQuery } from './dto/shop-admin.dto';

/** Một dòng trong danh sách shop của admin */
export interface AdminShopRow {
  id: string;
  name: string;
  logoUrl: string | null;
  /** Chủ shop (userId bên user-service; tên chủ shop xem ở user-service hoặc hồ sơ duyệt) */
  ownerId: string;
  status: 'ACTIVE' | 'SUSPENDED';
  /** Lý do đình chỉ (khi SUSPENDED) */
  suspendReason: string | null;
  /** Tổng số sản phẩm (cả đang bán và đang ẩn) */
  productCount: number;
  /** Ngày hồ sơ mở shop được duyệt */
  approvedAt: Date | null;
  createdAt: Date;
}

/** Chi tiết shop cho admin */
export interface AdminShopDetail extends AdminShopRow {
  description: string | null;
  phone: string | null;
  /** Địa chỉ lấy hàng đầy đủ bằng chữ */
  pickupAddress: string | null;
  /** Số tài khoản chỉ hiện 4 số cuối */
  bankAccount: BankAccount | null;
  /** Số sản phẩm theo trạng thái */
  productCounts: { ACTIVE: number; HIDDEN: number; REMOVED: number };
  /** Thời điểm quyết định đình chỉ/khôi phục gần nhất đã áp */
  moderatedAt: Date | null;
}

const APPROVED_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;

type ShopWithCount = Shop & { _count: { products: number } };

/** Admin xem shop (SHP-04): chỉ đọc dữ liệu shop của marketplace */
@Injectable()
export class ShopAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListAdminShopsQuery): Promise<Page<AdminShopRow>> {
    const where: Prisma.ShopWhereInput = {
      status: q.status ?? { in: [...APPROVED_STATUSES] },
      ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}),
    };
    const [shops, total] = await this.prisma.$transaction([
      this.prisma.shop.findMany({
        where,
        include: { _count: { select: { products: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...skipTake(q),
      }),
      this.prisma.shop.count({ where }),
    ]);
    const approved = await this.approvedAt(shops.map((s) => s.id));
    return toPage(
      shops.map((s) => this.row(s, approved.get(s.id) ?? null)),
      total,
      q,
    );
  }

  async detail(shopId: string): Promise<AdminShopDetail> {
    const shop = await this.prisma.shop.findFirst({
      where: { id: shopId, status: { in: [...APPROVED_STATUSES] } },
      include: { _count: { select: { products: true } } },
    });
    if (!shop) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy shop.');
    const [approved, byStatus] = await Promise.all([
      this.approvedAt([shop.id]),
      this.prisma.product.groupBy({ by: ['status'], where: { shopId }, _count: true }),
    ]);
    const productCounts = { ACTIVE: 0, HIDDEN: 0, REMOVED: 0 };
    for (const g of byStatus) productCounts[g.status] = g._count;
    return {
      ...this.row(shop, approved.get(shop.id) ?? null),
      description: shop.description,
      phone: shop.phone,
      pickupAddress: shop.pickupAddress,
      bankAccount: shop.bankName
        ? {
            bankName: shop.bankName,
            accountNumber: maskAccount(shop.bankAccountNumber ?? ''),
            accountName: shop.bankAccountName ?? '',
          }
        : null,
      productCounts,
      moderatedAt: shop.moderatedAt,
    };
  }

  /** Ngày duyệt = lúc hồ sơ mở shop (REGISTER) được duyệt */
  private async approvedAt(shopIds: string[]): Promise<Map<string, Date | null>> {
    if (shopIds.length === 0) return new Map();
    const apps = await this.prisma.shopApplication.findMany({
      where: { shopId: { in: shopIds }, type: 'REGISTER', status: 'APPROVED' },
      select: { shopId: true, decidedAt: true },
    });
    return new Map(apps.map((a) => [a.shopId, a.decidedAt]));
  }

  private row(s: ShopWithCount, approvedAt: Date | null): AdminShopRow {
    return {
      id: s.id,
      name: s.name ?? '',
      logoUrl: s.logoUrl,
      ownerId: s.ownerId,
      status: s.status as AdminShopRow['status'],
      suspendReason: s.suspendReason,
      productCount: s._count.products,
      approvedAt,
      createdAt: s.createdAt,
    };
  }
}

/** Chỉ để lại 4 số cuối, giống cách web hiển thị ở P1 */
function maskAccount(n: string): string {
  return `****${n.slice(-4)}`;
}
