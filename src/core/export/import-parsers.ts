import { boardLimits, boardPalette, boardSymbolAllowlist } from '../domain/entities';
import type { DomainResult } from '../domain/result';
import { err, ok } from '../domain/result';

// normalized import drafts shared by both sources; the import command maps
// them onto real records inside one exclusive transaction

export type ImportBoardDraft = {
  sourceId: string;
  title: string;
  symbol: string;
  accentHex: string;
  usesTintedBackground: boolean;
  tracksAmount: boolean;
  amountUnit: string | null;
  quickAmount: number;
  tracksTime: boolean;
  startOfDayMinute: number;
  metricsEnabled: boolean;
  createdAtUtc: number;
  archivedAtUtc: number | null;
  // own-format restores keep original ids and activity periods
  preserveId: boolean;
  periods: { startDate: string; endDate: string | null }[] | null;
  orderKey: string | null;
};

export type ImportCheckInDraft = {
  sourceId: string | null;
  sourceBoardId: string;
  occurredAtUtc: number | null;
  createdAtUtc: number;
  amount: number | null;
  note: string | null;
  // own-format restores carry the stored logical date and zone verbatim
  logicalDate: string | null;
  timeZoneId: string | null;
  offsetMinutes: number | null;
  preserveId: boolean;
};

// reminders only travel in own exports, so a restore always preserves
// their original ids
export type ImportReminderDraft = {
  sourceId: string;
  sourceBoardId: string;
  weekdaysMask: number;
  minuteOfDay: number;
  message: string | null;
  enabled: boolean;
  createdAtUtc: number;
};

export type ImportDraft = {
  source: 'own' | 'ripples-csv';
  boards: ImportBoardDraft[];
  checkIns: ImportCheckInDraft[];
  reminders: ImportReminderDraft[];
};

const RIPPLES_DEFAULT_SYMBOL = boardSymbolAllowlist[1];
const RIPPLES_DEFAULT_COLOR = boardPalette[2].hex;

