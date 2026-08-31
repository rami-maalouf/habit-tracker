import type { AppSettings, BoardActivityPeriod, SelectedIcon } from '../../domain/entities';
import type { BoardId, DeviceId, LogicalDate } from '../../domain/ids';
import type { SqlExecutor } from '../database';

// --- app settings -----------------------------------------------------------

type SettingsRow = {
  schema_revision: number;
  selected_icon: string;
  icloud_sync_enabled: number;
  metrics_education_dismissed: string;
  device_id: string;
  hlc_wall_time: number;
  hlc_counter: number;
  last_sync_at: number | null;
};

export async function getSettings(tx: SqlExecutor): Promise<AppSettings | null> {
  const row = await tx.getFirstAsync<SettingsRow>('SELECT * FROM app_settings WHERE id = 1');
  if (!row) {
    return null;
  }
  return {
    schemaRevision: row.schema_revision,
    selectedIcon: row.selected_icon as SelectedIcon,
    iCloudSyncEnabled: row.icloud_sync_enabled === 1,
    metricsEducationDismissed: JSON.parse(row.metrics_education_dismissed) as BoardId[],
    deviceId: row.device_id as DeviceId,
    hlcWallTime: row.hlc_wall_time,
    hlcCounter: row.hlc_counter,
    lastSyncAtUtc: row.last_sync_at,
  };
}

export async function insertSettings(
  tx: SqlExecutor,
  settings: { deviceId: DeviceId; schemaRevision: number },
): Promise<void> {
  await tx.runAsync(
    `INSERT INTO app_settings (id, schema_revision, device_id) VALUES (1, ?, ?)`,
    [settings.schemaRevision, settings.deviceId],
  );
}

export async function saveHlc(
  tx: SqlExecutor,
  hlc: { wallTime: number; counter: number },
): Promise<void> {
  await tx.runAsync('UPDATE app_settings SET hlc_wall_time = ?, hlc_counter = ? WHERE id = 1', [
    hlc.wallTime,
    hlc.counter,
  ]);
}

export async function saveSelectedIcon(tx: SqlExecutor, icon: SelectedIcon): Promise<void> {
  await tx.runAsync('UPDATE app_settings SET selected_icon = ? WHERE id = 1', [icon]);
}

export async function saveICloudSyncEnabled(tx: SqlExecutor, enabled: boolean): Promise<void> {
  await tx.runAsync('UPDATE app_settings SET icloud_sync_enabled = ? WHERE id = 1', [
    enabled ? 1 : 0,
  ]);
}

export async function saveMetricsEducationDismissed(
  tx: SqlExecutor,
  boardIds: BoardId[],
): Promise<void> {
  await tx.runAsync('UPDATE app_settings SET metrics_education_dismissed = ? WHERE id = 1', [
    JSON.stringify(boardIds),
  ]);
}

// --- command receipts -------------------------------------------------------

export async function getReceipt(tx: SqlExecutor, commandId: string): Promise<string | null> {
  const row = await tx.getFirstAsync<{ outcome: string }>(
    'SELECT outcome FROM command_receipts WHERE command_id = ?',
    [commandId],
  );
  return row?.outcome ?? null;
}

export async function insertReceipt(
  tx: SqlExecutor,
  commandId: string,
  outcome: string,
  createdAt: number,
): Promise<void> {
  await tx.runAsync(
    'INSERT INTO command_receipts (command_id, outcome, created_at) VALUES (?, ?, ?)',
    [commandId, outcome, createdAt],
  );
}

// --- mutation outbox ---------------------------------------------------------

export type OutboxEntityType =
  | 'board'
  | 'check_in'
  | 'reminder'
  | 'activity_period'
  | 'settings';

export async function appendOutbox(
  tx: SqlExecutor,
  entityType: OutboxEntityType,
  entityId: string,
  mutationStamp: string,
  createdAt: number,
): Promise<void> {
  await tx.runAsync(
    'INSERT INTO mutation_outbox (entity_type, entity_id, mutation_stamp, created_at) VALUES (?, ?, ?, ?)',
    [entityType, entityId, mutationStamp, createdAt],
  );
}

