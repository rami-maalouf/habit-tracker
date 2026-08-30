import { isValidLogicalDate } from '../calendar/logical-date';
import { boardLimits, boardSymbolAllowlist } from './entities';
import type { LogicalDate } from './ids';
import type { DomainResult } from './result';
import { err, ok } from './result';

function codePointLength(value: string): number {
  return [...value].length;
}

export function validateTitle(raw: string): DomainResult<string> {
  const title = raw.trim();
  if (title.length === 0) {
    return err('validation', 'A board needs a name.', { field: 'title' });
  }
  if (codePointLength(title) > boardLimits.titleMaxCodePoints) {
    return err('validation', 'The name is limited to 80 characters.', { field: 'title' });
  }
  return ok(title);
}

export function validateSymbol(symbol: string): DomainResult<string> {
  if (!(boardSymbolAllowlist as readonly string[]).includes(symbol)) {
    return err('validation', 'Choose a symbol from the list.', { field: 'symbol' });
  }
  return ok(symbol);
}

const ACCENT_SHAPE = /^#[0-9A-F]{6}$/;

export function validateAccentHex(raw: string): DomainResult<string> {
  const accent = raw.toUpperCase();
  if (!ACCENT_SHAPE.test(accent)) {
    return err('validation', 'Colors use the #RRGGBB form.', { field: 'accentHex' });
  }
  return ok(accent);
}

// finite, positive, bounded, and at most three decimal places
export function validateAmount(amount: number, field = 'amount'): DomainResult<number> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return err('validation', 'Enter an amount greater than zero.', { field });
  }
  if (amount > boardLimits.amountMax) {
    return err('validation', 'The amount is too large.', { field });
  }
  const scaled = amount * 1000;
  if (Math.abs(scaled - Math.round(scaled)) > 1e-6) {
    return err('validation', 'Amounts use at most three decimal places.', { field });
  }
  return ok(amount);
}

export function validateUnit(raw: string | null | undefined): DomainResult<string | null> {
  if (raw === null || raw === undefined) {
    return ok(null);
  }
  const unit = raw.trim();
  if (unit.length === 0) {
    return ok(null);
  }
  if (codePointLength(unit) > boardLimits.unitMaxCodePoints) {
    return err('validation', 'Units are limited to 20 characters.', { field: 'amountUnit' });
  }
  return ok(unit);
}

export function validateNote(raw: string | null | undefined): DomainResult<string | null> {
  if (raw === null || raw === undefined) {
    return ok(null);
  }
  const note = raw.trim();
  if (note.length === 0) {
    return ok(null);
  }
  if (codePointLength(note) > boardLimits.noteMaxCodePoints) {
    return err('validation', 'Notes are limited to 10,000 characters.', { field: 'note' });
  }
  return ok(note);
}

export function validateStartOfDayMinute(minute: number): DomainResult<number> {
  if (
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > boardLimits.startOfDayMinuteMax ||
    minute % boardLimits.startOfDayMinuteStep !== 0
  ) {
    return err('validation', 'Start of day uses 30-minute steps up to noon.', {
      field: 'startOfDayMinute',
    });
  }
  return ok(minute);
}

export function validateLogicalDateInput(
  raw: string,
  today: LogicalDate,
): DomainResult<LogicalDate> {
  if (!isValidLogicalDate(raw)) {
    return err('validation', 'Dates use the YYYY-MM-DD form.', { field: 'logicalDate' });
  }
  if (raw > (today as string)) {
    return err('validation', 'Future dates cannot receive check-ins.', { field: 'logicalDate' });
  }
  return ok(raw as LogicalDate);
}

export function validateWeekdaysMask(mask: number): DomainResult<number> {
  if (!Number.isInteger(mask) || mask <= 0 || mask > 0b1111111) {
    return err('validation', 'Pick at least one weekday.', { field: 'weekdaysMask' });
  }
  return ok(mask);
}

export function validateMinuteOfDay(minute: number): DomainResult<number> {
  if (!Number.isInteger(minute) || minute < 0 || minute > 1439) {
    return err('validation', 'Pick a valid time of day.', { field: 'minuteOfDay' });
  }
  return ok(minute);
}

export function validateReminderMessage(
  raw: string | null | undefined,
): DomainResult<string | null> {
  if (raw === null || raw === undefined) {
    return ok(null);
  }
  const message = raw.trim();
  if (message.length === 0) {
    return ok(null);
  }
  if (codePointLength(message) > boardLimits.reminderMessageMaxCodePoints) {
    return err('validation', 'Messages are limited to 180 characters.', { field: 'message' });
  }
  return ok(message);
}
