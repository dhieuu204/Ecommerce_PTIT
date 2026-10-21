import { useSearchParams } from 'react-router';
import { addDays, isDay, MAX_RANGE_DAYS, RANGE_PRESETS, rangeDays, vnToday } from './report-format';

/**
 * Khoảng ngày và tab của trang Báo cáo, giữ trên đường dẫn (?from=&to=&tab=) để tải lại hay gửi link vẫn
 * giữ đúng. Mặc định 30 ngày gần nhất theo giờ Việt Nam.
 */
export function useReportParams<T extends string>(tabs: readonly T[]) {
  const [params, setParams] = useSearchParams();
  const today = vnToday();
  const rawTo = params.get('to');
  const rawFrom = params.get('from');
  const to = isDay(rawTo) ? rawTo : today;
  const from = isDay(rawFrom) ? rawFrom : addDays(to, -29);
  const tabParam = params.get('tab') as T | null;
  const tab: T = tabParam && tabs.includes(tabParam) ? tabParam : tabs[0]!;
  const preset =
    to === today ? RANGE_PRESETS.find((n) => from === addDays(today, -(n - 1))) : undefined;

  /** Lỗi khoảng ngày kiểm ngay trên web (máy chủ vẫn kiểm lại): có lỗi thì không gọi API */
  const rangeError =
    from > to
      ? 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.'
      : rangeDays(from, to) > MAX_RANGE_DAYS
        ? `Khoảng ngày dài tối đa ${MAX_RANGE_DAYS} ngày.`
        : null;

  const update = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
  };

  return {
    from,
    to,
    today,
    tab,
    preset,
    rangeError,
    setTab: (t: T) => update({ tab: t === tabs[0] ? null : t }),
    setRange: (r: { from: string; to: string }) => update(r),
    setPreset: (days: number) => update({ from: addDays(today, -(days - 1)), to: today }),
  };
}
