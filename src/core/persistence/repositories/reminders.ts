import type { Reminder, ReminderScheduleState } from '../../domain/entities';
import type { BoardId, ReminderId } from '../../domain/ids';
import type { SqlExecutor } from '../database';

type ReminderRow = {
  id: string;
  board_id: string;
  weekdays_mask: number;
  minute_of_day: number;
  message: string | null;
  enabled: number;
  schedule_state: string;
  last_schedule_error: string | null;
  created_at: number;
  updated_at: number;
  mutation_stamp: string;
  deleted_at: number | null;
};

function toReminder(row: ReminderRow & { native_identifiers?: string | null }): Reminder {
  return {
    id: row.id as ReminderId,
    boardId: row.board_id as BoardId,
    weekdaysMask: row.weekdays_mask,
    minuteOfDay: row.minute_of_day,
    message: row.message,
    enabled: row.enabled === 1,
    // adapter-owned identifiers hydrate from the schedule table
    nativeIdentifiers:
      row.native_identifiers === null || row.native_identifiers === undefined
        ? []
        : row.native_identifiers.split('\u0001'),
    scheduleState: row.schedule_state as ReminderScheduleState,
    lastScheduleError: row.last_schedule_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    mutationStamp: row.mutation_stamp,
    deletedAt: row.deleted_at,
  };
}

const REMINDER_COLUMNS = `id, board_id, weekdays_mask, minute_of_day, message, enabled,
  schedule_state, last_schedule_error, created_at, updated_at, mutation_stamp, deleted_at`;

// group-concat of the schedule table's identifiers, hydrating the entity's
// adapter-owned nativeIdentifiers field
const REMINDER_SELECT = `SELECT r.id, r.board_id, r.weekdays_mask, r.minute_of_day, r.message,
  r.enabled, r.schedule_state, r.last_schedule_error, r.created_at, r.updated_at,
  r.mutation_stamp, r.deleted_at,
  (SELECT GROUP_CONCAT(s.native_identifier, char(1))
     FROM reminder_schedule s WHERE s.reminder_id = r.id
     ORDER BY s.weekday) AS native_identifiers
  FROM reminders r`;

