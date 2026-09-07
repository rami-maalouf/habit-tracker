import { isValidLogicalDate } from '../calendar/logical-date';
import type { BoardId } from '../domain/ids';
import { isUuidV4 } from '../domain/ids';
import {
  validateAccentHex,
  validateAmount,
  validateMinuteOfDay,
  validateNote,
  validateReminderMessage,
  validateStartOfDayMinute,
  validateSymbol,
  validateTitle,
  validateUnit,
  validateWeekdaysMask,
} from '../domain/validation';
import type { SqlExecutor } from '../persistence/database';
import { boardIdExists } from '../persistence/repositories/boards';
import { getCheckInByIdempotencyKey } from '../persistence/repositories/check-ins';
import { SETTINGS_ENTITY_ID, SYNC_SCHEMA_VERSION, parsePeriodEntityId } from './records';
import type { SyncEntityType, SyncRecord } from './transport';

const ENTITY_TYPES = new Set<SyncEntityType>([
  'board',
  'activity_period',
  'check_in',
  'reminder',
  'settings',
]);
const STAMP_SHAPE = /^\d{14}-[0-9a-z]{5}-[A-Za-z0-9_-]+$/;
const ORDER_KEY_SHAPE = /^[0-9a-z]+$/;
const CHECK_IN_SOURCES = new Set(['app', 'widget', 'shortcut', 'siri', 'sync']);
const MAX_DATE_MS = 8_640_000_000_000_000;

type IdentifiedRecord = SyncRecord & { entityType: SyncEntityType };

export type InboundValidation =
  | { kind: 'valid'; record: SyncRecord }
  | { kind: 'deferred'; record: SyncRecord }
  | { kind: 'invalid'; record: SyncRecord }
  | { kind: 'unidentifiable' };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEntityType(value: unknown): value is SyncEntityType {
  return typeof value === 'string' && ENTITY_TYPES.has(value as SyncEntityType);
}

function identityOf(value: unknown): IdentifiedRecord | null {
  if (!isObject(value)) {
    return null;
  }
  const entityType = value.entityType;
  const entityId = value.entityId;
  const mutationStamp = value.mutationStamp;
  if (
    !isEntityType(entityType) ||
    typeof entityId !== 'string' ||
    typeof mutationStamp !== 'string' ||
    !STAMP_SHAPE.test(mutationStamp)
  ) {
    return null;
  }
  const identifiable =
    entityType === 'settings'
      ? entityId === SETTINGS_ENTITY_ID
      : entityType === 'activity_period'
        ? validPeriodIdentity(entityId)
        : isUuidV4(entityId);
  return identifiable ? (value as IdentifiedRecord) : null;
}

function validPeriodIdentity(entityId: string): boolean {
  const parsed = parsePeriodEntityId(entityId);
  return parsed !== null && isUuidV4(parsed.boardId) && isValidLogicalDate(parsed.startDate);
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_DATE_MS;
}

function isNullableTimestamp(value: unknown): value is number | null {
  return value === null || isTimestamp(value);
}

function isFlag(value: unknown): value is 0 | 1 {
  return value === 0 || value === 1;
}

function fieldString(fields: Record<string, unknown>, key: string): string | null {
  return typeof fields[key] === 'string' ? fields[key] : null;
}

function validCommonTimestamps(fields: Record<string, unknown>): boolean {
  return (
    isTimestamp(fields.created_at) &&
    isTimestamp(fields.updated_at) &&
    isNullableTimestamp(fields.deleted_at)
  );
}

function normalizeBoard(record: IdentifiedRecord): SyncRecord | null {
  const fields = record.fields as Record<string, unknown>;
  const title = fieldString(fields, 'title');
  const symbol = fieldString(fields, 'symbol');
  const accent = fieldString(fields, 'accent_hex');
  const unit = fields.amount_unit;
  const quickAmount = fields.quick_amount;
  const startOfDay = fields.start_of_day_minute;
  if (
    fieldString(fields, 'id') !== record.entityId ||
    title === null ||
    symbol === null ||
    accent === null ||
    (unit !== null && typeof unit !== 'string') ||
    typeof quickAmount !== 'number' ||
    typeof startOfDay !== 'number' ||
    !isFlag(fields.uses_tinted_background) ||
    !isFlag(fields.tracks_amount) ||
    !isFlag(fields.tracks_time) ||
    !isFlag(fields.metrics_enabled) ||
    typeof fields.order_key !== 'string' ||
    !ORDER_KEY_SHAPE.test(fields.order_key) ||
    !isNullableTimestamp(fields.archived_at) ||
    !validCommonTimestamps(fields)
  ) {
    return null;
  }
  const validatedTitle = validateTitle(title);
  const validatedSymbol = validateSymbol(symbol);
  const validatedAccent = validateAccentHex(accent);
  const validatedUnit = validateUnit(unit);
  const validatedAmount = validateAmount(quickAmount, 'quickAmount');
  const validatedStart = validateStartOfDayMinute(startOfDay);
  if (
    !validatedTitle.ok ||
    !validatedSymbol.ok ||
    !validatedAccent.ok ||
    !validatedUnit.ok ||
    !validatedAmount.ok ||
    !validatedStart.ok
  ) {
    return null;
  }
  return {
    ...record,
    fields: {
      ...fields,
      title: validatedTitle.value,
      accent_hex: validatedAccent.value,
      amount_unit: validatedUnit.value,
    } as SyncRecord['fields'],
  };
}

