import {
  archiveBoard,
  createBoard,
  createCheckIn,
  deleteBoard,
  removeCheckIn,
  reorderBoard,
  restoreBoard,
  setICloudSyncEnabled,
  setSelectedIcon,
  undoCreatedCheckIn,
  updateBoard,
  updateCheckIn,
} from '@/core/domain/commands';
import type { BoardId, CheckInId, CommandId, LogicalDate } from '@/core/domain/ids';
import {
  getAppSettings,
  getBoard,
  getBoardHeatmap,
  getBoardSummary,
  getCheckIn,
  getConsistencyAnalytics,
  getGroupedCheckInHistory,
  getJournalTimeline,
  getLatestCheckInForDate,
  getSevenDayStrip,
  getStreakAnalytics,
  getTimelineAnalytics,
  getWeekdayAnalytics,
  getYearComparison,
} from '@/core/domain/queries';
import { initializeProductDatabase } from '@/core/persistence/bootstrap';
import { migrateDatabase } from '@/core/persistence/migrations';
import type { SqlDatabase } from '@/core/persistence/database';

import { createBoardForTest } from '../helpers/product-fixtures';
import { createTestHarness, TestIds } from '../helpers/test-db';

const missingBoard = '00000000-0000-4000-8000-00000000ffff' as BoardId;
const missingCheckIn = '00000000-0000-4000-8000-00000000fffe' as CheckInId;
const d = (value: string) => value as LogicalDate;

describe('query recovery paths', () => {
  it('returns explicit not-found and null results for missing entities', async () => {
    const harness = await createTestHarness();
    const board = await getBoard(harness.deps, missingBoard);
    expect(!board.ok && board.error.code).toBe('not_found');
    for (const result of [
      await getSevenDayStrip(harness.deps, missingBoard),
      await getBoardHeatmap(harness.deps, missingBoard),
      await getBoardSummary(harness.deps, missingBoard),
      await getTimelineAnalytics(harness.deps, missingBoard, 2026),
      await getWeekdayAnalytics(harness.deps, missingBoard),
      await getYearComparison(harness.deps, missingBoard, 2026),
      await getConsistencyAnalytics(harness.deps, missingBoard),
      await getStreakAnalytics(harness.deps, missingBoard),
      await getCheckIn(harness.deps, missingCheckIn),
    ]) {
      expect(result.ok && result.value).toBeNull();
    }
    const settings = await getAppSettings(harness.deps);
    expect(settings.ok && settings.value?.selectedIcon).toBe('default');
    await harness.db.closeAsync();
  });

  it('wraps storage failures as retryable database errors', async () => {
    const harness = await createTestHarness();
    await harness.db.closeAsync();
    const result = await getBoard(harness.deps, missingBoard);
    expect(!result.ok && result.error.code).toBe('database');
    expect(!result.ok && result.error.retryable).toBe(true);
  });
});

