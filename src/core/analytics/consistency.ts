import type { ActivityPeriodRange } from '../calendar/periods';
import { isDateEligible } from '../calendar/periods';
import { addDays, compareLogicalDates } from '../calendar/logical-date';
import type { LogicalDate } from '../domain/ids';

export type ConsistencyBand = 'low' | 'average' | 'high';

// completed eligible days / elapsed eligible days * 100; raw value unrounded
export function consistencyPercent(
  completedDays: ReadonlySet<string>,
  periods: ActivityPeriodRange[],
  rangeStart: LogicalDate,
  rangeEnd: LogicalDate,
  today: LogicalDate,
): { percent: number | null; eligibleDays: number; completedEligibleDays: number } {
  let eligible = 0;
  let completed = 0;
  let cursor = rangeStart;
  while (compareLogicalDates(cursor, rangeEnd) <= 0) {
    if (isDateEligible(cursor, periods, today)) {
      eligible += 1;
      if (completedDays.has(cursor)) {
        completed += 1;
      }
    }
    cursor = addDays(cursor, 1);
  }
  if (eligible === 0) {
    return { percent: null, eligibleDays: 0, completedEligibleDays: 0 };
  }
  return {
    percent: (completed / eligible) * 100,
    eligibleDays: eligible,
    completedEligibleDays: completed,
  };
}

// bands classify the RAW percent (low < 40, average < 75, high otherwise);
// rounding happens only at presentation, never before classification
export function consistencyBand(percent: number): ConsistencyBand {
  if (percent < 40) {
    return 'low';
  }
  if (percent < 75) {
    return 'average';
  }
  return 'high';
}

// percentages round half away from zero at presentation time
export function roundHalfAwayFromZero(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}
