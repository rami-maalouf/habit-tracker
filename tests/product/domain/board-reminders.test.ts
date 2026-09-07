import { createBoardWithReminders } from '@/core/domain/create-board-with-reminders';
import { reconcileReminderSchedules } from '@/core/domain/reminder-commands';

import { FakeReminderScheduler } from '../helpers/fake-scheduler';
import { createTestHarness, type TestHarness } from '../helpers/test-db';

const board = {
  title: 'board with reminders', symbol: 'star.fill', accentHex: '#70A7FF',
  usesTintedBackground: true, tracksAmount: false, tracksTime: false,
  startOfDayMinute: 0, metricsEnabled: true,
};
const reminder = { weekdaysMask: 1, minuteOfDay: 540, message: 'first', enabled: true };

describe('atomic board and reminder creation', () => {
  let harness: TestHarness;
  let scheduler: FakeReminderScheduler;
  beforeEach(async () => {
    harness = await createTestHarness();
    scheduler = new FakeReminderScheduler();
  });
  afterEach(async () => { await harness.db.closeAsync(); });

  function save(reminders = [reminder], overrides = {}) {
    return createBoardWithReminders({ ...harness.deps, scheduler }, {
      commandId: harness.ids.nextCommandId(), ...board, reminders, ...overrides,
    });
  }

  it.each([
    { title: '' },
    { reminders: [{ ...reminder, weekdaysMask: 0 }] },
    { reminders: [{ ...reminder, minuteOfDay: 1440 }] },
    { reminders: [{ ...reminder, message: 'x'.repeat(181) }] },
  ])('validates every draft before prompting or writing: %j', async (overrides) => {
    scheduler.auth = 'undetermined';
    const result = await save([reminder], overrides);
    expect(result).toMatchObject({ ok: false, error: { code: 'validation' } });
    expect(scheduler.prompts).toBe(0);
    expect(await harness.db.getAllAsync('SELECT id FROM boards')).toHaveLength(0);
    expect(await harness.db.getAllAsync('SELECT id FROM reminders')).toHaveLength(0);
  });

  it('commits all records, projections, outbox, and one receipt; retries do not schedule again', async () => {
    const commandId = harness.ids.nextCommandId();
    const input = { commandId, ...board, reminders: [reminder, { ...reminder, message: 'second' }] };
    const deps = { ...harness.deps, scheduler };
    const result = await createBoardWithReminders(deps, input);
    expect(result).toMatchObject({ ok: true, value: { remindersDenied: false } });
    expect(await harness.db.getAllAsync('SELECT id FROM boards')).toHaveLength(1);
    expect(await harness.db.getAllAsync('SELECT id FROM reminders')).toHaveLength(2);
    expect(await harness.db.getAllAsync('SELECT board_id FROM widget_board_rows')).toHaveLength(1);
    expect(await harness.db.getAllAsync('SELECT id FROM mutation_outbox')).toHaveLength(4);
    expect(await harness.db.getAllAsync('SELECT command_id FROM command_receipts')).toHaveLength(1);
    expect(scheduler.pending.size).toBe(2);
    jest.spyOn(scheduler, 'authorization').mockRejectedValue(new Error('permission service down'));
    expect(await createBoardWithReminders(deps, input)).toEqual(result);
    expect(scheduler.pending.size).toBe(2);
  });

  it('keeps validated reminders disabled when permission is denied', async () => {
    scheduler.auth = 'undetermined';
    scheduler.promptResult = 'denied';
    expect(await save()).toMatchObject({ ok: true, value: { remindersDenied: true } });
    expect(scheduler.prompts).toBe(1);
    expect(await harness.db.getAllAsync('SELECT enabled, schedule_state FROM reminders')).toEqual([
      { enabled: 0, schedule_state: 'denied' },
    ]);
    expect(scheduler.pending.size).toBe(0);
  });

  it('does not create a board when permission cannot be read', async () => {
    jest.spyOn(scheduler, 'authorization').mockRejectedValue(new Error('native detail'));
    expect(await save()).toMatchObject({ ok: false, error: { code: 'platform', retryable: true } });
    expect(await harness.db.getAllAsync('SELECT id FROM boards')).toHaveLength(0);
  });

  it('creates a board without querying permission when no reminders are enabled', async () => {
    const authorization = jest.spyOn(scheduler, 'authorization').mockRejectedValue(new Error('down'));
    expect(await save([])).toMatchObject({ ok: true });
    expect(authorization).not.toHaveBeenCalled();
  });

  it.each([false, true])('rolls back a later reminder write and cleans native requests (cancel fails: %s)', async (cancelFails) => {
    await harness.db.execAsync(`CREATE TRIGGER reject_second_reminder BEFORE INSERT ON reminders
      WHEN NEW.message = 'second' BEGIN SELECT RAISE(ABORT, 'injected failure'); END;`);
    scheduler.failNextCancels = cancelFails ? 1 : 0;
    expect(await save([reminder, { ...reminder, message: 'second' }])).toMatchObject({ ok: false });
    for (const table of ['boards', 'reminders', 'board_activity_periods', 'widget_board_rows', 'mutation_outbox', 'command_receipts']) {
      expect(await harness.db.getAllAsync(`SELECT * FROM ${table}`)).toHaveLength(0);
    }
    if (cancelFails) {
      await reconcileReminderSchedules({ ...harness.deps, scheduler }, { commandId: harness.ids.nextCommandId() });
    }
    expect(scheduler.pending.size).toBe(0);
  });

  it('returns a storage failure before prompting when receipt lookup fails', async () => {
    await harness.db.execAsync('DROP TABLE command_receipts');
    const result = await save();
    expect(result).toMatchObject({ ok: false, error: { code: 'database' } });
    expect(scheduler.prompts).toBe(0);
  });

  it('rejects an invalid command id before querying permission or writing a board', async () => {
    const result = await save([reminder], { commandId: 'invalid' });
    expect(result).toMatchObject({ ok: false, error: { code: 'validation', field: 'commandId' } });
    expect(scheduler.prompts).toBe(0);
    expect(await harness.db.getAllAsync('SELECT id FROM boards')).toHaveLength(0);
  });
});
