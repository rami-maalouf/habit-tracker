// the shared command contract every automation executor implements: the
// typescript executor here and the future native App Intents / App Actions
// executors. one json fixture suite drives all of them, so a native
// implementation can never fork product semantics.
import { currentLogicalDate } from '../calendar/logical-date';
import { createCheckIn, removeCheckIn } from '../domain/commands';
import type { CommandDeps } from '../domain/commands';
import type { BoardId, CommandId, LogicalDate } from '../domain/ids';
import type { DomainResult } from '../domain/result';
import { err, ok } from '../domain/result';
import { getBoardById, listActiveBoards } from '../persistence/repositories/boards';
import {
  latestCheckInForDate,
  listBoardCheckInsForDate,
} from '../persistence/repositories/check-ins';

export type AutomationSource = 'shortcut' | 'siri';

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

// --- board entity -------------------------------------------------------------

export type AutomationBoard = { boardId: string; title: string };

// the Board AppEntity is backed by active boards only, in active order
export function listAutomationBoards(
  deps: Pick<CommandDeps, 'db'>,
): Promise<DomainResult<AutomationBoard[]>> {
  return (async () => {
    try {
      const boards = await deps.db.withTransactionAsync((tx) => listActiveBoards(tx));
      return ok(boards.map((board) => ({ boardId: board.id, title: board.title })));
    } catch (cause) {
      return err('database', `The boards could not be read: ${describe(cause)}`, {
        retryable: true,
      });
    }
  })();
}

// --- check in -----------------------------------------------------------------

export type CheckInIntentInput = {
  commandId: CommandId;
  boardId: BoardId;
  source: AutomationSource;
  // omitted date defaults to the board's current logical date
  logicalDate?: LogicalDate;
  occurredAtUtc?: number;
  // omitted amount uses the board's quickAmount
  amount?: number;
  note?: string;
};

export type CheckInIntentResult = { checkInId: string; logicalDate: string };

export function runCheckInIntent(
  deps: CommandDeps,
  input: CheckInIntentInput,
): Promise<DomainResult<CheckInIntentResult>> {
  return (async () => {
    const board = await deps.db.withTransactionAsync((tx) => getBoardById(tx, input.boardId));
    if (!board) {
      return err('not_found', 'That board is not available.');
    }
    if (board.archivedAt !== null) {
      return err('archived', 'That board is archived. Restore it to check in.');
    }
    const logicalDate =
      input.logicalDate ??
      currentLogicalDate(deps.clock.nowUtcMs(), deps.clock.timeZoneId(), board.startOfDayMinute);
    const result = await createCheckIn(deps, {
      commandId: input.commandId,
      boardId: input.boardId,
      logicalDate,
      occurredAtUtc: input.occurredAtUtc,
      // an omitted amount falls back to the board's quick amount
      amount: board.tracksAmount ? (input.amount ?? board.quickAmount) : undefined,
      note: input.note,
      source: input.source,
    });
    if (!result.ok) {
      return result;
    }
    return ok({ checkInId: result.value.checkInId, logicalDate });
  })();
}

// --- remove latest check-in ---------------------------------------------------

export type RemoveLatestInput = {
  commandId: CommandId;
  boardId: BoardId;
  logicalDate?: LogicalDate;
};

export function runRemoveLatestIntent(
  deps: CommandDeps,
  input: RemoveLatestInput,
): Promise<DomainResult<{ removedCheckInId: string }>> {
  return (async () => {
    const board = await deps.db.withTransactionAsync((tx) => getBoardById(tx, input.boardId));
    if (!board) {
      return err('not_found', 'That board is not available.');
    }
    if (board.archivedAt !== null) {
      return err('archived', 'That board is archived. Restore it to change check-ins.');
    }
    const logicalDate =
      input.logicalDate ??
      currentLogicalDate(deps.clock.nowUtcMs(), deps.clock.timeZoneId(), board.startOfDayMinute);
    // the history ordering rule picks the latest record for that date
    const latest = await deps.db.withTransactionAsync((tx) =>
      latestCheckInForDate(tx, input.boardId, logicalDate),
    );
    if (!latest) {
      return err('not_found', 'There is no check-in to remove for that day.');
    }
    const removed = await removeCheckIn(deps, {
      commandId: input.commandId,
      checkInId: latest.id,
    });
    if (!removed.ok) {
      return removed;
    }
    return ok({ removedCheckInId: latest.id });
  })();
}

// --- today's check-ins --------------------------------------------------------

export type TodayCheckInsResult = {
  boards: { title: string; count: number }[];
  total: number;
};

// counts plus board names for the current logical date; this query never
// includes note text
export function runTodayCheckInsIntent(
  deps: Pick<CommandDeps, 'db' | 'clock'>,
  input: { boardId?: BoardId } = {},
): Promise<DomainResult<TodayCheckInsResult>> {
  return (async () => {
    try {
      const value = await deps.db.withTransactionAsync(async (tx) => {
        const boards = await listActiveBoards(tx);
        const scoped =
          input.boardId === undefined
            ? boards
            : boards.filter((board) => board.id === input.boardId);
        const rows: { title: string; count: number }[] = [];
        let total = 0;
        for (const board of scoped) {
          const today = currentLogicalDate(
            deps.clock.nowUtcMs(),
            deps.clock.timeZoneId(),
            board.startOfDayMinute,
          );
          const checkIns = await listBoardCheckInsForDate(tx, board.id, today);
          rows.push({ title: board.title, count: checkIns.length });
          total += checkIns.length;
        }
        return { boards: rows, total };
      });
      return ok(value);
    } catch (cause) {
      return err('database', `Today's check-ins could not be read: ${describe(cause)}`, {
        retryable: true,
      });
    }
  })();
}
