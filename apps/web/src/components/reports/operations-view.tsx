import {
  BadgeCheck,
  Ban,
  CircleDollarSign,
  ReceiptText,
  ShoppingBag,
  Store,
  Undo2,
} from 'lucide-react';
import { formatMoney } from '@/lib/format';
import type {
  AdminOperationsReport,
  ShopOperationsReport,
  TopProduct,
  TopShop,
} from '@/lib/report-types';
import { CHART_COLORS, DailyChart, type ChartSeries } from './daily-chart';
import { formatCount } from './report-format';
import {
  FormulaNote,
  RateTile,
  ReportSection,
  StatTile,
  TopProductsTable,
  TopShopsTable,
  VoucherTable,
} from './report-parts';

const FORMULAS: Array<[string, string]> = [
  [
    'Số đơn, giá trị đặt hàng',
    'Đơn của từng shop đặt trong khoảng ngày (giờ Việt Nam), gồm cả đơn đang xử lý và đơn bị hủy; không tính đơn trả trước chưa thanh toán đã hết hạn. Giá trị = tổng tiền hàng.',
  ],
  [
    'Doanh số',
    'Của đơn đang ở trạng thái hoàn tất: tiền hàng trừ giảm giá của shop, trừ tiền hàng của món đã trả và đã được hoàn tiền.',
  ],
  ['Tỉ lệ hủy', 'Số đơn bị hủy chia cho số đơn.'],
  [
    'Tỉ lệ trả hàng',
    'Số đơn có yêu cầu trả hàng đã hoàn tiền chia cho số đơn đã giao tới tay người mua.',
  ],
  ['Sản phẩm bán chạy', 'Số lượng trong các đơn không bị hủy, giá lúc đặt.'],
  ['Hiệu quả voucher', 'Đơn không bị hủy có dùng mã: số đơn, tổng tiền giảm, tổng tiền hàng.'],
];

const DAILY_SERIES: Array<ChartSeries<'orderValue' | 'orderCount'>> = [
  {
    key: 'orderValue',
    label: 'Giá trị đặt hàng',
    kind: 'bar',
    color: CHART_COLORS.navy,
    unit: 'money',
  },
  {
    key: 'orderCount',
    label: 'Số đơn',
    kind: 'line',
    color: CHART_COLORS.champagne,
    unit: 'count',
    axis: 'right',
  },
];

/**
 * Báo cáo vận hành (RPT-01) cho shop hoặc cả sàn. Cả sàn (`admin`) thêm số shop có đơn, 10 shop hàng đầu
 * và cột shop/voucher sàn.
 */
export function OperationsView({
  data,
  admin,
  productLink,
  shopLink,
}: {
  data: ShopOperationsReport | AdminOperationsReport;
  admin?: boolean;
  productLink?: (p: TopProduct) => string;
  shopLink?: (s: TopShop) => string;
}) {
  const s = data.summary;
  const adminData = admin ? (data as AdminOperationsReport) : null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          highlight
          icon={CircleDollarSign}
          label="Giá trị đặt hàng"
          value={formatMoney(s.orderValue)}
          hint={
            s.orderCount > 0
              ? `Trung bình ${formatMoney(Math.round(s.orderValue / s.orderCount))}/đơn`
              : 'Chưa có đơn'
          }
        />
        <StatTile
          icon={ShoppingBag}
          label="Số đơn"
          value={formatCount(s.orderCount)}
          hint={adminData ? `Từ ${formatCount(adminData.shopCount)} shop` : 'Đơn đã đặt'}
        />
        <StatTile
          icon={BadgeCheck}
          label="Đơn hoàn tất"
          value={formatCount(s.completedCount)}
          hint={`Đã giao ${formatCount(s.deliveredCount)} đơn`}
        />
        <StatTile
          icon={ReceiptText}
          label="Doanh số"
          value={formatMoney(s.revenue)}
          hint="Của đơn hoàn tất, sau giảm giá và trả hàng"
        />
      </div>
      <div className={adminData ? 'grid gap-3 md:grid-cols-3' : 'grid gap-3 md:grid-cols-2'}>
        <RateTile
          icon={Ban}
          label="Tỉ lệ hủy"
          rate={s.cancelRate}
          hint={`${formatCount(s.cancelledCount)} / ${formatCount(s.orderCount)} đơn bị hủy`}
        />
        <RateTile
          icon={Undo2}
          label="Tỉ lệ trả hàng"
          rate={s.returnRate}
          hint={`${formatCount(s.returnedCount)} / ${formatCount(s.deliveredCount)} đơn đã giao được hoàn tiền trả hàng`}
        />
        {adminData && (
          <StatTile
            icon={Store}
            label="Shop có đơn"
            value={formatCount(adminData.shopCount)}
            hint="Số shop có ít nhất một đơn trong khoảng"
          />
        )}
      </div>

      <ReportSection title="Đơn hàng theo ngày" description="Cột: giá trị đặt hàng · Đường: số đơn">
        <DailyChart
          data={data.daily}
          series={DAILY_SERIES}
          emptyText="Chưa có đơn nào trong khoảng ngày này."
        />
      </ReportSection>

      {adminData && (
        <ReportSection
          title="10 shop hàng đầu"
          description="Xếp theo giá trị đặt hàng"
          bodyClassName="py-1 md:py-2"
        >
          <TopShopsTable items={adminData.topShops} shopLink={shopLink} />
        </ReportSection>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <ReportSection
          title="Sản phẩm bán chạy"
          description="10 sản phẩm bán nhiều nhất (đơn không bị hủy)"
          bodyClassName="py-1 md:py-2"
        >
          <TopProductsTable items={data.topProducts} showShop={admin} productLink={productLink} />
        </ReportSection>
        <ReportSection
          title="Hiệu quả voucher"
          description={admin ? 'Voucher sàn và voucher shop' : 'Voucher của shop'}
          bodyClassName="py-1 md:py-2"
        >
          <VoucherTable items={data.vouchers} showScope={admin} />
        </ReportSection>
      </div>

      <FormulaNote items={FORMULAS} />
    </div>
  );
}
