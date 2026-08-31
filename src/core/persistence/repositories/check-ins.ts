import type { CheckIn, CheckInSource } from '../../domain/entities';
import type { BoardId, CheckInId, CommandId, LogicalDate } from '../../domain/ids';
import type { SqlExecutor } from '../database';

type CheckInRow = {
  id: string;
  board_id: string;
  logical_date: string;
  occurred_at_utc: number | null;
  time_zone_id: string | null;
  offset_minutes: number | null;
  amount: number | null;
  note: string | null;
  source: string;
  idempotency_key: string;
  created_at: number;
  updated_at: number;
  mutation_stamp: string;
  deleted_at: number | null;
};

function toCheckIn(row: CheckInRow): CheckIn {
  return {
    id: row.id as CheckInId,
    boardId: row.board_id as BoardId,
    logicalDate: row.logical_date as LogicalDate,
    occurredAtUtc: row.occurred_at_utc,
    timeZoneId: row.time_zone_id,
    offsetMinutes: row.offset_minutes,
    amount: row.amount,
    note: row.note,
    source: row.source as CheckInSource,
    idempotencyKey: row.idempotency_key as CommandId,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    mutationStamp: row.mutation_stamp,
    deletedAt: row.deleted_at,
  };
}

const CHECK_IN_COLUMNS = `id, board_id, logical_date, occurred_at_utc, time_zone_id,
  offset_minutes, amount, note, source, idempotency_key, created_at, updated_at,
  mutation_stamp, deleted_at`;

// history ordering: occurred_at_utc desc nulls last, created_at desc, id
const HISTORY_ORDER = `ORDER BY logical_date DESC,
  CASE WHEN occurred_at_utc IS NULL THEN 1 ELSE 0 END,
  occurred_at_utc DESC, created_at DESC, id`;