describe('command failure paths', () => {
  it('rejects malformed command ids', async () => {
    const harness = await createTestHarness();
    const result = await archiveBoard(harness.deps, {
      commandId: 'nope' as CommandId,
      boardId: missingBoard,
    });
    expect(!result.ok && result.error.code).toBe('validation');
    await harness.db.closeAsync();
  });

  it('surfaces database failures as retryable errors', async () => {
    const harness = await createTestHarness();
    await harness.db.closeAsync();
    const result = await archiveBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId: missingBoard,
    });
    expect(!result.ok && result.error.code).toBe('database');
    expect(!result.ok && result.error.retryable).toBe(true);
  });

  it('covers board command guards', async () => {
    const harness = await createTestHarness();
    const boardId = await createBoardForTest(harness);
    const other = await createBoardForTest(harness, { title: 'other' });

    const notFoundUpdate = await updateBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId: missingBoard,
      expectedMutationStamp: 'x',
      title: 'x',
      symbol: 'star.fill',
      accentHex: '#70A7FF',
      usesTintedBackground: false,
      tracksAmount: false,
      tracksTime: false,
      startOfDayMinute: 0,
      metricsEnabled: true,
    });
    expect(!notFoundUpdate.ok && notFoundUpdate.error.code).toBe('not_found');

    await archiveBoard(harness.deps, { commandId: harness.ids.nextCommandId(), boardId });
    const archivedEdit = await updateBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      expectedMutationStamp: 'x',
      title: 'x',
      symbol: 'star.fill',
      accentHex: '#70A7FF',
      usesTintedBackground: false,
      tracksAmount: false,
      tracksTime: false,
      startOfDayMinute: 0,
      metricsEnabled: true,
    });
    expect(!archivedEdit.ok && archivedEdit.error.code).toBe('archived');

    const archiveAgain = await archiveBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
    });
    expect(!archiveAgain.ok && archiveAgain.error.code).toBe('archived');

    const archiveMissing = await archiveBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId: missingBoard,
    });
    expect(!archiveMissing.ok && archiveMissing.error.code).toBe('not_found');

    const reorderArchived = await reorderBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      previousBoardId: null,
      nextBoardId: null,
    });
    expect(!reorderArchived.ok && reorderArchived.error.code).toBe('not_found');

    const reorderMissingNeighbor = await reorderBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId: other,
      previousBoardId: missingBoard,
      nextBoardId: null,
    });
    expect(!reorderMissingNeighbor.ok && reorderMissingNeighbor.error.code).toBe('not_found');

    const restoreActive = await restoreBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId: other,
    });
    expect(!restoreActive.ok && restoreActive.error.code).toBe('validation');

    const restoreMissing = await restoreBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId: missingBoard,
    });
    expect(!restoreMissing.ok && restoreMissing.error.code).toBe('not_found');

    const deleteMissing = await deleteBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId: missingBoard,
    });
    expect(!deleteMissing.ok && deleteMissing.error.code).toBe('not_found');
    await harness.db.closeAsync();
  });

  it('covers check-in command guards', async () => {
    const harness = await createTestHarness();
    const boardId = await createBoardForTest(harness, { tracksTime: false });

    const missingBoardCreate = await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId: missingBoard,
      source: 'app',
    });
    expect(!missingBoardCreate.ok && missingBoardCreate.error.code).toBe('not_found');

    const badNote = await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      note: 'x'.repeat(10001),
      source: 'app',
    });
    expect(!badNote.ok && badNote.error.code).toBe('validation');

    const created = await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      source: 'app',
    });
    if (!created.ok) {
      throw new Error('setup failed');
    }
    const checkIn = await getCheckIn(harness.deps, created.value.checkInId);
    const stamp = checkIn.ok && checkIn.value ? checkIn.value.mutationStamp : '';

    const missingUpdate = await updateCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      checkInId: missingCheckIn,
      expectedMutationStamp: 'x',
      logicalDate: d('2026-08-30'),
    });
    expect(!missingUpdate.ok && missingUpdate.error.code).toBe('not_found');

    const badAmount = await updateCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      checkInId: created.value.checkInId,
      expectedMutationStamp: stamp,
      logicalDate: d('2026-08-30'),
      amount: 4,
    });
    expect(!badAmount.ok && badAmount.error.code).toBe('validation');

    const badTime = await updateCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      checkInId: created.value.checkInId,
      expectedMutationStamp: stamp,
      logicalDate: d('2026-08-30'),
      occurredAtUtc: harness.clock.utcMs,
    });
    expect(!badTime.ok && badTime.error.code).toBe('validation');

    const badDate = await updateCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      checkInId: created.value.checkInId,
      expectedMutationStamp: stamp,
      logicalDate: d('2027-01-01'),
    });
    expect(!badDate.ok && badDate.error.code).toBe('validation');

    const badNoteUpdate = await updateCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      checkInId: created.value.checkInId,
      expectedMutationStamp: stamp,
      logicalDate: d('2026-08-30'),
      note: 'x'.repeat(10001),
    });
    expect(!badNoteUpdate.ok && badNoteUpdate.error.code).toBe('validation');

    const staleRemove = await removeCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      checkInId: created.value.checkInId,
      expectedMutationStamp: 'stale',
    });
    expect(!staleRemove.ok && staleRemove.error.code).toBe('conflict');

    const missingRemove = await removeCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      checkInId: missingCheckIn,
    });
    expect(!missingRemove.ok && missingRemove.error.code).toBe('not_found');

    const missingUndo = await undoCreatedCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      checkInId: missingCheckIn,
      createdByCommandId: harness.ids.nextCommandId(),
    });
    expect(!missingUndo.ok && missingUndo.error.code).toBe('not_found');
    await harness.db.closeAsync();
  });

  it('derives the logical date from a provided instant on timed boards', async () => {
    const harness = await createTestHarness();
    const boardId = await createBoardForTest(harness, { tracksTime: true, startOfDayMinute: 120 });
    // 01:00 local on aug 30 with a 2-hour shift belongs to aug 29
    const created = await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      occurredAtUtc: Date.UTC(2026, 7, 30, 5, 0),
      source: 'app',
    });
    if (!created.ok) {
      throw new Error('create failed');
    }
    const checkIn = await getCheckIn(harness.deps, created.value.checkInId);
    expect(checkIn.ok && checkIn.value?.logicalDate).toBe('2026-08-29');
    const latest = await getLatestCheckInForDate(harness.deps, boardId, d('2026-08-29'));
    expect(latest.ok && latest.value?.id).toBe(created.value.checkInId);
    await harness.db.closeAsync();
  });
});

