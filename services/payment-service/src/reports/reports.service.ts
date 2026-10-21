import { Injectable } from '@nestjs/common';
import type { AuthUser } from '@san/nest-common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '../../generated/prisma';
import type { ReportRangeQuery } from './dto/report-range.query';
import { num, resolveRange, type ReportRange } from './report-range';

/** Khoảng ngày đã dùng để tính (giờ Việt Nam) */
export interface ReportRangeView {
  from: string;
  to: string;
  days: number;
}

/** Số dư 3 ngăn hiện tại (không phụ thuộc khoảng ngày) */
export interface BalanceView {
  pending: number;
  available: number;
  locked: number;
  /** = đang giữ + khả dụng + đang khóa */
  total: number;
}

/** Số tài chính của shop trong khoảng. Tiền là số nguyên đồng */
export interface SellerFinanceSummary {
  /** Số đơn con ghi nhận trong khoảng (xem `recordedSql`) */
  orderCount: number;
  /** Giá trị đơn: tổng người mua đã trả (buyer_paid) của các đơn con đó */
  orderValue: number;
  /** Khoản hoàn đã xong trong khoảng cho đơn của shop (qua cổng hoặc hoàn tay) */
  refunded: number;
  /** Phí sàn sau khi đã đảo phần trả hàng, của đơn ghi nhận không bị hủy/giao thất bại */
  platformFee: number;
  /** Tiền seller nhận (sau phí sàn, đã trừ phần trả hàng) của cùng các đơn đó */
  sellerReceives: number;
  /** Tiền vào ngăn khả dụng trong khoảng: đơn chuyển từ đang giữ sang + tiền đền sự cố */
  released: number;
  /** Yêu cầu rút đã chuyển khoản trong khoảng */
  withdrawn: number;
}

export interface SellerFinanceDaily {
  /** Ngày theo giờ Việt Nam (YYYY-MM-DD) */
  date: string;
  sellerReceives: number;
  refunded: number;
}

export interface SellerFinanceReport {
  range: ReportRangeView;
  /** false: shop chưa có ví (chưa có đơn nào tới payment-service), mọi số bằng 0 */
  hasWallet: boolean;
  summary: SellerFinanceSummary;
  balance: BalanceView;
  daily: SellerFinanceDaily[];
}

export interface AdminFinanceSummary {
  orderCount: number;
  /** Giá trị đơn: tổng người mua đã trả của các đơn con ghi nhận trong khoảng */
  orderValue: number;
  /** Tiền thực thu = VNPay thành công + COD đã đối soát khớp, trong khoảng */
  collected: number;
  collectedVnpay: number;
  collectedCod: number;
  /** Khoản hoàn đã xong trong khoảng (qua cổng hoặc hoàn tay) */
  refunded: number;
  /** Trợ giá voucher sàn (sàn chịu) của đơn ghi nhận không bị hủy/giao thất bại */
  platformSubsidy: number;
  /** Phí sàn sau khi đã đảo phần trả hàng */
  platformFee: number;
  /** Phải trả seller: số dư hiện tại của mọi ví (đang giữ + khả dụng + đang khóa) */
  payableToSellers: number;
  /** Đã chi cho seller: yêu cầu rút đã chuyển khoản trong khoảng */
  paidToSellers: number;
}

export interface AdminFinanceDaily {
  date: string;
  collected: number;
  refunded: number;
  platformFee: number;
}

export interface AdminFinanceReport {
  range: ReportRangeView;
  summary: AdminFinanceSummary;
  /** Phải trả seller chia theo ngăn */
  payable: BalanceView;
  daily: AdminFinanceDaily[];
}

type DayRow = { day: string } & Record<string, bigint | number | string | null>;

/** Biểu thức ngày giờ Việt Nam (YYYY-MM-DD) của một cột thời gian */
const vnDay = (col: Prisma.Sql) =>
  Prisma.sql`to_char((${col} AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD')`;

/**
 * Báo cáo tài chính (RPT-02) theo sổ tiền của payment-service, định nghĩa ở
 * docs/phan-tich/13-quyet-dinh-p6.md mục 4. Gom bằng SQL theo ngày giờ Việt Nam; số tổng của khoảng = tổng
 * các ngày.
 */
