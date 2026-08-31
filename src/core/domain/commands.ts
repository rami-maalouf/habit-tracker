import {
  compareLogicalDates,
  currentLogicalDate,
  isValidLogicalDate,
  offsetMinutesAt,
} from '../calendar/logical-date';
import type { ImportDraft } from '../export/import-parsers';
import type { SqlDatabase, SqlExecutor } from '../persistence/database';
import { rebuildWidgetRows } from '../persistence/projections/widget-rows';
import {
  boardIdExists,
  getBoardById,
  insertBoard,
  lastActiveOrderKey,
  updateBoardRow,
} from '../persistence/repositories/boards';
import {
  checkInIdExists,
  getCheckInById,
  insertCheckIn,
  updateCheckInRow,
} from '../persistence/repositories/check-ins';
import { insertReminder, reminderIdExists } from '../persistence/repositories/reminders';
import {
  appendOutbox,
  closeOpenPeriod,
  getReceipt,
  getSettings,
  insertPeriod,
  insertReceipt,
  reopenPeriodEndingOn,
  saveHlc,
  saveICloudSyncEnabled,
  saveMetricsEducationDismissed,
  saveSelectedIcon,
  tombstoneBoardGraph,
} from '../persistence/repositories/support';
import type { HlcState } from '../sync/hybrid-clock';
import { advance, encodeStamp } from '../sync/hybrid-clock';
import type { Board, CheckIn, CheckInSource, Reminder, SelectedIcon } from './entities';
import type { BoardId, CheckInId, CommandId, LogicalDate, ReminderId } from './ids';
import { isUuidV4 } from './ids';
import { orderKeyAfter, orderKeyBetween } from './order-key';
import type { Clock, IdGenerator } from './ports';
import type { DomainResult } from './result';
import { err, ok } from './result';
import {
  validateAccentHex,
  validateAmount,
  validateLogicalDateInput,
  validateMinuteOfDay,
  validateNote,
  validateReminderMessage,
  validateStartOfDayMinute,
  validateSymbol,
  validateTitle,
  validateUnit,
  validateWeekdaysMask,
} from './validation';

export type CommandDeps = {
  db: SqlDatabase;
  clock: Clock;
  ids: IdGenerator;
};

type CommandContext = {
  tx: SqlExecutor;
  now: number;
  timeZoneId: string;
  settings: NonNullable<Awaited<ReturnType<typeof getSettings>>>;
  stamp(): string;
};

