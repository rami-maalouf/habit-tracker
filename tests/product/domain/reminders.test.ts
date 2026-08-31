import { archiveBoard, deleteBoard, restoreBoard } from '@/core/domain/commands';
import type { ReminderId } from '@/core/domain/ids';
import {
  createReminder,
  deleteReminder,
  reconcileReminderSchedules,
  setReminderEnabled,
  updateReminder,
  weekdaysInMask,
} from '@/core/domain/reminder-commands';
import type { ReminderCommandDeps } from '@/core/domain/reminder-commands';
import {
  getNotificationOverview,
  getReminder,
  listBoardReminders,
} from '@/core/domain/queries';

import { FakeReminderScheduler } from '../helpers/fake-scheduler';
import { createBoardForTest } from '../helpers/product-fixtures';
import { createTestHarness, type TestHarness } from '../helpers/test-db';

const MONDAY_WEDNESDAY = 0b0000101;
const MONDAY = 0b0000001;

async function setup(): Promise<{
  harness: TestHarness;
  scheduler: FakeReminderScheduler;
  deps: ReminderCommandDeps;
}> {
  const harness = await createTestHarness();
  const scheduler = new FakeReminderScheduler();
  return { harness, scheduler, deps: { ...harness.deps, scheduler } };
}

function firstReminderId(result: { ok: boolean; value?: { reminderId: ReminderId } }): ReminderId {
  if (!result.ok || !result.value) {
    throw new Error('expected a created reminder');
  }
  return result.value.reminderId;
}

