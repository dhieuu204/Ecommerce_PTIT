import { Injectable } from '@nestjs/common';
import { AppError } from '@san/nest-common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '../../generated/prisma';
import type { ReportRangeQuery } from './dto/report-range.query';
import { num, perMille, resolveRange, type ReportRange } from './report-range';

/** Khoảng ngày đã dùng để tính (giờ Việt Nam) */
export interface ReportRangeView {
  from: string;
  to: string;
  days: number;
}

/** Số chính của báo cáo vận hành. Tiền là số nguyên đồng; tỉ lệ theo phần nghìn (125 = 12,5%) */
export interface OperationsSummary {
  /** Số đơn con đã đặt trong khoảng (bỏ đơn trả trước chưa thanh toán đã hết hạn) */
  orderCount: number;
  /** Giá trị đặt hàng = tổng tiền hàng (subtotal) của các đơn đó */
  orderValue: number;
  /** Đơn đang ở trạng thái hoàn tất */
  completedCount: number;
  /** Doanh số của đơn hoàn tất = tiền hàng − giảm giá của shop − tiền hàng của món đã trả và được hoàn */
  revenue: number;
  cancelledCount: number;
  /** Đơn bị hủy / số đơn, phần nghìn */
  cancelRate: number;
  /** Đơn đã giao tới tay người mua (có lúc giao thành công) */
  deliveredCount: number;
  /** Đơn có yêu cầu trả hàng đã hoàn tiền */
  returnedCount: number;
  /** Đơn trả hàng đã hoàn tiền / đơn đã giao, phần nghìn */
  returnRate: number;
}

export interface DailyOperations {
  /** Ngày theo giờ Việt Nam (YYYY-MM-DD) */
  date: string;
  orderCount: number;
  orderValue: number;
}

export interface TopProduct {
  productId: string;
  name: string;
  image: string | null;
  shopId: string;
  shopName: string;
  /** Số lượng đã bán trong các đơn không bị hủy */
  quantity: number;
  /** Tiền hàng của số lượng đó (giá lúc đặt × số lượng) */
  amount: number;
}

export interface VoucherPerformance {
  voucherId: string;
  code: string;
  name: string;
  /** SHOP: voucher shop (shop chịu); PLATFORM: voucher sàn (sàn chịu) */
  scope: 'SHOP' | 'PLATFORM';
  shopId: string | null;
  shopName: string | null;
  /** Số đơn con dùng mã (không tính đơn đã hủy: lượt dùng đã được trả lại) */
  orderCount: number;
  /** Tổng tiền giảm */
  discountTotal: number;
  /** Giá trị đặt hàng (tiền hàng) của các đơn đó */
  orderValue: number;
}

export interface TopShop {
  shopId: string;
  name: string;
  orderCount: number;
  orderValue: number;
  /** Doanh số đơn hoàn tất (cùng cách tính với summary.revenue) */
  revenue: number;
}

export interface ShopOperationsReport {
  range: ReportRangeView;
  summary: OperationsSummary;
  daily: DailyOperations[];
  topProducts: TopProduct[];
  vouchers: VoucherPerformance[];
}

export interface AdminOperationsReport extends ShopOperationsReport {
  /** Số shop có đơn trong khoảng */
  shopCount: number;
  topShops: TopShop[];
}

/** Số dòng tối đa của bảng sản phẩm bán chạy và 10 shop hàng đầu */
const TOP_LIMIT = 10;
/** Số mã tối đa trong bảng hiệu quả voucher (nhiều đơn nhất trước) */
const VOUCHER_LIMIT = 50;