// every command validates before its transaction, replays its receipt when
// retried, advances the hybrid clock once per mutation stamp, and persists
// receipts and clock state atomically with the mutation. exported for the
// reminder command module, which shares the same envelope
export async function runCommand<Value>(
  deps: CommandDeps,
  commandId: CommandId,
  work: (context: CommandContext) => Promise<DomainResult<Value>>,
): Promise<DomainResult<Value>> {
  if (!isUuidV4(commandId)) {
    return err('validation', 'Command ids must be uuids.', { field: 'commandId' });
  }
  const now = deps.clock.nowUtcMs();
  const timeZoneId = deps.clock.timeZoneId();
  try {
    return await deps.db.withExclusiveTransactionAsync(async (tx) => {
      const receipt = await getReceipt(tx, commandId);
      if (receipt !== null) {
        const replayed = JSON.parse(receipt) as { ok: boolean; value?: Value };
        if (replayed.ok && !('value' in replayed)) {
          // json drops undefined values; restore the exact original shape
          replayed.value = undefined;
        }
        return replayed as DomainResult<Value>;
      }
      const settings = await getSettings(tx);
      if (!settings) {
        return err('database', 'The database is not initialized.');
      }
      let hlc: HlcState = { wallTime: settings.hlcWallTime, counter: settings.hlcCounter };
      const context: CommandContext = {
        tx,
        now,
        timeZoneId,
        settings,
        stamp: () => {
          hlc = advance(hlc, now);
          return encodeStamp(hlc, settings.deviceId);
        },
      };
      const result = await work(context);
      await saveHlc(tx, hlc);
      await insertReceipt(tx, commandId, JSON.stringify(result), now);
      return result;
    });
  } catch (cause) {
    return err('database', `The command could not be completed: ${describe(cause)}`, {
      retryable: true,
    });
  }
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

// --- boards ------------------------------------------------------------------

export type CreateBoardInput = {
  commandId: CommandId;
  title: string;
  symbol: string;
  accentHex: string;
  usesTintedBackground: boolean;
  tracksAmount: boolean;
  amountUnit?: string | null;
  quickAmount?: number;
  tracksTime: boolean;
  startOfDayMinute: number;
  metricsEnabled: boolean;
};

type BoardFieldValidation = {
  title: string;
  symbol: string;
  accentHex: string;
  amountUnit: string | null;
  quickAmount: number;
  startOfDayMinute: number;
};

function validateBoardFields(
  input: {
    title: string;
    symbol: string;
    accentHex: string;
    tracksAmount: boolean;
    amountUnit?: string | null;
    quickAmount?: number;
    startOfDayMinute: number;
  },
  // updates retain the saved amount configuration when fields are omitted,
  // so turning amount tracking off never erases unit or quick amount
  fallback: { amountUnit: string | null; quickAmount: number } = {
    amountUnit: null,
    quickAmount: 1,
  },
): DomainResult<BoardFieldValidation> {
  const title = validateTitle(input.title);
  if (!title.ok) {
    return title;
  }
  const symbol = validateSymbol(input.symbol);
  if (!symbol.ok) {
    return symbol;
  }
  const accent = validateAccentHex(input.accentHex);
  if (!accent.ok) {
    return accent;
  }
  const unit =
    input.amountUnit === undefined ? ok(fallback.amountUnit) : validateUnit(input.amountUnit);
  if (!unit.ok) {
    return unit;
  }
  const quickAmountRaw = input.quickAmount ?? fallback.quickAmount;
  const quickAmount = validateAmount(quickAmountRaw, 'quickAmount');
  if (!quickAmount.ok) {
    return quickAmount;
  }
  const startOfDay = validateStartOfDayMinute(input.startOfDayMinute);
  if (!startOfDay.ok) {
    return startOfDay;
  }
  return ok({
    title: title.value,
    symbol: symbol.value,
    accentHex: accent.value,
    amountUnit: unit.value,
    quickAmount: quickAmount.value,
    startOfDayMinute: startOfDay.value,
  });
}

export function createBoard(
  deps: CommandDeps,
  input: CreateBoardInput,
): Promise<DomainResult<{ boardId: BoardId }>> {
  const fields = validateBoardFields(input);
  if (!fields.ok) {
    return Promise.resolve(fields);
  }
  return runCommand(deps, input.commandId, async ({ tx, now, timeZoneId, stamp }) => {
    const boardId = deps.ids.uuid() as BoardId;
    const mutationStamp = stamp();
    const orderKey = orderKeyAfter(await lastActiveOrderKey(tx));
    const board: Board = {
      id: boardId,
      title: fields.value.title,
      symbol: fields.value.symbol,
      accentHex: fields.value.accentHex,
      usesTintedBackground: input.usesTintedBackground,
      tracksAmount: input.tracksAmount,
      amountUnit: fields.value.amountUnit,
      quickAmount: fields.value.quickAmount,
      tracksTime: input.tracksTime,
      startOfDayMinute: fields.value.startOfDayMinute,
      metricsEnabled: input.metricsEnabled,
      orderKey,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      mutationStamp,
      deletedAt: null,
    };
    await insertBoard(tx, board);
    const today = currentLogicalDate(now, timeZoneId, board.startOfDayMinute);
    const periodId = await insertPeriod(tx, boardId, today, mutationStamp);
    await appendOutbox(tx, 'board', boardId, mutationStamp, now);
    await appendOutbox(tx, 'activity_period', String(periodId), mutationStamp, now);
    await rebuildWidgetRows(tx, now, timeZoneId);
    return ok({ boardId });
  });
}

export type UpdateBoardInput = Omit<CreateBoardInput, 'commandId'> & {
  commandId: CommandId;
  boardId: BoardId;
  expectedMutationStamp: string;
};

export function updateBoard(
  deps: CommandDeps,
  input: UpdateBoardInput,
): Promise<DomainResult<{ mutationStamp: string }>> {
  const fields = validateBoardFields(input);
  if (!fields.ok) {
    return Promise.resolve(fields);
  }
  return runCommand(deps, input.commandId, async ({ tx, now, timeZoneId, stamp }) => {
    const board = await getBoardById(tx, input.boardId);
    if (!board) {
      return err('not_found', 'This board no longer exists.');
    }
    if (board.archivedAt !== null) {
      return err('archived', 'Restore the board before editing it.');
    }
    if (board.mutationStamp !== input.expectedMutationStamp) {
      return err('conflict', 'This board changed elsewhere. Review the latest values.');
    }
    const mutationStamp = stamp();
    const updated: Board = {
      ...board,
      title: fields.value.title,
      symbol: fields.value.symbol,
      accentHex: fields.value.accentHex,
      usesTintedBackground: input.usesTintedBackground,
      tracksAmount: input.tracksAmount,
      // omitted amount configuration retains the saved values
      amountUnit: input.amountUnit === undefined ? board.amountUnit : fields.value.amountUnit,
      quickAmount: input.quickAmount === undefined ? board.quickAmount : fields.value.quickAmount,
      tracksTime: input.tracksTime,
      startOfDayMinute: fields.value.startOfDayMinute,
      metricsEnabled: input.metricsEnabled,
      updatedAt: now,
      mutationStamp,
    };
    await updateBoardRow(tx, updated);
    await appendOutbox(tx, 'board', board.id, mutationStamp, now);
    await rebuildWidgetRows(tx, now, timeZoneId);
    return ok({ mutationStamp });
  });
}

export type ReorderBoardInput = {
  commandId: CommandId;
  boardId: BoardId;
  previousBoardId: BoardId | null;
  nextBoardId: BoardId | null;
};

export function reorderBoard(
  deps: CommandDeps,
  input: ReorderBoardInput,
): Promise<DomainResult<void>> {
  return runCommand(deps, input.commandId, async ({ tx, now, timeZoneId, stamp }) => {
    const board = await getBoardById(tx, input.boardId);
    if (!board || board.archivedAt !== null) {
      return err('not_found', 'This board is not in the active list.');
    }
    const previous = input.previousBoardId ? await getBoardById(tx, input.previousBoardId) : null;
    const next = input.nextBoardId ? await getBoardById(tx, input.nextBoardId) : null;
    if ((input.previousBoardId && !previous) || (input.nextBoardId && !next)) {
      return err('not_found', 'A neighboring board no longer exists.');
    }
    const mutationStamp = stamp();
    const orderKey = orderKeyBetween(previous?.orderKey ?? null, next?.orderKey ?? null);
    await updateBoardRow(tx, { ...board, orderKey, updatedAt: now, mutationStamp });
    await appendOutbox(tx, 'board', board.id, mutationStamp, now);
    await rebuildWidgetRows(tx, now, timeZoneId);
    return ok(undefined);
  });
}

export function archiveBoard(
  deps: CommandDeps,
  input: { commandId: CommandId; boardId: BoardId },
): Promise<DomainResult<void>> {
  return runCommand(deps, input.commandId, async ({ tx, now, timeZoneId, stamp }) => {
    const board = await getBoardById(tx, input.boardId);
    if (!board) {
      return err('not_found', 'This board no longer exists.');
    }
    if (board.archivedAt !== null) {
      return err('archived', 'This board is already archived.');
    }
    const mutationStamp = stamp();
    const today = currentLogicalDate(now, timeZoneId, board.startOfDayMinute);
    await updateBoardRow(tx, { ...board, archivedAt: now, updatedAt: now, mutationStamp });
    const closedPeriodIds = await closeOpenPeriod(tx, board.id, today, mutationStamp);
    // schedule rows survive the archive: they hold the native identifiers
    // the reminder reconciler needs to actually cancel the requests
    await appendOutbox(tx, 'board', board.id, mutationStamp, now);
    for (const periodId of closedPeriodIds) {
      await appendOutbox(tx, 'activity_period', String(periodId), mutationStamp, now);
    }
    await rebuildWidgetRows(tx, now, timeZoneId);
    return ok(undefined);
  });
}

export function restoreBoard(
  deps: CommandDeps,
  input: { commandId: CommandId; boardId: BoardId },
): Promise<DomainResult<void>> {
  return runCommand(deps, input.commandId, async ({ tx, now, timeZoneId, stamp }) => {
    const board = await getBoardById(tx, input.boardId);
    if (!board) {
      return err('not_found', 'This board no longer exists.');
    }
    if (board.archivedAt === null) {
      return err('validation', 'This board is not archived.');
    }
    const mutationStamp = stamp();
    const today = currentLogicalDate(now, timeZoneId, board.startOfDayMinute);
    // restored boards go to the end of the active order
    const orderKey = orderKeyAfter(await lastActiveOrderKey(tx));
    await updateBoardRow(tx, {
      ...board,
      archivedAt: null,
      orderKey,
      updatedAt: now,
      mutationStamp,
    });
    // same-day close and reopen merge into one period
    const reopenedId = await reopenPeriodEndingOn(tx, board.id, today, mutationStamp);
    const periodId = reopenedId ?? (await insertPeriod(tx, board.id, today, mutationStamp));
    await appendOutbox(tx, 'board', board.id, mutationStamp, now);
    await appendOutbox(tx, 'activity_period', String(periodId), mutationStamp, now);
    await rebuildWidgetRows(tx, now, timeZoneId);
    return ok(undefined);
  });
}

export function deleteBoard(
  deps: CommandDeps,
  input: { commandId: CommandId; boardId: BoardId },
): Promise<DomainResult<void>> {
  return runCommand(deps, input.commandId, async ({ tx, now, timeZoneId, stamp }) => {
    const board = await getBoardById(tx, input.boardId);
    if (!board) {
      return err('not_found', 'This board no longer exists.');
    }
    const mutationStamp = stamp();
    const descendants = await tombstoneBoardGraph(tx, board.id, now, mutationStamp);
    await appendOutbox(tx, 'board', board.id, mutationStamp, now);
    // descendant tombstones must reach sync so remote replicas delete them
    for (const checkInId of descendants.checkInIds) {
      await appendOutbox(tx, 'check_in', checkInId, mutationStamp, now);
    }
    for (const reminderId of descendants.reminderIds) {
      await appendOutbox(tx, 'reminder', reminderId, mutationStamp, now);
    }
    for (const periodId of descendants.periodIds) {
      await appendOutbox(tx, 'activity_period', String(periodId), mutationStamp, now);
    }
    await rebuildWidgetRows(tx, now, timeZoneId);
    return ok(undefined);
  });
}

// --- check-ins ---------------------------------------------------------------

export type CreateCheckInInput = {
  commandId: CommandId;
  boardId: BoardId;
  logicalDate?: LogicalDate;
  occurredAtUtc?: number;
  amount?: number;
  note?: string;
  source: Exclude<CheckInSource, 'sync'>;
};

export function createCheckIn(
  deps: CommandDeps,
  input: CreateCheckInInput,
): Promise<DomainResult<{ checkInId: CheckInId }>> {
  const note = validateNote(input.note);
  if (!note.ok) {
    return Promise.resolve(note);
  }
  return runCommand(deps, input.commandId, async ({ tx, now, timeZoneId, stamp }) => {
    const board = await getBoardById(tx, input.boardId);
    if (!board) {
      return err('not_found', 'This board no longer exists.');
    }
    if (board.archivedAt !== null) {
      return err('archived', 'Restore the board to add check-ins.');
    }
    const today = currentLogicalDate(now, timeZoneId, board.startOfDayMinute);

    let amount: number | null = null;
    if (board.tracksAmount) {
      const value = validateAmount(input.amount ?? board.quickAmount);
      if (!value.ok) {
        return value;
      }
      amount = value.value;
    } else if (input.amount !== undefined) {
      return err('validation', 'This board does not track amounts.', { field: 'amount' });
    }

    let occurredAtUtc: number | null = null;
    let checkInZone: string | null = null;
    let offsetMinutes: number | null = null;
    if (board.tracksTime) {
      occurredAtUtc = input.occurredAtUtc ?? now;
      checkInZone = timeZoneId;
      offsetMinutes = offsetMinutesAt(occurredAtUtc, timeZoneId);
    }

    let logicalDate: LogicalDate;
    if (input.logicalDate !== undefined) {
      const validated = validateLogicalDateInput(input.logicalDate, today);
      if (!validated.ok) {
        return validated;
      }
      logicalDate = validated.value;
    } else if (occurredAtUtc !== null) {
      const derived = currentLogicalDate(occurredAtUtc, timeZoneId, board.startOfDayMinute);
      // a future instant must not smuggle in a future logical date
      const validated = validateLogicalDateInput(derived, today);
      if (!validated.ok) {
        return validated;
      }
      logicalDate = validated.value;
    } else {
      logicalDate = today;
    }

    const mutationStamp = stamp();
    const checkIn: CheckIn = {
      id: deps.ids.uuid() as CheckInId,
      boardId: board.id,
      logicalDate,
      occurredAtUtc,
      timeZoneId: checkInZone,
      offsetMinutes,
      amount,
      note: note.value,
      source: input.source,
      idempotencyKey: input.commandId,
      createdAt: now,
      updatedAt: now,
      mutationStamp,
      deletedAt: null,
    };
    await insertCheckIn(tx, checkIn);
    await appendOutbox(tx, 'check_in', checkIn.id, mutationStamp, now);
    await rebuildWidgetRows(tx, now, timeZoneId);
    return ok({ checkInId: checkIn.id });
  });
}

export type UpdateCheckInInput = {
  commandId: CommandId;
  checkInId: CheckInId;
  expectedMutationStamp: string;
  logicalDate: LogicalDate;
  occurredAtUtc?: number;
  amount?: number;
  note?: string;
};

export function updateCheckIn(
  deps: CommandDeps,
  input: UpdateCheckInInput,
): Promise<DomainResult<{ mutationStamp: string }>> {
  const note = validateNote(input.note);
  if (!note.ok) {
    return Promise.resolve(note);
  }
  return runCommand(deps, input.commandId, async ({ tx, now, timeZoneId, stamp }) => {
    const existing = await getCheckInById(tx, input.checkInId);
    if (!existing) {
      return err('not_found', 'This check-in no longer exists.');
    }
    if (existing.mutationStamp !== input.expectedMutationStamp) {
      return err('conflict', 'This check-in changed elsewhere. Review the latest values.');
    }
    const board = await getBoardById(tx, existing.boardId);
    if (!board) {
      return err('not_found', 'This board no longer exists.');
    }
    if (board.archivedAt !== null) {
      return err('archived', 'Restore the board to edit its check-ins.');
    }
    const today = currentLogicalDate(now, timeZoneId, board.startOfDayMinute);
    const logicalDate = validateLogicalDateInput(input.logicalDate, today);
    if (!logicalDate.ok) {
      return logicalDate;
    }
    let amount: number | null = existing.amount;
    if (input.amount !== undefined) {
      if (!board.tracksAmount) {
        return err('validation', 'This board does not track amounts.', { field: 'amount' });
      }
      const value = validateAmount(input.amount);
      if (!value.ok) {
        return value;
      }
      amount = value.value;
    }
    let occurredAtUtc = existing.occurredAtUtc;
    let zone = existing.timeZoneId;
    let offset = existing.offsetMinutes;
    if (input.occurredAtUtc !== undefined) {
      if (!board.tracksTime) {
        return err('validation', 'This board does not track exact times.', {
          field: 'occurredAtUtc',
        });
      }
      occurredAtUtc = input.occurredAtUtc;
      zone = timeZoneId;
      offset = offsetMinutesAt(input.occurredAtUtc, timeZoneId);
    }
    const mutationStamp = stamp();
    await updateCheckInRow(tx, {
      ...existing,
      logicalDate: logicalDate.value,
      occurredAtUtc,
      timeZoneId: zone,
      offsetMinutes: offset,
      amount,
      note: note.value,
      updatedAt: now,
      mutationStamp,
    });
    await appendOutbox(tx, 'check_in', existing.id, mutationStamp, now);
    await rebuildWidgetRows(tx, now, timeZoneId);
    return ok({ mutationStamp });
  });
}

export function removeCheckIn(
  deps: CommandDeps,
  input: { commandId: CommandId; checkInId: CheckInId; expectedMutationStamp?: string },
): Promise<DomainResult<void>> {
  return runCommand(deps, input.commandId, async ({ tx, now, timeZoneId, stamp }) => {
    const existing = await getCheckInById(tx, input.checkInId);
    if (!existing) {
      return err('not_found', 'This check-in no longer exists.');
    }
    if (
      input.expectedMutationStamp !== undefined &&
      existing.mutationStamp !== input.expectedMutationStamp
    ) {
      return err('conflict', 'This check-in changed elsewhere. Review the latest values.');
    }
    const board = await getBoardById(tx, existing.boardId);
    if (board && board.archivedAt !== null) {
      return err('archived', 'Restore the board to delete its check-ins.');
    }
    const mutationStamp = stamp();
    await updateCheckInRow(tx, { ...existing, deletedAt: now, updatedAt: now, mutationStamp });
    await appendOutbox(tx, 'check_in', existing.id, mutationStamp, now);
    await rebuildWidgetRows(tx, now, timeZoneId);
    return ok(undefined);
  });
}

// undo removes only the check-in created by the quick action it belongs to
export function undoCreatedCheckIn(
  deps: CommandDeps,
  input: { commandId: CommandId; checkInId: CheckInId; createdByCommandId: CommandId },
): Promise<DomainResult<void>> {
  return runCommand(deps, input.commandId, async ({ tx, now, timeZoneId, stamp }) => {
    const existing = await getCheckInById(tx, input.checkInId);
    if (!existing) {
      return err('not_found', 'This check-in was already removed.');
    }
    if (existing.idempotencyKey !== input.createdByCommandId) {
      return err('conflict', 'Undo can only remove the check-in it belongs to.');
    }
    const board = await getBoardById(tx, existing.boardId);
    if (board && board.archivedAt !== null) {
      return err('archived', 'Restore the board to change its check-ins.');
    }
    const mutationStamp = stamp();
    await updateCheckInRow(tx, { ...existing, deletedAt: now, updatedAt: now, mutationStamp });
    await appendOutbox(tx, 'check_in', existing.id, mutationStamp, now);
    await rebuildWidgetRows(tx, now, timeZoneId);
    return ok(undefined);
  });
}

// --- settings ----------------------------------------------------------------

export function setSelectedIcon(
  deps: CommandDeps,
  input: { commandId: CommandId; icon: SelectedIcon },
): Promise<DomainResult<void>> {
  return runCommand(deps, input.commandId, async ({ tx }) => {
    await saveSelectedIcon(tx, input.icon);
    return ok(undefined);
  });
}

export function setICloudSyncEnabled(
  deps: CommandDeps,
  input: { commandId: CommandId; enabled: boolean },
): Promise<DomainResult<void>> {
  return runCommand(deps, input.commandId, async ({ tx }) => {
    await saveICloudSyncEnabled(tx, input.enabled);
    return ok(undefined);
  });
}

export function dismissMetricsEducation(
  deps: CommandDeps,
  input: { commandId: CommandId; boardId: BoardId },
): Promise<DomainResult<void>> {
  return runCommand(deps, input.commandId, async ({ tx, now, settings, stamp }) => {
    if (!settings.metricsEducationDismissed.includes(input.boardId)) {
      const dismissed = [...settings.metricsEducationDismissed, input.boardId];
      await saveMetricsEducationDismissed(tx, dismissed);
      await appendOutbox(tx, 'settings', 'app-settings', stamp(), now);
    }
    return ok(undefined);
  });
}

// --- import ---------------------------------------------------------------

export type ImportSnapshotInput = {
  commandId: CommandId;
  draft: ImportDraft;
};

export type ImportSummary = {
  boardsCreated: number;
  boardsSkipped: number;
  checkInsCreated: number;
  checkInsSkipped: number;
  remindersCreated: number;
  remindersSkipped: number;
};

// restored activity periods replay only when the whole list is coherent:
// real logical dates, each end on or after its start, strictly ordered
// without overlap, and any open period last. one bad entry distrusts the
// list and the import falls back to a derived lifetime period instead of
// writing corrupt period state
function sanitizeImportPeriods(
  periods: { startDate: string; endDate: string | null }[],
): { startDate: LogicalDate; endDate: LogicalDate | null }[] {
  const cleaned: { startDate: LogicalDate; endDate: LogicalDate | null }[] = [];
  for (const period of periods) {
    if (typeof period !== 'object' || period === null) {
      return [];
    }
    if (typeof period.startDate !== 'string' || !isValidLogicalDate(period.startDate)) {
      return [];
    }
    if (period.endDate !== null) {
      if (typeof period.endDate !== 'string' || !isValidLogicalDate(period.endDate)) {
        return [];
      }
      if (compareLogicalDates(period.endDate, period.startDate) < 0) {
        return [];
      }
    }
    cleaned.push({
      startDate: period.startDate as LogicalDate,
      endDate: period.endDate as LogicalDate | null,
    });
  }
  cleaned.sort((a, b) => compareLogicalDates(a.startDate, b.startDate));
  for (let index = 1; index < cleaned.length; index += 1) {
    const previous = cleaned[index - 1];
    if (previous.endDate === null) {
      return [];
    }
    if (compareLogicalDates(cleaned[index].startDate, previous.endDate) <= 0) {
      return [];
    }
  }
  return cleaned;
}

// one exclusive transaction maps normalized import drafts onto real
// records: an own-format restore keeps original ids and periods and skips
// records that already exist, while a ripples csv import always creates
// fresh records and derives periods and logical dates from its instants
export function importSnapshot(
  deps: CommandDeps,
  input: ImportSnapshotInput,
): Promise<DomainResult<ImportSummary>> {
  return runCommand(deps, input.commandId, async ({ tx, now, timeZoneId, stamp }) => {
    const summary: ImportSummary = {
      boardsCreated: 0,
      boardsSkipped: 0,
      checkInsCreated: 0,
      checkInsSkipped: 0,
      remindersCreated: 0,
      remindersSkipped: 0,
    };
    const boardIdBySource = new Map<string, BoardId>();
    const boardMeta = new Map<
      BoardId,
      { startOfDayMinute: number; tracksAmount: boolean; tracksTime: boolean }
    >();
    let lastKey = await lastActiveOrderKey(tx);

    for (const draft of input.draft.boards) {
      // invalid records skip individually instead of failing the import
      const fields = validateBoardFields({
        title: draft.title,
        symbol: draft.symbol,
        accentHex: draft.accentHex,
        tracksAmount: draft.tracksAmount,
        amountUnit: draft.amountUnit,
        quickAmount: draft.quickAmount,
        startOfDayMinute: draft.startOfDayMinute,
      });
      if (!fields.ok) {
        summary.boardsSkipped += 1;
        continue;
      }
      if (draft.preserveId) {
        if (!isUuidV4(draft.sourceId)) {
          summary.boardsSkipped += 1;
          continue;
        }
        const existing = await getBoardById(tx, draft.sourceId as BoardId);
        if (existing) {
          // a restore over existing data keeps the live record and still
          // routes the file's check-ins to it
          boardIdBySource.set(draft.sourceId, existing.id);
          boardMeta.set(existing.id, {
            startOfDayMinute: existing.startOfDayMinute,
            tracksAmount: existing.tracksAmount,
            tracksTime: existing.tracksTime,
          });
          summary.boardsSkipped += 1;
          continue;
        }
        if (await boardIdExists(tx, draft.sourceId as BoardId)) {
          // a tombstoned row still owns its primary key; the deleted board
          // stays deleted and its check-ins are not rerouted
          summary.boardsSkipped += 1;
          continue;
        }
      }
      const boardId = (draft.preserveId ? draft.sourceId : deps.ids.uuid()) as BoardId;
      const mutationStamp = stamp();
      const createdAt = Math.min(draft.createdAtUtc, now);
      const archivedAt =
        draft.archivedAtUtc === null ? null : Math.min(draft.archivedAtUtc, now);
      const orderKey = draft.orderKey ?? orderKeyAfter(lastKey);
      // every used key folds into the high-water mark, preserved ones
      // included, so later generated keys cannot collide or interleave
      if (lastKey === null || orderKey > lastKey) {
        lastKey = orderKey;
      }
      const board: Board = {
        id: boardId,
        title: fields.value.title,
        symbol: fields.value.symbol,
        accentHex: fields.value.accentHex,
        usesTintedBackground: draft.usesTintedBackground,
        tracksAmount: draft.tracksAmount,
        amountUnit: fields.value.amountUnit,
        quickAmount: fields.value.quickAmount,
        tracksTime: draft.tracksTime,
        startOfDayMinute: fields.value.startOfDayMinute,
        metricsEnabled: draft.metricsEnabled,
        orderKey,
        archivedAt,
        createdAt,
        updatedAt: now,
        mutationStamp,
        deletedAt: null,
      };
      await insertBoard(tx, board);
      await appendOutbox(tx, 'board', boardId, mutationStamp, now);
      const restoredPeriods = draft.periods === null ? [] : sanitizeImportPeriods(draft.periods);
      if (restoredPeriods.length > 0) {
        // an own-format restore replays its recorded activity periods
        for (const period of restoredPeriods) {
          const periodId = await insertPeriod(tx, boardId, period.startDate, mutationStamp);
          if (period.endDate !== null) {
            await closeOpenPeriod(tx, boardId, period.endDate, mutationStamp);
          }
          await appendOutbox(tx, 'activity_period', String(periodId), mutationStamp, now);
        }
      } else {
        // ripples imports, and own restores whose period list is missing or
        // incoherent, derive one period from creation to archive
        const startDate = currentLogicalDate(
          createdAt,
          timeZoneId,
          fields.value.startOfDayMinute,
        );
        const periodId = await insertPeriod(tx, boardId, startDate, mutationStamp);
        if (archivedAt !== null) {
          const archivedDate = currentLogicalDate(
            archivedAt,
            timeZoneId,
            fields.value.startOfDayMinute,
          );
          const endDate =
            compareLogicalDates(archivedDate, startDate) < 0 ? startDate : archivedDate;
          await closeOpenPeriod(tx, boardId, endDate, mutationStamp);
        }
        await appendOutbox(tx, 'activity_period', String(periodId), mutationStamp, now);
      }
      boardIdBySource.set(draft.sourceId, boardId);
      boardMeta.set(boardId, {
        startOfDayMinute: fields.value.startOfDayMinute,
        tracksAmount: draft.tracksAmount,
        tracksTime: draft.tracksTime,
      });
      summary.boardsCreated += 1;
    }

    for (const draft of input.draft.checkIns) {
      const boardId = boardIdBySource.get(draft.sourceBoardId);
      if (!boardId) {
        summary.checkInsSkipped += 1;
        continue;
      }
      if (draft.preserveId && draft.sourceId !== null) {
        if (!isUuidV4(draft.sourceId)) {
          summary.checkInsSkipped += 1;
          continue;
        }
        // the raw check covers live and tombstoned rows: both own the
        // primary key, and a deleted check-in stays deleted
        if (await checkInIdExists(tx, draft.sourceId as CheckInId)) {
          summary.checkInsSkipped += 1;
          continue;
        }
      }
      const meta = boardMeta.get(boardId) as {
        startOfDayMinute: number;
        tracksAmount: boolean;
        tracksTime: boolean;
      };
      const instant = draft.occurredAtUtc;
      let logicalDate: LogicalDate;
      if (draft.logicalDate !== null && isValidLogicalDate(draft.logicalDate)) {
        logicalDate = draft.logicalDate;
      } else if (instant !== null) {
        // a malformed stored date falls back to the instant's logical date
        logicalDate = currentLogicalDate(instant, timeZoneId, meta.startOfDayMinute);
      } else {
        summary.checkInsSkipped += 1;
        continue;
      }
      const today = currentLogicalDate(now, timeZoneId, meta.startOfDayMinute);
      if (logicalDate > today) {
        // future rows never enter the store
        summary.checkInsSkipped += 1;
        continue;
      }
      const note = validateNote(draft.note);
      // amounts pass the same domain gate as user input; an out-of-range
      // value is dropped, not a reason to lose the record
      const amountResult =
        meta.tracksAmount && draft.amount !== null ? validateAmount(draft.amount) : null;
      const mutationStamp = stamp();
      const checkInId = (
        draft.preserveId && draft.sourceId !== null ? draft.sourceId : deps.ids.uuid()
      ) as CheckInId;
      // a same-day instant from a skewed source clock is clamped so no
      // stored occurrence sits in the future
      const storedInstant =
        meta.tracksTime && instant !== null ? Math.min(instant, now) : null;
      const checkIn: CheckIn = {
        id: checkInId,
        boardId,
        logicalDate,
        occurredAtUtc: storedInstant,
        timeZoneId:
          storedInstant === null ? null : (draft.timeZoneId ?? timeZoneId),
        offsetMinutes:
          storedInstant === null
            ? null
            : (draft.offsetMinutes ?? offsetMinutesAt(storedInstant, timeZoneId)),
        amount: amountResult !== null && amountResult.ok ? amountResult.value : null,
        // an over-long note is dropped, not a reason to lose the record
        note: note.ok ? note.value : null,
        source: 'app',
        idempotencyKey: deps.ids.uuid() as CommandId,
        createdAt: Math.min(draft.createdAtUtc, now),
        updatedAt: now,
        mutationStamp,
        deletedAt: null,
      };
      await insertCheckIn(tx, checkIn);
      await appendOutbox(tx, 'check_in', checkInId, mutationStamp, now);
      summary.checkInsCreated += 1;
    }

    for (const draft of input.draft.reminders) {
      const boardId = boardIdBySource.get(draft.sourceBoardId);
      if (!boardId) {
        summary.remindersSkipped += 1;
        continue;
      }
      const mask = validateWeekdaysMask(draft.weekdaysMask);
      const minute = validateMinuteOfDay(draft.minuteOfDay);
      const message = validateReminderMessage(draft.message);
      if (!mask.ok || !minute.ok || !message.ok) {
        summary.remindersSkipped += 1;
        continue;
      }
      if (!isUuidV4(draft.sourceId)) {
        summary.remindersSkipped += 1;
        continue;
      }
      // the raw check covers live and tombstoned rows
      if (await reminderIdExists(tx, draft.sourceId as ReminderId)) {
        summary.remindersSkipped += 1;
        continue;
      }
      const mutationStamp = stamp();
      const reminder: Reminder = {
        id: draft.sourceId as ReminderId,
        boardId,
        weekdaysMask: mask.value,
        minuteOfDay: minute.value,
        message: message.value,
        // rules and enabled state restore; the schedule itself is rebuilt
        // by the reminder reconciler after the import
        enabled: draft.enabled,
        scheduleState: 'idle',
        lastScheduleError: null,
        createdAt: Math.min(draft.createdAtUtc, now),
        updatedAt: now,
        mutationStamp,
        deletedAt: null,
      };
      await insertReminder(tx, reminder);
      await appendOutbox(tx, 'reminder', reminder.id, mutationStamp, now);
      summary.remindersCreated += 1;
    }

    await rebuildWidgetRows(tx, now, timeZoneId);
    return ok(summary);
  });
}

