import {
  ArrowDownLeft,
  ArrowRightLeft,
  Banknote,
  CircleDollarSign,
  HandCoins,
  Hourglass,
  Landmark,
  Lock,
  Percent,
  TicketPercent,
  Undo2,
  Wallet,
} from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/console/empty-state';
import { formatMoney } from '@/lib/format';
import type { AdminFinanceReport, BalanceView, SellerFinanceReport } from '@/lib/report-types';
import { cn } from '@/lib/utils';
import { CHART_COLORS, DailyChart, type ChartSeries } from './daily-chart';
import { formatCount } from './report-format';
import { FormulaNote, ReportSection, StatTile } from './report-parts';

const SELLER_SERIES: Array<ChartSeries<'sellerReceives' | 'refunded'>> = [
  {
    key: 'sellerReceives',
    label: 'Tiền shop nhận',
    kind: 'bar',
    color: CHART_COLORS.navy,
    unit: 'money',
  },
  {
    key: 'refunded',
    label: 'Khoản hoàn',
    kind: 'bar',
    color: CHART_COLORS.champagne,
    unit: 'money',
  },
];

const ADMIN_SERIES: Array<ChartSeries<'collected' | 'refunded' | 'platformFee'>> = [
  {
    key: 'collected',
    label: 'Tiền thực thu',
    kind: 'bar',
    color: CHART_COLORS.navy,
    unit: 'money',
  },
  {
    key: 'refunded',
    label: 'Khoản hoàn',
    kind: 'line',
    color: CHART_COLORS.champagne,
    unit: 'money',
  },
  {
    key: 'platformFee',
    label: 'Phí sàn',
    kind: 'line',
    color: CHART_COLORS.ink,
    unit: 'money',
    dashed: true,
  },
];

const SELLER_FORMULAS: Array<[string, string]> = [
  [
    'Đơn ghi nhận',
    'Đơn người mua đã trả tiền trong khoảng: trả trước tính lúc thanh toán thành công, COD tính lúc giao thành công.',
  ],
  [
    'Giá trị đơn',
    'Tổng số người mua đã trả cho các đơn ghi nhận (kể cả phí ship và đơn bị hủy sau đó).',
  ],
  [
    'Phí sàn, tiền shop nhận',
    'Của các đơn ghi nhận không bị hủy hay giao thất bại; đã trừ phần của hàng trả.',
  ],
  ['Khoản hoàn', 'Tiền đã hoàn xong cho người mua trong khoảng (qua cổng hoặc chuyển khoản).'],
  [
    'Chuyển sang khả dụng',
    'Tiền vào ngăn khả dụng trong khoảng: đơn hoàn tất và tiền đã về sàn, cộng tiền đền sự cố vận chuyển.',
  ],
  ['Đã rút', 'Yêu cầu rút tiền đã được chuyển khoản trong khoảng.'],
];

const ADMIN_FORMULAS: Array<[string, string]> = [
  [
    'Đơn ghi nhận, giá trị đơn',
    'Đơn người mua đã trả tiền trong khoảng (trả trước: lúc thanh toán; COD: lúc giao). Giá trị = tổng số người mua đã trả.',
  ],
  [
    'Tiền thực thu',
    'Thanh toán VNPay thành công trong khoảng cộng tiền COD đã đối soát khớp với GHN trong khoảng.',
  ],
  ['Khoản hoàn', 'Khoản hoàn đã xong trong khoảng, qua cổng hoặc admin hoàn tay.'],
  [
    'Phí sàn, trợ giá voucher sàn',
    'Của các đơn ghi nhận không bị hủy hay giao thất bại; phí sàn đã đảo phần hàng trả.',
  ],
  ['Phải trả seller', 'Số dư hiện tại của mọi ví seller: đang giữ + khả dụng + đang khóa.'],
  ['Đã chi cho seller', 'Yêu cầu rút tiền đã chuyển khoản trong khoảng.'],
];