describe('reminder commands', () => {
  it('creates an enabled reminder with one native request per weekday', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness, { title: 'water plants' });
    const created = await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY_WEDNESDAY,
      minuteOfDay: 8 * 60 + 30,
      enabled: true,
    });
    if (!created.ok) {
      throw new Error(created.error.message);
    }
    expect(created.value.scheduleState).toBe('scheduled');
    expect(scheduler.pending.size).toBe(2);
    const requests = [...scheduler.pending.values()];
    expect(requests.map((request) => request.weekday)).toEqual([1, 3]);
    expect(requests[0].minuteOfDay).toBe(510);
    expect(requests[0].title).toBe('water plants');
    // the default body names the board when no message is set
    expect(requests[0].body).toBe('Check in to water plants');

    const listed = await listBoardReminders(harness.deps, boardId);
    if (!listed.ok) {
      throw new Error('list failed');
    }
    expect(listed.value).toHaveLength(1);
    expect(listed.value[0].enabled).toBe(true);
    expect(listed.value[0].scheduleState).toBe('scheduled');

    const outbox = await harness.db.getAllAsync<{ entity_type: string }>(
      `SELECT entity_type FROM mutation_outbox WHERE entity_type = 'reminder'`,
    );
    expect(outbox).toHaveLength(1);
    await harness.db.closeAsync();
  });

  it('uses the custom message as the notification body', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    const created = await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY,
      minuteOfDay: 600,
      message: '  time to move  ',
      enabled: true,
    });
    expect(created.ok).toBe(true);
    expect([...scheduler.pending.values()][0].body).toBe('time to move');
    await harness.db.closeAsync();
  });

  it('rejects invalid masks, minutes, and over-long messages', async () => {
    const { harness, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    const base = {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY,
      minuteOfDay: 500,
      enabled: true,
    };
    expect((await createReminder(deps, { ...base, weekdaysMask: 0 })).ok).toBe(false);
    expect((await createReminder(deps, { ...base, weekdaysMask: 0b10000000 })).ok).toBe(false);
    expect(
      (
        await createReminder(deps, {
          ...base,
          commandId: harness.ids.nextCommandId(),
          minuteOfDay: 1440,
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await createReminder(deps, {
          ...base,
          commandId: harness.ids.nextCommandId(),
          message: 'x'.repeat(181),
        })
      ).ok,
    ).toBe(false);
    await harness.db.closeAsync();
  });

  it('prompts just in time and preserves a denied reminder disabled', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    scheduler.auth = 'undetermined';
    scheduler.promptResult = 'denied';
    const created = await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY,
      minuteOfDay: 480,
      enabled: true,
    });
    if (!created.ok) {
      throw new Error(created.error.message);
    }
    expect(scheduler.prompts).toBe(1);
    expect(created.value.scheduleState).toBe('denied');
    expect(scheduler.pending.size).toBe(0);
    const listed = await listBoardReminders(harness.deps, boardId);
    expect(listed.ok && listed.value[0].enabled).toBe(false);
    await harness.db.closeAsync();
  });

  it('never prompts for a reminder saved disabled', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    scheduler.auth = 'undetermined';
    const created = await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY,
      minuteOfDay: 480,
      enabled: false,
    });
    if (!created.ok) {
      throw new Error(created.error.message);
    }
    expect(scheduler.prompts).toBe(0);
    expect(created.value.scheduleState).toBe('idle');
    await harness.db.closeAsync();
  });

  it('prompts once and schedules when the prompt grants', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    scheduler.auth = 'undetermined';
    scheduler.promptResult = 'granted';
    const created = await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY,
      minuteOfDay: 480,
      enabled: true,
    });
    expect(created.ok && created.value.scheduleState).toBe('scheduled');
    expect(scheduler.prompts).toBe(1);
    await harness.db.closeAsync();
  });

  it('rejects reminders on missing or archived boards', async () => {
    const { harness, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    const missing = await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId: '00000000-0000-4000-8000-00000000f0f0' as never,
      weekdaysMask: MONDAY,
      minuteOfDay: 480,
      enabled: true,
    });
    expect(!missing.ok && missing.error.code).toBe('not_found');
    await archiveBoard(harness.deps, { commandId: harness.ids.nextCommandId(), boardId });
    const archived = await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY,
      minuteOfDay: 480,
      enabled: true,
    });
    expect(!archived.ok && archived.error.code).toBe('archived');
    await harness.db.closeAsync();
  });

  it('reports a capacity error without dropping weekdays', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    scheduler.capacity = 1;
    const created = await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY_WEDNESDAY,
      minuteOfDay: 480,
      enabled: true,
    });
    if (!created.ok) {
      throw new Error(created.error.message);
    }
    expect(created.value.scheduleState).toBe('error');
    expect(scheduler.pending.size).toBe(0);
    const listed = await listBoardReminders(harness.deps, boardId);
    expect(listed.ok && listed.value[0].lastScheduleError).toBe('capacity_exceeded');
    await harness.db.closeAsync();
  });

  it('cancels partial schedules when a native call fails mid-way', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    // the first weekday schedules, the second throws
    scheduler.failNextSchedules = 0;
    const failing = new FakeReminderScheduler();
    failing.schedule = (() => {
      let calls = 0;
      return async (request) => {
        calls += 1;
        if (calls === 2) {
          throw new Error('native scheduling failed');
        }
        failing.pending.set(`native-${calls}`, request);
        return `native-${calls}`;
      };
    })();
    const created = await createReminder(
      { ...harness.deps, scheduler: failing },
      {
        commandId: harness.ids.nextCommandId(),
        boardId,
        weekdaysMask: MONDAY_WEDNESDAY,
        minuteOfDay: 480,
        enabled: true,
      },
    );
    if (!created.ok) {
      throw new Error(created.error.message);
    }
    expect(created.value.scheduleState).toBe('error');
    // the partial first request was cancelled again
    expect(failing.cancelled).toEqual(['native-1']);
    const listed = await listBoardReminders(harness.deps, boardId);
    expect(listed.ok && listed.value[0].lastScheduleError).toBe('schedule_failed');
    await harness.db.closeAsync();
  });

  it('fails cleanly when the very first native call throws', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    scheduler.failNextSchedules = 1;
    const created = await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY,
      minuteOfDay: 480,
      enabled: true,
    });
    expect(created.ok && created.value.scheduleState).toBe('error');
    expect(scheduler.cancelled).toHaveLength(0);
    await harness.db.closeAsync();
  });

  it('replaces schedules before cancelling the old identifiers on edit', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    const created = await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY,
      minuteOfDay: 480,
      enabled: true,
    });
    const reminderId = firstReminderId(created as never);
    const record = await getReminder(harness.deps, reminderId);
    if (!record.ok || record.value === null) {
      throw new Error('reminder missing');
    }
    const updated = await updateReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      reminderId,
      expectedMutationStamp: record.value.mutationStamp,
      weekdaysMask: MONDAY_WEDNESDAY,
      minuteOfDay: 600,
    });
    if (!updated.ok) {
      throw new Error(updated.error.message);
    }
    expect(updated.value.scheduleState).toBe('scheduled');
    // old monday request cancelled, two new requests live
    expect(scheduler.cancelled).toEqual(['native-1']);
    expect(scheduler.pending.size).toBe(2);
    expect([...scheduler.pending.values()].map((request) => request.minuteOfDay)).toEqual([
      600, 600,
    ]);
    await harness.db.closeAsync();
  });

  it('keeps the previous schedule when the replacement fails', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    const created = await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY,
      minuteOfDay: 480,
      enabled: true,
    });
    const reminderId = firstReminderId(created as never);
    const record = await getReminder(harness.deps, reminderId);
    if (!record.ok || record.value === null) {
      throw new Error('reminder missing');
    }
    scheduler.failNextSchedules = 1;
    const updated = await updateReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      reminderId,
      expectedMutationStamp: record.value.mutationStamp,
      weekdaysMask: MONDAY_WEDNESDAY,
      minuteOfDay: 600,
    });
    expect(updated.ok && updated.value.scheduleState).toBe('error');
    // the original monday request is still pending
    expect(scheduler.pending.size).toBe(1);
    expect([...scheduler.pending.values()][0].minuteOfDay).toBe(480);
    await harness.db.closeAsync();
  });

  it('surfaces update conflicts, missing records, and validation errors', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    const created = await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY,
      minuteOfDay: 480,
      enabled: true,
    });
    const reminderId = firstReminderId(created as never);
    const conflict = await updateReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      reminderId,
      expectedMutationStamp: 'stale-stamp',
      weekdaysMask: MONDAY,
      minuteOfDay: 500,
    });
    expect(!conflict.ok && conflict.error.code).toBe('conflict');
    const missing = await updateReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      reminderId: '00000000-0000-4000-8000-00000000e0e0' as ReminderId,
      expectedMutationStamp: 'x',
      weekdaysMask: MONDAY,
      minuteOfDay: 500,
    });
    expect(!missing.ok && missing.error.code).toBe('not_found');
    expect(
      (
        await updateReminder(deps, {
          commandId: harness.ids.nextCommandId(),
          reminderId,
          expectedMutationStamp: 'x',
          weekdaysMask: 0,
          minuteOfDay: 500,
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await updateReminder(deps, {
          commandId: harness.ids.nextCommandId(),
          reminderId,
          expectedMutationStamp: 'x',
          weekdaysMask: MONDAY,
          minuteOfDay: -1,
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await updateReminder(deps, {
          commandId: harness.ids.nextCommandId(),
          reminderId,
          expectedMutationStamp: 'x',
          weekdaysMask: MONDAY,
          minuteOfDay: 500,
          message: 'y'.repeat(181),
        })
      ).ok,
    ).toBe(false);
    void scheduler;
    await harness.db.closeAsync();
  });

  it('locks reminder edits behind archived boards', async () => {
    const { harness, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    const created = await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY,
      minuteOfDay: 480,
      enabled: true,
    });
    const reminderId = firstReminderId(created as never);
    const record = await getReminder(harness.deps, reminderId);
    if (!record.ok || record.value === null) {
      throw new Error('reminder missing');
    }
    await archiveBoard(harness.deps, { commandId: harness.ids.nextCommandId(), boardId });
    const updated = await updateReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      reminderId,
      expectedMutationStamp: record.value.mutationStamp,
      weekdaysMask: MONDAY,
      minuteOfDay: 500,
    });
    expect(!updated.ok && updated.error.code).toBe('archived');
    const toggled = await setReminderEnabled(deps, {
      commandId: harness.ids.nextCommandId(),
      reminderId,
      enabled: false,
    });
    expect(!toggled.ok && toggled.error.code).toBe('archived');
    await harness.db.closeAsync();
  });

  it('disabling preserves the rule but cancels future requests', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    const created = await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY_WEDNESDAY,
      minuteOfDay: 480,
      message: 'move it',
      enabled: true,
    });
    const reminderId = firstReminderId(created as never);
    const disabled = await setReminderEnabled(deps, {
      commandId: harness.ids.nextCommandId(),
      reminderId,
      enabled: false,
    });
    expect(disabled.ok && disabled.value.scheduleState).toBe('idle');
    expect(scheduler.pending.size).toBe(0);
    const record = await getReminder(harness.deps, reminderId);
    if (!record.ok || record.value === null) {
      throw new Error('reminder missing');
    }
    expect(record.value.weekdaysMask).toBe(MONDAY_WEDNESDAY);
    expect(record.value.minuteOfDay).toBe(480);
    expect(record.value.message).toBe('move it');
    expect(record.value.enabled).toBe(false);

    const enabled = await setReminderEnabled(deps, {
      commandId: harness.ids.nextCommandId(),
      reminderId,
      enabled: true,
    });
    expect(enabled.ok && enabled.value.scheduleState).toBe('scheduled');
    expect(scheduler.pending.size).toBe(2);
    await harness.db.closeAsync();
  });

  it('keeps a re-enable attempt disabled while permission is denied', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    const created = await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY,
      minuteOfDay: 480,
      enabled: false,
    });
    const reminderId = firstReminderId(created as never);
    scheduler.auth = 'denied';
    const enabled = await setReminderEnabled(deps, {
      commandId: harness.ids.nextCommandId(),
      reminderId,
      enabled: true,
    });
    if (!enabled.ok) {
      throw new Error(enabled.error.message);
    }
    expect(enabled.value.enabled).toBe(false);
    expect(enabled.value.scheduleState).toBe('denied');
    const missing = await setReminderEnabled(deps, {
      commandId: harness.ids.nextCommandId(),
      reminderId: '00000000-0000-4000-8000-00000000e0e1' as ReminderId,
      enabled: false,
    });
    expect(!missing.ok && missing.error.code).toBe('not_found');
    await harness.db.closeAsync();
  });

  it('deleting tombstones the reminder and cancels its requests', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    const created = await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY_WEDNESDAY,
      minuteOfDay: 480,
      enabled: true,
    });
    const reminderId = firstReminderId(created as never);
    const deleted = await deleteReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      reminderId,
    });
    expect(deleted.ok).toBe(true);
    expect(scheduler.pending.size).toBe(0);
    const listed = await listBoardReminders(harness.deps, boardId);
    expect(listed.ok && listed.value).toHaveLength(0);
    const again = await deleteReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      reminderId,
    });
    expect(!again.ok && again.error.code).toBe('not_found');
    await harness.db.closeAsync();
  });
});

