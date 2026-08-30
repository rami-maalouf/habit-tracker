import { archiveBoard, createCheckIn, reorderBoard, restoreBoard } from '@/core/domain/commands';
import type { LogicalDate } from '@/core/domain/ids';
import { parseCheckInId, parseCommandId, parseReminderId } from '@/core/domain/ids';
import {
  getBoardHeatmap,
  getBoardSummary,
  getConsistencyAnalytics,
  getGroupedCheckInHistory,
  getSevenDayStrip,
} from '@/core/domain/queries';
import { initializeProductDatabase } from '@/core/persistence/bootstrap';
import { migrateDatabase } from '@/core/persistence/migrations';
import {
  getBoardById,
  listArchivedBoards as listArchivedBoardRows,
} from '@/core/persistence/repositories/boards';
import { decodeStamp } from '@/core/sync/hybrid-clock';
import type { BoardId } from '@/core/domain/ids';

import { createBoardForTest } from '../helpers/product-fixtures';
import { createTestHarness, NodeSqlDatabase } from '../helpers/test-db';

const d = (value: string) => value as LogicalDate;

describe('final branch coverage', () => {
  it('rejects malformed ids for every parser', () => {
    for (const bad of ['nope', '', '1234']) {
      expect(parseCheckInId(bad)).toBeNull();
      expect(parseReminderId(bad)).toBeNull();
      expect(parseCommandId(bad)).toBeNull();
    }
  });

  it('decodes stamps with hyphenated device ids', () => {
    const decoded = decodeStamp('00000000002000-00001-device-with-hyphens');
    expect(decoded.deviceId).toBe('device-with-hyphens');
  });

  it('reorders with only one neighbor on each side', async () => {
    const harness = await createTestHarness();
    const a = await createBoardForTest(harness, { title: 'a' });
    const b = await createBoardForTest(harness, { title: 'b' });
    // move b before a: only next neighbor
    const toFront = await reorderBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId: b,
      previousBoardId: null,
      nextBoardId: a,
    });
    expect(toFront.ok).toBe(true);
    // move b after a: only previous neighbor
    const toBack = await reorderBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId: b,
      previousBoardId: a,
      nextBoardId: null,
    });
    expect(toBack.ok).toBe(true);
    await harness.db.closeAsync();
  });

  it('covers non-error throwables in command and query wrappers', async () => {
    const harness = await createTestHarness();
    const throwingDb = Object.create(harness.db) as typeof harness.db;
    throwingDb.withExclusiveTransactionAsync = async () => {
      // deliberately not an Error instance
      throw 'string failure';
    };
    throwingDb.getAllAsync = async () => {
      throw 'string failure';
    };
    throwingDb.getFirstAsync = async () => {
      throw 'string failure';
    };
    const commandResult = await archiveBoard(
      { ...harness.deps, db: throwingDb },
      {
        commandId: harness.ids.nextCommandId(),
        boardId: '00000000-0000-4000-8000-00000000ffff' as BoardId,
      },
    );
    expect(!commandResult.ok && commandResult.error.message).toContain('string failure');
    const queryResult = await getSevenDayStrip(
      { db: throwingDb, clock: harness.clock },
      '00000000-0000-4000-8000-00000000ffff' as BoardId,
    );
    expect(!queryResult.ok && queryResult.error.message).toContain('string failure');
    await harness.db.closeAsync();
  });

  it('covers heatmap explicit window options and closed-period eligibility', async () => {
    const harness = await createTestHarness();
    const boardId = await createBoardForTest(harness);
    await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      source: 'app',
    });
    await archiveBoard(harness.deps, { commandId: harness.ids.nextCommandId(), boardId });
    harness.clock.advanceDays(5);
    await restoreBoard(harness.deps, { commandId: harness.ids.nextCommandId(), boardId });
    const heatmap = await getBoardHeatmap(harness.deps, boardId, {
      days: 21,
      endDate: d('2026-09-04'),
    });
    if (!heatmap.ok || heatmap.value === null) {
      throw new Error('heatmap failed');
    }
    const cells = heatmap.value.weeks.flatMap((week) => week.days);
    // the archived gap between periods is ineligible
    const gapCell = cells.find((cell) => cell.date === '2026-09-02');
    expect(gapCell?.eligible).toBe(false);
    const closedPeriodCell = cells.find((cell) => cell.date === '2026-08-30');
    expect(closedPeriodCell?.eligible).toBe(true);
    // iso alignment extends the final week past the requested end; those
    // trailing cells are out of the window, never rendered as empty data
    const trailingCell = cells.find((cell) => cell.date === '2026-09-05');
    expect(trailingCell).toBeDefined();
    expect(trailingCell?.eligible).toBe(false);
    expect(trailingCell?.intensity).toBe('empty');
    await harness.db.closeAsync();
  });

  it('covers summary with a closed earlier period and consistency null months', async () => {
    const harness = await createTestHarness();
    const boardId = await createBoardForTest(harness);
    await archiveBoard(harness.deps, { commandId: harness.ids.nextCommandId(), boardId });
    harness.clock.advanceDays(10);
    await restoreBoard(harness.deps, { commandId: harness.ids.nextCommandId(), boardId });
    const summary = await getBoardSummary(harness.deps, boardId);
    if (!summary.ok || summary.value === null) {
      throw new Error('summary failed');
    }
    // one closed single-day period plus the reopened period today
    expect(summary.value.eligibleDayCount).toBe(2);
    expect(summary.value.metricsReady).toBe(false);
    expect(summary.value.consistencyBand).toBe('low');
    // below the seven-eligible-day threshold the analysis is unavailable
    const months = await getConsistencyAnalytics(harness.deps, boardId);
    expect(months.ok && months.value).toBeNull();
    await harness.db.closeAsync();
  });

  it('initializes an already-initialized database as a no-op', async () => {
    const harness = await createTestHarness();
    const again = await initializeProductDatabase(harness.db, harness.ids);
    expect(again.ok).toBe(true);
    await harness.db.closeAsync();
  });

  it('wraps a non-error migration failure', async () => {
    const db = new NodeSqlDatabase();
    const broken = Object.create(db) as typeof db;
    broken.execAsync = async () => {
      throw 'pragma failed';
    };
    const result = await migrateDatabase(broken);
    expect(!result.ok && result.error.message).toContain('pragma failed');
    await db.closeAsync();
  });

  it('reads archived boards through the repository ordering', async () => {
    const harness = await createTestHarness();
    const boardId = await createBoardForTest(harness);
    await archiveBoard(harness.deps, { commandId: harness.ids.nextCommandId(), boardId });
    const archived = await listArchivedBoardRows(harness.db);
    expect(archived).toHaveLength(1);
    const loaded = await getBoardById(harness.db, boardId);
    expect(loaded?.usesTintedBackground).toBe(true);
    expect(loaded?.tracksAmount).toBe(false);
    await harness.db.closeAsync();
  });

  it('round-trips every boolean field shape through insert and update', async () => {
    const harness = await createTestHarness();
    // all-false variant exercises the zero side of every boolean column
    const offBoard = await createBoardForTest(harness, {
      title: 'all off',
      usesTintedBackground: false,
      tracksAmount: false,
      tracksTime: false,
      metricsEnabled: false,
    });
    // all-on variant exercises the one side
    const onBoard = await createBoardForTest(harness, {
      title: 'all on',
      usesTintedBackground: true,
      tracksAmount: true,
      tracksTime: true,
      metricsEnabled: true,
      quickAmount: 1.5,
      amountUnit: 'km',
    });
    const off = await getBoardById(harness.db, offBoard);
    const on = await getBoardById(harness.db, onBoard);
    expect(off?.metricsEnabled).toBe(false);
    expect(on?.metricsEnabled).toBe(true);
    expect(on?.amountUnit).toBe('km');

    const { updateBoard, setICloudSyncEnabled } = require('@/core/domain/commands') as typeof import('../../../src/core/domain/commands');
    const flippedOff = await updateBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId: onBoard,
      expectedMutationStamp: on?.mutationStamp ?? '',
      title: 'all on flipped',
      symbol: 'star.fill',
      accentHex: '#70A7FF',
      usesTintedBackground: false,
      tracksAmount: false,
      tracksTime: false,
      startOfDayMinute: 0,
      metricsEnabled: false,
    });
    expect(flippedOff.ok).toBe(true);
    const flippedOn = await getBoardById(harness.db, offBoard);
    const updateBack = await updateBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId: offBoard,
      expectedMutationStamp: flippedOn?.mutationStamp ?? '',
      title: 'all off flipped',
      symbol: 'star.fill',
      accentHex: '#70A7FF',
      usesTintedBackground: true,
      tracksAmount: true,
      tracksTime: true,
      startOfDayMinute: 0,
      metricsEnabled: true,
    });
    expect(updateBack.ok).toBe(true);
    await setICloudSyncEnabled(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      enabled: false,
    });
    await harness.db.closeAsync();
  });

  it('covers empty-result repository lookups and observe equality', async () => {
    const harness = await createTestHarness();
    const boardId = await createBoardForTest(harness);
    const {
      latestCheckInForDate,
      getCheckInByIdempotencyKey,
    } = require('@/core/persistence/repositories/check-ins') as typeof import('../../../src/core/persistence/repositories/check-ins');
    const noneYet = await latestCheckInForDate(harness.db, boardId, d('2026-08-30'));
    expect(noneYet).toBeNull();
    const commandId = harness.ids.nextCommandId();
    await createCheckIn(harness.deps, { commandId, boardId, source: 'app' });
    const byKey = await getCheckInByIdempotencyKey(harness.db, commandId);
    expect(byKey?.boardId).toBe(boardId);

    const { observe, encodeStamp } = require('@/core/sync/hybrid-clock') as typeof import('../../../src/core/sync/hybrid-clock');
    const state = { wallTime: 500, counter: 3 };
    const equalStamp = encodeStamp({ wallTime: 500, counter: 3 }, 'x');
    expect(observe(state, equalStamp)).toEqual(state);
    await harness.db.closeAsync();
  });

  it('covers error-instance failures in the command and query wrappers', async () => {
    const harness = await createTestHarness();
    const throwingDb = Object.create(harness.db) as typeof harness.db;
    throwingDb.withExclusiveTransactionAsync = async () => {
      throw new Error('typed failure');
    };
    throwingDb.getFirstAsync = async () => {
      throw new Error('typed failure');
    };
    const commandResult = await archiveBoard(
      { ...harness.deps, db: throwingDb },
      {
        commandId: harness.ids.nextCommandId(),
        boardId: '00000000-0000-4000-8000-00000000ffff' as BoardId,
      },
    );
    expect(!commandResult.ok && commandResult.error.message).toContain('typed failure');
    const queryResult = await getSevenDayStrip(
      { db: throwingDb, clock: harness.clock },
      '00000000-0000-4000-8000-00000000ffff' as BoardId,
    );
    expect(!queryResult.ok && queryResult.error.message).toContain('typed failure');
    await harness.db.closeAsync();
  });

  it('covers the default heatmap window and stamp comparison order', async () => {
    const harness = await createTestHarness();
    const boardId = await createBoardForTest(harness);
    const heatmap = await getBoardHeatmap(harness.deps, boardId);
    expect(heatmap.ok && heatmap.value?.weeks.length).toBeGreaterThanOrEqual(52);
    const { compareStamps } = require('@/core/sync/hybrid-clock') as typeof import('../../../src/core/sync/hybrid-clock');
    expect(compareStamps('b', 'a')).toBe(1);
    await harness.db.closeAsync();
  });

  it('covers summaries with archived boards, old check-ins, and backward clocks', async () => {
    const harness = await createTestHarness();
    // archived long ago: the rolling window holds no eligible days
    const dormant = await createBoardForTest(harness, { title: 'dormant' });
    await archiveBoard(harness.deps, { commandId: harness.ids.nextCommandId(), boardId: dormant });
    harness.clock.advanceDays(40);
    const dormantSummary = await getBoardSummary(harness.deps, dormant);
    if (!dormantSummary.ok || dormantSummary.value === null) {
      throw new Error('summary failed');
    }
    expect(dormantSummary.value.consistencyPercent).toBeNull();
    expect(dormantSummary.value.consistencyBand).toBeNull();

    // a board with an old check-in outside the current month
    const veteran = await createBoardForTest(harness, { title: 'veteran' });
    await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId: veteran,
      logicalDate: d('2026-07-15'),
      source: 'app',
    });
    const veteranSummary = await getBoardSummary(harness.deps, veteran);
    expect(veteranSummary.ok && veteranSummary.value?.currentMonthCount).toBe(0);

    // clock moved backward across a boundary: a period can start after today
    const traveler = await createBoardForTest(harness, { title: 'traveler' });
    harness.clock.advanceDays(-45);
    const travelerSummary = await getBoardSummary(harness.deps, traveler);
    expect(travelerSummary.ok && travelerSummary.value?.eligibleDayCount).toBe(0);
    await harness.db.closeAsync();
  });

  it('covers defensive null-row fallbacks through a stub executor', async () => {
    const harness = await createTestHarness();
    const stub = Object.create(harness.db) as typeof harness.db;
    stub.getFirstAsync = async () => null;
    const realBoard = await createBoardForTest(harness, { title: 'stub target' });
    const { insertPeriod } = require('@/core/persistence/repositories/support') as typeof import('../../../src/core/persistence/repositories/support');
    const fallbackId = await insertPeriod(stub, realBoard, d('2026-08-30'), 's');
    expect(fallbackId).toBe(0);
    const {
      countBoardCheckIns,
      countBoardNotes,
    } = require('@/core/persistence/repositories/check-ins') as typeof import('../../../src/core/persistence/repositories/check-ins');
    expect(await countBoardCheckIns(stub, '00000000-0000-4000-8000-000000000001' as BoardId)).toBe(0);
    expect(await countBoardNotes(stub, '00000000-0000-4000-8000-000000000001' as BoardId)).toBe(0);
    const { getBoardDependentCounts, getMetricsEducationDismissed } =
      require('@/core/domain/queries') as typeof import('../../../src/core/domain/queries');
    const counts = await getBoardDependentCounts(
      { db: stub, clock: harness.clock },
      '00000000-0000-4000-8000-000000000001' as BoardId,
    );
    expect(counts.ok && counts.value).toEqual({ checkIns: 0, notes: 0, reminders: 0 });
    const dismissed = await getMetricsEducationDismissed({ db: stub, clock: harness.clock });
    expect(dismissed.ok && dismissed.value).toEqual([]);
    await harness.db.closeAsync();
  });

  it('replays void command results, explicit amount updates, and reminder tombstones', async () => {
    const harness = await createTestHarness();
    const boardId = await createBoardForTest(harness, { tracksAmount: true, quickAmount: 1 });
    // formats an instant as the calendar date observed in a zone
    const { localDateOfInstant } = require('@/core/calendar/logical-date') as typeof import('../../../src/core/calendar/logical-date');
    expect(localDateOfInstant(Date.UTC(2026, 7, 30, 2, 0), 'America/New_York')).toBe('2026-08-29');

    // explicit amount configuration on update takes the provided values
    const board = await getBoardById(harness.db, boardId);
    const { updateBoard } = require('@/core/domain/commands') as typeof import('../../../src/core/domain/commands');
    const explicit = await updateBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      expectedMutationStamp: board?.mutationStamp ?? '',
      title: 'explicit amounts',
      symbol: 'star.fill',
      accentHex: '#70A7FF',
      usesTintedBackground: true,
      tracksAmount: true,
      amountUnit: 'liters',
      quickAmount: 4,
      tracksTime: false,
      startOfDayMinute: 0,
      metricsEnabled: true,
    });
    expect(explicit.ok).toBe(true);
    const updated = await getBoardById(harness.db, boardId);
    expect(updated?.amountUnit).toBe('liters');
    expect(updated?.quickAmount).toBe(4);

    // a reminder row participates in delete tombstoning and its outbox entry
    await harness.db.runAsync(
      `INSERT INTO reminders (id, board_id, weekdays_mask, minute_of_day, message, enabled,
        schedule_state, last_schedule_error, created_at, updated_at, mutation_stamp, deleted_at)
       VALUES (?, ?, 1, 480, NULL, 1, 'idle', NULL, 0, 0, 's', NULL)`,
      ['00000000-0000-4000-8000-0000000000aa', boardId],
    );
    const { deleteBoard, archiveBoard: archiveAgain } = require('@/core/domain/commands') as typeof import('../../../src/core/domain/commands');
    const deleteCommand = harness.ids.nextCommandId();
    const first = await deleteBoard(harness.deps, { commandId: deleteCommand, boardId });
    expect(first).toEqual({ ok: true, value: undefined });
    // replaying a void command returns the original shape
    const replay = await deleteBoard(harness.deps, { commandId: deleteCommand, boardId });
    expect(replay).toEqual(first);
    const reminderOutbox = await harness.db.getFirstAsync(
      "SELECT id FROM mutation_outbox WHERE entity_type = 'reminder'",
    );
    expect(reminderOutbox).not.toBeNull();
    expect(typeof archiveAgain).toBe('function');
    await harness.db.closeAsync();
  });

  it('wraps a non-error bootstrap transaction failure', async () => {
    const db = new NodeSqlDatabase();
    await migrateDatabase(db);
    const broken = Object.create(db) as typeof db;
    broken.withExclusiveTransactionAsync = async () => {
      throw 'settings exploded';
    };
    const result = await initializeProductDatabase(broken, {
      uuid: () => '00000000-0000-4000-8000-000000000001',
    });
    expect(!result.ok && result.error.message).toContain('settings exploded');
    await db.closeAsync();
  });
});