// --- board activity periods --------------------------------------------------

type PeriodRow = {
  id: number;
  board_id: string;
  start_date: string;
  end_date: string | null;
  mutation_stamp: string;
  deleted_at: number | null;
};

function toPeriod(row: PeriodRow): BoardActivityPeriod {
  return {
    id: row.id,
    boardId: row.board_id as BoardId,
    startDate: row.start_date as LogicalDate,
    endDate: row.end_date as LogicalDate | null,
    mutationStamp: row.mutation_stamp,
    deletedAt: row.deleted_at,
  };
}

export async function listBoardPeriods(
  tx: SqlExecutor,
  boardId: BoardId,
): Promise<BoardActivityPeriod[]> {
  const rows = await tx.getAllAsync<PeriodRow>(
    `SELECT * FROM board_activity_periods
     WHERE board_id = ? AND deleted_at IS NULL ORDER BY start_date`,
    [boardId],
  );
  return rows.map(toPeriod);
}

export async function insertPeriod(
  tx: SqlExecutor,
  boardId: BoardId,
  startDate: LogicalDate,
  mutationStamp: string,
): Promise<number> {
  await tx.runAsync(
    `INSERT INTO board_activity_periods (board_id, start_date, end_date, mutation_stamp, deleted_at)
     VALUES (?, ?, NULL, ?, NULL)`,
    [boardId, startDate, mutationStamp],
  );
  const row = await tx.getFirstAsync<{ id: number }>(
    'SELECT id FROM board_activity_periods WHERE board_id = ? ORDER BY id DESC LIMIT 1',
    [boardId],
  );
  return row?.id ?? 0;
}

export async function closeOpenPeriod(
  tx: SqlExecutor,
  boardId: BoardId,
  endDate: LogicalDate,
  mutationStamp: string,
): Promise<number[]> {
  const open = await tx.getAllAsync<{ id: number }>(
    'SELECT id FROM board_activity_periods WHERE board_id = ? AND end_date IS NULL AND deleted_at IS NULL',
    [boardId],
  );
  await tx.runAsync(
    `UPDATE board_activity_periods SET end_date = ?, mutation_stamp = ?
     WHERE board_id = ? AND end_date IS NULL AND deleted_at IS NULL`,
    [endDate, mutationStamp, boardId],
  );
  return open.map((row) => row.id);
}

export async function reopenPeriodEndingOn(
  tx: SqlExecutor,
  boardId: BoardId,
  endDate: LogicalDate,
  mutationStamp: string,
): Promise<number | null> {
  const row = await tx.getFirstAsync<{ id: number }>(
    'SELECT id FROM board_activity_periods WHERE board_id = ? AND end_date = ? AND deleted_at IS NULL LIMIT 1',
    [boardId, endDate],
  );
  if (!row) {
    return null;
  }
  await tx.runAsync(
    `UPDATE board_activity_periods SET end_date = NULL, mutation_stamp = ? WHERE id = ?`,
    [mutationStamp, row.id],
  );
  return row.id;
}

