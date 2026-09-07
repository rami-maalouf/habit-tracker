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

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  SchedulableTriggerInputTypes: { WEEKLY: 'weekly' },
}));

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
  it.each([
    { reminderId: 'wrong' }, { boardId: 'wrong' }, { weekday: 7 },
    { minuteOfDay: 800 }, { title: 'stale title' }, { body: 'stale body' },
  ])('replaces native request metadata drift %o', async (drift) => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    await createReminder(deps, {
      commandId: harness.ids.nextCommandId(), boardId,
      weekdaysMask: MONDAY, minuteOfDay: 480, enabled: true,
    });
    const request = scheduler.pending.get('native-1')!;
    scheduler.pending.set('native-1', { ...request, ...drift });
    expect(await reconcileReminderSchedules(deps, { commandId: harness.ids.nextCommandId() }))
      .toEqual({ ok: true, value: { updated: 1 } });
    expect([...scheduler.pending.values()]).toEqual([request]);
    await harness.db.closeAsync();
  });

  it('preserves a denied first save until authorization changes', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    scheduler.auth = 'denied';
    await createReminder(deps, {
      commandId: harness.ids.nextCommandId(), boardId,
      weekdaysMask: MONDAY, minuteOfDay: 480, enabled: true,
    });
    expect(await reconcileReminderSchedules(deps, { commandId: harness.ids.nextCommandId() }))
      .toEqual({ ok: true, value: { updated: 0 } });
    scheduler.auth = 'granted';
    expect(await reconcileReminderSchedules(deps, { commandId: harness.ids.nextCommandId() }))
      .toEqual({ ok: true, value: { updated: 1 } });
    expect(scheduler.pending.size).toBe(0);
    await harness.db.closeAsync();
  });

  it('recreates requests removed by the operating system despite settled local rows', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    await createReminder(deps, {
      commandId: harness.ids.nextCommandId(), boardId,
      weekdaysMask: MONDAY_WEDNESDAY, minuteOfDay: 480, enabled: true,
    });
    scheduler.pending.delete('native-1');
    const result = await reconcileReminderSchedules(deps, { commandId: harness.ids.nextCommandId() });
    expect(result.ok && result.value.updated).toBe(1);
    expect([...scheduler.pending.values()].map((request) => request.weekday)).toEqual([1, 3]);
    expect(await reconcileReminderSchedules(deps, { commandId: harness.ids.nextCommandId() }))
      .toEqual({ ok: true, value: { updated: 0 } });
    await harness.db.closeAsync();
  });

  it('refreshes native time and content after a synced reminder and board edit', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness, { title: 'old title' });
    const created = await createReminder(deps, {
      commandId: harness.ids.nextCommandId(), boardId,
      weekdaysMask: MONDAY, minuteOfDay: 480, enabled: true,
    });
    const reminderId = firstReminderId(created);
    await harness.db.runAsync('UPDATE boards SET title = ? WHERE id = ?', ['new title', boardId]);
    await harness.db.runAsync('UPDATE reminders SET minute_of_day = ?, message = ? WHERE id = ?',
      [600, 'new message', reminderId]);
    const result = await reconcileReminderSchedules(deps, { commandId: harness.ids.nextCommandId() });
    expect(result.ok && result.value.updated).toBe(1);
    expect([...scheduler.pending.values()]).toEqual([{
      boardId, reminderId, weekday: 1, minuteOfDay: 600, title: 'new title', body: 'new message',
    }]);
    await harness.db.closeAsync();
  });

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

