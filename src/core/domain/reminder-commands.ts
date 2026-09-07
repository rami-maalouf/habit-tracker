import type { SqlExecutor } from '../persistence/database';
import { getBoardById } from '../persistence/repositories/boards';
import {
  clearScheduleRows,
  getReminderById,
  insertReminder,
  listOrphanedScheduleRows,
  listRemindersForReconcile,
  listScheduleRows,
  replaceScheduleRows,
  updateReminderRow,
} from '../persistence/repositories/reminders';
import { appendOutbox } from '../persistence/repositories/support';
import type { CommandContext, CommandDeps } from './commands';
import { replayCommand, runCommand } from './commands';
import type { Board, Reminder, ReminderScheduleState } from './entities';
import type { BoardId, CommandId, ReminderId } from './ids';
import type { ReminderAuthorization, ReminderScheduler, ReminderScheduleRequest } from './ports';
import type { DomainResult } from './result';
import { err, ok } from './result';
import {
  validateMinuteOfDay,
  validateReminderMessage,
  validateWeekdaysMask,
} from './validation';

export type ReminderCommandDeps = CommandDeps & { scheduler: ReminderScheduler };

const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export function weekdaysInMask(mask: number): number[] {
  return ISO_WEEKDAYS.filter((weekday) => (mask & (1 << (weekday - 1))) !== 0);
}

// the just-in-time permission point: the system prompt runs before the
// exclusive transaction so the database is never held open on user input
export async function resolveReminderAuthorization(
  scheduler: ReminderScheduler,
  wantsSchedule: boolean,
  requestIfUndetermined = true,
): Promise<DomainResult<ReminderAuthorization>> {
  if (!wantsSchedule) {
    return ok('undetermined');
  }
  try {
    const current = await scheduler.authorization();
    if (!requestIfUndetermined || current !== 'undetermined') {
      return ok(current);
    }
    return ok(await scheduler.requestAuthorization());
  } catch {
    return err('platform', 'Notification permission could not be checked. Try again.', {
      retryable: true,
    });
  }
}

type ScheduleOutcome = {
  scheduleState: ReminderScheduleState;
  lastScheduleError: string | null;
};

// replace-before-cancel: new requests are scheduled first, and only a
// fully successful replacement cancels the previous identifiers. on any
// failure the new requests are cancelled and the old schedule stands.
export async function applyReminderSchedule(
  tx: SqlExecutor,
  scheduler: ReminderScheduler,
  input: {
    reminder: Pick<Reminder, 'id' | 'boardId' | 'weekdaysMask' | 'minuteOfDay' | 'message'>;
    boardTitle: string;
    shouldSchedule: boolean;
    authorization: 'granted' | 'denied' | 'undetermined';
    // denied state only applies while the person still wants the schedule
    wantsSchedule: boolean;
  },
): Promise<ScheduleOutcome> {
  const existing = await listScheduleRows(tx, input.reminder.id);
  const existingIdentifiers = existing.map((row) => row.nativeIdentifier);

  if (!input.shouldSchedule || input.authorization !== 'granted') {
    if (existingIdentifiers.length > 0) {
      await scheduler.cancel(existingIdentifiers);
      await clearScheduleRows(tx, input.reminder.id);
    }
    if (input.wantsSchedule && input.authorization !== 'granted') {
      return { scheduleState: 'denied', lastScheduleError: null };
    }
    return { scheduleState: 'idle', lastScheduleError: null };
  }

  const weekdays = weekdaysInMask(input.reminder.weekdaysMask);
  // the platform's pending-request pool is validated before saving; the
  // ui never silently drops selected weekdays to fit the limit
  const capacity = await scheduler.remainingCapacity();
  if (capacity < weekdays.length) {
    return { scheduleState: 'error', lastScheduleError: 'capacity_exceeded' };
  }

  const scheduled: { weekday: number; nativeIdentifier: string }[] = [];
  try {
    for (const weekday of weekdays) {
      const identifier = await scheduler.schedule({
        reminderId: input.reminder.id,
        boardId: input.reminder.boardId,
        weekday,
        minuteOfDay: input.reminder.minuteOfDay,
        title: input.boardTitle,
        body: input.reminder.message ?? `Check in to ${input.boardTitle}`,
      });
      scheduled.push({ weekday, nativeIdentifier: identifier });
    }
  } catch {
    if (scheduled.length > 0) {
      try {
        await scheduler.cancel(scheduled.map((row) => row.nativeIdentifier));
      } catch {
        // partial requests the platform refused to cancel become orphans
        // for the reconciler's pending sweep
      }
    }
    return { scheduleState: 'error', lastScheduleError: 'schedule_failed' };
  }

  // a cancellation failure never invalidates the successful replacement:
  // the rows below track the new requests, and old ones the platform kept
  // are cancelled by the reconciler's pending sweep
  if (existingIdentifiers.length > 0) {
    try {
      await scheduler.cancel(existingIdentifiers);
    } catch {
      // swept later
    }
  }
  await replaceScheduleRows(tx, input.reminder.id, scheduled);
  return { scheduleState: 'scheduled', lastScheduleError: null };
}

