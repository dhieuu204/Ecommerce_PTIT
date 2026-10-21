import { BarChart3 } from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { EmptyState } from '@/components/console/empty-state';
import { formatMoney } from '@/lib/format';
import { compactMoney, dayLabel, formatCount, fullDayLabel, weekday } from './report-format';

/** Màu biểu đồ lấy từ token của theme (index.css), không viết mã màu */
export const CHART_COLORS = {
  navy: 'var(--color-navy)',
  champagne: 'var(--color-champagne)',
  ink: 'var(--color-ink)',
} as const;

export interface ChartSeries<K extends string = string> {
  key: K;
  label: string;
  /** Cột hay đường */
  kind: 'bar' | 'line';
  color: string;
  /** money: định dạng 1.250.000đ; count: số đếm */
  unit: 'money' | 'count';
  /** Trục bên phải (khi trộn tiền và số đếm) */
  axis?: 'left' | 'right';
  dashed?: boolean;
}

type Row<K extends string> = { date: string } & Record<K, number>;

const tickStyle = { fontSize: 11, fill: 'var(--muted-foreground)' };

const formatValue = (unit: ChartSeries['unit'], v: number) =>
  unit === 'money' ? formatMoney(v) : formatCount(v);

/**
 * Biểu đồ theo ngày (Recharts): cột và/hoặc đường, co giãn theo bề ngang (dùng được trên điện thoại).
 * Trục ngày ghi dd/MM; tooltip tiếng Việt, tiền dạng 1.250.000đ. Mọi giá trị bằng 0 → ô trống.
 */
export function DailyChart<K extends string>({
  data,
  series,
  emptyText = 'Chưa có số liệu trong khoảng ngày này.',
  height = 280,
}: {
  data: Array<Row<K>>;
  series: Array<ChartSeries<K>>;
  emptyText?: string;
  height?: number;
}) {
  const empty = data.every((d) => series.every((s) => !d[s.key]));
  const leftUnit = series.find((s) => s.axis !== 'right')?.unit ?? 'money';
  const right = series.find((s) => s.axis === 'right');
  const tick = (unit: ChartSeries['unit']) => (v: number) =>
    unit === 'money' ? compactMoney(v) : formatCount(v);

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/70">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span
              className={s.kind === 'bar' ? 'size-2.5 rounded-sm' : 'h-0.5 w-3.5 rounded-full'}
              style={{ backgroundColor: s.color }}
              aria-hidden
            />
            {s.label}
          </li>
        ))}
      </ul>
      {empty ? (
        <EmptyState icon={BarChart3} title="Chưa có số liệu" text={emptyText} className="py-12" />
      ) : (
        <div style={{ height }} className="-ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-ivory-200)" />
              <XAxis
                dataKey="date"
                tickFormatter={dayLabel}
                tick={tickStyle}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-ivory-200)' }}
                minTickGap={18}
              />
              <YAxis
                yAxisId="left"
                tickFormatter={tick(leftUnit)}
                tick={tickStyle}
                tickLine={false}
                axisLine={false}
                width={52}
                allowDecimals={false}
              />
              {right && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={tick(right.unit)}
                  tick={tickStyle}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  allowDecimals={false}
                />
              )}
              <Tooltip
                cursor={{ fill: 'var(--color-champagne-50)', opacity: 0.6 }}
                content={(p: TooltipContentProps) => (
                  <ChartTooltip
                    active={p.active}
                    label={p.label}
                    row={p.payload?.[0]?.payload as Row<K> | undefined}
                    series={series}
                  />
                )}
              />
              {series.map((s) =>
                s.kind === 'bar' ? (
                  <Bar
                    key={s.key}
                    yAxisId={s.axis ?? 'left'}
                    dataKey={s.key}
                    name={s.label}
                    fill={s.color}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                ) : (
                  <Line
                    key={s.key}
                    yAxisId={s.axis ?? 'left'}
                    dataKey={s.key}
                    name={s.label}
                    type="monotone"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeDasharray={s.dashed ? '5 4' : undefined}
                    dot={data.length <= 31 ? { r: 2.5, strokeWidth: 0, fill: s.color } : false}
                    activeDot={{ r: 4 }}
                  />
                ),
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function ChartTooltip<K extends string>({
  active,
  label,
  row,
  series,
}: {
  active?: boolean;
  label?: string | number;
  row?: Row<K>;
  series: Array<ChartSeries<K>>;
}) {
  if (!active || !row || typeof label !== 'string') return null;
  return (
    <div className="min-w-44 rounded-xl border bg-card px-3 py-2 text-xs shadow-lg shadow-navy/10">
      <div className="mb-1.5 font-semibold text-navy">
        {weekday(label)}, {fullDayLabel(label)}
      </div>
      <dl className="space-y-1">
        {series.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-1.5 text-ink/70">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: s.color }}
                aria-hidden
              />
              {s.label}
            </dt>
            <dd className="font-medium text-ink tabular-nums">
              {formatValue(s.unit, row[s.key] ?? 0)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
