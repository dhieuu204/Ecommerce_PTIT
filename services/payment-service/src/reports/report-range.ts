import { AppError } from '@san/nest-common';

/**
 * Khoảng ngày của báo cáo (RPT-01, RPT-02, quy tắc "Báo cáo (RPT)" ở docs/api/README.md mục 7): `from`, `to` dạng
 * YYYY-MM-DD theo giờ Việt Nam, gồm cả hai ngày; trống thì 30 ngày gần nhất; dài quá 366 ngày hoặc
 * `from > to` → 400 INVALID_RANGE. Việt Nam không đổi giờ mùa hè nên lệch UTC luôn là +7 giờ.
 * Hàm thuần để test đủ trường hợp (cùng một bản ở marketplace-service và payment-service).
 */

/** Giờ Việt Nam = UTC + 7 */
const VN_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;
export const REPORT_DEFAULT_DAYS = 30;
export const REPORT_MAX_DAYS = 366;

export interface ReportRange {
  /** Ngày đầu (YYYY-MM-DD, giờ Việt Nam) */
  from: string;
  /** Ngày cuối, gồm cả ngày này */
  to: string;
  /** Số ngày trong khoảng */
  days: number;
  /** 0 giờ ngày `from` theo giờ Việt Nam, đổi ra UTC */
  start: Date;
  /** 0 giờ ngày sau `to` theo giờ Việt Nam (mốc cuối không tính) */
  end: Date;
  /** Từng ngày trong khoảng, để điền 0 cho ngày không có số liệu */
  dates: string[];
}

const invalid = (message: string) => new AppError(400, 'INVALID_RANGE', message);

/** Số ms của 0 giờ UTC ngày `s`; ngày không có thật (30/02) → null */
function parseDay(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    return null;
  }
  return ms;
}

const dayString = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Hôm nay theo giờ Việt Nam (YYYY-MM-DD) */
export function vnToday(now = new Date()): string {
  return dayString(now.getTime() + VN_OFFSET_MS);
}

/**
 * Đổi `from`/`to` của người gọi thành khoảng thời gian UTC. Chỉ gửi `to`: lấy 30 ngày kết thúc ở `to`;
 * chỉ gửi `from`: tới hôm nay.
 */
export function resolveRange(q: { from?: string; to?: string }, now = new Date()): ReportRange {
  const toMs = q.to ? parseDay(q.to) : parseDay(vnToday(now));
  if (toMs === null) throw invalid('Ngày kết thúc không hợp lệ.');
  const fromMs = q.from ? parseDay(q.from) : toMs - (REPORT_DEFAULT_DAYS - 1) * DAY_MS;
  if (fromMs === null) throw invalid('Ngày bắt đầu không hợp lệ.');
  if (fromMs > toMs) throw invalid('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
  const days = Math.round((toMs - fromMs) / DAY_MS) + 1;
  if (days > REPORT_MAX_DAYS) {
    throw invalid(`Khoảng ngày dài tối đa ${REPORT_MAX_DAYS} ngày.`);
  }
  const dates: string[] = [];
  for (let ms = fromMs; ms <= toMs; ms += DAY_MS) dates.push(dayString(ms));
  return {
    from: dayString(fromMs),
    to: dayString(toMs),
    days,
    start: new Date(fromMs - VN_OFFSET_MS),
    end: new Date(toMs + DAY_MS - VN_OFFSET_MS),
    dates,
  };
}

/** Tỉ lệ theo phần nghìn, làm tròn (125 = 12,5%); mẫu bằng 0 → 0 */
export function perMille(part: number, whole: number): number {
  return whole > 0 ? Math.round((part * 1000) / whole) : 0;
}

/** Số từ PostgreSQL (tổng là bigint, Prisma trả BigInt) đổi ra number; null → 0 */
export const num = (v: bigint | number | null | undefined): number => Number(v ?? 0);