describe('history, journal, and heatmap composition', () => {
  it('groups history by month and day with stable ordering', async () => {
    const harness = await createTestHarness();
    const boardId = await createBoardForTest(harness, { tracksTime: true });
    // two months, mixed timed and untimed
    await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      logicalDate: d('2026-07-15'),
      source: 'app',
    });
    await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      source: 'app',
    });
    harness.clock.advanceMinutes(1);
    await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      source: 'app',
    });
    const history = await getGroupedCheckInHistory(harness.deps, boardId);
    if (!history.ok) {
      throw new Error('history failed');
    }
    expect(history.value.map((month) => month.month)).toEqual(['2026-08', '2026-07']);
    expect(history.value[0].count).toBe(2);
    const todayGroup = history.value[0].days[0];
    expect(todayGroup.count).toBe(2);
    // newest instant first within the day
    expect(todayGroup.checkIns[0].occurredAtUtc).toBeGreaterThan(
      todayGroup.checkIns[1].occurredAtUtc ?? 0,
    );
    await harness.db.closeAsync();
  });

  it('journal contains only noted check-ins', async () => {
    const harness = await createTestHarness();
    const boardId = await createBoardForTest(harness);
    await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      source: 'app',
    });
    await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      note: 'kept the promise',
      source: 'app',
    });
    const journal = await getJournalTimeline(harness.deps, boardId);
    expect(journal.ok && journal.value).toHaveLength(1);
    expect(journal.ok && journal.value[0].note).toBe('kept the promise');
    await harness.db.closeAsync();
  });

  it('builds a monday-aligned heatmap with today, future, and gap eligibility', async () => {
    const harness = await createTestHarness();
    const boardId = await createBoardForTest(harness);
    await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      source: 'app',
    });
    const heatmap = await getBoardHeatmap(harness.deps, boardId, { days: 14 });
    if (!heatmap.ok || heatmap.value === null) {
      throw new Error('heatmap failed');
    }
    const cells = heatmap.value.weeks.flatMap((week) => week.days);
    expect(cells.length % 7).toBe(0);
    const todayCell = cells.find((cell) => cell.isToday);
    expect(todayCell?.count).toBe(1);
    expect(todayCell?.intensity).toBe('low');
    const futureCells = cells.filter((cell) => cell.isFuture);
    // today is a sunday, so the window ends exactly at the week boundary
    expect(futureCells.every((cell) => cell.intensity === 'empty')).toBe(true);
    // pre-creation days are ineligible
    const first = cells[0];
    expect(first.eligible).toBe(false);
    await harness.db.closeAsync();
  });
});