describe('sol reminder remediation', () => {
  it('replays completed saves and reconciliation while native permission APIs are unavailable', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    const createInput = {
      commandId: harness.ids.nextCommandId(), boardId,
      weekdaysMask: MONDAY, minuteOfDay: 480, enabled: true,
    };
    const created = await createReminder(deps, createInput);
    const reminderId = firstReminderId(created);
    const record = await getReminder(harness.deps, reminderId);
    if (!record.ok || !record.value) throw new Error('missing reminder');
    const updateInput = {
      commandId: harness.ids.nextCommandId(), reminderId,
      expectedMutationStamp: record.value.mutationStamp, weekdaysMask: MONDAY, minuteOfDay: 600,
    };
    const updated = await updateReminder(deps, updateInput);
    const toggleInput = { commandId: harness.ids.nextCommandId(), reminderId, enabled: true };
    const toggled = await setReminderEnabled(deps, toggleInput);
    const reconcileInput = { commandId: harness.ids.nextCommandId() };
    const reconciled = await reconcileReminderSchedules(deps, reconcileInput);
    const before = new Map(scheduler.pending);
    const authorization = jest.spyOn(scheduler, 'authorization').mockRejectedValue(new Error('unavailable'));
    expect(await createReminder(deps, createInput)).toEqual(created);
    expect(await updateReminder(deps, updateInput)).toEqual(updated);
    expect(await setReminderEnabled(deps, toggleInput)).toEqual(toggled);
    expect(await reconcileReminderSchedules(deps, reconcileInput)).toEqual(reconciled);
    expect(authorization).not.toHaveBeenCalled();
    expect(scheduler.pending).toEqual(before);
    await harness.db.closeAsync();
  });

  it('returns retryable results for permission failures in edit, enable, and reconcile', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    const created = await createReminder(deps, {
      commandId: harness.ids.nextCommandId(), boardId,
      weekdaysMask: MONDAY, minuteOfDay: 480, enabled: false,
    });
    const reminderId = firstReminderId(created);
    const before = await getReminder(harness.deps, reminderId);
    if (!before.ok || !before.value) throw new Error('missing reminder');
    jest.spyOn(scheduler, 'authorization').mockRejectedValue(new Error('native private details'));
    const results = await Promise.all([
      updateReminder(deps, {
        commandId: harness.ids.nextCommandId(), reminderId,
        expectedMutationStamp: before.value.mutationStamp, weekdaysMask: MONDAY, minuteOfDay: 600,
      }),
      setReminderEnabled(deps, { commandId: harness.ids.nextCommandId(), reminderId, enabled: true }),
      reconcileReminderSchedules(deps, { commandId: harness.ids.nextCommandId() }),
    ]);
    for (const result of results) {
      expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'platform', retryable: true }) });
      expect(JSON.stringify(result)).not.toContain('native private details');
    }
    expect(await getReminder(harness.deps, reminderId)).toEqual(before);
    await harness.db.closeAsync();
  });

  it('does not persist or consume the command when the system permission prompt rejects', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    scheduler.auth = 'undetermined';
    jest.spyOn(scheduler, 'requestAuthorization').mockRejectedValueOnce(new Error('native private details'));
    const input = {
      commandId: harness.ids.nextCommandId(), boardId,
      weekdaysMask: MONDAY, minuteOfDay: 480, enabled: true,
    };
    expect(await createReminder(deps, input)).toEqual({
      ok: false, error: expect.objectContaining({ code: 'platform', retryable: true }),
    });
    expect(await listBoardReminders(harness.deps, boardId)).toEqual({ ok: true, value: [] });
    expect((await createReminder(deps, input)).ok).toBe(true);
    expect(scheduler.pending.size).toBe(1);
    await harness.db.closeAsync();
  });

  it('returns an actionable result when a permission query rejects before saving', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    jest.spyOn(scheduler, 'authorization').mockRejectedValue(new Error('native private details'));
    await expect(createReminder(deps, {
      commandId: harness.ids.nextCommandId(), boardId,
      weekdaysMask: MONDAY, minuteOfDay: 480, enabled: true,
    })).resolves.toEqual({ ok: false, error: expect.objectContaining({ code: 'platform', retryable: true }) });
    expect(await listBoardReminders(harness.deps, boardId)).toEqual({ ok: true, value: [] });
    await harness.db.closeAsync();
  });

  it('disables a reminder even when permission queries are unavailable', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    const created = await createReminder(deps, {
      commandId: harness.ids.nextCommandId(), boardId,
      weekdaysMask: MONDAY, minuteOfDay: 480, enabled: true,
    });
    const authorization = jest.spyOn(scheduler, 'authorization')
      .mockRejectedValue(new Error('native private details'));
    await expect(setReminderEnabled(deps, {
      commandId: harness.ids.nextCommandId(), reminderId: firstReminderId(created), enabled: false,
    })).resolves.toEqual({ ok: true, value: { scheduleState: 'idle', enabled: false } });
    expect(authorization).not.toHaveBeenCalled();
    expect(scheduler.pending.size).toBe(0);
    await harness.db.closeAsync();
  });

  it('checks the target before consuming the just-in-time prompt', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    await archiveBoard(harness.deps, { commandId: harness.ids.nextCommandId(), boardId });
    scheduler.auth = 'undetermined';
    const created = await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY,
      minuteOfDay: 480,
      enabled: true,
    });
    expect(!created.ok && created.error.code).toBe('archived');
    // the one system prompt was never spent on a rejected save
    expect(scheduler.prompts).toBe(0);
    const missingToggle = await setReminderEnabled(deps, {
      commandId: harness.ids.nextCommandId(),
      reminderId: '00000000-0000-4000-8000-00000000e0e2' as ReminderId,
      enabled: true,
    });
    expect(!missingToggle.ok && missingToggle.error.code).toBe('not_found');
    expect(scheduler.prompts).toBe(0);
    await harness.db.closeAsync();
  });

  it('preserves an edit under revoked authorization disabled and denied', async () => {
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
    scheduler.auth = 'denied';
    const updated = await updateReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      reminderId,
      expectedMutationStamp: record.value.mutationStamp,
      weekdaysMask: MONDAY_WEDNESDAY,
      minuteOfDay: 600,
    });
    expect(updated.ok && updated.value.scheduleState).toBe('denied');
    const after = await getReminder(harness.deps, reminderId);
    expect(after.ok && after.value?.enabled).toBe(false);
    expect(scheduler.pending.size).toBe(0);
    await harness.db.closeAsync();
  });

  it('keeps a successful replacement when cancelling the old requests fails', async () => {
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
    scheduler.failNextCancels = 1;
    const updated = await updateReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      reminderId,
      expectedMutationStamp: record.value.mutationStamp,
      weekdaysMask: MONDAY,
      minuteOfDay: 600,
    });
    expect(updated.ok && updated.value.scheduleState).toBe('scheduled');
    const after = await getReminder(harness.deps, reminderId);
    if (!after.ok || after.value === null) {
      throw new Error('reminder missing');
    }
    // the rows track the new request; the uncancelled old one is now an
    // untracked orphan for the reconciler
    expect(after.value.nativeIdentifiers).toEqual(['native-2']);
    const reconciled = await reconcileReminderSchedules(deps, {
      commandId: harness.ids.nextCommandId(),
    });
    expect(reconciled.ok && reconciled.value.updated).toBeGreaterThan(0);
    expect(scheduler.pending.size).toBe(1);
    expect([...scheduler.pending.keys()]).toEqual(['native-2']);
    await harness.db.closeAsync();
  });

  it('sweeps pending requests no schedule row claims', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY,
      minuteOfDay: 480,
      enabled: true,
    });
    // a crash leftover the schedule table never recorded
    scheduler.pending.set('native-stray', {
      reminderId: 'gone',
      boardId: 'gone',
      weekday: 1,
      minuteOfDay: 0,
      title: 'stray',
      body: 'stray',
    });
    const result = await reconcileReminderSchedules(deps, {
      commandId: harness.ids.nextCommandId(),
    });
    expect(result.ok && result.value.updated).toBeGreaterThan(0);
    expect(scheduler.pending.has('native-stray')).toBe(false);
    expect(scheduler.pending.size).toBe(1);
    await harness.db.closeAsync();
  });

  it('marks an unauthorized enabled reminder denied instead of leaving it idle', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    // an imported enabled reminder arrives idle with no schedule
    const imported = await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY,
      minuteOfDay: 480,
      enabled: true,
    });
    const reminderId = firstReminderId(imported as never);
    await harness.db.runAsync(
      `UPDATE reminders SET schedule_state = 'idle' WHERE id = ?`,
      [reminderId],
    );
    await harness.db.runAsync(`DELETE FROM reminder_schedule WHERE reminder_id = ?`, [reminderId]);
    scheduler.pending.clear();
    scheduler.auth = 'denied';
    const result = await reconcileReminderSchedules(deps, {
      commandId: harness.ids.nextCommandId(),
    });
    expect(result.ok && result.value.updated).toBe(1);
    const record = await getReminder(harness.deps, reminderId);
    expect(record.ok && record.value?.scheduleState).toBe('denied');
    expect(record.ok && record.value?.enabled).toBe(true);
    await harness.db.closeAsync();
  });

  it('does not report an unchanged persistent error as an update', async () => {
    const { harness, scheduler, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    scheduler.capacity = 0;
    await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY,
      minuteOfDay: 480,
      enabled: true,
    });
    // the first reconcile retries and lands on the same capacity error;
    // reporting it as an update would loop invalidation-driven reconciles
    const first = await reconcileReminderSchedules(deps, {
      commandId: harness.ids.nextCommandId(),
    });
    expect(first.ok && first.value.updated).toBe(0);
    await harness.db.closeAsync();
  });

  it('hydrates adapter-owned native identifiers on reminder records', async () => {
    const { harness, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    const created = await createReminder(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      weekdaysMask: MONDAY_WEDNESDAY,
      minuteOfDay: 480,
      enabled: true,
    });
    const reminderId = firstReminderId(created as never);
    const record = await getReminder(harness.deps, reminderId);
    expect(record.ok && record.value?.nativeIdentifiers).toEqual(['native-1', 'native-2']);
    const listed = await listBoardReminders(harness.deps, boardId);
    expect(listed.ok && listed.value[0].nativeIdentifiers).toHaveLength(2);
    await harness.db.closeAsync();
  });
});