describe('reminder reconciliation', () => {
  it('suspends schedules on archive and restores them on restore', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    const created = await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY,
      minuteOfDay: 480,
      enabled: true,
    });
    const reminderId = firstReminderId(created as never);

    await archiveBoard(harness.deps, { commandId: harness.ids.nextCommandId(), boardId });
    const suspended = await reconcileReminderSchedules(deps, {
      commandId: harness.ids.nextCommandId(),
    });
    expect(suspended.ok && suspended.value.updated).toBe(1);
    expect(scheduler.pending.size).toBe(0);
    const archivedRecord = await getReminder(harness.deps, reminderId);
    if (!archivedRecord.ok || archivedRecord.value === null) {
      throw new Error('reminder missing');
    }
    // archiving suspends without clearing enabled
    expect(archivedRecord.value.enabled).toBe(true);
    expect(archivedRecord.value.scheduleState).toBe('idle');

    await restoreBoard(harness.deps, { commandId: harness.ids.nextCommandId(), boardId });
    const restored = await reconcileReminderSchedules(deps, {
      commandId: harness.ids.nextCommandId(),
    });
    expect(restored.ok && restored.value.updated).toBe(1);
    expect(scheduler.pending.size).toBe(1);
    const restoredRecord = await getReminder(harness.deps, reminderId);
    expect(restoredRecord.ok && restoredRecord.value?.scheduleState).toBe('scheduled');
    await harness.db.closeAsync();
  });

  it('cancels schedules when authorization was revoked', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    const created = await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY,
      minuteOfDay: 480,
      enabled: true,
    });
    const reminderId = firstReminderId(created as never);
    scheduler.auth = 'denied';
    const result = await reconcileReminderSchedules(deps, {
      commandId: harness.ids.nextCommandId(),
    });
    expect(result.ok && result.value.updated).toBe(1);
    expect(scheduler.pending.size).toBe(0);
    const record = await getReminder(harness.deps, reminderId);
    expect(record.ok && record.value?.scheduleState).toBe('denied');
    await harness.db.closeAsync();
  });

  it('cancels orphaned native requests left by a board delete', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY_WEDNESDAY,
      minuteOfDay: 480,
      enabled: true,
    });
    expect(scheduler.pending.size).toBe(2);
    const deleted = await deleteBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
    });
    if (!deleted.ok) {
      throw new Error(deleted.error.message);
    }
    const result = await reconcileReminderSchedules(deps, {
      commandId: harness.ids.nextCommandId(),
    });
    expect(result.ok && result.value.updated).toBe(1);
    expect(scheduler.pending.size).toBe(0);
    const rows = await harness.db.getAllAsync(`SELECT * FROM reminder_schedule`);
    expect(rows).toHaveLength(0);
    await harness.db.closeAsync();
  });

  it('is a no-op when every schedule is already settled', async () => {
    const { harness, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY,
      minuteOfDay: 480,
      enabled: true,
    });
    await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY,
      minuteOfDay: 600,
      enabled: false,
    });
    const result = await reconcileReminderSchedules(deps, {
      commandId: harness.ids.nextCommandId(),
    });
    expect(result.ok && result.value.updated).toBe(0);
    await harness.db.closeAsync();
  });

  it('replays through its receipt', async () => {
    const { harness, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY,
      minuteOfDay: 480,
      enabled: true,
    });
    const commandId = harness.ids.nextCommandId();
    const first = await reconcileReminderSchedules(deps, { commandId });
    const replay = await reconcileReminderSchedules(deps, { commandId });
    expect(first.ok && replay.ok).toBe(true);
    if (first.ok && replay.ok) {
      expect(replay.value).toEqual(first.value);
    }
    await harness.db.closeAsync();
  });
});