function parseInstant(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

// --- own export format ---------------------------------------------------

export function parseOwnExport(json: string): DomainResult<ImportDraft> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return err('validation', 'This file is not valid JSON.');
  }
  if (typeof raw !== 'object' || raw === null) {
    return err('validation', 'This file is not a Ripples export.');
  }
  const data = raw as Record<string, unknown>;
  if (data.format !== 'ripples.export') {
    return err('validation', 'This file is not a Ripples export.');
  }
  if (data.exportVersion !== 1) {
    return err('validation', 'This export was created by a newer version of the app.');
  }
  const boards = Array.isArray(data.boards) ? data.boards : [];
  const checkIns = Array.isArray(data.checkIns) ? data.checkIns : [];
  const boardDrafts: ImportBoardDraft[] = [];
  for (const entry of boards) {
    // a malformed record skips individually; one bad row must not reject
    // an otherwise restorable file
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const board = entry as Record<string, unknown>;
    if (typeof board.id !== 'string' || typeof board.title !== 'string') {
      continue;
    }
    boardDrafts.push({
      sourceId: board.id,
      title: board.title,
      symbol: typeof board.symbol === 'string' ? board.symbol : RIPPLES_DEFAULT_SYMBOL,
      accentHex: typeof board.accentHex === 'string' ? board.accentHex : RIPPLES_DEFAULT_COLOR,
      usesTintedBackground: board.usesTintedBackground === true,
      tracksAmount: board.tracksAmount === true,
      amountUnit: typeof board.amountUnit === 'string' ? board.amountUnit : null,
      quickAmount: typeof board.quickAmount === 'number' ? board.quickAmount : 1,
      tracksTime: board.tracksTime === true,
      startOfDayMinute:
        typeof board.startOfDayMinute === 'number' ? board.startOfDayMinute : 0,
      metricsEnabled: board.metricsEnabled === true,
      createdAtUtc: typeof board.createdAtUtc === 'number' ? board.createdAtUtc : 0,
      archivedAtUtc: typeof board.archivedAtUtc === 'number' ? board.archivedAtUtc : null,
      preserveId: true,
      // malformed period entries are kept as invalid sentinels instead of
      // silently dropped, so the import command distrusts the whole list
      // and falls back to a derived lifetime period
      periods: Array.isArray(board.periods)
        ? board.periods.map((period) => {
            if (
              typeof period !== 'object' ||
              period === null ||
              typeof (period as Record<string, unknown>).startDate !== 'string'
            ) {
              return { startDate: 'invalid', endDate: null };
            }
            const record = period as Record<string, unknown>;
            return {
              startDate: record.startDate as string,
              endDate: typeof record.endDate === 'string' ? record.endDate : null,
            };
          })
        : null,
      orderKey: typeof board.orderKey === 'string' ? board.orderKey : null,
    });
  }
  const checkInDrafts: ImportCheckInDraft[] = [];
  for (const entry of checkIns) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const checkIn = entry as Record<string, unknown>;
    if (
      typeof checkIn.id !== 'string' ||
      typeof checkIn.boardId !== 'string' ||
      typeof checkIn.logicalDate !== 'string'
    ) {
      continue;
    }
    checkInDrafts.push({
      sourceId: checkIn.id,
      sourceBoardId: checkIn.boardId,
      occurredAtUtc: typeof checkIn.occurredAtUtc === 'number' ? checkIn.occurredAtUtc : null,
      createdAtUtc: typeof checkIn.createdAtUtc === 'number' ? checkIn.createdAtUtc : 0,
      amount: typeof checkIn.amount === 'number' ? checkIn.amount : null,
      note: typeof checkIn.note === 'string' ? checkIn.note : null,
      logicalDate: checkIn.logicalDate,
      timeZoneId: typeof checkIn.timeZoneId === 'string' ? checkIn.timeZoneId : null,
      offsetMinutes: typeof checkIn.offsetMinutes === 'number' ? checkIn.offsetMinutes : null,
      preserveId: true,
    });
  }
  const reminders = Array.isArray(data.reminders) ? data.reminders : [];
  const reminderDrafts: ImportReminderDraft[] = [];
  for (const entry of reminders) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const reminder = entry as Record<string, unknown>;
    if (
      typeof reminder.id !== 'string' ||
      typeof reminder.boardId !== 'string' ||
      typeof reminder.weekdaysMask !== 'number' ||
      typeof reminder.minuteOfDay !== 'number'
    ) {
      continue;
    }
    reminderDrafts.push({
      sourceId: reminder.id,
      sourceBoardId: reminder.boardId,
      weekdaysMask: reminder.weekdaysMask,
      minuteOfDay: reminder.minuteOfDay,
      message: typeof reminder.message === 'string' ? reminder.message : null,
      enabled: reminder.enabled === true,
      createdAtUtc: typeof reminder.createdAtUtc === 'number' ? reminder.createdAtUtc : 0,
    });
  }
  return ok({
    source: 'own',
    boards: boardDrafts,
    checkIns: checkInDrafts,
    reminders: reminderDrafts,
  });
}

// --- ripples csv ----------------------------------------------------------

// strict rfc-4180: quoted fields, doubled quotes, commas and newlines
// inside quotes, crlf or lf row endings. malformed quoting - an unterminated
// quote, a quote inside an unquoted field, or content after a closing
// quote - rejects the file instead of silently misreading it
export function parseCsv(text: string): DomainResult<string[][]> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  // set once a field was opened with a quote; only a separator or row end
  // may follow its closing quote
  let fieldQuoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      // a closing quote is only recognized when the next char is not a
      // quote, so a quote here can never directly follow a quoted field
      if (field.length > 0) {
        return err('validation', 'This file is not valid CSV: unexpected quote in a field.');
      }
      inQuotes = true;
      fieldQuoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
      fieldQuoted = false;
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') {
        index += 1;
      }
      row.push(field);
      field = '';
      fieldQuoted = false;
      rows.push(row);
      row = [];
    } else {
      if (fieldQuoted) {
        return err('validation', 'This file is not valid CSV: content after a closing quote.');
      }
      field += char;
    }
  }
  if (inQuotes) {
    return err('validation', 'This file is not valid CSV: a quoted field never closes.');
  }
  if (field.length > 0 || fieldQuoted || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return ok(rows);
}

function roundShiftToStep(seconds: number): number {
  const minutes = Math.round(seconds / 60 / boardLimits.startOfDayMinuteStep) *
    boardLimits.startOfDayMinuteStep;
  return Math.min(boardLimits.startOfDayMinuteMax, Math.max(0, minutes));
}