export type CreateReminderInput = {
  commandId: CommandId;
  boardId: BoardId;
  weekdaysMask: number;
  minuteOfDay: number;
  message?: string | null;
  enabled: boolean;
};

export async function createReminder(
  deps: ReminderCommandDeps,
  input: CreateReminderInput,
): Promise<DomainResult<{ reminderId: ReminderId; scheduleState: ReminderScheduleState }>> {
  const replay = await replayCommand<{ reminderId: ReminderId; scheduleState: ReminderScheduleState }>(
    deps.db, input.commandId,
  );
  if (replay !== null) {
    return replay;
  }
  const mask = validateWeekdaysMask(input.weekdaysMask);
  if (!mask.ok) {
    return mask;
  }
  const minute = validateMinuteOfDay(input.minuteOfDay);
  if (!minute.ok) {
    return minute;
  }
  const message = validateReminderMessage(input.message);
  if (!message.ok) {
    return message;
  }
  // the target is checked before the just-in-time prompt so a stale or
  // invalid save cannot consume the one system permission ask
  const preflight = await getBoardById(deps.db, input.boardId);
  if (!preflight) {
    return err('not_found', 'This board no longer exists.');
  }
  if (preflight.archivedAt !== null) {
    return err('archived', 'Restore the board to change its reminders.');
  }
  const authorization = await resolveReminderAuthorization(deps.scheduler, input.enabled);
  if (!authorization.ok) {
    return authorization;
  }
  return runCommand(deps, input.commandId, async (context) => {
    const board = await getBoardById(context.tx, input.boardId);
    if (!board) {
      return err('not_found', 'This board no longer exists.');
    }
    if (board.archivedAt !== null) {
      return err('archived', 'Restore the board to change its reminders.');
    }
    return ok(await createReminderInTransaction(deps, context, {
      board,
      weekdaysMask: mask.value,
      minuteOfDay: minute.value,
      message: message.value,
      enabled: input.enabled,
      authorization: authorization.value,
    }));
  });
}

