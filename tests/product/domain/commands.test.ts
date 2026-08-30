import {
  archiveBoard,
  createBoard,
  createCheckIn,
  deleteBoard,
  dismissMetricsEducation,
  removeCheckIn,
  reorderBoard,
  restoreBoard,
  undoCreatedCheckIn,
  updateBoard,
  updateCheckIn,
} from '@/core/domain/commands';
import type { BoardId, CheckInId, CommandId } from '@/core/domain/ids';
import {
  getBoard,
  getBoardDependentCounts,
  getGroupedCheckInHistory,
  getHomeBoardProjection,
  getMetricsEducationDismissed,
  getWidgetProjection,
  listActiveBoards,
  listArchivedBoards,
} from '@/core/domain/queries';
import { listBoardPeriods } from '@/core/persistence/repositories/support';

import type { TestHarness } from '../helpers/test-db';
import { createTestHarness } from '../helpers/test-db';

function boardInput(harness: TestHarness, overrides: Record<string, unknown> = {}) {
  return {
    commandId: harness.ids.nextCommandId(),
    title: 'morning pages',
    symbol: 'star.fill',
    accentHex: '#78d98b',
    usesTintedBackground: true,
    tracksAmount: false,
    tracksTime: false,
    startOfDayMinute: 0,
    metricsEnabled: true,
    ...overrides,
  };
}

async function makeBoard(
  harness: TestHarness,
  overrides: Record<string, unknown> = {},
): Promise<BoardId> {
  const result = await createBoard(harness.deps, boardInput(harness, overrides) as never);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value.boardId;
}

