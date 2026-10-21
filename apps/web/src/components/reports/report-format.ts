/**
 * Định dạng và khoảng ngày cho trang Báo cáo. Ngày là chuỗi YYYY-MM-DD theo giờ Việt Nam (như API),
 * tính bằng UTC để không lệch múi giờ của máy người xem.
 */

const DAY_MS = 86_400_000;
export const MAX_RANGE_DAYS = 366;
export const RANGE_PRESETS = [7, 30, 90] as const;

const vnDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Hôm nay theo giờ Việt Nam (YYYY-MM-DD) */
export const vnToday = () => vnDate.format(new Date());

const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);

export const isDay = (s: string | null): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toMs(s));

/** Cộng/trừ số ngày */
export const addDays = (d: string, n: number) =>
  new Date(toMs(d) + n * DAY_MS).toISOString().slice(0, 10);

/** Số ngày của khoảng, gồm cả hai đầu */
export const rangeDays = (from: string, to: string) =>
  Math.round((toMs(to) - toMs(from)) / DAY_MS) + 1;

/** "2026-10-05" → "05/10" */
export const dayLabel = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** "2026-10-05" → "05/10/2026" */
export const fullDayLabel = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
/** "2026-10-05" → "T2" */
export const weekday = (d: string) => WEEKDAYS[new Date(toMs(d)).getUTCDay()] ?? '';

/** Phần nghìn → phần trăm: 125 → "12,5%" */
export const formatPerMille = (v: number) =>
  `${(v / 10).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;

/** Tiền gọn cho trục biểu đồ: 1.250.000 → "1,3tr", 2.000.000.000 → "2 tỷ", 500.000 → "500k" */
export function compactMoney(vnd: number): string {
  const abs = Math.abs(vnd);
  const fmt = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  if (abs >= 1e9) return `${fmt(vnd / 1e9)} tỷ`;
  if (abs >= 1e6) return `${fmt(vnd / 1e6)}tr`;
  if (abs >= 1e3) return `${fmt(vnd / 1e3)}k`;
  return String(vnd);
}

/** Số đếm: 1250 → "1.250" */
export const formatCount = (n: number) => n.toLocaleString('vi-VN');
