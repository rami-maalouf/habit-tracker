import {
  createBoardInTransaction,
  replayCommand,
  runCommand,
  validateBoardFields,
  type CreateBoardInput,
} from './commands';
import type { BoardId } from './ids';
import type { ReminderScheduler } from './ports';
import {
  createReminderInTransaction,
  resolveReminderAuthorization,
  type ReminderCommandDeps,
} from './reminder-commands';
import { ok, type DomainResult } from './result';
import { validateMinuteOfDay, validateReminderMessage, validateWeekdaysMask } from './validation';

type ReminderDraft = {
  weekdaysMask: number;
  minuteOfDay: number;
  message?: string | null;
  enabled: boolean;
};
type CreateBoardOutcome = { boardId: BoardId; remindersDenied: boolean };

export async function createBoardWithReminders(
  deps: ReminderCommandDeps,
  input: CreateBoardInput & { reminders: ReminderDraft[] },
): Promise<DomainResult<CreateBoardOutcome>> {
  const replayed = await replayCommand<CreateBoardOutcome>(deps.db, input.commandId);
  if (replayed !== null) return replayed;
  const fields = validateBoardFields(input);
  if (!fields.ok) return fields;
  const reminders: (ReminderDraft & { message: string | null })[] = [];
  for (const draft of input.reminders) {
    const weekdays = validateWeekdaysMask(draft.weekdaysMask);
    if (!weekdays.ok) return weekdays;
    const minute = validateMinuteOfDay(draft.minuteOfDay);
    if (!minute.ok) return minute;
    const message = validateReminderMessage(draft.message);
    if (!message.ok) return message;
    reminders.push({ ...draft, message: message.value });
  }
  // permission prompts never hold the shared database transaction open.
  const authorization = await resolveReminderAuthorization(
    deps.scheduler, reminders.some((reminder) => reminder.enabled),
  );
  if (!authorization.ok) return authorization;

  const scheduled: string[] = [];
  const scheduler: ReminderScheduler = {
    authorization: deps.scheduler.authorization.bind(deps.scheduler),
    requestAuthorization: deps.scheduler.requestAuthorization.bind(deps.scheduler),
    remainingCapacity: deps.scheduler.remainingCapacity.bind(deps.scheduler),
    pendingIdentifiers: deps.scheduler.pendingIdentifiers.bind(deps.scheduler),
    pendingRequests: deps.scheduler.pendingRequests.bind(deps.scheduler),
    cancel: deps.scheduler.cancel.bind(deps.scheduler),
    async schedule(request) {
      const identifier = await deps.scheduler.schedule(request);
      scheduled.push(identifier);
      return identifier;
    },
  };
  const result = await runCommand(deps, input.commandId, async (context) => {
    const board = await createBoardInTransaction(deps, context, input, fields.value);
    let remindersDenied = false;
    for (const reminder of reminders) {
      const created = await createReminderInTransaction({ ...deps, scheduler }, context, {
        ...reminder, board, authorization: authorization.value,
      });
      remindersDenied ||= created.scheduleState === 'denied';
    }
    return ok({ boardId: board.id, remindersDenied });
  });
  // sqlite rollback cannot roll back notification-center side effects.
  if (!result.ok && scheduled.length > 0) {
    try {
      await deps.scheduler.cancel(scheduled);
    } catch {
      // the reconciler will cancel unclaimed native requests on its next pass.
    }
  }
  return result;
}