export async function insertReminder(tx: SqlExecutor, reminder: Reminder): Promise<void> {
  await tx.runAsync(
    `INSERT INTO reminders (${REMINDER_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      reminder.id,
      reminder.boardId,
      reminder.weekdaysMask,
      reminder.minuteOfDay,
      reminder.message,
      reminder.enabled ? 1 : 0,
      reminder.scheduleState,
      reminder.lastScheduleError,
      reminder.createdAt,
      reminder.updatedAt,
      reminder.mutationStamp,
      reminder.deletedAt,
    ],
  );
}

export async function updateReminderRow(tx: SqlExecutor, reminder: Reminder): Promise<void> {
  await tx.runAsync(
    `UPDATE reminders
     SET board_id = ?, weekdays_mask = ?, minute_of_day = ?, message = ?, enabled = ?,
         schedule_state = ?, last_schedule_error = ?, created_at = ?, updated_at = ?,
         mutation_stamp = ?, deleted_at = ?
     WHERE id = ?`,
    [
      reminder.boardId,
      reminder.weekdaysMask,
      reminder.minuteOfDay,
      reminder.message,
      reminder.enabled ? 1 : 0,
      reminder.scheduleState,
      reminder.lastScheduleError,
      reminder.createdAt,
      reminder.updatedAt,
      reminder.mutationStamp,
      reminder.deletedAt,
      reminder.id,
    ],
  );
}

// import restores must see tombstoned rows too: inserting over a deleted
// id would violate the primary key and roll back the whole restore
export async function reminderIdExists(tx: SqlExecutor, reminderId: ReminderId): Promise<boolean> {
  const row = await tx.getFirstAsync<{ id: string }>(`SELECT id FROM reminders WHERE id = ?`, [
    reminderId,
  ]);
  return row !== null && row !== undefined;
}

export async function getReminderById(
  tx: SqlExecutor,
  reminderId: ReminderId,
): Promise<Reminder | null> {
  const row = await tx.getFirstAsync<ReminderRow & { native_identifiers: string | null }>(
    `${REMINDER_SELECT} WHERE r.id = ? AND r.deleted_at IS NULL`,
    [reminderId],
  );
  return row ? toReminder(row) : null;
}

export async function listBoardReminders(
  tx: SqlExecutor,
  boardId: BoardId,
): Promise<Reminder[]> {
  const rows = await tx.getAllAsync<ReminderRow & { native_identifiers: string | null }>(
    `${REMINDER_SELECT} WHERE r.board_id = ? AND r.deleted_at IS NULL
     ORDER BY r.minute_of_day, r.id`,
    [boardId],
  );
  return rows.map(toReminder);
}

// every non-deleted reminder joined with its board's archive state; the
// reconciler decides per record whether a schedule should exist
export async function listRemindersForReconcile(
  tx: SqlExecutor,
): Promise<{ reminder: Reminder; boardTitle: string; boardArchived: boolean }[]> {
  const rows = await tx.getAllAsync<
    ReminderRow & { board_title: string; board_archived: number; native_identifiers: string | null }
  >(
    `SELECT r.id, r.board_id, r.weekdays_mask, r.minute_of_day, r.message, r.enabled,
            r.schedule_state, r.last_schedule_error, r.created_at, r.updated_at,
            r.mutation_stamp, r.deleted_at,
            b.title AS board_title,
            CASE WHEN b.archived_at IS NULL THEN 0 ELSE 1 END AS board_archived,
            (SELECT GROUP_CONCAT(s.native_identifier, char(1))
               FROM reminder_schedule s WHERE s.reminder_id = r.id
               ORDER BY s.weekday) AS native_identifiers
     FROM reminders r
     JOIN boards b ON b.id = r.board_id
     WHERE r.deleted_at IS NULL AND b.deleted_at IS NULL
     ORDER BY r.id`,
  );
  return rows.map((row) => ({
    reminder: toReminder(row),
    boardTitle: row.board_title,
    boardArchived: row.board_archived === 1,
  }));
}

// native identifiers whose reminder rows are gone (tombstoned board or
// reminder); the reconciler cancels these orphans
export async function listOrphanedScheduleRows(
  tx: SqlExecutor,
): Promise<{ reminderId: string; nativeIdentifier: string }[]> {
  const rows = await tx.getAllAsync<{ reminder_id: string; native_identifier: string }>(
    `SELECT s.reminder_id, s.native_identifier
     FROM reminder_schedule s
     LEFT JOIN reminders r ON r.id = s.reminder_id AND r.deleted_at IS NULL
     WHERE r.id IS NULL`,
  );
  return rows.map((row) => ({
    reminderId: row.reminder_id,
    nativeIdentifier: row.native_identifier,
  }));
}

export async function listScheduleRows(
  tx: SqlExecutor,
  reminderId: ReminderId,
): Promise<{ weekday: number; nativeIdentifier: string }[]> {
  const rows = await tx.getAllAsync<{ weekday: number; native_identifier: string }>(
    `SELECT weekday, native_identifier FROM reminder_schedule WHERE reminder_id = ? ORDER BY weekday`,
    [reminderId],
  );
  return rows.map((row) => ({ weekday: row.weekday, nativeIdentifier: row.native_identifier }));
}

export async function clearScheduleRows(tx: SqlExecutor, reminderId: string): Promise<void> {
  await tx.runAsync(`DELETE FROM reminder_schedule WHERE reminder_id = ?`, [reminderId]);
}

export async function replaceScheduleRows(
  tx: SqlExecutor,
  reminderId: ReminderId,
  rows: { weekday: number; nativeIdentifier: string }[],
): Promise<void> {
  await clearScheduleRows(tx, reminderId);
  for (const row of rows) {
    await tx.runAsync(
      `INSERT INTO reminder_schedule (reminder_id, weekday, native_identifier) VALUES (?, ?, ?)`,
      [reminderId, row.weekday, row.nativeIdentifier],
    );
  }
}

export async function countEnabledActiveReminders(tx: SqlExecutor): Promise<number> {
  const row = await tx.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total
     FROM reminders r
     JOIN boards b ON b.id = r.board_id
     WHERE r.deleted_at IS NULL AND r.enabled = 1
       AND b.deleted_at IS NULL AND b.archived_at IS NULL`,
  );
  return row?.total ?? 0;
}
