import type { LogicalDate } from '../domain/ids';
import { compareLogicalDates } from './logical-date';

export type ActivityPeriodRange = {
  startDate: LogicalDate;
  endDate: LogicalDate | null;
};

// a date is eligible when it falls inside any open or closed activity period
// and is not in the future; archived gaps and pre-creation days are excluded
export function isDateEligible(
  date: LogicalDate,
  periods: ActivityPeriodRange[],
  today: LogicalDate,
): boolean {
  if (compareLogicalDates(date, today) > 0) {
    return false;
  }
  return periods.some(
    (period) =>
      compareLogicalDates(date, period.startDate) >= 0 &&
      (period.endDate === null || compareLogicalDates(date, period.endDate) <= 0),
  );
}
