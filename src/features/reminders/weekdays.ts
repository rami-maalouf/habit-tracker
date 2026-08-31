import { weekdaysInMask } from '@/core/domain/reminder-commands';

// iso order monday through sunday, fixed across the app per the spec
export const WEEKDAYS = [
  { iso: 1, short: 'M', name: 'Monday', summary: 'Mon' },
  { iso: 2, short: 'T', name: 'Tuesday', summary: 'Tue' },
  { iso: 3, short: 'W', name: 'Wednesday', summary: 'Wed' },
  { iso: 4, short: 'T', name: 'Thursday', summary: 'Thu' },
  { iso: 5, short: 'F', name: 'Friday', summary: 'Fri' },
  { iso: 6, short: 'S', name: 'Saturday', summary: 'Sat' },
  { iso: 7, short: 'S', name: 'Sunday', summary: 'Sun' },
] as const;

export function toggleWeekday(mask: number, isoWeekday: number): number {
  return mask ^ (1 << (isoWeekday - 1));
}

export function isWeekdaySelected(mask: number, isoWeekday: number): boolean {
  return (mask & (1 << (isoWeekday - 1))) !== 0;
}

export function weekdaySummary(mask: number): string {
  const selected = weekdaysInMask(mask);
  if (selected.length === 7) {
    return 'Every day';
  }
  return selected
    .map((iso) => WEEKDAYS[iso - 1].summary)
    .join(', ');
}

export function formatMinuteOfDay(minute: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: 'numeric' }).format(
    new Date(2000, 0, 1, Math.floor(minute / 60), minute % 60),
  );
}