describe('paged check-in history', () => {
  it('trims the trailing partial day and keeps true month totals', async () => {
    const harness = await createTestHarness();
    const boardId = await createBoardForTest(harness);
    harness.clock.advanceDays(6);
    // three days, three check-ins each, newest first in history
    for (const day of ['2026-09-01', '2026-09-02', '2026-09-03']) {
      for (let index = 0; index < 3; index += 1) {
        const created = await createCheckIn(harness.deps, {
          commandId: harness.ids.nextCommandId(),
          boardId,
          logicalDate: day as LogicalDate,
          source: 'app',
        });
        if (!created.ok) {
          throw new Error(created.error.message);
        }
      }
    }

    // a limit inside the second day trims that partial day entirely
    const paged = await getGroupedCheckInHistory(harness.deps, boardId, { limit: 4 });
    if (!paged.ok) {
      throw new Error(paged.error.message);
    }
    expect(paged.value).toHaveLength(1);
    expect(paged.value[0].days).toHaveLength(1);
    expect(paged.value[0].days[0].date).toBe('2026-09-03');
    expect(paged.value[0].days[0].count).toBe(3);
    // the month header still reports all nine records
    expect(paged.value[0].count).toBe(9);

    // a limit inside the FIRST day completes that day instead of returning
    // an empty or undercounted page
    const tiny = await getGroupedCheckInHistory(harness.deps, boardId, { limit: 2 });
    if (!tiny.ok) {
      throw new Error(tiny.error.message);
    }
    expect(tiny.value[0].days[0].date).toBe('2026-09-03');
    expect(tiny.value[0].days[0].checkIns).toHaveLength(3);
    expect(tiny.value[0].days[0].count).toBe(3);

    // a limit at or beyond the total behaves like the unpaged query
    const all = await getGroupedCheckInHistory(harness.deps, boardId, { limit: 50 });
    if (!all.ok) {
      throw new Error(all.error.message);
    }
    expect(all.value[0].days).toHaveLength(3);

    // a limit landing exactly on a day boundary keeps that complete day
    const exact = await getGroupedCheckInHistory(harness.deps, boardId, { limit: 3 });
    if (!exact.ok) {
      throw new Error(exact.error.message);
    }
    expect(exact.value[0].days).toHaveLength(1);
    expect(exact.value[0].days[0].date).toBe('2026-09-03');
    expect(exact.value[0].days[0].count).toBe(3);

    // a single day larger than the page is completed, never undercounted
    for (let index = 0; index < 4; index += 1) {
      const extra = await createCheckIn(harness.deps, {
        commandId: harness.ids.nextCommandId(),
        boardId,
        logicalDate: '2026-09-04' as LogicalDate,
        source: 'app',
      });
      if (!extra.ok) {
        throw new Error(extra.error.message);
      }
    }
    const bigDay = await getGroupedCheckInHistory(harness.deps, boardId, { limit: 2 });
    if (!bigDay.ok) {
      throw new Error(bigDay.error.message);
    }
    expect(bigDay.value[0].days).toHaveLength(1);
    expect(bigDay.value[0].days[0].date).toBe('2026-09-04');
    expect(bigDay.value[0].days[0].count).toBe(4);
    expect(bigDay.value[0].days[0].checkIns).toHaveLength(4);
    await harness.db.closeAsync();
  });
});
