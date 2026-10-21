import { AppError } from '@san/nest-common';
import { perMille, resolveRange, vnToday } from './report-range';

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? `${e.status} ${e.code}` : String(e);
  }
  return 'ok';
};

describe('Khoảng ngày báo cáo (giờ Việt Nam)', () => {
  // 21/10/2026 23:30 giờ Việt Nam = 16:30 UTC
  const now = new Date('2026-10-21T16:30:00Z');

  it('hôm nay theo giờ Việt Nam, kể cả khi UTC còn là hôm trước', () => {
    expect(vnToday(new Date('2026-10-21T17:30:00Z'))).toBe('2026-10-22');
    expect(vnToday(new Date('2026-10-21T16:59:59Z'))).toBe('2026-10-21');
  });

  it('mặc định 30 ngày gần nhất, gồm hôm nay', () => {
    const r = resolveRange({}, now);
    expect(r).toMatchObject({ from: '2026-09-22', to: '2026-10-21', days: 30 });
    expect(r.dates).toHaveLength(30);
    expect(r.dates[0]).toBe('2026-09-22');
    expect(r.dates[29]).toBe('2026-10-21');
  });

  it('mốc UTC: 0 giờ Việt Nam ngày đầu tới 0 giờ ngày sau ngày cuối', () => {
    const r = resolveRange({ from: '2026-10-01', to: '2026-10-01' }, now);
    expect(r.start.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-10-01T17:00:00.000Z');
    expect(r.days).toBe(1);
  });

  it('chỉ gửi to: 30 ngày kết thúc ở to; chỉ gửi from: tới hôm nay', () => {
    expect(resolveRange({ to: '2026-03-01' }, now)).toMatchObject({
      from: '2026-01-31',
      to: '2026-03-01',
    });
    expect(resolveRange({ from: '2026-10-15' }, now)).toMatchObject({ to: '2026-10-21', days: 7 });
  });

  it('366 ngày được, 367 ngày hoặc from > to → INVALID_RANGE', () => {
    expect(resolveRange({ from: '2025-10-21', to: '2026-10-21' }, now).days).toBe(366);
    expect(code(() => resolveRange({ from: '2025-10-20', to: '2026-10-21' }, now))).toBe(
      '400 INVALID_RANGE',
    );
    expect(code(() => resolveRange({ from: '2026-10-10', to: '2026-10-09' }, now))).toBe(
      '400 INVALID_RANGE',
    );
    expect(code(() => resolveRange({ from: '2026-02-30', to: '2026-03-01' }, now))).toBe(
      '400 INVALID_RANGE',
    );
  });

  it('tỉ lệ phần nghìn làm tròn, mẫu 0 → 0', () => {
    expect(perMille(1, 8)).toBe(125);
    expect(perMille(2, 3)).toBe(667);
    expect(perMille(0, 0)).toBe(0);
  });
});