/**
 * Báo cáo vận hành (RPT-01), định nghĩa ở docs/phan-tich/13-quyet-dinh-p6.md mục 4. Mọi số gom bằng SQL
 * trên database, không tải đơn lên bộ nhớ. Tập đơn gốc ("base") là các đơn con đặt trong khoảng ngày
 * (giờ Việt Nam) của một shop hoặc cả sàn, bỏ đơn trả trước chưa thanh toán đã hết hạn.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Shop của chủ shop: phải đã được duyệt (đang hoạt động hoặc bị đình chỉ vẫn xem được số của mình).
   * Chưa có shop hoặc chưa duyệt → 409 SHOP_NOT_ACTIVE (như các API Kênh người bán khác).
   */
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

  async shopOperations(userId: string, q: ReportRangeQuery): Promise<ShopOperationsReport> {
    const range = resolveRange(q);
    const shopId = await this.sellerShopId(userId);
    const base = baseSql(range, shopId);
    const [summary, daily, topProducts, vouchers] = await Promise.all([
      this.summary(base),
      this.daily(base, range),
      this.topProducts(base),
      this.vouchers(base, false),
    ]);
    return { range: rangeView(range), summary: summary.summary, daily, topProducts, vouchers };
  }

  async adminOperations(q: ReportRangeQuery): Promise<AdminOperationsReport> {
    const range = resolveRange(q);
    const base = baseSql(range, null);
    const [summary, daily, topProducts, vouchers, topShops] = await Promise.all([
      this.summary(base),
      this.daily(base, range),
      this.topProducts(base),
      this.vouchers(base, true),
      this.topShops(base),
    ]);
    return {
      range: rangeView(range),
      summary: summary.summary,
      shopCount: summary.shopCount,
      daily,
      topProducts,
      vouchers,
      topShops,
    };
  }

  private async summary(
    base: Prisma.Sql,
  ): Promise<{ summary: OperationsSummary; shopCount: number }> {
    const [r] = await this.prisma.$queryRaw<
      Array<{
        order_count: bigint;
        order_value: bigint | null;
        completed_count: bigint;
        revenue: bigint | null;
        cancelled_count: bigint;
        delivered_count: bigint;
        returned_count: bigint;
        shop_count: bigint;
      }>
    >`
      WITH base AS (${base})
      SELECT
        count(*) AS order_count,
        sum(subtotal) AS order_value,
        count(*) FILTER (WHERE status = 'COMPLETED') AS completed_count,
        sum(subtotal - shop_discount - returned_base) FILTER (WHERE status = 'COMPLETED') AS revenue,
        count(*) FILTER (WHERE status = 'CANCELLED') AS cancelled_count,
        count(*) FILTER (WHERE delivered_at IS NOT NULL) AS delivered_count,
        count(*) FILTER (WHERE delivered_at IS NOT NULL AND return_status = 'REFUNDED') AS returned_count,
        count(DISTINCT shop_id) AS shop_count
      FROM base`;
    const orderCount = num(r?.order_count);
    const cancelledCount = num(r?.cancelled_count);
    const deliveredCount = num(r?.delivered_count);
    const returnedCount = num(r?.returned_count);
    return {
      summary: {
        orderCount,
        orderValue: num(r?.order_value),
        completedCount: num(r?.completed_count),
        revenue: num(r?.revenue),
        cancelledCount,
        cancelRate: perMille(cancelledCount, orderCount),
        deliveredCount,
        returnedCount,
        returnRate: perMille(returnedCount, deliveredCount),
      },
      shopCount: num(r?.shop_count),
    };
  }

  /** Số đơn và giá trị đặt hàng từng ngày (giờ Việt Nam); ngày không có đơn trả 0 */
  private async daily(base: Prisma.Sql, range: ReportRange): Promise<DailyOperations[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ day: string; order_count: bigint; order_value: bigint | null }>
    >`
      WITH base AS (${base})
      SELECT to_char((created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD') AS day,
        count(*) AS order_count, sum(subtotal) AS order_value
      FROM base GROUP BY 1`;
    const byDay = new Map(rows.map((r) => [r.day, r]));
    return range.dates.map((date) => {
      const r = byDay.get(date);
      return { date, orderCount: num(r?.order_count), orderValue: num(r?.order_value) };
    });
  }

  /** 10 sản phẩm có số lượng bán nhiều nhất trong các đơn không bị hủy */
  private async topProducts(base: Prisma.Sql): Promise<TopProduct[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        product_id: string;
        name: string;
        image: string | null;
        shop_id: string;
        shop_name: string | null;
        quantity: bigint;
        amount: bigint;
      }>
    >`
      WITH base AS (${base})
      SELECT oi.product_id, p.name, p.shop_id, s.name AS shop_name,
        (array_agg(oi.image ORDER BY b.created_at DESC))[1] AS image,
        sum(oi.quantity) AS quantity, sum(oi.price::bigint * oi.quantity) AS amount
      FROM base b
      JOIN order_items oi ON oi.shop_order_id = b.id
      JOIN products p ON p.id = oi.product_id
      JOIN shops s ON s.id = p.shop_id
      WHERE b.status <> 'CANCELLED'
      GROUP BY oi.product_id, p.name, p.shop_id, s.name
      ORDER BY quantity DESC, amount DESC, oi.product_id
      LIMIT ${TOP_LIMIT}`;
    return rows.map((r) => ({
      productId: r.product_id,
      name: r.name,
      image: r.image,
      shopId: r.shop_id,
      shopName: r.shop_name ?? '',
      quantity: num(r.quantity),
      amount: num(r.amount),
    }));
  }

  /**
   * Hiệu quả từng mã voucher: số đơn con dùng, tổng tiền giảm, giá trị đặt hàng của các đơn đó. Không tính
   * đơn đã hủy (lượt dùng đã trả lại cho người mua). Voucher sàn (chỉ admin): đơn con thuộc đơn tổng dùng
   * mã, tiền giảm là phần voucher sàn chia cho đơn con đó.
   */
  private async vouchers(base: Prisma.Sql, withPlatform: boolean): Promise<VoucherPerformance[]> {
    const platform = withPlatform
      ? Prisma.sql`
        UNION ALL
        SELECT v.id, v.code, v.name, 'PLATFORM' AS scope, NULL::uuid AS shop_id, NULL AS shop_name,
          count(*) AS order_count, sum(b.platform_discount) AS discount_total,
          sum(b.subtotal) AS order_value
        FROM base b JOIN vouchers v ON v.id = b.platform_voucher_id
        WHERE b.status <> 'CANCELLED'
        GROUP BY v.id`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        code: string;
        name: string;
        scope: 'SHOP' | 'PLATFORM';
        shop_id: string | null;
        shop_name: string | null;
        order_count: bigint;
        discount_total: bigint | null;
        order_value: bigint | null;
      }>
    >`
      WITH base AS (${base})
      SELECT * FROM (
        SELECT v.id, v.code, v.name, 'SHOP' AS scope, v.shop_id, s.name AS shop_name,
          count(*) AS order_count, sum(b.shop_discount) AS discount_total,
          sum(b.subtotal) AS order_value
        FROM base b
        JOIN vouchers v ON v.id = b.shop_voucher_id
        LEFT JOIN shops s ON s.id = v.shop_id
        WHERE b.status <> 'CANCELLED'
        GROUP BY v.id, s.name
        ${platform}
      ) t
      ORDER BY order_count DESC, discount_total DESC, code
      LIMIT ${VOUCHER_LIMIT}`;
    return rows.map((r) => ({
      voucherId: r.id,
      code: r.code,
      name: r.name,
      scope: r.scope,
      shopId: r.shop_id,
      shopName: r.shop_name,
      orderCount: num(r.order_count),
      discountTotal: num(r.discount_total),
      orderValue: num(r.order_value),
    }));
  }

  /** 10 shop có giá trị đặt hàng cao nhất */
  private async topShops(base: Prisma.Sql): Promise<TopShop[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        shop_id: string;
        name: string;
        order_count: bigint;
        order_value: bigint | null;
        revenue: bigint | null;
      }>
    >`
      WITH base AS (${base})
      SELECT b.shop_id, COALESCE(s.name, max(b.shop_name)) AS name,
        count(*) AS order_count, sum(b.subtotal) AS order_value,
        sum(b.subtotal - b.shop_discount - b.returned_base) FILTER (WHERE b.status = 'COMPLETED') AS revenue
      FROM base b LEFT JOIN shops s ON s.id = b.shop_id
      GROUP BY b.shop_id, s.name
      ORDER BY order_value DESC, order_count DESC, b.shop_id
      LIMIT ${TOP_LIMIT}`;
    return rows.map((r) => ({
      shopId: r.shop_id,
      name: r.name,
      orderCount: num(r.order_count),
      orderValue: num(r.order_value),
      revenue: num(r.revenue),
    }));
  }
}

