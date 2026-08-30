import type { LogicalDate } from '../domain/ids';
import { yearOf } from '../calendar/logical-date';

// total monthly check-in counts for one calendar year; months 1..12
export function monthlyCounts(
  countsByDate: ReadonlyMap<string, number>,
  year: number,
): number[] {
  const months = new Array<number>(12).fill(0);
  for (const [date, count] of countsByDate) {
    if (yearOf(date as LogicalDate) !== year) {
      continue;
    }
    const month = Number(date.slice(5, 7));
    months[month - 1] += count;
  }
  return months;
}