describe('sol remediation regressions', () => {
  it('retains amount configuration when tracking turns off without new values', async () => {
    const harness = await createTestHarness();
    const boardId = await createBoardForTest(harness, {
      tracksAmount: true,
      quickAmount: 2.5,
      amountUnit: 'cups',
    });
    const board = await getBoard(harness.deps, boardId);
    if (!board.ok) {
      throw new Error('missing board');
    }
    const result = await updateBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      expectedMutationStamp: board.value.mutationStamp,
      title: board.value.title,
      symbol: board.value.symbol,
      accentHex: board.value.accentHex,
      usesTintedBackground: board.value.usesTintedBackground,
      tracksAmount: false,
      tracksTime: board.value.tracksTime,
      startOfDayMinute: board.value.startOfDayMinute,
      metricsEnabled: board.value.metricsEnabled,
    });
    expect(result.ok).toBe(true);
    const after = await getBoard(harness.deps, boardId);
    expect(after.ok && after.value.tracksAmount).toBe(false);
    expect(after.ok && after.value.quickAmount).toBe(2.5);
    expect(after.ok && after.value.amountUnit).toBe('cups');
    await harness.db.closeAsync();
  });

  it('rejects edits, removals, and undo on archived boards', async () => {
    const harness = await createTestHarness();
    const boardId = await createBoardForTest(harness);
    const quickCommand = harness.ids.nextCommandId();
    const created = await createCheckIn(harness.deps, {
      commandId: quickCommand,
      boardId,
      source: 'app',
    });
    if (!created.ok) {
      throw new Error('setup failed');
    }
    const loaded = await getCheckIn(harness.deps, created.value.checkInId);
    const stamp = loaded.ok && loaded.value ? loaded.value.mutationStamp : '';
    const { archiveBoard } = require('@/core/domain/commands') as typeof import('../../../src/core/domain/commands');
    await archiveBoard(harness.deps, { commandId: harness.ids.nextCommandId(), boardId });

    const edit = await updateCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      checkInId: created.value.checkInId,
      expectedMutationStamp: stamp,
      logicalDate: d('2026-08-30'),
    });
    expect(!edit.ok && edit.error.code).toBe('archived');
    const remove = await removeCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      checkInId: created.value.checkInId,
    });
    expect(!remove.ok && remove.error.code).toBe('archived');
    const { undoCreatedCheckIn } = require('@/core/domain/commands') as typeof import('../../../src/core/domain/commands');
    const undo = await undoCreatedCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      checkInId: created.value.checkInId,
      createdByCommandId: quickCommand,
    });
    expect(!undo.ok && undo.error.code).toBe('archived');
    await harness.db.closeAsync();
  });

  it('enqueues outbox tombstones for every deleted descendant', async () => {
    const harness = await createTestHarness();
    const boardId = await createBoardForTest(harness);
    const created = await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      source: 'app',
    });
    if (!created.ok) {
      throw new Error('setup failed');
    }
    const { deleteBoard } = require('@/core/domain/commands') as typeof import('../../../src/core/domain/commands');
    await deleteBoard(harness.deps, { commandId: harness.ids.nextCommandId(), boardId });
    const rows = await harness.db.getAllAsync<{ entity_type: string; entity_id: string }>(
      'SELECT entity_type, entity_id FROM mutation_outbox ORDER BY id',
    );
    const deletedCheckInRow = rows.find(
      (row) => row.entity_type === 'check_in' && row.entity_id === created.value.checkInId,
    );
    expect(deletedCheckInRow).toBeDefined();
    await harness.db.closeAsync();
  });

  it('rejects a future instant that would derive a future logical date', async () => {
    const harness = await createTestHarness();
    const boardId = await createBoardForTest(harness, { tracksTime: true });
    const result = await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      occurredAtUtc: harness.clock.utcMs + 3 * 86400000,
      source: 'app',
    });
    expect(!result.ok && result.error.code).toBe('validation');
    await harness.db.closeAsync();
  });

  it('keeps stored logical dates stable when the device zone changes', async () => {
    const harness = await createTestHarness();
    const boardId = await createBoardForTest(harness, { tracksTime: true });
    const created = await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      source: 'app',
    });
    if (!created.ok) {
      throw new Error('setup failed');
    }
    const before = await getCheckIn(harness.deps, created.value.checkInId);
    harness.clock.zone = 'Asia/Tokyo';
    const after = await getCheckIn(harness.deps, created.value.checkInId);
    expect(after.ok && after.value?.logicalDate).toBe(
      before.ok ? before.value?.logicalDate : 'mismatch',
    );
    expect(after.ok && after.value?.timeZoneId).toBe('America/New_York');
    await harness.db.closeAsync();
  });
});

describe('settings commands', () => {
  it('persists selected icon and icloud flag', async () => {
    const harness = await createTestHarness();
    await setSelectedIcon(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      icon: 'midnight',
    });
    await setICloudSyncEnabled(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      enabled: true,
    });
    const settings = await getAppSettings(harness.deps);
    expect(settings.ok && settings.value?.selectedIcon).toBe('midnight');
    expect(settings.ok && settings.value?.iCloudSyncEnabled).toBe(true);
    await harness.db.closeAsync();
  });
});

describe('migration failure wrapping', () => {
  it('reports a migration error when the engine fails', async () => {
    const failing: SqlDatabase = {
      execAsync: async () => {
        throw new Error('disk gone');
      },
      runAsync: async () => ({ changes: 0 }),
      getAllAsync: async () => [],
      getFirstAsync: async () => null,
      withExclusiveTransactionAsync: async () => {
        throw new Error('disk gone');
      },
      withTransactionAsync: async () => {
        throw new Error('disk gone');
      },
      closeAsync: async () => undefined,
    };
    const result = await migrateDatabase(failing);
    expect(!result.ok && result.error.code).toBe('migration');
    const ids = new TestIds();
    const initialized = await initializeProductDatabase(failing, ids);
    expect(initialized.ok).toBe(false);
  });
});