function normalizeBoardTombstone(record: IdentifiedRecord): SyncRecord | null {
  const fields = record.fields as Record<string, unknown>;
  if (
    fieldString(fields, 'id') !== record.entityId ||
    typeof fields.order_key !== 'string' ||
    !ORDER_KEY_SHAPE.test(fields.order_key) ||
    !validCommonTimestamps(fields)
  ) {
    return null;
  }
  return {
    ...record,
    fields: {
      id: record.entityId,
      title: '',
      symbol: '',
      accent_hex: '',
      uses_tinted_background: 0,
      tracks_amount: 0,
      amount_unit: null,
      quick_amount: 0,
      tracks_time: 0,
      start_of_day_minute: 0,
      metrics_enabled: 0,
      order_key: fields.order_key,
      archived_at: null,
      created_at: fields.created_at as number,
      updated_at: fields.updated_at as number,
      deleted_at: fields.deleted_at as number | null,
    },
  };
}

function validInstantFields(fields: Record<string, unknown>): boolean {
  const instant = fields.occurred_at_utc;
  const zone = fields.time_zone_id;
  const offset = fields.offset_minutes;
  if (instant === null && zone === null && offset === null) {
    return true;
  }
  if (
    !isTimestamp(instant) ||
    typeof zone !== 'string' ||
    typeof offset !== 'number' ||
    !Number.isFinite(offset)
  ) {
    return false;
  }
  if (offset < -1440 || offset > 1440) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone }).format(instant);
    return true;
  } catch {
    return false;
  }
}

function normalizeCheckIn(record: IdentifiedRecord, boardId: string): SyncRecord | null {
  const fields = record.fields as Record<string, unknown>;
  const logicalDate = fieldString(fields, 'logical_date');
  const note = fields.note;
  const amount = fields.amount;
  if (
    fieldString(fields, 'id') !== record.entityId ||
    fieldString(fields, 'board_id') !== boardId ||
    logicalDate === null ||
    !isValidLogicalDate(logicalDate) ||
    (note !== null && typeof note !== 'string') ||
    (amount !== null && typeof amount !== 'number') ||
    typeof fields.source !== 'string' ||
    !CHECK_IN_SOURCES.has(fields.source) ||
    typeof fields.idempotency_key !== 'string' ||
    !isUuidV4(fields.idempotency_key) ||
    !validInstantFields(fields) ||
    !validCommonTimestamps(fields)
  ) {
    return null;
  }
  if (amount !== null && !validateAmount(amount).ok) {
    return null;
  }
  const validatedNote = validateNote(note);
  if (!validatedNote.ok) {
    return null;
  }
  return { ...record, fields: { ...fields, note: validatedNote.value } as SyncRecord['fields'] };
}

function normalizeCheckInTombstone(
  record: IdentifiedRecord,
  boardId: string,
): SyncRecord | null {
  const fields = record.fields as Record<string, unknown>;
  if (
    fieldString(fields, 'id') !== record.entityId ||
    fieldString(fields, 'board_id') !== boardId ||
    !validCommonTimestamps(fields)
  ) {
    return null;
  }
  return {
    ...record,
    fields: {
      id: record.entityId,
      board_id: boardId,
      logical_date: '',
      occurred_at_utc: null,
      time_zone_id: null,
      offset_minutes: null,
      amount: null,
      note: null,
      source: 'sync',
      idempotency_key: record.entityId,
      created_at: fields.created_at as number,
      updated_at: fields.updated_at as number,
      deleted_at: fields.deleted_at as number | null,
    },
  };
}