export async function tombstoneBoardGraph(
  tx: SqlExecutor,
  boardId: BoardId,
  deletedAt: number,
  mutationStamp: string,
): Promise<{ checkInIds: string[]; reminderIds: string[]; periodIds: number[] }> {
  const checkIns = await tx.getAllAsync<{ id: string }>(
    'SELECT id FROM check_ins WHERE board_id = ? AND deleted_at IS NULL',
    [boardId],
  );
  const reminders = await tx.getAllAsync<{ id: string }>(
    'SELECT id FROM reminders WHERE board_id = ? AND deleted_at IS NULL',
    [boardId],
  );
  const periods = await tx.getAllAsync<{ id: number }>(
    'SELECT id FROM board_activity_periods WHERE board_id = ? AND deleted_at IS NULL',
    [boardId],
  );
  await tx.runAsync(
    'UPDATE boards SET deleted_at = ?, updated_at = ?, mutation_stamp = ? WHERE id = ?',
    [deletedAt, deletedAt, mutationStamp, boardId],
  );
  await tx.runAsync(
    'UPDATE check_ins SET deleted_at = ?, updated_at = ?, mutation_stamp = ? WHERE board_id = ? AND deleted_at IS NULL',
    [deletedAt, deletedAt, mutationStamp, boardId],
  );
  await tx.runAsync(
    'UPDATE reminders SET deleted_at = ?, updated_at = ?, mutation_stamp = ? WHERE board_id = ? AND deleted_at IS NULL',
    [deletedAt, deletedAt, mutationStamp, boardId],
  );
  await tx.runAsync(
    'UPDATE board_activity_periods SET deleted_at = ?, mutation_stamp = ? WHERE board_id = ? AND deleted_at IS NULL',
    [deletedAt, mutationStamp, boardId],
  );
  // schedule rows are kept: they hold the native identifiers the reminder
  // reconciler cancels before clearing the orphaned rows
  return {
    checkInIds: checkIns.map((row) => row.id),
    reminderIds: reminders.map((row) => row.id),
    periodIds: periods.map((row) => row.id),
  };
}

// --- sync ---------------------------------------------------------------------

export type SyncStateRow = {
  changeToken: string | null;
  zoneCreated: boolean;
  retryState: string | null;
  lastSuccessAtUtc: number | null;
};

export async function getSyncState(tx: SqlExecutor): Promise<SyncStateRow> {
  const row = await tx.getFirstAsync<{
    change_token: string | null;
    zone_created: number;
    retry_state: string | null;
    last_success_at: number | null;
  }>('SELECT change_token, zone_created, retry_state, last_success_at FROM sync_state WHERE id = 1');
  return {
    changeToken: row?.change_token ?? null,
    zoneCreated: row?.zone_created === 1,
    retryState: row?.retry_state ?? null,
    lastSuccessAtUtc: row?.last_success_at ?? null,
  };
}

export async function saveSyncState(tx: SqlExecutor, state: SyncStateRow): Promise<void> {
  await tx.runAsync(
    `INSERT INTO sync_state (id, change_token, zone_created, retry_state, last_success_at)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       change_token = excluded.change_token,
       zone_created = excluded.zone_created,
       retry_state = excluded.retry_state,
       last_success_at = excluded.last_success_at`,
    [state.changeToken, state.zoneCreated ? 1 : 0, state.retryState, state.lastSuccessAtUtc],
  );
}

export type OutboxRow = {
  id: number;
  entityType: OutboxEntityType;
  entityId: string;
  mutationStamp: string;
};

// oldest first, so a partial upload always makes forward progress
export async function listOutbox(tx: SqlExecutor, limit: number): Promise<OutboxRow[]> {
  const rows = await tx.getAllAsync<{
    id: number;
    entity_type: string;
    entity_id: string;
    mutation_stamp: string;
  }>(
    `SELECT id, entity_type, entity_id, mutation_stamp FROM mutation_outbox
     ORDER BY id LIMIT ?`,
    [limit],
  );
  return rows.map((row) => ({
    id: row.id,
    entityType: row.entity_type as OutboxEntityType,
    entityId: row.entity_id,
    mutationStamp: row.mutation_stamp,
  }));
}

export async function deleteOutboxRows(tx: SqlExecutor, ids: number[]): Promise<void> {
  for (const id of ids) {
    await tx.runAsync('DELETE FROM mutation_outbox WHERE id = ?', [id]);
  }
}

// generic raw row read for sync serialization; sync ships whole records,
// so the column list stays open rather than entity-typed
export async function readRawRow(
  tx: SqlExecutor,
  table: string,
  idColumn: string,
  id: string,
): Promise<Record<string, string | number | null> | null> {
  const row = await tx.getFirstAsync<Record<string, string | number | null>>(
    `SELECT * FROM ${table} WHERE ${idColumn} = ?`,
    [id],
  );
  return row ?? null;
}
