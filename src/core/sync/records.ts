import type { SyncEntityType, SyncRecord } from './transport';

// the record schema version travels with every record so a newer peer can
// recognize an older shape
export const SYNC_SCHEMA_VERSION = 1;

export const SETTINGS_ENTITY_ID = 'app-settings';

type TableSpec = {
  table: string;
  idColumn: string;
  // columns that travel; everything else is device-local by definition
  columns: string[];
  // everything a tombstone must drop - user content AND user preferences -
  // mapped to the empty value its column accepts, because a replica
  // inserting a tombstone it never saw still has to satisfy the local
  // NOT NULL constraints. only structural linkage (ids, board_id,
  // order_key, start_date) and timestamps survive a delete.
  userContent: Record<string, string | number | null>;
};

// reminders never ship scheduleState / lastScheduleError: those describe
// this device's native schedule, not the rule. periods key on
// boardId|startDate because their local integer ids never leave the device.
const SPECS: Record<SyncEntityType, TableSpec> = {
  board: {
    table: 'boards',
    idColumn: 'id',
    columns: [
      'id',
      'title',
      'symbol',
      'accent_hex',
      'uses_tinted_background',
      'tracks_amount',
      'amount_unit',
      'quick_amount',
      'tracks_time',
      'start_of_day_minute',
      'metrics_enabled',
      'order_key',
      'archived_at',
      'created_at',
      'updated_at',
      'deleted_at',
    ],
    userContent: {
      title: '',
      symbol: '',
      accent_hex: '',
      amount_unit: null,
      quick_amount: 0,
      uses_tinted_background: 0,
      tracks_amount: 0,
      tracks_time: 0,
      start_of_day_minute: 0,
      metrics_enabled: 0,
      archived_at: null,
    },
  },
  check_in: {
    table: 'check_ins',
    idColumn: 'id',
    columns: [
      'id',
      'board_id',
      'logical_date',
      'occurred_at_utc',
      'time_zone_id',
      'offset_minutes',
      'amount',
      'note',
      'source',
      'idempotency_key',
      'created_at',
      'updated_at',
      'deleted_at',
    ],
    userContent: {
      note: null,
      amount: null,
      logical_date: '',
      occurred_at_utc: null,
      time_zone_id: null,
      offset_minutes: null,
    },
  },
  reminder: {
    table: 'reminders',
    idColumn: 'id',
    columns: [
      'id',
      'board_id',
      'weekdays_mask',
      'minute_of_day',
      'message',
      'enabled',
      'created_at',
      'updated_at',
      'deleted_at',
    ],
    userContent: { message: null, weekdays_mask: 0, minute_of_day: 0, enabled: 0 },
  },
  activity_period: {
    table: 'board_activity_periods',
    idColumn: 'id',
    columns: ['board_id', 'start_date', 'end_date', 'deleted_at'],
    userContent: { end_date: null },
  },
  settings: {
    table: 'app_settings',
    idColumn: 'id',
    columns: ['metrics_education_dismissed'],
    userContent: {},
  },
};

export function specFor(entityType: SyncEntityType): TableSpec {
  return SPECS[entityType];
}

export function periodEntityId(boardId: string, startDate: string): string {
  return `${boardId}|${startDate}`;
}

export function parsePeriodEntityId(
  entityId: string,
): { boardId: string; startDate: string } | null {
  const separator = entityId.indexOf('|');
  if (separator <= 0 || separator === entityId.length - 1) {
    return null;
  }
  return {
    boardId: entityId.slice(0, separator),
    startDate: entityId.slice(separator + 1),
  };
}

// a tombstone keeps structural linkage and timestamps and drops content,
// so a remote replica cannot read deleted notes
export function toSyncRecord(
  entityType: SyncEntityType,
  entityId: string,
  mutationStamp: string,
  row: Record<string, string | number | null>,
): SyncRecord {
  const spec = SPECS[entityType];
  const deleted = row.deleted_at !== null && row.deleted_at !== undefined;
  const fields: Record<string, string | number | null> = {};
  for (const column of spec.columns) {
    if (deleted && column in spec.userContent) {
      fields[column] = spec.userContent[column];
      continue;
    }
    fields[column] = row[column] ?? null;
  }
  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    entityType,
    entityId,
    mutationStamp,
    deleted,
    fields,
  };
}
