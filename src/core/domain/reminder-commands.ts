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
import type { CommandDeps } from './commands';
import { runCommand } from './commands';
import type { Reminder, ReminderScheduleState } from './entities';
import type { BoardId, CommandId, ReminderId } from './ids';
import { isUuidV4 } from './ids';
import type { ReminderScheduler } from './ports';
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
async function resolveAuthorization(
  scheduler: ReminderScheduler,
  wantsSchedule: boolean,
): Promise<'granted' | 'denied' | 'undetermined'> {
  const current = await scheduler.authorization();
  if (!wantsSchedule || current !== 'undetermined') {
    return current;
  }
  return scheduler.requestAuthorization();
}

type ScheduleOutcome = {
  scheduleState: ReminderScheduleState;
  lastScheduleError: string | null;
};

// replace-before-cancel: new requests are scheduled first, and only a
// fully successful replacement cancels the previous identifiers. on any
// failure the new requests are cancelled and the old schedule stands.
async function applyReminderSchedule(
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
      await scheduler.cancel(scheduled.map((row) => row.nativeIdentifier));
    }
    return { scheduleState: 'error', lastScheduleError: 'schedule_failed' };
  }

  if (existingIdentifiers.length > 0) {
    await scheduler.cancel(existingIdentifiers);
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
  const authorization = await resolveAuthorization(deps.scheduler, input.enabled);
  // a denied first save preserves the validated reminder disabled with a
  // denied schedule state instead of prompting repeatedly
  const enabled = input.enabled && authorization === 'granted';
  return runCommand(deps, input.commandId, async ({ tx, now, stamp }) => {
    const board = await getBoardById(tx, input.boardId);
    if (!board) {
      return err('not_found', 'This board no longer exists.');
    }
    if (board.archivedAt !== null) {
      return err('archived', 'Restore the board to change its reminders.');
    }
    const reminderId = deps.ids.uuid() as ReminderId;
    const mutationStamp = stamp();
    const reminder: Reminder = {
      id: reminderId,
      boardId: board.id,
      weekdaysMask: mask.value,
      minuteOfDay: minute.value,
      message: message.value,
      enabled,
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
      boardTitle: board.title,
      shouldSchedule: enabled,
      authorization,
      wantsSchedule: input.enabled,
    });
    await updateReminderRow(tx, { ...reminder, ...outcome });
    await appendOutbox(tx, 'reminder', reminderId, mutationStamp, now);
    return ok({ reminderId, scheduleState: outcome.scheduleState });
  });
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
  const authorization = await deps.scheduler.authorization();
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
    const reminder: Reminder = {
      ...existing,
      weekdaysMask: mask.value,
      minuteOfDay: minute.value,
      message: message.value,
      updatedAt: now,
      mutationStamp,
    };
    const outcome = await applyReminderSchedule(tx, deps.scheduler, {
      reminder,
      boardTitle: board.title,
      shouldSchedule: reminder.enabled,
      authorization,
      wantsSchedule: reminder.enabled,
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
  const authorization = await resolveAuthorization(deps.scheduler, input.enabled);
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
  const authorization = await deps.scheduler.authorization();
  return runCommand(deps, input.commandId, async ({ tx }) => {
    let updated = 0;

    const orphans = await listOrphanedScheduleRows(tx);
    if (orphans.length > 0) {
      await deps.scheduler.cancel(orphans.map((row) => row.nativeIdentifier));
      for (const orphan of orphans) {
        await clearScheduleRows(tx, orphan.reminderId);
      }
      updated += 1;
    }

    for (const entry of await listRemindersForReconcile(tx)) {
      const shouldSchedule =
        entry.reminder.enabled && !entry.boardArchived && authorization === 'granted';
      const rows = await listScheduleRows(tx, entry.reminder.id);
      const desiredWeekdays = weekdaysInMask(entry.reminder.weekdaysMask);
      const rowsMatch =
        rows.length === desiredWeekdays.length &&
        rows.every((row, index) => row.weekday === desiredWeekdays[index]);
      const settled =
        shouldSchedule
          ? entry.reminder.scheduleState === 'scheduled' && rowsMatch
          : rows.length === 0 && entry.reminder.scheduleState !== 'scheduled';
      if (settled) {
        continue;
      }
      const outcome = await applyReminderSchedule(tx, deps.scheduler, {
        reminder: entry.reminder,
        boardTitle: entry.boardTitle,
        shouldSchedule,
        authorization,
        wantsSchedule: entry.reminder.enabled && !entry.boardArchived,
      });
      // the reminder's own mutation stamp is preserved: reconciliation is
      // device-local schedule state, not a synced edit
      await updateReminderRow(tx, { ...entry.reminder, ...outcome });
      updated += 1;
    }
    return ok({ updated });
  });
}