describe('preflight race re-checks', () => {
  it('still rejects when the board changes between preflight and transaction', async () => {
    const { harness, deps } = await setup();
    const boardId = await createBoardForTest(harness);

    // the preflight sees the live board; the exclusive transaction then
    // observes a concurrent archive or delete and must still reject
    const raceDb = (mutation: string) => {
      const wrapped = Object.create(harness.db) as typeof harness.db;
      wrapped.withExclusiveTransactionAsync = (work) =>
        harness.db.withExclusiveTransactionAsync(async (tx) => {
          await tx.runAsync(mutation, [boardId]);
          return work(tx);
        });
      return wrapped;
    };

    const archivedRace = await createReminder(
      { ...deps, db: raceDb('UPDATE boards SET archived_at = 1 WHERE id = ?') },
      {
        commandId: harness.ids.nextCommandId(),
        boardId,
        weekdaysMask: MONDAY,
        minuteOfDay: 480,
        enabled: false,
      },
    );
    expect(!archivedRace.ok && archivedRace.error.code).toBe('archived');
    await harness.db.runAsync('UPDATE boards SET archived_at = NULL WHERE id = ?', [boardId]);

    const deletedRace = await createReminder(
      { ...deps, db: raceDb('UPDATE boards SET deleted_at = 1 WHERE id = ?') },
      {
        commandId: harness.ids.nextCommandId(),
        boardId,
        weekdaysMask: MONDAY,
        minuteOfDay: 480,
        enabled: false,
      },
    );
    expect(!deletedRace.ok && deletedRace.error.code).toBe('not_found');
    await harness.db.runAsync('UPDATE boards SET deleted_at = NULL WHERE id = ?', [boardId]);
    await harness.db.closeAsync();
  });

  it('still rejects a toggle when the records change inside the transaction', async () => {
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

    const raceDb = (mutation: string, param: string) => {
      const wrapped = Object.create(harness.db) as typeof harness.db;
      wrapped.withExclusiveTransactionAsync = (work) =>
        harness.db.withExclusiveTransactionAsync(async (tx) => {
          await tx.runAsync(mutation, [param]);
          return work(tx);
        });
      return wrapped;
    };

    const reminderGone = await setReminderEnabled(
      {
        ...deps,
        db: raceDb('UPDATE reminders SET deleted_at = 1 WHERE id = ?', reminderId),
      },
      { commandId: harness.ids.nextCommandId(), reminderId, enabled: false },
    );
    expect(!reminderGone.ok && reminderGone.error.code).toBe('not_found');
    await harness.db.runAsync('UPDATE reminders SET deleted_at = NULL WHERE id = ?', [reminderId]);

    const boardGone = await setReminderEnabled(
      { ...deps, db: raceDb('UPDATE boards SET deleted_at = 1 WHERE id = ?', boardId) },
      { commandId: harness.ids.nextCommandId(), reminderId, enabled: false },
    );
    expect(!boardGone.ok && boardGone.error.code).toBe('not_found');
    await harness.db.runAsync('UPDATE boards SET deleted_at = NULL WHERE id = ?', [boardId]);

    const boardArchived = await setReminderEnabled(
      { ...deps, db: raceDb('UPDATE boards SET archived_at = 1 WHERE id = ?', boardId) },
      { commandId: harness.ids.nextCommandId(), reminderId, enabled: false },
    );
    expect(!boardArchived.ok && boardArchived.error.code).toBe('archived');
    await harness.db.closeAsync();
  });
});