describe('board commands', () => {
  it('creates a board with normalized fields, an activity period, and a widget row', async () => {
    const harness = await createTestHarness();
    const boardId = await makeBoard(harness, { title: '  morning pages  ', accentHex: '#78d98b' });
    const board = await getBoard(harness.deps, boardId);
    expect(board.ok && board.value.title).toBe('morning pages');
    expect(board.ok && board.value.accentHex).toBe('#78D98B');
    const periods = await listBoardPeriods(harness.db, boardId);
    expect(periods).toHaveLength(1);
    expect(periods[0].endDate).toBeNull();
    const widgets = await getWidgetProjection(harness.deps);
    expect(widgets.ok && widgets.value).toHaveLength(1);
    await harness.db.closeAsync();
  });

  it('rejects invalid board fields before any transaction', async () => {
    const harness = await createTestHarness();
    const cases = [
      boardInput(harness, { title: '   ' }),
      boardInput(harness, { title: 'x'.repeat(81) }),
      boardInput(harness, { symbol: 'not.a.symbol' }),
      boardInput(harness, { accentHex: 'red' }),
      boardInput(harness, { startOfDayMinute: 45 }),
      boardInput(harness, { startOfDayMinute: 750 }),
      boardInput(harness, { quickAmount: 0 }),
      boardInput(harness, { quickAmount: 1.2345 }),
      boardInput(harness, { quickAmount: 2_000_000_000 }),
      boardInput(harness, { amountUnit: 'u'.repeat(21) }),
    ];
    for (const input of cases) {
      const result = await createBoard(harness.deps, input as never);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('validation');
      }
    }
    expect((await listActiveBoards(harness.deps)) as never).toMatchObject({ ok: true, value: [] });
    await harness.db.closeAsync();
  });

  it('replays the original result for a retried command id', async () => {
    const harness = await createTestHarness();
    const input = boardInput(harness);
    const first = await createBoard(harness.deps, input as never);
    const retry = await createBoard(harness.deps, input as never);
    expect(retry).toEqual(first);
    const boards = await listActiveBoards(harness.deps);
    expect(boards.ok && boards.value).toHaveLength(1);
    await harness.db.closeAsync();
  });

  it('enforces optimistic concurrency on update', async () => {
    const harness = await createTestHarness();
    const boardId = await makeBoard(harness);
    const board = await getBoard(harness.deps, boardId);
    if (!board.ok) {
      throw new Error('missing board');
    }
    const stale = await updateBoard(harness.deps, {
      ...boardInput(harness, { title: 'renamed' }),
      boardId,
      expectedMutationStamp: 'not-the-stamp',
    } as never);
    expect(!stale.ok && stale.error.code).toBe('conflict');
    const fresh = await updateBoard(harness.deps, {
      ...boardInput(harness, { title: 'renamed' }),
      boardId,
      expectedMutationStamp: board.value.mutationStamp,
    } as never);
    expect(fresh.ok).toBe(true);
    const renamed = await getBoard(harness.deps, boardId);
    expect(renamed.ok && renamed.value.title).toBe('renamed');
    await harness.db.closeAsync();
  });

  it('keeps deterministic active order and supports reordering', async () => {
    const harness = await createTestHarness();
    const a = await makeBoard(harness, { title: 'a' });
    const b = await makeBoard(harness, { title: 'b' });
    const c = await makeBoard(harness, { title: 'c' });
    let boards = await listActiveBoards(harness.deps);
    expect(boards.ok && boards.value.map((x) => x.title)).toEqual(['a', 'b', 'c']);
    // move c between a and b
    const move = await reorderBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId: c,
      previousBoardId: a,
      nextBoardId: b,
    });
    expect(move.ok).toBe(true);
    boards = await listActiveBoards(harness.deps);
    expect(boards.ok && boards.value.map((x) => x.title)).toEqual(['a', 'c', 'b']);
    await harness.db.closeAsync();
  });

  it('archives and restores with correct activity periods and projections', async () => {
    const harness = await createTestHarness();
    const boardId = await makeBoard(harness);
    const archived = await archiveBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
    });
    expect(archived.ok).toBe(true);
    expect(((await listActiveBoards(harness.deps)) as never as { value: unknown[] }).value).toHaveLength(0);
    const archivedList = await listArchivedBoards(harness.deps);
    expect(archivedList.ok && archivedList.value).toHaveLength(1);
    let widgets = await getWidgetProjection(harness.deps);
    expect(widgets.ok && widgets.value).toHaveLength(0);

    // same-day restore merges back into one open period
    const restored = await restoreBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
    });
    expect(restored.ok).toBe(true);
    const periods = await listBoardPeriods(harness.db, boardId);
    expect(periods).toHaveLength(1);
    expect(periods[0].endDate).toBeNull();

    // archive again, then restore on a later day creates a second period
    await archiveBoard(harness.deps, { commandId: harness.ids.nextCommandId(), boardId });
    harness.clock.advanceDays(3);
    await restoreBoard(harness.deps, { commandId: harness.ids.nextCommandId(), boardId });
    const laterPeriods = await listBoardPeriods(harness.db, boardId);
    expect(laterPeriods).toHaveLength(2);
    expect(laterPeriods[0].endDate).not.toBeNull();
    expect(laterPeriods[1].endDate).toBeNull();
    widgets = await getWidgetProjection(harness.deps);
    expect(widgets.ok && widgets.value).toHaveLength(1);
    await harness.db.closeAsync();
  });

  it('tombstones the whole board graph on delete in one transaction', async () => {
    const harness = await createTestHarness();
    const boardId = await makeBoard(harness);
    await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      source: 'app',
    });
    const counts = await getBoardDependentCounts(harness.deps, boardId);
    expect(counts.ok && counts.value.checkIns).toBe(1);
    const deleted = await deleteBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
    });
    expect(deleted.ok).toBe(true);
    const gone = await getBoard(harness.deps, boardId);
    expect(!gone.ok && gone.error.code).toBe('not_found');
    const widgets = await getWidgetProjection(harness.deps);
    expect(widgets.ok && widgets.value).toHaveLength(0);
    const history = await getGroupedCheckInHistory(harness.deps, boardId);
    expect(history.ok && history.value.months).toHaveLength(0);
    await harness.db.closeAsync();
  });
});

