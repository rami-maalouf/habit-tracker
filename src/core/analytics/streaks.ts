import type { ActivityPeriodRange } from '../calendar/periods';
import { isDateEligible } from '../calendar/periods';
import { addDays, compareLogicalDates, daysBetween } from '../calendar/logical-date';
import type { LogicalDate } from '../domain/ids';

// completedDays holds every logical date with at least one non-deleted
// check-in. closed activity periods break streaks because the gap days are
// not completed; eligibility does not rescue a streak across a gap.

export function currentStreak(completedDays: ReadonlySet<string>, today: LogicalDate): number {
  // an unfinished current day does not break the streak early
  let cursor: LogicalDate = completedDays.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (completedDays.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function longestStreak(completedDays: ReadonlySet<string>): number {
  let longest = 0;
  for (const day of completedDays) {
    // only count runs from their first day
    if (completedDays.has(addDays(day as LogicalDate, -1))) {
      continue;
    }
    let length = 0;
    let cursor = day as LogicalDate;
    while (completedDays.has(cursor)) {
      length += 1;
      cursor = addDays(cursor, 1);
    }
    longest = Math.max(longest, length);
  }
  return longest;
}

export type StreakSpan = {
  startDate: LogicalDate;
  endDate: LogicalDate;
  length: number;
};

// consecutive completed runs intersecting [windowStart, windowEnd]
export function streakSpans(
  completedDays: ReadonlySet<string>,
  windowStart: LogicalDate,
  windowEnd: LogicalDate,
): StreakSpan[] {
  const spans: StreakSpan[] = [];
  for (const day of completedDays) {
    const date = day as LogicalDate;
    if (completedDays.has(addDays(date, -1))) {
      continue;
    }
    let end = date;
    while (completedDays.has(addDays(end, 1))) {
      end = addDays(end, 1);
    }
    if (compareLogicalDates(end, windowStart) < 0 || compareLogicalDates(date, windowEnd) > 0) {
      continue;
    }
    spans.push({ startDate: date, endDate: end, length: daysBetween(date, end) + 1 });
  }
  spans.sort((a, b) => compareLogicalDates(a.startDate, b.startDate));
  return spans;
}

// streak availability begins after the first completed day exists
export function hasAnyCompletedDay(completedDays: ReadonlySet<string>): boolean {
  return completedDays.size > 0;
}

export function isCompletedDayEligible(
  day: LogicalDate,
  periods: ActivityPeriodRange[],
  today: LogicalDate,
): boolean {
  return isDateEligible(day, periods, today);
}
