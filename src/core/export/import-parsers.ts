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

export type ImportDraft = {
  source: 'own' | 'ripples-csv';
  boards: ImportBoardDraft[];
  checkIns: ImportCheckInDraft[];
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
    const board = entry as Record<string, unknown>;
    if (typeof board.id !== 'string' || typeof board.title !== 'string') {
      return err('validation', 'A board in this export is malformed.');
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
      periods: Array.isArray(board.periods)
        ? (board.periods as { startDate: string; endDate: string | null }[])
        : null,
      orderKey: typeof board.orderKey === 'string' ? board.orderKey : null,
    });
  }
  const checkInDrafts: ImportCheckInDraft[] = [];
  for (const entry of checkIns) {
    const checkIn = entry as Record<string, unknown>;
    if (
      typeof checkIn.id !== 'string' ||
      typeof checkIn.boardId !== 'string' ||
      typeof checkIn.logicalDate !== 'string'
    ) {
      return err('validation', 'A check-in in this export is malformed.');
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
  return ok({ source: 'own', boards: boardDrafts, checkIns: checkInDrafts });
}

// --- ripples csv ----------------------------------------------------------

// minimal rfc-4180: quoted fields, doubled quotes, commas and newlines
// inside quotes, crlf or lf row endings
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
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
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') {
        index += 1;
      }
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function roundShiftToStep(seconds: number): number {
  const minutes = Math.round(seconds / 60 / boardLimits.startOfDayMinuteStep) *
    boardLimits.startOfDayMinuteStep;
  return Math.min(boardLimits.startOfDayMinuteMax, Math.max(0, minutes));
}

export function parseRipplesCsv(text: string): DomainResult<ImportDraft> {
  const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim().length > 0));
  if (rows.length < 2) {
    return err('validation', 'This file has no importable rows.');
  }
  const header = rows[0].map((cell) => cell.trim());
  const column = (name: string) => header.indexOf(name);
  const required = ['entity', 'board_id', 'board_name', 'checkin_id', 'checkin_boardId', 'checkin_createdAt'];
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
        archivedAtUtc: parseInstant(cell(row, 'board_archivedAt')),
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
  return ok({ source: 'ripples-csv', boards, checkIns });
}