// callers validate the fields and resolve permission before entering the
// shared envelope, so board drafts and standalone saves use one mutation
export async function createReminderInTransaction(
  deps: ReminderCommandDeps,
  { tx, now, stamp }: CommandContext,
  input: {
    board: Board;
    weekdaysMask: number;
    minuteOfDay: number;
    message: string | null;
    enabled: boolean;
    authorization: ReminderAuthorization;
  },
): Promise<{ reminderId: ReminderId; scheduleState: ReminderScheduleState }> {
  const reminderId = deps.ids.uuid() as ReminderId;
  const mutationStamp = stamp();
  // denial preserves the validated reminder disabled with its denied state
  const enabled = input.enabled && input.authorization === 'granted';
  const reminder: Reminder = {
    id: reminderId,
    boardId: input.board.id,
    weekdaysMask: input.weekdaysMask,
    minuteOfDay: input.minuteOfDay,
    message: input.message,
    enabled,
    nativeIdentifiers: [],
    scheduleState: 'pending',
    lastScheduleError: null,
    createdAt: now,
    updatedAt: now,
    mutationStamp,
    deletedAt: null,
  };
  await insertReminder(tx, reminder);
  const outcome = await applyReminderSchedule(tx, deps.scheduler, {
    reminder,
    boardTitle: input.board.title,
    shouldSchedule: enabled,
    authorization: input.authorization,
    wantsSchedule: input.enabled,
  });
  await updateReminderRow(tx, { ...reminder, ...outcome });
  await appendOutbox(tx, 'reminder', reminderId, mutationStamp, now);
  return { reminderId, scheduleState: outcome.scheduleState };
}

export type UpdateReminderInput = {
  commandId: CommandId;
  reminderId: ReminderId;
  expectedMutationStamp: string;
  weekdaysMask: number;
  minuteOfDay: number;
  message?: string | null;
};

export async function updateReminder(
  deps: ReminderCommandDeps,
  input: UpdateReminderInput,
): Promise<DomainResult<{ scheduleState: ReminderScheduleState }>> {
  const replay = await replayCommand<{ scheduleState: ReminderScheduleState }>(deps.db, input.commandId);
  if (replay !== null) {
    return replay;
  }
  const mask = validateWeekdaysMask(input.weekdaysMask);
  if (!mask.ok) {
    return mask;
  }
  const minute = validateMinuteOfDay(input.minuteOfDay);
  if (!minute.ok) {
    return minute;
  }
  const message = validateReminderMessage(input.message);
  if (!message.ok) {
    return message;
  }
  const authorizationResult = await resolveReminderAuthorization(deps.scheduler, true, false);
  if (!authorizationResult.ok) {
    return authorizationResult;
  }
  const authorization = authorizationResult.value;
  return runCommand(deps, input.commandId, async ({ tx, now, stamp }) => {
    const existing = await getReminderById(tx, input.reminderId);
    if (!existing) {
      return err('not_found', 'This reminder no longer exists.');
    }
    if (existing.mutationStamp !== input.expectedMutationStamp) {
      return err('conflict', 'This reminder changed elsewhere. Review and save again.');
    }
    const board = await getBoardById(tx, existing.boardId);
    if (!board) {
      return err('not_found', 'This board no longer exists.');
    }
    if (board.archivedAt !== null) {
      return err('archived', 'Restore the board to change its reminders.');
    }
    const mutationStamp = stamp();
    // an edit while authorization is revoked preserves the rule disabled
    // with the denied state, mirroring the first-save behavior
    const enabled = existing.enabled && authorization === 'granted';
    const reminder: Reminder = {
      ...existing,
      weekdaysMask: mask.value,
      minuteOfDay: minute.value,
      message: message.value,
      enabled,
      updatedAt: now,
      mutationStamp,
    };
    const outcome = await applyReminderSchedule(tx, deps.scheduler, {
      reminder,
      boardTitle: board.title,
      shouldSchedule: enabled,
      authorization,
      wantsSchedule: existing.enabled,
    });
    await updateReminderRow(tx, { ...reminder, ...outcome });
    await appendOutbox(tx, 'reminder', reminder.id, mutationStamp, now);
    return ok({ scheduleState: outcome.scheduleState });
  });
}