@Injectable()
export class FinanceReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Shop của chủ shop nhận ra qua ví (chủ shop lưu từ order.placed); chưa có ví → mọi số bằng 0 */
  async seller(user: AuthUser, q: ReportRangeQuery): Promise<SellerFinanceReport> {
    const range = resolveRange(q);
    const wallet = await this.prisma.sellerWallet.findUnique({ where: { ownerId: user.id } });
    if (!wallet) {
      return {
        range: rangeView(range),
        hasWallet: false,
        summary: {
          orderCount: 0,
          orderValue: 0,
          refunded: 0,
          platformFee: 0,
          sellerReceives: 0,
          released: 0,
          withdrawn: 0,
        },
        balance: { pending: 0, available: 0, locked: 0, total: 0 },
        daily: range.dates.map((date) => ({ date, sellerReceives: 0, refunded: 0 })),
      };
    }
    const shopId = wallet.shopId;
    const [earnings, refunds, released, withdrawn] = await Promise.all([
      this.recorded(range, shopId),
      this.refunds(range, shopId),
      this.released(range, shopId),
      this.withdrawn(range, shopId),
    ]);
    const daily = range.dates.map((date) => ({
      date,
      sellerReceives: num(earnings.get(date)?.seller_receives as bigint),
      refunded: num(refunds.get(date)?.amount as bigint),
    }));
    return {
      range: rangeView(range),
      hasWallet: true,
      summary: {
        orderCount: total(earnings, 'order_count'),
        orderValue: total(earnings, 'order_value'),
        refunded: total(refunds, 'amount'),
        platformFee: total(earnings, 'platform_fee'),
        sellerReceives: total(earnings, 'seller_receives'),
        released: total(released, 'amount'),
        withdrawn: total(withdrawn, 'amount'),
      },
      balance: balance(wallet),
      daily,
    };
  }

  async admin(q: ReportRangeQuery): Promise<AdminFinanceReport> {
    const range = resolveRange(q);
    const [earnings, refunds, vnpay, cod, withdrawn, wallets] = await Promise.all([
      this.recorded(range, null),
      this.refunds(range, null),
      this.vnpayCollected(range),
      this.codCollected(range),
      this.withdrawn(range, null),
      this.prisma.sellerWallet.aggregate({
        _sum: { pending: true, available: true, locked: true },
      }),
    ]);
    const daily = range.dates.map((date) => ({
      date,
      collected: num(vnpay.get(date)?.amount as bigint) + num(cod.get(date)?.amount as bigint),
      refunded: num(refunds.get(date)?.amount as bigint),
      platformFee: num(earnings.get(date)?.platform_fee as bigint),
    }));
    const payable = balance({
      pending: wallets._sum.pending ?? 0,
      available: wallets._sum.available ?? 0,
      locked: wallets._sum.locked ?? 0,
    });
    const collectedVnpay = total(vnpay, 'amount');
    const collectedCod = total(cod, 'amount');
    return {
      range: rangeView(range),
      summary: {
        orderCount: total(earnings, 'order_count'),
        orderValue: total(earnings, 'order_value'),
        collected: collectedVnpay + collectedCod,
        collectedVnpay,
        collectedCod,
        refunded: total(refunds, 'amount'),
        platformSubsidy: total(earnings, 'platform_subsidy'),
        platformFee: total(earnings, 'platform_fee'),
        payableToSellers: payable.total,
        paidToSellers: total(withdrawn, 'amount'),
      },
      payable,
      daily,
    };
  }

  /**
   * Tiền của các đơn con **ghi nhận** trong khoảng, theo ngày. Đơn con ghi nhận = người mua đã trả tiền
   * cho nó: trả trước lúc thanh toán thành công (`paid_at`), COD lúc GHN giao thành công (`delivered_at`,
   * cũng là lúc tiền seller vào ngăn đang giữ). Đơn trả trước hết hạn, đơn COD chưa giao/giao thất bại
   * không có tiền nên không ghi nhận.
   * - Giá trị đơn tính mọi đơn ghi nhận (kể cả đơn bị hủy sau khi trả: khoản hoàn nằm ở số "khoản hoàn").
   * - Phí sàn, tiền seller nhận, trợ giá voucher sàn chỉ tính đơn không bị hủy/giao thất bại (các đơn đó
   *   đã trừ lại ví, sàn không thu phí và không chịu voucher); phí sàn và tiền seller đã đảo phần trả hàng
   *   (`return_fee_reversed`, `return_deduction`).
   */
  private recorded(range: ReportRange, shopId: string | null) {
    const shopFilter = shopId ? Prisma.sql`AND e.shop_id = ${shopId}::uuid` : Prisma.empty;
    return this.byDay(Prisma.sql`
      SELECT ${vnDay(Prisma.sql`recorded_at`)} AS day,
        count(*) AS order_count,
        sum(buyer_paid) AS order_value,
        sum(platform_fee - return_fee_reversed) FILTER (WHERE kept) AS platform_fee,
        sum(seller_amount - return_deduction) FILTER (WHERE kept) AS seller_receives,
        sum(platform_discount) FILTER (WHERE kept) AS platform_subsidy
      FROM (
        SELECT e.*,
          CASE WHEN e.payment_method = 'VNPAY' THEN e.paid_at ELSE e.delivered_at END AS recorded_at,
          e.status NOT IN ('CANCELLED', 'FAILED') AS kept
        FROM seller_earnings e
        WHERE true ${shopFilter}
      ) x
      WHERE recorded_at >= ${range.start} AND recorded_at < ${range.end}
      GROUP BY 1`);
  }

  /**
   * Khoản hoàn đã xong trong khoảng (theo lúc xong): qua cổng thành công hoặc admin đã hoàn tay. Của shop:
   * khoản hoàn gắn với đơn con của shop (khoản hoàn cả lần trả muộn/trả trùng không thuộc shop nào).
   */
  private refunds(range: ReportRange, shopId: string | null) {
    const shopFilter = shopId
      ? Prisma.sql`AND r.shop_order_id IN (SELECT shop_order_id FROM seller_earnings WHERE shop_id = ${shopId}::uuid)`
      : Prisma.empty;
    return this.byDay(Prisma.sql`
      SELECT ${vnDay(Prisma.sql`r.completed_at`)} AS day, sum(r.amount) AS amount
      FROM refunds r
      WHERE r.status IN ('SUCCEEDED', 'MANUAL_DONE')
        AND r.completed_at >= ${range.start} AND r.completed_at < ${range.end}
        ${shopFilter}
      GROUP BY 1`);
  }

  /** Thanh toán VNPay thành công trong khoảng (kể cả lần trả muộn/trả trùng: tiền đã về, có khoản hoàn riêng) */
  private vnpayCollected(range: ReportRange) {
    return this.byDay(Prisma.sql`
      SELECT ${vnDay(Prisma.sql`paid_at`)} AS day, sum(amount) AS amount
      FROM payments
      WHERE status = 'SUCCEEDED' AND paid_at >= ${range.start} AND paid_at < ${range.end}
      GROUP BY 1`);
  }

  /**
   * Tiền COD đã đối soát khớp trong khoảng: đơn con COD có lúc tiền về sàn (`money_received_at`, ghi khi
   * dòng file đối soát khớp hoặc admin chấp nhận dòng lệch), số tiền là số GHN thu hộ của đơn.
   */
  private codCollected(range: ReportRange) {
    return this.byDay(Prisma.sql`
      SELECT ${vnDay(Prisma.sql`money_received_at`)} AS day, sum(cod_amount) AS amount
      FROM seller_earnings
      WHERE payment_method = 'COD'
        AND money_received_at >= ${range.start} AND money_received_at < ${range.end}
      GROUP BY 1`);
  }

  /** Tiền vào ngăn khả dụng của shop trong khoảng: chuyển từ đang giữ (RELEASED) và tiền đền sự cố */
  private released(range: ReportRange, shopId: string) {
    return this.byDay(Prisma.sql`
      SELECT ${vnDay(Prisma.sql`created_at`)} AS day, sum(amount) AS amount
      FROM wallet_transactions
      WHERE shop_id = ${shopId}::uuid AND type IN ('RELEASED', 'COMPENSATION')
        AND created_at >= ${range.start} AND created_at < ${range.end}
      GROUP BY 1`);
  }

  /** Yêu cầu rút đã chuyển khoản trong khoảng (theo lúc chuyển) */
  private withdrawn(range: ReportRange, shopId: string | null) {
    const shopFilter = shopId ? Prisma.sql`AND shop_id = ${shopId}::uuid` : Prisma.empty;
    return this.byDay(Prisma.sql`
      SELECT ${vnDay(Prisma.sql`paid_at`)} AS day, sum(amount) AS amount
      FROM withdrawals
      WHERE status = 'PAID' AND paid_at >= ${range.start} AND paid_at < ${range.end}
        ${shopFilter}
      GROUP BY 1`);
  }

  private async byDay(sql: Prisma.Sql): Promise<Map<string, DayRow>> {
    const rows = await this.prisma.$queryRaw<DayRow[]>(sql);
    return new Map(rows.map((r) => [r.day, r]));
  }
}

function rangeView(r: ReportRange): ReportRangeView {
  return { from: r.from, to: r.to, days: r.days };
}

function balance(w: { pending: number; available: number; locked: number }): BalanceView {
  const { pending, available, locked } = w;
  return { pending, available, locked, total: pending + available + locked };
}

/** Tổng một cột qua mọi ngày */
function total(rows: Map<string, DayRow>, column: string): number {
  let sum = 0;
  for (const r of rows.values()) sum += num(r[column] as bigint | null);
  return sum;
}
