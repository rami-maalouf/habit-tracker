// the shared command contract every automation executor implements: the
// typescript executor here and the future native App Intents / App Actions
// executors. one json fixture suite drives all of them, so a native
// implementation can never fork product semantics.
import { currentLogicalDate } from '../calendar/logical-date';
import { createCheckIn, removeLatestCheckIn } from '../domain/commands';
import type { CommandDeps } from '../domain/commands';
import type { BoardId, CommandId, LogicalDate } from '../domain/ids';
import type { DomainResult } from '../domain/result';
import { err, ok } from '../domain/result';
import { getBoardById, listActiveBoards } from '../persistence/repositories/boards';
import { listBoardCheckInsForDate } from '../persistence/repositories/check-ins';

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

// a board read that turns a transport failure into an actionable result
// instead of a rejected promise a native executor would have to catch
async function readActiveBoard(
  deps: Pick<CommandDeps, 'db'>,
  boardId: BoardId,
): Promise<DomainResult<Awaited<ReturnType<typeof getBoardById>>>> {
  try {
    return ok(await deps.db.withTransactionAsync((tx) => getBoardById(tx, boardId)));
  } catch (cause) {
    return err('database', `That board could not be read: ${describe(cause)}`, {
      retryable: true,
    });
  }
}

export function runCheckInIntent(
  deps: CommandDeps,
  input: CheckInIntentInput,
): Promise<DomainResult<CheckInIntentResult>> {
  return (async () => {
    const board = await readActiveBoard(deps, input.boardId);
    if (!board.ok) {
      return board;
    }
    if (!board.value) {
      return err('not_found', 'That board is not available.');
    }
    if (board.value.archivedAt !== null) {
      return err('archived', 'That board is archived. Restore it to check in.');
    }
    // the date is NOT resolved here: the command defaults it inside its own
    // receipt, so a retry that crosses midnight replays the original date
    const result = await createCheckIn(deps, {
      commandId: input.commandId,
      boardId: input.boardId,
      logicalDate: input.logicalDate,
      occurredAtUtc: input.occurredAtUtc,
      // an omitted amount falls back to the board's quick amount
      amount: board.value.tracksAmount ? (input.amount ?? board.value.quickAmount) : undefined,
      note: input.note,
      source: input.source,
    });
    if (!result.ok) {
      return result;
    }
    return ok({ checkInId: result.value.checkInId, logicalDate: result.value.logicalDate });
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
    const board = await readActiveBoard(deps, input.boardId);
    if (!board.ok) {
      return board;
    }
    if (!board.value) {
      return err('not_found', 'That board is not available.');
    }
    if (board.value.archivedAt !== null) {
      return err('archived', 'That board is archived. Restore it to change check-ins.');
    }
    // the command resolves the target by the history ordering rule inside
    // its own receipt, so a retry replays the same removal
    const removed = await removeLatestCheckIn(deps, {
      commandId: input.commandId,
      boardId: input.boardId,
      logicalDate: input.logicalDate,
    });
    if (!removed.ok) {
      return removed;
    }
    return ok({ removedCheckInId: removed.value.removedCheckInId });
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
        // an archived, deleted, or unknown board is an actionable failure,
        // never a silent empty answer
        if (input.boardId !== undefined && scoped.length === 0) {
          return null;
        }
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
      if (value === null) {
        return err('not_found', 'That board is not available.');
      }
      return ok(value);
    } catch (cause) {
      return err('database', `Today's check-ins could not be read: ${describe(cause)}`, {
        retryable: true,
      });
    }
  })();
}