describe('check-in commands', () => {
  it('creates multiple check-ins per day and updates every projection', async () => {
    const harness = await createTestHarness();
    const boardId = await makeBoard(harness);
    const first = await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      source: 'app',
    });
    const second = await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      source: 'app',
    });
    expect(first.ok && second.ok).toBe(true);
    const home = await getHomeBoardProjection(harness.deps);
    expect(home.ok && home.value[0].strip[6]).toBe(2);
    const widgets = await getWidgetProjection(harness.deps);
    expect(widgets.ok && widgets.value[0].strip[6]).toBe(2);
    await harness.db.closeAsync();
  });

  it('is idempotent for the same command id but distinct for intentional presses', async () => {
    const harness = await createTestHarness();
    const boardId = await makeBoard(harness);
    const commandId = harness.ids.nextCommandId();
    const first = await createCheckIn(harness.deps, { commandId, boardId, source: 'widget' });
    const retry = await createCheckIn(harness.deps, { commandId, boardId, source: 'widget' });
    expect(retry).toEqual(first);
    await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      source: 'widget',
    });
    const home = await getHomeBoardProjection(harness.deps);
    expect(home.ok && home.value[0].strip[6]).toBe(2);
    await harness.db.closeAsync();
  });

  it('applies amount rules per board configuration', async () => {
    const harness = await createTestHarness();
    const plain = await makeBoard(harness);
    const amountBoard = await makeBoard(harness, {
      title: 'water',
      tracksAmount: true,
      quickAmount: 2.5,
      amountUnit: 'cups',
    });
    const rejected = await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId: plain,
      amount: 3,
      source: 'app',
    });
    expect(!rejected.ok && rejected.error.code).toBe('validation');
    const defaulted = await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId: amountBoard,
      source: 'app',
    });
    expect(defaulted.ok).toBe(true);
    const history = await getGroupedCheckInHistory(harness.deps, amountBoard);
    expect(history.ok && history.value.months[0].days[0].checkIns[0].amount).toBe(2.5);
    const invalid = await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId: amountBoard,
      amount: -1,
      source: 'app',
    });
    expect(!invalid.ok && invalid.error.code).toBe('validation');
    await harness.db.closeAsync();
  });

  it('stores time fields only when the board tracks time', async () => {
    const harness = await createTestHarness();
    const timed = await makeBoard(harness, { title: 'timed', tracksTime: true });
    const untimed = await makeBoard(harness, { title: 'untimed' });
    await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId: timed,
      source: 'app',
    });
    await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId: untimed,
      source: 'app',
    });
    const timedHistory = await getGroupedCheckInHistory(harness.deps, timed);
    const untimedHistory = await getGroupedCheckInHistory(harness.deps, untimed);
    const timedRow = timedHistory.ok ? timedHistory.value.months[0].days[0].checkIns[0] : null;
    const untimedRow = untimedHistory.ok ? untimedHistory.value.months[0].days[0].checkIns[0] : null;
    expect(timedRow?.occurredAtUtc).toBe(harness.clock.utcMs);
    expect(timedRow?.timeZoneId).toBe('America/New_York');
    expect(timedRow?.offsetMinutes).toBe(-240);
    expect(untimedRow?.occurredAtUtc).toBeNull();
    expect(untimedRow?.timeZoneId).toBeNull();
    await harness.db.closeAsync();
  });

  it('rejects future logical dates and accepts historical manual entry', async () => {
    const harness = await createTestHarness();
    const boardId = await makeBoard(harness);
    const future = await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      logicalDate: '2026-09-15' as never,
      source: 'app',
    });
    expect(!future.ok && future.error.code).toBe('validation');
    const historical = await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      logicalDate: '2026-08-01' as never,
      note: '  felt good  ',
      source: 'app',
    });
    expect(historical.ok).toBe(true);
    const history = await getGroupedCheckInHistory(harness.deps, boardId);
    const row = history.ok ? history.value.months[0].days[0].checkIns[0] : null;
    expect(row?.note).toBe('felt good');
    await harness.db.closeAsync();
  });

  it('edits preserve identity fields and enforce concurrency', async () => {
    const harness = await createTestHarness();
    const boardId = await makeBoard(harness, { title: 'timed', tracksTime: true });
    const created = await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      source: 'app',
    });
    if (!created.ok) {
      throw new Error('create failed');
    }
    const history = await getGroupedCheckInHistory(harness.deps, boardId);
    const original = history.ok ? history.value.months[0].days[0].checkIns[0] : null;
    if (!original) {
      throw new Error('missing row');
    }
    const conflicted = await updateCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      checkInId: original.id,
      expectedMutationStamp: 'stale',
      logicalDate: original.logicalDate,
    });
    expect(!conflicted.ok && conflicted.error.code).toBe('conflict');
    harness.clock.advanceMinutes(5);
    const updated = await updateCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      checkInId: original.id,
      expectedMutationStamp: original.mutationStamp,
      logicalDate: '2026-08-29' as never,
      note: 'moved',
    });
    expect(updated.ok).toBe(true);
    const after = await getGroupedCheckInHistory(harness.deps, boardId);
    const edited = after.ok ? after.value.months[0].days[0].checkIns[0] : null;
    expect(edited?.id).toBe(original.id);
    expect(edited?.source).toBe(original.source);
    expect(edited?.createdAt).toBe(original.createdAt);
    expect(edited?.updatedAt).toBeGreaterThan(original.updatedAt);
    expect(edited?.logicalDate).toBe('2026-08-29');
    await harness.db.closeAsync();
  });

  it('undo removes only the check-in created by the quick action', async () => {
    const harness = await createTestHarness();
    const boardId = await makeBoard(harness);
    const quickCommand = harness.ids.nextCommandId();
    const created = await createCheckIn(harness.deps, {
      commandId: quickCommand,
      boardId,
      source: 'app',
    });
    const other = await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      source: 'app',
    });
    if (!created.ok || !other.ok) {
      throw new Error('setup failed');
    }
    const wrong = await undoCreatedCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      checkInId: other.value.checkInId,
      createdByCommandId: quickCommand,
    });
    expect(!wrong.ok && wrong.error.code).toBe('conflict');
    const undone = await undoCreatedCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      checkInId: created.value.checkInId,
      createdByCommandId: quickCommand,
    });
    expect(undone.ok).toBe(true);
    const home = await getHomeBoardProjection(harness.deps);
    expect(home.ok && home.value[0].strip[6]).toBe(1);
    await harness.db.closeAsync();
  });

  it('removes check-ins with tombstones', async () => {
    const harness = await createTestHarness();
    const boardId = await makeBoard(harness);
    const created = await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      source: 'app',
    });
    if (!created.ok) {
      throw new Error('create failed');
    }
    const removed = await removeCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      checkInId: created.value.checkInId,
    });
    expect(removed.ok).toBe(true);
    const again = await removeCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      checkInId: created.value.checkInId,
    });
    expect(!again.ok && again.error.code).toBe('not_found');
    const raw = await harness.db.getFirstAsync<{ deleted_at: number | null }>(
      'SELECT deleted_at FROM check_ins WHERE id = ?',
      [created.value.checkInId],
    );
    expect(raw?.deleted_at).not.toBeNull();
    await harness.db.closeAsync();
  });

  it('rejects check-ins on archived boards', async () => {
    const harness = await createTestHarness();
    const boardId = await makeBoard(harness);
    await archiveBoard(harness.deps, { commandId: harness.ids.nextCommandId(), boardId });
    const result = await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      source: 'app',
    });
    expect(!result.ok && result.error.code).toBe('archived');
    await harness.db.closeAsync();
  });
});

describe('settings commands', () => {
  it('dismisses metrics education once per board', async () => {
    const harness = await createTestHarness();
    const boardId = await makeBoard(harness);
    await dismissMetricsEducation(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
    });
    await dismissMetricsEducation(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
    });
    const dismissed = await getMetricsEducationDismissed(harness.deps);
    expect(dismissed.ok && dismissed.value).toEqual([boardId]);
    await harness.db.closeAsync();
  });
});