export async function setReminderEnabled(
  deps: ReminderCommandDeps,
  input: { commandId: CommandId; reminderId: ReminderId; enabled: boolean },
): Promise<DomainResult<{ scheduleState: ReminderScheduleState; enabled: boolean }>> {
  const replay = await replayCommand<{ scheduleState: ReminderScheduleState; enabled: boolean }>(
    deps.db, input.commandId,
  );
  if (replay !== null) {
    return replay;
  }
  // check the target before consuming the just-in-time prompt
  const preflight = await getReminderById(deps.db, input.reminderId);
  if (!preflight) {
    return err('not_found', 'This reminder no longer exists.');
  }
  const preflightBoard = await getBoardById(deps.db, preflight.boardId);
  if (!preflightBoard) {
    return err('not_found', 'This board no longer exists.');
  }
  if (preflightBoard.archivedAt !== null) {
    return err('archived', 'Restore the board to change its reminders.');
  }
  const authorizationResult = await resolveReminderAuthorization(deps.scheduler, input.enabled);
  if (!authorizationResult.ok) {
    return authorizationResult;
  }
  const authorization = authorizationResult.value;
  // enabling under denial keeps the reminder disabled with the denied
  // state; the ui explains the settings path instead of re-prompting
  const enabled = input.enabled && authorization === 'granted';
  return runCommand(deps, input.commandId, async ({ tx, now, stamp }) => {
    const existing = await getReminderById(tx, input.reminderId);
    if (!existing) {
      return err('not_found', 'This reminder no longer exists.');
    }
    const board = await getBoardById(tx, existing.boardId);
    if (!board) {
      return err('not_found', 'This board no longer exists.');
    }
    if (board.archivedAt !== null) {
      return err('archived', 'Restore the board to change its reminders.');
    }
    const mutationStamp = stamp();
    const reminder: Reminder = { ...existing, enabled, updatedAt: now, mutationStamp };
    const outcome = await applyReminderSchedule(tx, deps.scheduler, {
      reminder,
      boardTitle: board.title,
      shouldSchedule: enabled,
      authorization,
      wantsSchedule: input.enabled,
    });
    await updateReminderRow(tx, { ...reminder, ...outcome });
    await appendOutbox(tx, 'reminder', reminder.id, mutationStamp, now);
    return ok({ scheduleState: outcome.scheduleState, enabled });
  });
}

export async function deleteReminder(
  deps: ReminderCommandDeps,
  input: { commandId: CommandId; reminderId: ReminderId },
): Promise<DomainResult<void>> {
  return runCommand(deps, input.commandId, async ({ tx, now, stamp }) => {
    const existing = await getReminderById(tx, input.reminderId);
    if (!existing) {
      return err('not_found', 'This reminder no longer exists.');
    }
    const rows = await listScheduleRows(tx, existing.id);
    if (rows.length > 0) {
      await deps.scheduler.cancel(rows.map((row) => row.nativeIdentifier));
      await clearScheduleRows(tx, existing.id);
    }
    const mutationStamp = stamp();
    await updateReminderRow(tx, {
      ...existing,
      enabled: false,
      scheduleState: 'idle',
      lastScheduleError: null,
      updatedAt: now,
      mutationStamp,
      deletedAt: now,
    });
    await appendOutbox(tx, 'reminder', existing.id, mutationStamp, now);
    return ok(undefined);
  });
}

