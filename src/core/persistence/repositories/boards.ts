import type { Board } from '../../domain/entities';
import type { BoardId } from '../../domain/ids';
import type { SqlExecutor } from '../database';

type BoardRow = {
  id: string;
  title: string;
  symbol: string;
  accent_hex: string;
  uses_tinted_background: number;
  tracks_amount: number;
  amount_unit: string | null;
  quick_amount: number;
  tracks_time: number;
  start_of_day_minute: number;
  metrics_enabled: number;
  order_key: string;
  archived_at: number | null;
  created_at: number;
  updated_at: number;
  mutation_stamp: string;
  deleted_at: number | null;
};

function toBoard(row: BoardRow): Board {
  return {
    id: row.id as BoardId,
    title: row.title,
    symbol: row.symbol,
    accentHex: row.accent_hex,
    usesTintedBackground: row.uses_tinted_background === 1,
    tracksAmount: row.tracks_amount === 1,
    amountUnit: row.amount_unit,
    quickAmount: row.quick_amount,
    tracksTime: row.tracks_time === 1,
    startOfDayMinute: row.start_of_day_minute,
    metricsEnabled: row.metrics_enabled === 1,
    orderKey: row.order_key,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    mutationStamp: row.mutation_stamp,
    deletedAt: row.deleted_at,
  };
}

const BOARD_COLUMNS = `id, title, symbol, accent_hex, uses_tinted_background, tracks_amount,
  amount_unit, quick_amount, tracks_time, start_of_day_minute, metrics_enabled, order_key,
  archived_at, created_at, updated_at, mutation_stamp, deleted_at`;

export async function insertBoard(tx: SqlExecutor, board: Board): Promise<void> {
  await tx.runAsync(
    `INSERT INTO boards (${BOARD_COLUMNS})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      board.id,
      board.title,
      board.symbol,
      board.accentHex,
      board.usesTintedBackground ? 1 : 0,
      board.tracksAmount ? 1 : 0,
      board.amountUnit,
      board.quickAmount,
      board.tracksTime ? 1 : 0,
      board.startOfDayMinute,
      board.metricsEnabled ? 1 : 0,
      board.orderKey,
      board.archivedAt,
      board.createdAt,
      board.updatedAt,
      board.mutationStamp,
      board.deletedAt,
    ],
  );
}

export async function updateBoardRow(tx: SqlExecutor, board: Board): Promise<void> {
  await tx.runAsync(
    `UPDATE boards SET title = ?, symbol = ?, accent_hex = ?, uses_tinted_background = ?,
       tracks_amount = ?, amount_unit = ?, quick_amount = ?, tracks_time = ?,
       start_of_day_minute = ?, metrics_enabled = ?, order_key = ?, archived_at = ?,
       updated_at = ?, mutation_stamp = ?, deleted_at = ?
     WHERE id = ?`,
    [
      board.title,
      board.symbol,
      board.accentHex,
      board.usesTintedBackground ? 1 : 0,
      board.tracksAmount ? 1 : 0,
      board.amountUnit,
      board.quickAmount,
      board.tracksTime ? 1 : 0,
      board.startOfDayMinute,
      board.metricsEnabled ? 1 : 0,
      board.orderKey,
      board.archivedAt,
      board.updatedAt,
      board.mutationStamp,
      board.deletedAt,
      board.id,
    ],
  );
}

// import restores must see tombstoned rows too: inserting over a deleted
// id would violate the primary key and roll back the whole restore
export async function boardIdExists(tx: SqlExecutor, boardId: BoardId): Promise<boolean> {
  const row = await tx.getFirstAsync<{ id: string }>(`SELECT id FROM boards WHERE id = ?`, [
    boardId,
  ]);
  return row !== null && row !== undefined;
}

export async function getBoardById(tx: SqlExecutor, boardId: BoardId): Promise<Board | null> {
  const row = await tx.getFirstAsync<BoardRow>(
    `SELECT ${BOARD_COLUMNS} FROM boards WHERE id = ? AND deleted_at IS NULL`,
    [boardId],
  );
  return row ? toBoard(row) : null;
}

export async function listActiveBoards(tx: SqlExecutor): Promise<Board[]> {
  const rows = await tx.getAllAsync<BoardRow>(
    `SELECT ${BOARD_COLUMNS} FROM boards
     WHERE deleted_at IS NULL AND archived_at IS NULL
     ORDER BY order_key, id`,
  );
  return rows.map(toBoard);
}

export async function listArchivedBoards(tx: SqlExecutor): Promise<Board[]> {
  const rows = await tx.getAllAsync<BoardRow>(
    `SELECT ${BOARD_COLUMNS} FROM boards
     WHERE deleted_at IS NULL AND archived_at IS NOT NULL
     ORDER BY archived_at DESC, id`,
  );
  return rows.map(toBoard);
}

export async function lastActiveOrderKey(tx: SqlExecutor): Promise<string | null> {
  const row = await tx.getFirstAsync<{ order_key: string }>(
    `SELECT order_key FROM boards
     WHERE deleted_at IS NULL AND archived_at IS NULL
     ORDER BY order_key DESC, id DESC LIMIT 1`,
  );
  return row?.order_key ?? null;
}