/** Số dư 3 ngăn: thanh chia tỉ lệ + từng ngăn */
function BalanceBreakdown({ b, dark }: { b: BalanceView; dark?: boolean }) {
  const parts = [
    { label: 'Đang giữ', value: b.pending, icon: Hourglass, bar: 'bg-champagne' },
    { label: 'Khả dụng', value: b.available, icon: Wallet, bar: dark ? 'bg-white' : 'bg-navy' },
    { label: 'Đang khóa', value: b.locked, icon: Lock, bar: dark ? 'bg-white/40' : 'bg-ink/30' },
  ];
  return (
    <div>
      <div
        className={cn(
          'flex h-2 overflow-hidden rounded-full',
          dark ? 'bg-white/10' : 'bg-ivory-200',
        )}
        aria-hidden
      >
        {b.total > 0 &&
          parts.map((p) => (
            <div
              key={p.label}
              className={p.bar}
              style={{ width: `${(p.value / b.total) * 100}%` }}
            />
          ))}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        {parts.map((p) => (
          <div key={p.label} className="min-w-0">
            <dt
              className={cn(
                'flex items-center gap-1 text-xs',
                dark ? 'text-white/65' : 'text-muted-foreground',
              )}
            >
              <span className={cn('size-2 shrink-0 rounded-full', p.bar)} aria-hidden />
              {p.label}
            </dt>
            <dd
              className={cn(
                'mt-0.5 truncate text-sm font-semibold tabular-nums',
                dark ? 'text-white' : 'text-ink',
              )}
            >
              {formatMoney(p.value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Báo cáo tài chính của shop (RPT-02) */
export function SellerFinanceView({ data }: { data: SellerFinanceReport }) {
  const s = data.summary;
  if (!data.hasWallet) {
    return (
      <ReportSection title="Tài chính của shop">
        <EmptyState
          icon={Wallet}
          title="Chưa có số liệu tài chính"
          text="Số liệu hiện khi shop có đơn đầu tiên được người mua thanh toán hoặc giao thành công (COD)."
        />
      </ReportSection>
    );
  }
  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl bg-navy p-5 text-white shadow-lg shadow-navy/20">
        <div
          className="absolute -top-12 -right-12 size-40 rounded-full bg-champagne/15"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:gap-8">
          <div className="md:w-64">
            <div className="flex items-center gap-2 text-sm text-white/75">
              <Landmark className="size-4 text-champagne" /> Số dư ví hiện tại
            </div>
            <div className="mt-1 text-3xl font-bold text-champagne tabular-nums">
              {formatMoney(data.balance.total)}
            </div>
            <Link
              to="/kenh-nguoi-ban/tai-chinh"
              className="mt-1 inline-block text-xs text-white/80 underline-offset-2 hover:underline"
            >
              Mở Ví và rút tiền ›
            </Link>
          </div>
          <div className="min-w-0 flex-1">
            <BalanceBreakdown b={data.balance} dark />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile
          icon={CircleDollarSign}
          label="Giá trị đơn"
          value={formatMoney(s.orderValue)}
          hint={`${formatCount(s.orderCount)} đơn ghi nhận`}
        />
        <StatTile
          icon={HandCoins}
          label="Tiền shop nhận"
          value={formatMoney(s.sellerReceives)}
          hint="Sau phí sàn và trả hàng"
        />
        <StatTile
          icon={Percent}
          label="Phí sàn"
          value={formatMoney(s.platformFee)}
          hint="Đã đảo phần hàng trả"
        />
        <StatTile
          icon={Undo2}
          label="Khoản hoàn"
          value={formatMoney(s.refunded)}
          hint="Đã hoàn xong cho người mua"
        />
        <StatTile
          icon={ArrowRightLeft}
          label="Chuyển sang khả dụng"
          value={formatMoney(s.released)}
          hint="Rút được về ngân hàng"
        />
        <StatTile
          icon={Banknote}
          label="Đã rút"
          value={formatMoney(s.withdrawn)}
          hint="Đã chuyển khoản cho shop"
        />
      </div>

      <ReportSection title="Tiền theo ngày" description="Tiền shop nhận và khoản hoàn từng ngày">
        <DailyChart
          data={data.daily}
          series={SELLER_SERIES}
          emptyText="Chưa có tiền vào hay khoản hoàn nào trong khoảng ngày này."
        />
      </ReportSection>

      <FormulaNote items={SELLER_FORMULAS} />
    </div>
  );
}

/** Báo cáo tài chính của sàn (RPT-02, bộ quyền Tài chính) */
export function AdminFinanceView({ data }: { data: AdminFinanceReport }) {
  const s = data.summary;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          highlight
          icon={ArrowDownLeft}
          label="Tiền thực thu"
          value={formatMoney(s.collected)}
          hint={`VNPay ${formatMoney(s.collectedVnpay)} · COD ${formatMoney(s.collectedCod)}`}
        />
        <StatTile
          icon={CircleDollarSign}
          label="Giá trị đơn"
          value={formatMoney(s.orderValue)}
          hint={`${formatCount(s.orderCount)} đơn ghi nhận`}
        />
        <StatTile
          icon={Undo2}
          label="Khoản hoàn"
          value={formatMoney(s.refunded)}
          hint="Qua cổng và hoàn tay"
        />
        <StatTile
          icon={Percent}
          label="Phí sàn"
          value={formatMoney(s.platformFee)}
          hint="Đã đảo phần hàng trả"
        />
        <StatTile
          icon={TicketPercent}
          label="Trợ giá voucher sàn"
          value={formatMoney(s.platformSubsidy)}
          hint="Sàn chịu"
        />
        <StatTile
          icon={Banknote}
          label="Đã chi cho seller"
          value={formatMoney(s.paidToSellers)}
          hint="Yêu cầu rút đã chuyển khoản"
        />
        <div className="col-span-2 min-w-0 rounded-2xl border bg-card p-4 shadow-sm shadow-navy/[0.03] md:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-medium text-ink/60">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-champagne-50 text-champagne-600">
                <Landmark className="size-4" />
              </span>
              Phải trả seller (hiện tại)
            </div>
            <div className="text-lg font-bold text-navy tabular-nums sm:text-2xl">
              {formatMoney(s.payableToSellers)}
            </div>
          </div>
          <div className="mt-3">
            <BalanceBreakdown b={data.payable} />
          </div>
        </div>
      </div>

      <ReportSection
        title="Dòng tiền theo ngày"
        description="Cột: tiền thực thu · Đường: khoản hoàn, phí sàn"
      >
        <DailyChart
          data={data.daily}
          series={ADMIN_SERIES}
          emptyText="Chưa có tiền vào, khoản hoàn hay phí sàn nào trong khoảng ngày này."
        />
      </ReportSection>

      <FormulaNote items={ADMIN_FORMULAS} />
    </div>
  );
}