describe('reminder queries', () => {
  it('summarizes enabled counts and schedule errors for settings', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness, { title: 'stretch' });
    const otherBoard = await createBoardForTest(harness, { title: 'read' });
    await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY,
      minuteOfDay: 480,
      enabled: true,
    });
    scheduler.capacity = 0;
    await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId: otherBoard,
      weekdaysMask: MONDAY,
      minuteOfDay: 500,
      enabled: true,
    });
    const overview = await getNotificationOverview(harness.deps);
    if (!overview.ok) {
      throw new Error('overview failed');
    }
    expect(overview.value.enabledReminderCount).toBe(2);
    expect(overview.value.scheduleErrors).toEqual([
      expect.objectContaining({ boardTitle: 'read', code: 'capacity_exceeded' }),
    ]);

    // archiving removes the board's reminders from the enabled count
    await archiveBoard(harness.deps, { commandId: harness.ids.nextCommandId(), boardId });
    const afterArchive = await getNotificationOverview(harness.deps);
    expect(afterArchive.ok && afterArchive.value.enabledReminderCount).toBe(1);
    await harness.db.closeAsync();
  });

  it('exposes weekday mask decoding for the ui', () => {
    expect(weekdaysInMask(0b1111111)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(weekdaysInMask(0b1000000)).toEqual([7]);
    expect(weekdaysInMask(MONDAY_WEDNESDAY)).toEqual([1, 3]);
  });
});