// reruns on cold start, foreground, permission change, board archive or
// restore, and after mutations: cancels orphaned native requests, drops
// schedules that should not exist, and schedules the ones that should.
// device-local schedule state changes do not enter the outbox.
export async function reconcileReminderSchedules(
  deps: ReminderCommandDeps,
  input: { commandId: CommandId },
): Promise<DomainResult<{ updated: number }>> {
  const replay = await replayCommand<{ updated: number }>(deps.db, input.commandId);
  if (replay !== null) {
    return replay;
  }
  const authorizationResult = await resolveReminderAuthorization(deps.scheduler, true, false);
  if (!authorizationResult.ok) {
    return authorizationResult;
  }
  const authorization = authorizationResult.value;
  return runCommand(deps, input.commandId, async ({ tx }) => {
    let updated = 0;
    const pendingRequests = new Map(
      (await deps.scheduler.pendingRequests()).map(({ identifier, request }) => [identifier, request]),
    );

    const orphans = await listOrphanedScheduleRows(tx);
    if (orphans.length > 0) {
      await deps.scheduler.cancel(orphans.map((row) => row.nativeIdentifier));
      for (const orphan of orphans) {
        await clearScheduleRows(tx, orphan.reminderId);
      }
      updated += 1;
    }

    const knownIdentifiers = new Set<string>();
    for (const entry of await listRemindersForReconcile(tx)) {
      const shouldSchedule =
        entry.reminder.enabled && !entry.boardArchived && authorization === 'granted';
      const wantsSchedule = entry.reminder.enabled && !entry.boardArchived;
      const rows = await listScheduleRows(tx, entry.reminder.id);
      const desiredWeekdays = weekdaysInMask(entry.reminder.weekdaysMask);
      const rowsMatch =
        rows.length === desiredWeekdays.length &&
        rows.every((row, index) => {
          const pending = pendingRequests.get(row.nativeIdentifier);
          return row.weekday === desiredWeekdays[index] && pending != null &&
            matchesReminderRequest(pending, {
              reminderId: entry.reminder.id,
              boardId: entry.reminder.boardId,
              weekday: row.weekday,
              minuteOfDay: entry.reminder.minuteOfDay,
              title: entry.boardTitle,
              body: entry.reminder.message ?? `Check in to ${entry.boardTitle}`,
            });
        });
      // a reminder that wants a schedule but cannot have one must read
      // denied, not a leftover idle or error state. a first-save denial
      // (record disabled, state denied) also stays denied while the
      // authorization is still revoked, so the ui keeps explaining why.
      const idleState = wantsSchedule && authorization !== 'granted' ? 'denied' : 'idle';
      const settled = shouldSchedule
        ? entry.reminder.scheduleState === 'scheduled' && rowsMatch
        : rows.length === 0 &&
          (entry.reminder.scheduleState === idleState ||
            (entry.reminder.scheduleState === 'denied' && authorization !== 'granted'));
      if (settled) {
        for (const row of rows) {
          knownIdentifiers.add(row.nativeIdentifier);
        }
        continue;
      }
      const outcome = await applyReminderSchedule(tx, deps.scheduler, {
        reminder: entry.reminder,
        boardTitle: entry.boardTitle,
        shouldSchedule,
        authorization,
        wantsSchedule,
      });
      for (const row of await listScheduleRows(tx, entry.reminder.id)) {
        knownIdentifiers.add(row.nativeIdentifier);
      }
      // an unchanged outcome (a persistent error being retried) is not an
      // update: reporting it would loop invalidation-driven reconciles
      const changed =
        outcome.scheduleState !== entry.reminder.scheduleState ||
        outcome.lastScheduleError !== entry.reminder.lastScheduleError ||
        (outcome.scheduleState === 'scheduled' && !rowsMatch);
      if (changed) {
        // the reminder's own mutation stamp is preserved: reconciliation
        // is device-local schedule state, not a synced edit
        await updateReminderRow(tx, { ...entry.reminder, ...outcome });
        updated += 1;
      }
    }

    // pending requests no schedule row claims are crash leftovers or
    // partially cancelled replacements; sweep them
    const pending = await deps.scheduler.pendingIdentifiers();
    const unknown = pending.filter((identifier) => !knownIdentifiers.has(identifier));
    if (unknown.length > 0) {
      await deps.scheduler.cancel(unknown);
      updated += 1;
    }
    return ok({ updated });
  });
}

function matchesReminderRequest(actual: ReminderScheduleRequest, expected: ReminderScheduleRequest): boolean {
  return actual.reminderId === expected.reminderId &&
    actual.boardId === expected.boardId &&
    actual.weekday === expected.weekday &&
    actual.minuteOfDay === expected.minuteOfDay &&
    actual.title === expected.title &&
    actual.body === expected.body;
}