export async function insertCheckIn(tx: SqlExecutor, checkIn: CheckIn): Promise<void> {
  await tx.runAsync(
    `INSERT INTO check_ins (${CHECK_IN_COLUMNS})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      checkIn.id,
      checkIn.boardId,
      checkIn.logicalDate,
      checkIn.occurredAtUtc,
      checkIn.timeZoneId,
      checkIn.offsetMinutes,
      checkIn.amount,
      checkIn.note,
      checkIn.source,
      checkIn.idempotencyKey,
      checkIn.createdAt,
      checkIn.updatedAt,
      checkIn.mutationStamp,
      checkIn.deletedAt,
    ],
  );
}

export async function updateCheckInRow(tx: SqlExecutor, checkIn: CheckIn): Promise<void> {
  await tx.runAsync(
    `UPDATE check_ins SET logical_date = ?, occurred_at_utc = ?, time_zone_id = ?,
       offset_minutes = ?, amount = ?, note = ?, updated_at = ?, mutation_stamp = ?,
       deleted_at = ?
     WHERE id = ?`,
    [
      checkIn.logicalDate,
      checkIn.occurredAtUtc,
      checkIn.timeZoneId,
      checkIn.offsetMinutes,
      checkIn.amount,
      checkIn.note,
      checkIn.updatedAt,
      checkIn.mutationStamp,
      checkIn.deletedAt,
      checkIn.id,
    ],
  );
}

// import restores must see tombstoned rows too: inserting over a deleted
// id would violate the primary key and roll back the whole restore
export async function checkInIdExists(tx: SqlExecutor, checkInId: CheckInId): Promise<boolean> {
  const row = await tx.getFirstAsync<{ id: string }>(`SELECT id FROM check_ins WHERE id = ?`, [
    checkInId,
  ]);
  return row !== null && row !== undefined;
}

export async function getCheckInById(
  tx: SqlExecutor,
  checkInId: CheckInId,
): Promise<CheckIn | null> {
  const row = await tx.getFirstAsync<CheckInRow>(
    `SELECT ${CHECK_IN_COLUMNS} FROM check_ins WHERE id = ? AND deleted_at IS NULL`,
    [checkInId],
  );
  return row ? toCheckIn(row) : null;
}

export async function listBoardCheckIns(
  tx: SqlExecutor,
  boardId: BoardId,
  limit?: number,
): Promise<CheckIn[]> {
  // a bounded page keeps history responsive at very large record counts;
  // callers grow the limit as the reader scrolls
  const rows =
    limit === undefined
      ? await tx.getAllAsync<CheckInRow>(
          `SELECT ${CHECK_IN_COLUMNS} FROM check_ins
           WHERE board_id = ? AND deleted_at IS NULL ${HISTORY_ORDER}`,
          [boardId],
        )
      : await tx.getAllAsync<CheckInRow>(
          `SELECT ${CHECK_IN_COLUMNS} FROM check_ins
           WHERE board_id = ? AND deleted_at IS NULL ${HISTORY_ORDER} LIMIT ?`,
          [boardId, limit],
        );
  return rows.map(toCheckIn);
}

// every record of one logical day, for completing a page boundary
export async function listBoardCheckInsForDate(
  tx: SqlExecutor,
  boardId: BoardId,
  logicalDate: string,
): Promise<CheckIn[]> {
  const rows = await tx.getAllAsync<CheckInRow>(
    `SELECT ${CHECK_IN_COLUMNS} FROM check_ins
     WHERE board_id = ? AND deleted_at IS NULL AND logical_date = ? ${HISTORY_ORDER}`,
    [boardId, logicalDate],
  );
  return rows.map(toCheckIn);
}

// the oldest logical date with a live record, bounding year selectors
export async function earliestCheckInDate(
  tx: SqlExecutor,
  boardId: BoardId,
): Promise<string | null> {
  const row = await tx.getFirstAsync<{ earliest: string | null }>(
    `SELECT MIN(logical_date) AS earliest FROM check_ins
     WHERE board_id = ? AND deleted_at IS NULL`,
    [boardId],
  );
  return row?.earliest ?? null;
}

// true per-month totals independent of any page limit
export async function monthlyCheckInTotals(
  tx: SqlExecutor,
  boardId: BoardId,
): Promise<Map<string, number>> {
  const rows = await tx.getAllAsync<{ month: string; total: number }>(
    `SELECT substr(logical_date, 1, 7) AS month, COUNT(*) AS total FROM check_ins
     WHERE board_id = ? AND deleted_at IS NULL
     GROUP BY substr(logical_date, 1, 7)`,
    [boardId],
  );
  return new Map(rows.map((row) => [row.month, Number(row.total)]));
}

export async function listBoardJournal(tx: SqlExecutor, boardId: BoardId): Promise<CheckIn[]> {
  const rows = await tx.getAllAsync<CheckInRow>(
    `SELECT ${CHECK_IN_COLUMNS} FROM check_ins
     WHERE board_id = ? AND deleted_at IS NULL AND note IS NOT NULL ${HISTORY_ORDER}`,
    [boardId],
  );
  return rows.map(toCheckIn);
}

// count per logical date, bounded by an inclusive range
export async function dailyCounts(
  tx: SqlExecutor,
  boardId: BoardId,
  from: LogicalDate,
  to: LogicalDate,
): Promise<Map<string, number>> {
  const rows = await tx.getAllAsync<{ logical_date: string; count: number }>(
    `SELECT logical_date, COUNT(*) AS count FROM check_ins
     WHERE board_id = ? AND deleted_at IS NULL AND logical_date BETWEEN ? AND ?
     GROUP BY logical_date`,
    [boardId, from, to],
  );
  return new Map(rows.map((row) => [row.logical_date, row.count]));
}

export async function allDailyCounts(
  tx: SqlExecutor,
  boardId: BoardId,
): Promise<Map<string, number>> {
  const rows = await tx.getAllAsync<{ logical_date: string; count: number }>(
    `SELECT logical_date, COUNT(*) AS count FROM check_ins
     WHERE board_id = ? AND deleted_at IS NULL
     GROUP BY logical_date`,
    [boardId],
  );
  return new Map(rows.map((row) => [row.logical_date, row.count]));
}

export async function latestCheckInForDate(
  tx: SqlExecutor,
  boardId: BoardId,
  logicalDate: LogicalDate,
): Promise<CheckIn | null> {
  const row = await tx.getFirstAsync<CheckInRow>(
    `SELECT ${CHECK_IN_COLUMNS} FROM check_ins
     WHERE board_id = ? AND logical_date = ? AND deleted_at IS NULL
     ORDER BY CASE WHEN occurred_at_utc IS NULL THEN 1 ELSE 0 END,
       occurred_at_utc DESC, created_at DESC, id LIMIT 1`,
    [boardId, logicalDate],
  );
  return row ? toCheckIn(row) : null;
}

export async function getCheckInByIdempotencyKey(
  tx: SqlExecutor,
  idempotencyKey: string,
): Promise<CheckIn | null> {
  const row = await tx.getFirstAsync<CheckInRow>(
    `SELECT ${CHECK_IN_COLUMNS} FROM check_ins WHERE idempotency_key = ?`,
    [idempotencyKey],
  );
  return row ? toCheckIn(row) : null;
}

export async function countBoardCheckIns(tx: SqlExecutor, boardId: BoardId): Promise<number> {
  const row = await tx.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM check_ins WHERE board_id = ? AND deleted_at IS NULL',
    [boardId],
  );
  return row?.count ?? 0;
}

export async function countBoardNotes(tx: SqlExecutor, boardId: BoardId): Promise<number> {
  const row = await tx.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM check_ins WHERE board_id = ? AND deleted_at IS NULL AND note IS NOT NULL',
    [boardId],
  );
  return row?.count ?? 0;
}