describe('reminder defensive edges', () => {
  it('deletes a reminder that never scheduled anything', async () => {
    const { harness, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    const created = await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY,
      minuteOfDay: 480,
      enabled: false,
    });
    const reminderId = firstReminderId(created as never);
    const deleted = await deleteReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      reminderId,
    });
    expect(deleted.ok).toBe(true);
    await harness.db.closeAsync();
  });

  it('treats a reminder whose board row vanished as not found', async () => {
    const { harness, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    const created = await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY,
      minuteOfDay: 480,
      enabled: false,
    });
    const reminderId = firstReminderId(created as never);
    const record = await getReminder(harness.deps, reminderId);
    if (!record.ok || record.value === null) {
      throw new Error('reminder missing');
    }
    // a board tombstone normally tombstones its reminders too; the raw
    // update simulates a torn state a defensive guard must survive
    await harness.db.runAsync(`UPDATE boards SET deleted_at = 1 WHERE id = ?`, [boardId]);
    const updated = await updateReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      reminderId,
      expectedMutationStamp: record.value.mutationStamp,
      weekdaysMask: MONDAY,
      minuteOfDay: 500,
    });
    expect(!updated.ok && updated.error.code).toBe('not_found');
    const toggled = await setReminderEnabled(deps, {
      commandId: harness.ids.nextCommandId(),
      reminderId,
      enabled: false,
    });
    expect(!toggled.ok && toggled.error.code).toBe('not_found');
    await harness.db.closeAsync();
  });

  it('labels an error state without a recorded code as unknown', async () => {
    const { harness, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    const created = await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY,
      minuteOfDay: 480,
      enabled: true,
    });
    const reminderId = firstReminderId(created as never);
    await harness.db.runAsync(
      `UPDATE reminders SET schedule_state = 'error', last_schedule_error = NULL WHERE id = ?`,
      [reminderId],
    );
    const overview = await getNotificationOverview(harness.deps);
    expect(overview.ok && overview.value.scheduleErrors[0]?.code).toBe('unknown');
    await harness.db.closeAsync();
  });

  it('counts zero enabled reminders when the store returns no row', async () => {
    const { countEnabledActiveReminders } = jest.requireActual<{
      countEnabledActiveReminders: (tx: unknown) => Promise<number>;
    }>('../../../src/core/persistence/repositories/reminders');
    const count = await countEnabledActiveReminders({ getFirstAsync: async () => null });
    expect(count).toBe(0);
  });
});