describe('native reminder adapter boundary', () => {
  const notifications = jest.requireMock<{
    getPermissionsAsync: jest.Mock;
    requestPermissionsAsync: jest.Mock;
    getAllScheduledNotificationsAsync: jest.Mock;
    scheduleNotificationAsync: jest.Mock;
    cancelScheduledNotificationAsync: jest.Mock;
  }>('expo-notifications');
  const { reminderScheduler: adapter } = jest.requireActual<
    typeof import('@/platform/notifications')
  >('../../../src/platform/notifications/index');

  it.each([
    ['pendingRequests', 'pending_unavailable'],
    ['pendingIdentifiers', 'pending_unavailable'],
    ['remainingCapacity', 'capacity_unavailable'],
  ] as const)('sanitizes %s native rejection', async (operation, code) => {
    notifications.getAllScheduledNotificationsAsync.mockRejectedValue(new Error('private native details'));
    await expect(adapter[operation]()).rejects.toMatchObject({ name: 'ReminderSchedulerError', code });
    await expect(adapter[operation]()).rejects.not.toThrow('private native details');
  });

  it('sanitizes schedule and cancel native rejection', async () => {
    notifications.scheduleNotificationAsync.mockRejectedValue(new Error('private native details'));
    notifications.cancelScheduledNotificationAsync.mockRejectedValue(new Error('private native details'));
    await expect(adapter.schedule({
      reminderId: 'reminder', boardId: 'board', weekday: 1, minuteOfDay: 480, title: 'read', body: 'read',
    })).rejects.toMatchObject({ name: 'ReminderSchedulerError', code: 'schedule_failed' });
    await expect(adapter.cancel(['native-1'])).rejects.toMatchObject({
      name: 'ReminderSchedulerError', code: 'cancel_failed',
    });
  });

  it.each(['pendingRequests', 'pendingIdentifiers'] as const)(
    'reports %s native rejection as a retryable platform result', async (operation) => {
      const { harness, deps } = await setup();
      notifications.getPermissionsAsync.mockResolvedValue({ granted: true });
      notifications.getAllScheduledNotificationsAsync.mockRejectedValue(new Error('private native details'));
      if (operation === 'pendingIdentifiers') {
        notifications.getAllScheduledNotificationsAsync.mockResolvedValueOnce([]);
      }
      const result = await reconcileReminderSchedules({ ...deps, scheduler: adapter }, {
        commandId: harness.ids.nextCommandId(),
      });
      expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'platform', retryable: true }) });
      expect(JSON.stringify(result)).not.toContain('private native details');
      await harness.db.closeAsync();
    },
  );

  it('rolls back the reminder when native capacity cannot be read', async () => {
    const { harness, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    notifications.getPermissionsAsync.mockResolvedValue({ granted: true });
    notifications.getAllScheduledNotificationsAsync.mockRejectedValue(new Error('private native details'));
    const result = await createReminder({ ...deps, scheduler: adapter }, {
      commandId: harness.ids.nextCommandId(), boardId, weekdaysMask: MONDAY, minuteOfDay: 480, enabled: true,
    });
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'platform', retryable: true }) });
    expect(JSON.stringify(result)).not.toContain('private native details');
    expect(await listBoardReminders(harness.deps, boardId)).toEqual({ ok: true, value: [] });
    await harness.db.closeAsync();
  });

  it('preserves the failed schedule state when native scheduling rejects', async () => {
    const { harness, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    notifications.getPermissionsAsync.mockResolvedValue({ granted: true });
    notifications.getAllScheduledNotificationsAsync.mockResolvedValue([]);
    notifications.scheduleNotificationAsync.mockRejectedValue(new Error('private native details'));
    const result = await createReminder({ ...deps, scheduler: adapter }, {
      commandId: harness.ids.nextCommandId(), boardId, weekdaysMask: MONDAY, minuteOfDay: 480, enabled: true,
    });
    expect(result.ok && result.value.scheduleState).toBe('error');
    const record = await getReminder(harness.deps, firstReminderId(result));
    expect(record.ok && record.value?.lastScheduleError).toBe('schedule_failed');
    expect(JSON.stringify(record)).not.toContain('private native details');
    await harness.db.closeAsync();
  });

  it('preserves the reminder when native cancellation rejects', async () => {
    const { harness, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    const created = await createReminder(deps, {
      commandId: harness.ids.nextCommandId(), boardId, weekdaysMask: MONDAY, minuteOfDay: 480, enabled: true,
    });
    const reminderId = firstReminderId(created);
    const before = await getReminder(harness.deps, reminderId);
    notifications.cancelScheduledNotificationAsync.mockRejectedValue(new Error('private native details'));
    const result = await deleteReminder({ ...deps, scheduler: adapter }, {
      commandId: harness.ids.nextCommandId(), reminderId,
    });
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'platform', retryable: true }) });
    expect(JSON.stringify(result)).not.toContain('private native details');
    expect(await getReminder(harness.deps, reminderId)).toEqual(before);
    await harness.db.closeAsync();
  });

  it.each(['authorization', 'requestAuthorization'] as const)(
    'maps %s rejection to a typed error without native details', async (operation) => {
      notifications.getPermissionsAsync.mockRejectedValue(new Error('private native details'));
      notifications.requestPermissionsAsync.mockRejectedValue(new Error('private native details'));
      await expect(adapter[operation]()).rejects.toMatchObject({
        name: 'ReminderSchedulerError',
        code: 'authorization_unavailable',
        message: 'Notification permission is temporarily unavailable.',
      });
    },
  );

  it('reads ios serialized weekly calendar requests and android weekly requests', async () => {
    const content = {
      title: 'stretch', body: 'take a break', data: { reminderId: 'reminder', boardId: 'board' },
    };
    notifications.getAllScheduledNotificationsAsync.mockResolvedValue([
      {
        identifier: 'ios', content,
        trigger: {
          type: 'calendar', repeats: true,
          dateComponents: {
            weekday: 2, hour: 8, minute: 30, calendar: null, timeZone: null,
            isLeapMonth: false, isRepeatedDay: false,
          },
        },
      },
      { identifier: 'android', content, trigger: { type: 'weekly', weekday: 1, hour: 10, minute: 0 } },
    ]);
    expect(await adapter.pendingRequests()).toEqual([
      {
        identifier: 'ios',
        request: { reminderId: 'reminder', boardId: 'board', weekday: 1, minuteOfDay: 510,
          title: 'stretch', body: 'take a break' },
      },
      {
        identifier: 'android',
        request: { reminderId: 'reminder', boardId: 'board', weekday: 7, minuteOfDay: 600,
          title: 'stretch', body: 'take a break' },
      },
    ]);
  });

  it('keeps malformed or nonweekly native identifiers visible for replacement and orphan cleanup', async () => {
    const content = { title: 'stretch', body: 'move', data: { reminderId: 'reminder', boardId: 'board' } };
    const calendar = { type: 'calendar', repeats: true, dateComponents: { weekday: 2, hour: 8, minute: 0 } };
    notifications.getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'immediate', content, trigger: null },
      { identifier: 'daily', content, trigger: { type: 'daily', hour: 8, minute: 0 } },
      { identifier: 'once', content, trigger: { ...calendar, repeats: false } },
      { identifier: 'dated', content, trigger: { ...calendar, dateComponents: { ...calendar.dateComponents, year: 2026 } } },
      { identifier: 'pinned', content, trigger: { ...calendar, dateComponents: { ...calendar.dateComponents, timeZone: 'UTC' } } },
      { identifier: 'invalid-hour', content, trigger: { type: 'weekly', weekday: 1, hour: 24, minute: 0 } },
      { identifier: 'missing-link', content: { ...content, data: {} }, trigger: calendar },
    ]);
    expect(await adapter.pendingRequests()).toEqual(
      ['immediate', 'daily', 'once', 'dated', 'pinned', 'invalid-hour', 'missing-link']
        .map((identifier) => ({ identifier, request: null })),
    );
  });
});