function rangeView(r: ReportRange): ReportRangeView {
  return { from: r.from, to: r.to, days: r.days };
}

/**
 * Tập đơn con gốc của báo cáo: đặt trong khoảng (theo giờ Việt Nam), của một shop (`shopId`) hoặc cả sàn.
 *
 * - **Bỏ đơn trả trước chưa thanh toán đã hết hạn**: đơn tổng vẫn `UNPAID`, đơn con bị hệ thống hủy lúc
 *   đã qua hạn thanh toán (`pay_before`). Đơn đang trong hạn thanh toán vẫn tính (đã đặt); đơn người mua
 *   tự hủy trước khi trả, hoặc bị hủy vì không qua kiểm tra đơn, vẫn tính là đơn bị hủy.
 * - `returned_base`: tiền hàng (sau voucher shop) của món đã trả và **đã hoàn xong** (yêu cầu trả hàng
 *   `REFUNDED`), tính như payment-service trừ tiền seller: hoàn đủ → cả `seller_base`; hoàn một phần X →
 *   `seller_base × X / số hoàn tối đa` (làm tròn xuống); sàn chịu (kiện trả thất lạc) → 0 vì seller không
 *   bị trừ.
 */
function baseSql(range: ReportRange, shopId: string | null): Prisma.Sql {
  const shopFilter = shopId ? Prisma.sql`AND so.shop_id = ${shopId}::uuid` : Prisma.empty;
  return Prisma.sql`
    SELECT so.id, so.shop_id, so.shop_name, so.status, so.subtotal, so.shop_discount,
      so.platform_discount, so.delivered_at, so.created_at, so.shop_voucher_id,
      o.platform_voucher_id, r.status AS return_status,
      CASE
        WHEN r.status = 'REFUNDED' AND NOT r.platform_covers THEN
          CASE
            WHEN r.decided_refund IS NULL OR r.decided_refund >= r.refund_amount THEN r.seller_base::bigint
            WHEN r.refund_amount > 0 THEN r.seller_base::bigint * r.decided_refund / r.refund_amount
            ELSE 0
          END
        ELSE 0
      END AS returned_base
    FROM shop_orders so
    JOIN orders o ON o.id = so.order_id
    LEFT JOIN returns r ON r.shop_order_id = so.id
    WHERE so.created_at >= ${range.start} AND so.created_at < ${range.end}
      ${shopFilter}
      AND NOT COALESCE(
        o.payment_status = 'UNPAID' AND so.status = 'CANCELLED' AND so.cancelled_by = 'SYSTEM'
          AND o.pay_before IS NOT NULL AND so.cancelled_at >= o.pay_before,
        false
      )`;
}
