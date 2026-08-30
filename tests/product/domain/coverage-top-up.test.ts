import { isLeapYear, parseLogicalDate } from '@/core/calendar/logical-date';
import { dismissMetricsEducation, updateBoard } from '@/core/domain/commands';
import type { BoardId, LogicalDate } from '@/core/domain/ids';
import { orderKeyBetween } from '@/core/domain/order-key';
import { getBoardDependentCounts, getSevenDayStrip } from '@/core/domain/queries';
import { validateStartOfDayMinute, validateUnit } from '@/core/domain/validation';
import { getCheckInByIdempotencyKey } from '@/core/persistence/repositories/check-ins';
import { createCheckIn } from '@/core/domain/commands';

import { createBoardForTest } from '../helpers/product-fixtures';
import { createTestHarness } from '../helpers/test-db';

describe('coverage top-up', () => {
  it('covers leap-year century rules and date parse failure', () => {
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(() => parseLogicalDate('garbage')).toThrow('invalid logical date');
    const { isValidLogicalDate } = require('@/core/calendar/logical-date') as typeof import('../../../src/core/calendar/logical-date');
    expect(isValidLogicalDate('2028-02-29')).toBe(true);
    expect(isValidLogicalDate('2026-02-29')).toBe(false);
    expect(isValidLogicalDate('2026-04-31')).toBe(false);
  });

  it('covers unit and start-of-day boundary inputs', () => {
    expect(validateUnit(undefined)).toEqual({ ok: true, value: null });
    expect(validateUnit(null)).toEqual({ ok: true, value: null });
    expect(validateStartOfDayMinute(-30).ok).toBe(false);
    expect(validateStartOfDayMinute(15.5).ok).toBe(false);
    expect(validateStartOfDayMinute(720).ok).toBe(true);
  });

  it('covers deep order-key narrowing near the digit floor', () => {
    // repeatedly insert before the smallest key to walk toward the floor
    let high = 'i';
    for (let index = 0; index < 40; index += 1) {
      const lower = orderKeyBetween(null, high);
      expect(lower < high).toBe(true);
      high = lower;
    }
    // and between adjacent long keys
    const between = orderKeyBetween('az', 'b');
    expect(between > 'az' && between < 'b').toBe(true);
  });

  it('covers the populated seven-day strip and dependent counts', async () => {
    const harness = await createTestHarness();
    const boardId = await createBoardForTest(harness);
    await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      source: 'app',
    });
    const strip = await getSevenDayStrip(harness.deps, boardId);
    expect(strip.ok && strip.value?.strip[6]).toBe(1);
    const counts = await getBoardDependentCounts(harness.deps, boardId);
    expect(counts.ok && counts.value).toEqual({ checkIns: 1, notes: 0, reminders: 0 });
    const byKey = await getCheckInByIdempotencyKey(harness.db, 'no-such-key');
    expect(byKey).toBeNull();
    await harness.db.closeAsync();
  });

  it('rejects invalid update-board fields before the transaction', async () => {
    const harness = await createTestHarness();
    const boardId = await createBoardForTest(harness);
    const result = await updateBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      expectedMutationStamp: 'x',
      title: '   ',
      symbol: 'star.fill',
      accentHex: '#70A7FF',
      usesTintedBackground: false,
      tracksAmount: false,
      tracksTime: false,
      startOfDayMinute: 0,
      metricsEnabled: true,
    });
    expect(!result.ok && result.error.code).toBe('validation');
    await harness.db.closeAsync();
  });

  it('reports an uninitialized database from commands needing settings', async () => {
    const harness = await createTestHarness();
    await harness.db.runAsync('DELETE FROM app_settings');
    const result = await dismissMetricsEducation(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId: '00000000-0000-4000-8000-000000000001' as BoardId,
    });
    expect(!result.ok && result.error.code).toBe('database');
    await harness.db.closeAsync();
  });

  it('covers remaining validator and query branches', async () => {
    expect(validateUnit('   ')).toEqual({ ok: true, value: null });
    const { validateReminderMessage } = await Promise.resolve(
      require('@/core/domain/validation') as typeof import('../../../src/core/domain/validation'),
    );
    expect(validateReminderMessage(null)).toEqual({ ok: true, value: null });
    expect(validateReminderMessage('   ')).toEqual({ ok: true, value: null });

    const harness = await createTestHarness();
    const boardId = await createBoardForTest(harness, {
      tracksAmount: true,
      tracksTime: true,
      quickAmount: 2,
    });
    const created = await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      source: 'app',
    });
    if (!created.ok) {
      throw new Error('setup failed');
    }
    const { getCheckIn, getTimelineAnalytics } = await Promise.resolve(
      require('@/core/domain/queries') as typeof import('../../../src/core/domain/queries'),
    );
    const loaded = await getCheckIn(harness.deps, created.value.checkInId);
    const stamp = loaded.ok && loaded.value ? loaded.value.mutationStamp : '';
    const { updateCheckIn } = await Promise.resolve(
      require('@/core/domain/commands') as typeof import('../../../src/core/domain/commands'),
    );
    const badAmount = await updateCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      checkInId: created.value.checkInId,
      expectedMutationStamp: stamp,
      logicalDate: '2026-08-30' as LogicalDate,
      amount: -2,
    });
    expect(!badAmount.ok && badAmount.error.code).toBe('validation');
    const updated = await updateCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      checkInId: created.value.checkInId,
      expectedMutationStamp: stamp,
      logicalDate: '2026-08-30' as LogicalDate,
      amount: 3.25,
      occurredAtUtc: harness.clock.utcMs - 3600000,
    });
    expect(updated.ok).toBe(true);

    const timeline = await getTimelineAnalytics(harness.deps, boardId, 2026);
    expect(timeline.ok && timeline.value?.months[7]).toBe(1);

    // defensive path: a check-in whose board row was tombstoned out of band
    await harness.db.runAsync('UPDATE boards SET deleted_at = 1 WHERE id = ?', [boardId]);
    const orphanUpdate = await updateCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      checkInId: created.value.checkInId,
      expectedMutationStamp: updated.ok ? updated.value.mutationStamp : '',
      logicalDate: '2026-08-30' as LogicalDate,
    });
    expect(!orphanUpdate.ok && orphanUpdate.error.code).toBe('not_found');
    await harness.db.closeAsync();
  });

  it('wraps a bootstrap transaction failure after a clean migration', async () => {
    const { NodeSqlDatabase, TestIds: Ids } = await Promise.resolve(
      require('../helpers/test-db') as typeof import('../helpers/test-db'),
    );
    const db = new NodeSqlDatabase();
    const { migrateDatabase } = await Promise.resolve(
      require('@/core/persistence/migrations') as typeof import('../../../src/core/persistence/migrations'),
    );
    await migrateDatabase(db);
    const broken = Object.create(db) as typeof db;
    broken.withExclusiveTransactionAsync = async () => {
      throw new Error('settings write failed');
    };
    const { initializeProductDatabase } = await Promise.resolve(
      require('@/core/persistence/bootstrap') as typeof import('../../../src/core/persistence/bootstrap'),
    );
    const result = await initializeProductDatabase(broken, new Ids());
    expect(!result.ok && result.error.code).toBe('database');
    await db.closeAsync();
  });

  it('validates future-date guard against the shifted today', async () => {
    const harness = await createTestHarness();
    // shift 720: at 09:00 local the logical day is still yesterday
    const boardId = await createBoardForTest(harness, { startOfDayMinute: 720 });
    harness.clock.utcMs = Date.UTC(2026, 7, 30, 13, 0); // 09:00 edt
    const todayRejected = await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      logicalDate: '2026-08-30' as LogicalDate,
      source: 'app',
    });
    expect(!todayRejected.ok && todayRejected.error.code).toBe('validation');
    const yesterdayAccepted = await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      logicalDate: '2026-08-29' as LogicalDate,
      source: 'app',
    });
    expect(yesterdayAccepted.ok).toBe(true);
    await harness.db.closeAsync();
  });
});
