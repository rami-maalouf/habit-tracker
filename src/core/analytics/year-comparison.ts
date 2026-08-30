import { monthlyCounts } from './timeline';

export type YearComparison = {
  selectedYear: number;
  previousYear: number;
  // months 1..12; null marks an unavailable future month in the current year
  selected: (number | null)[];
  previous: number[];
};

export function yearComparison(
  countsByDate: ReadonlyMap<string, number>,
  selectedYear: number,
  currentYear: number,
  currentMonth: number,
): YearComparison {
  const selectedRaw = monthlyCounts(countsByDate, selectedYear);
  const selected = selectedRaw.map((count, index) => {
    // future months in the selected current year are unavailable, not zero
    if (selectedYear === currentYear && index + 1 > currentMonth) {
      return null;
    }
    return count;
  });
  return {
    selectedYear,
    previousYear: selectedYear - 1,
    selected,
    previous: monthlyCounts(countsByDate, selectedYear - 1),
  };
}
