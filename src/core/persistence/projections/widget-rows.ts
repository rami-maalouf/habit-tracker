import { addDays, currentLogicalDate } from '../../calendar/logical-date';
import type { WidgetBoardRow } from '../../domain/entities';
import type { BoardId, LogicalDate } from '../../domain/ids';
import type { SqlExecutor } from '../database';
import { listActiveBoards } from '../repositories/boards';
import { dailyCounts } from '../repositories/check-ins';

// the widget reads widget_board_rows only; every mutating command rebuilds
// this projection inside the same exclusive transaction
export async function rebuildWidgetRows(
  tx: SqlExecutor,
  nowUtcMs: number,
  timeZoneId: string,
): Promise<void> {
  const boards = await listActiveBoards(tx);
  await tx.runAsync('DELETE FROM widget_board_rows');
  for (let position = 0; position < boards.length; position += 1) {
    const board = boards[position];
    const today = currentLogicalDate(nowUtcMs, timeZoneId, board.startOfDayMinute);
    const from = addDays(today, -6);
    const counts = await dailyCounts(tx, board.id, from, today);
    const strip: number[] = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      strip.push(counts.get(addDays(today, -offset)) ?? 0);
    }
    await tx.runAsync(
      `INSERT INTO widget_board_rows (board_id, position, title, symbol, accent_hex, strip, strip_end_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [board.id, position, board.title, board.symbol, board.accentHex, JSON.stringify(strip), today],
    );
  }
}

type WidgetRowRecord = {
  board_id: string;
  position: number;
  title: string;
  symbol: string;
  accent_hex: string;
  strip: string;
  strip_end_date: string;
};

export async function readWidgetRows(tx: SqlExecutor): Promise<WidgetBoardRow[]> {
  const rows = await tx.getAllAsync<WidgetRowRecord>(
    'SELECT * FROM widget_board_rows ORDER BY position',
  );
  return rows.map((row) => ({
    boardId: row.board_id as BoardId,
    position: row.position,
    title: row.title,
    symbol: row.symbol,
    accentHex: row.accent_hex,
    strip: JSON.parse(row.strip) as number[],
    stripEndDate: row.strip_end_date as LogicalDate,
  }));
}
