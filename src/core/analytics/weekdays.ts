import { addDays, compareLogicalDates, isoWeekday } from '../calendar/logical-date';
import type { LogicalDate } from '../domain/ids';

export type WeekdayDirection = 'up' | 'down' | 'neutral';

export type WeekdayAnalytics = {
  // monday..sunday counts over the rolling window
  weekdayCounts: number[];
  workdayCount: number;
  weekendCount: number;
  workdayPercent: number | null;
  weekendPercent: number | null;
  // latest 182 elapsed days vs the preceding 183
  direction: WeekdayDirection;
};

// rolling 365 logical days ending today
export function weekdayAnalytics(
  countsByDate: ReadonlyMap<string, number>,
  today: LogicalDate,
): WeekdayAnalytics {
  const windowStart = addDays(today, -364);
  const splitStart = addDays(today, -181); // latest 182 days: today-181 .. today
  const weekdayCounts = new Array<number>(7).fill(0);
  let workdayCount = 0;
  let weekendCount = 0;
  let latest = 0;
  let preceding = 0;
  for (const [date, count] of countsByDate) {
    const logical = date as LogicalDate;
    if (
      compareLogicalDates(logical, windowStart) < 0 ||
      compareLogicalDates(logical, today) > 0
    ) {
      continue;
    }
    const weekday = isoWeekday(logical);
    weekdayCounts[weekday - 1] += count;
    if (weekday <= 5) {
      workdayCount += count;
    } else {
      weekendCount += count;
    }
    if (compareLogicalDates(logical, splitStart) >= 0) {
      latest += count;
    } else {
      preceding += count;
    }
  }
  const total = workdayCount + weekendCount;
  return {
    weekdayCounts,
    workdayCount,
    weekendCount,
    workdayPercent: total === 0 ? null : (workdayCount / total) * 100,
    weekendPercent: total === 0 ? null : (weekendCount / total) * 100,
    direction: latest > preceding ? 'up' : latest < preceding ? 'down' : 'neutral',
  };
}