function normalizeReminder(record: IdentifiedRecord, boardId: string): SyncRecord | null {
  const fields = record.fields as Record<string, unknown>;
  const message = fields.message;
  if (
    fieldString(fields, 'id') !== record.entityId ||
    fieldString(fields, 'board_id') !== boardId ||
    typeof fields.weekdays_mask !== 'number' ||
    !validateWeekdaysMask(fields.weekdays_mask).ok ||
    typeof fields.minute_of_day !== 'number' ||
    !validateMinuteOfDay(fields.minute_of_day).ok ||
    (message !== null && typeof message !== 'string') ||
    !isFlag(fields.enabled) ||
    !validCommonTimestamps(fields)
  ) {
    return null;
  }
  const validatedMessage = validateReminderMessage(message);
  if (!validatedMessage.ok) {
    return null;
  }
  return { ...record, fields: { ...fields, message: validatedMessage.value } as SyncRecord['fields'] };
}

function normalizeReminderTombstone(
  record: IdentifiedRecord,
  boardId: string,
): SyncRecord | null {
  const fields = record.fields as Record<string, unknown>;
  if (
    fieldString(fields, 'id') !== record.entityId ||
    fieldString(fields, 'board_id') !== boardId ||
    !validCommonTimestamps(fields)
  ) {
    return null;
  }
  return {
    ...record,
    fields: {
      id: record.entityId,
      board_id: boardId,
      weekdays_mask: 0,
      minute_of_day: 0,
      message: null,
      enabled: 0,
      created_at: fields.created_at as number,
      updated_at: fields.updated_at as number,
      deleted_at: fields.deleted_at as number | null,
    },
  };
}

function normalizePeriod(record: IdentifiedRecord, boardId: string, startDate: string): SyncRecord | null {
  const fields = record.fields as Record<string, unknown>;
  const endDate = record.deleted ? null : (fields.end_date ?? null);
  if (
    fieldString(fields, 'board_id') !== boardId ||
    fieldString(fields, 'start_date') !== startDate ||
    (endDate !== null && (typeof endDate !== 'string' || !isValidLogicalDate(endDate))) ||
    (typeof endDate === 'string' && endDate < startDate) ||
    !isNullableTimestamp(fields.deleted_at ?? null)
  ) {
    return null;
  }
  return {
    ...record,
    fields: {
      board_id: boardId,
      start_date: startDate,
      end_date: endDate as string | null,
      deleted_at: (fields.deleted_at ?? null) as number | null,
    },
  };
}

function normalizeSettings(record: IdentifiedRecord): SyncRecord | null {
  const raw = (record.fields as Record<string, unknown>).metrics_education_dismissed;
  if (record.deleted || typeof raw !== 'string') {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== 'string' || !isUuidV4(id))) {
      return null;
    }
    const normalized = [...new Set(parsed)];
    return { ...record, fields: { metrics_education_dismissed: JSON.stringify(normalized) } };
  } catch {
    return null;
  }
}

function parentBoardExists(tx: SqlExecutor, boardId: string): Promise<boolean> {
  return boardIdExists(tx, boardId as BoardId);
}

export async function validateInboundRecord(
  tx: SqlExecutor,
  value: unknown,
): Promise<InboundValidation> {
  const record = identityOf(value);
  if (record === null) {
    return { kind: 'unidentifiable' };
  }
  if (
    record.schemaVersion !== SYNC_SCHEMA_VERSION ||
    typeof record.deleted !== 'boolean' ||
    !isObject(record.fields)
  ) {
    return { kind: 'invalid', record };
  }
  let normalized: SyncRecord | null = null;
  if (record.entityType === 'settings') {
    normalized = normalizeSettings(record);
  } else if (record.entityType === 'board') {
    normalized = record.deleted ? normalizeBoardTombstone(record) : normalizeBoard(record);
  } else {
    const parsed =
      record.entityType === 'activity_period'
        ? (parsePeriodEntityId(record.entityId) as { boardId: string; startDate: string })
        : { boardId: fieldString(record.fields, 'board_id') ?? '', startDate: '' };
    if (!isUuidV4(parsed.boardId)) {
      return { kind: 'invalid', record };
    }
    if (!(await parentBoardExists(tx, parsed.boardId))) {
      return { kind: 'deferred', record };
    }
    if (record.entityType === 'activity_period') {
      normalized = normalizePeriod(record, parsed.boardId, parsed.startDate);
    } else if (record.entityType === 'check_in') {
      normalized = record.deleted
        ? normalizeCheckInTombstone(record, parsed.boardId)
        : normalizeCheckIn(record, parsed.boardId);
    } else {
      normalized = record.deleted
        ? normalizeReminderTombstone(record, parsed.boardId)
        : normalizeReminder(record, parsed.boardId);
    }
  }
  if (normalized !== null && record.entityType === 'check_in') {
    const owner = await getCheckInByIdempotencyKey(
      tx,
      normalized.fields.idempotency_key as string,
    );
    if (owner !== null && owner.id !== record.entityId) {
      return { kind: 'invalid', record };
    }
  }
  return normalized === null
    ? { kind: 'invalid', record }
    : { kind: 'valid', record: normalized };
}