export function parseRipplesCsv(text: string): DomainResult<ImportDraft> {
  const parsed = parseCsv(text);
  if (!parsed.ok) {
    return parsed;
  }
  const rows = parsed.value.filter((row) => row.some((cell) => cell.trim().length > 0));
  if (rows.length < 2) {
    return err('validation', 'This file has no importable rows.');
  }
  const header = rows[0].map((cell) => cell.trim());
  const column = (name: string) => header.indexOf(name);
  // every column this parser reads must be present; a partial schema would
  // import lossy data (no amounts, no archive state, no notes) silently
  const required = [
    'entity',
    'board_id',
    'board_name',
    'board_amountKind',
    'board_createdAt',
    'board_dayStartShiftSeconds',
    'board_defaultAmount',
    'board_tracksCheckinTime',
    'board_tracksPerformanceMetrics',
    'board_archivedAt',
    'checkin_id',
    'checkin_boardId',
    'checkin_createdAt',
    'checkin_amount',
    'checkin_note',
  ];
  for (const name of required) {
    if (column(name) < 0) {
      return err('validation', 'This file does not look like a Ripples CSV export.');
    }
  }
  const cell = (row: string[], name: string): string => {
    const index = column(name);
    return index >= 0 && index < row.length ? row[index].trim() : '';
  };

  const boards: ImportBoardDraft[] = [];
  const checkIns: ImportCheckInDraft[] = [];
  for (const row of rows.slice(1)) {
    const entity = cell(row, 'entity');
    if (entity === 'Board') {
      const sourceId = cell(row, 'board_id');
      const title = cell(row, 'board_name');
      if (sourceId.length === 0 || title.length === 0) {
        return err('validation', 'A board row in this file is missing its id or name.');
      }
      const amountKind = cell(row, 'board_amountKind');
      const createdAt = parseInstant(cell(row, 'board_createdAt'));
      if (createdAt === null) {
        return err('validation', `The board "${title}" has an unreadable creation date.`);
      }
      const shiftSeconds = Number(cell(row, 'board_dayStartShiftSeconds') || '0');
      const defaultAmountText = cell(row, 'board_defaultAmount');
      const defaultAmount = Number(defaultAmountText);
      // a present but unreadable archive date must not silently restore an
      // archived board as active
      const archivedAtText = cell(row, 'board_archivedAt');
      const archivedAtUtc = parseInstant(archivedAtText);
      if (archivedAtText.length > 0 && archivedAtUtc === null) {
        return err('validation', `The board "${title}" has an unreadable archive date.`);
      }
      boards.push({
        sourceId,
        title,
        symbol: RIPPLES_DEFAULT_SYMBOL,
        accentHex: RIPPLES_DEFAULT_COLOR,
        usesTintedBackground: true,
        tracksAmount: amountKind.length > 0,
        amountUnit: amountKind.length > 0 ? amountKind : null,
        quickAmount:
          defaultAmountText.length > 0 && Number.isFinite(defaultAmount) && defaultAmount > 0
            ? defaultAmount
            : 1,
        tracksTime: cell(row, 'board_tracksCheckinTime') === 'true',
        startOfDayMinute: Number.isFinite(shiftSeconds) ? roundShiftToStep(shiftSeconds) : 0,
        metricsEnabled: cell(row, 'board_tracksPerformanceMetrics') !== 'false',
        createdAtUtc: createdAt,
        archivedAtUtc,
        preserveId: false,
        periods: null,
        orderKey: null,
      });
    } else if (entity === 'Checkin') {
      const sourceBoardId = cell(row, 'checkin_boardId');
      const createdAt = parseInstant(cell(row, 'checkin_createdAt'));
      if (sourceBoardId.length === 0 || createdAt === null) {
        return err('validation', 'A check-in row in this file is missing its board or date.');
      }
      const amountText = cell(row, 'checkin_amount');
      const amount = Number(amountText);
      const note = cell(row, 'checkin_note');
      checkIns.push({
        sourceId: null,
        sourceBoardId,
        occurredAtUtc: createdAt,
        createdAtUtc: createdAt,
        amount: amountText.length > 0 && Number.isFinite(amount) ? amount : null,
        note: note.length > 0 ? note : null,
        logicalDate: null,
        timeZoneId: null,
        offsetMinutes: null,
        preserveId: false,
      });
    } else {
      return err('validation', `This file contains an unknown row type "${entity}".`);
    }
  }
  if (boards.length === 0) {
    return err('validation', 'This file has no boards to import.');
  }
  return ok({ source: 'ripples-csv', boards, checkIns, reminders: [] });
}
