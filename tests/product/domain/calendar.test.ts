import {
  addDays,
  compareLogicalDates,
  currentLogicalDate,
  daysBetween,
  isoWeekday,
  isValidLogicalDate,
  monthOf,
  parseLogicalDate,
  toLogicalDate,
} from '@/core/calendar/logical-date';

describe('logical dates', () => {
  it('formats and validates iso dates', () => {
    expect(toLogicalDate(2026, 8, 30)).toBe('2026-08-30');
    expect(isValidLogicalDate('2026-08-30')).toBe(true);
    expect(isValidLogicalDate('2026-13-01')).toBe(false);
    expect(isValidLogicalDate('2026-02-30')).toBe(false);
    expect(isValidLogicalDate('26-02-03')).toBe(false);
    expect(parseLogicalDate('2026-02-28')).toEqual({ year: 2026, month: 2, day: 28 });
  });

  it('handles arithmetic across month, year, and leap boundaries', () => {
    expect(addDays('2026-08-31' as never, 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01' as never, -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28' as never, 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28' as never, 1)).toBe('2027-03-01');
    expect(daysBetween('2026-08-01' as never, '2026-08-30' as never)).toBe(29);
    expect(compareLogicalDates('2026-08-30' as never, '2026-09-01' as never)).toBeLessThan(0);
    expect(monthOf('2026-08-30' as never)).toBe('2026-08');
  });

  it('uses iso monday weekdays', () => {
    // 2026-08-30 is a sunday, 2026-08-31 a monday
    expect(isoWeekday('2026-08-30' as never)).toBe(7);
    expect(isoWeekday('2026-08-31' as never)).toBe(1);
  });

  it('derives the logical date from the start-of-day shift', () => {
    // 2026-08-30 01:30 in new york, shift 120 minutes -> still 2026-08-29
    const nowUtc = Date.UTC(2026, 7, 30, 5, 30); // 01:30 edt
    expect(currentLogicalDate(nowUtc, 'America/New_York', 120)).toBe('2026-08-29');
    expect(currentLogicalDate(nowUtc, 'America/New_York', 0)).toBe('2026-08-30');
    // noon shift boundary: 11:59 local belongs to the previous day at shift 720
    const noonish = Date.UTC(2026, 7, 30, 15, 59); // 11:59 edt
    expect(currentLogicalDate(noonish, 'America/New_York', 720)).toBe('2026-08-29');
    const pastNoon = Date.UTC(2026, 7, 30, 16, 0); // 12:00 edt
    expect(currentLogicalDate(pastNoon, 'America/New_York', 720)).toBe('2026-08-30');
  });

  it('uses wall-clock arithmetic across the spring-forward gap', () => {
    // 03:30 edt with a 3-hour shift: wall 210 minutes >= 180 -> still march 8
    const springForward = Date.UTC(2026, 2, 8, 7, 30);
    expect(currentLogicalDate(springForward, 'America/New_York', 180)).toBe('2026-03-08');
    // one minute before the gap: 01:59 est, shift 120 -> previous day
    const beforeGap = Date.UTC(2026, 2, 8, 6, 59);
    expect(currentLogicalDate(beforeGap, 'America/New_York', 120)).toBe('2026-03-07');
    // the gap jumps to 03:00 edt, which is past the shift -> march 8
    const afterGap = Date.UTC(2026, 2, 8, 7, 0);
    expect(currentLogicalDate(afterGap, 'America/New_York', 120)).toBe('2026-03-08');
  });

  it('records the exact offset for both passes of a repeated local hour', () => {
    const { offsetMinutesAt } = require('@/core/calendar/logical-date') as typeof import('../../../src/core/calendar/logical-date');
    const firstPass = Date.UTC(2026, 10, 1, 5, 30); // 01:30 edt
    const secondPass = Date.UTC(2026, 10, 1, 6, 30); // 01:30 est
    expect(offsetMinutesAt(firstPass, 'America/New_York')).toBe(-240);
    expect(offsetMinutesAt(secondPass, 'America/New_York')).toBe(-300);
  });

  it('stays stable across daylight-saving transitions in both directions', () => {
    // us spring forward 2026-03-08 02:00 -> 03:00 edt
    const springForward = Date.UTC(2026, 2, 8, 7, 30); // 02:30 est does not exist; 03:30 edt
    expect(currentLogicalDate(springForward, 'America/New_York', 0)).toBe('2026-03-08');
    // fall back 2026-11-01: 01:30 occurs twice
    const fallBackFirst = Date.UTC(2026, 10, 1, 5, 30); // 01:30 edt (first pass)
    const fallBackSecond = Date.UTC(2026, 10, 1, 6, 30); // 01:30 est (second pass)
    expect(currentLogicalDate(fallBackFirst, 'America/New_York', 0)).toBe('2026-11-01');
    expect(currentLogicalDate(fallBackSecond, 'America/New_York', 0)).toBe('2026-11-01');
    // with a 2-hour shift both passes still land on the previous logical day
    expect(currentLogicalDate(fallBackFirst, 'America/New_York', 120)).toBe('2026-10-31');
  });
});
