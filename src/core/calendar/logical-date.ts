import type { LogicalDate } from '../domain/ids';

const DATE_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) {
    return 29;
  }
  return DAYS_IN_MONTH[month - 1];
}

export function toLogicalDate(year: number, month: number, day: number): LogicalDate {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${mm}-${dd}` as LogicalDate;
}

export function isValidLogicalDate(value: string): value is LogicalDate {
  const match = DATE_SHAPE.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function parseLogicalDate(value: LogicalDate | string): {
  year: number;
  month: number;
  day: number;
} {
  const match = DATE_SHAPE.exec(value);
  if (!match) {
    throw new Error('invalid logical date');
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

// epoch day arithmetic through utc keeps the math pure and dst-free
function toEpochDay(date: LogicalDate | string): number {
  const { year, month, day } = parseLogicalDate(date);
  return Date.UTC(year, month - 1, day) / 86400000;
}

function fromEpochDay(epochDay: number): LogicalDate {
  const d = new Date(epochDay * 86400000);
  return toLogicalDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(date: LogicalDate, days: number): LogicalDate {
  return fromEpochDay(toEpochDay(date) + days);
}

export function daysBetween(from: LogicalDate, to: LogicalDate): number {
  return toEpochDay(to) - toEpochDay(from);
}

export function compareLogicalDates(a: LogicalDate, b: LogicalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// iso weekday: monday = 1 ... sunday = 7, fixed across locales
export function isoWeekday(date: LogicalDate): number {
  const jsDay = new Date(toEpochDay(date) * 86400000).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

export function startOfIsoWeek(date: LogicalDate): LogicalDate {
  return addDays(date, 1 - isoWeekday(date));
}

export function monthOf(date: LogicalDate): string {
  return date.slice(0, 7);
}

export function yearOf(date: LogicalDate): number {
  return Number(date.slice(0, 4));
}

// formats an instant as the calendar date observed in a time zone
export function localDateOfInstant(utcMs: number, timeZoneId: string): LogicalDate {
  const local = localWallClock(utcMs, timeZoneId);
  return toLogicalDate(local.year, local.month, local.day);
}

// the board's logical "today": the local wall-clock time minus the shift.
// a local time-of-day before the shift belongs to the previous calendar day.
// wall-clock arithmetic (not instant arithmetic) keeps the boundary stable
// across daylight-saving gaps and repeats. stored dates never recompute.
export function currentLogicalDate(
  nowUtcMs: number,
  timeZoneId: string,
  startOfDayMinute: number,
): LogicalDate {
  const local = localWallClock(nowUtcMs, timeZoneId);
  const date = toLogicalDate(local.year, local.month, local.day);
  return local.hour * 60 + local.minute < startOfDayMinute ? addDays(date, -1) : date;
}

// signed utc offset in minutes observed in a zone at an instant
export function offsetMinutesAt(utcMs: number, timeZoneId: string): number {
  const local = localWallClock(utcMs, timeZoneId);
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  return Math.round((asUtc - truncateToMinute(utcMs)) / 60000);
}

function truncateToMinute(utcMs: number): number {
  return Math.floor(utcMs / 60000) * 60000;
}

const wallClockFormatters = new Map<string, Intl.DateTimeFormat>();

function wallClockFormatterFor(timeZoneId: string): Intl.DateTimeFormat {
  let formatter = wallClockFormatters.get(timeZoneId);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZoneId,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    wallClockFormatters.set(timeZoneId, formatter);
  }
  return formatter;
}

export function localWallClock(
  utcMs: number,
  timeZoneId: string,
): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = wallClockFormatterFor(timeZoneId).formatToParts(new Date(utcMs));
  const read = (type: string): number => {
    const part = parts.find((p) => p.type === type);
    /* istanbul ignore next: intl always emits the requested parts */
    return part ? Number(part.value) : 0;
  };
  // intl reports midnight as 24 in some engines with hour12 false
  const hour = read('hour') % 24;
  return { year: read('year'), month: read('month'), day: read('day'), hour, minute: read('minute') };
}
