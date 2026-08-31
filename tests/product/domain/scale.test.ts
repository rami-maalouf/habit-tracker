import { createCheckIn } from '@/core/domain/commands';
import type { BoardId, LogicalDate } from '@/core/domain/ids';
import {
  getBoardSummary,
  getConsistencyAnalytics,
  getGroupedCheckInHistory,
  getHomeBoardProjection,
  getStreakAnalytics,
  getTimelineAnalytics,
  getWeekdayAnalytics,
  getWidgetProjection,
} from '@/core/domain/queries';

import { createBoardForTest } from '../helpers/product-fixtures';
import { createTestHarness, type TestHarness } from '../helpers/test-db';

// the spec's scale budgets. these run against node:sqlite rather than the
// device, so they are a regression guard on the query shapes (no O(n) row
// materialization, no unbounded scans), not a device benchmark.
const HISTORY_ROWS = 100_000;
const BOARD_COUNT = 1_000;

async function seedCheckIns(
  harness: TestHarness,
  boardId: BoardId,
  count: number,
): Promise<void> {
  // one bulk insert: going through the command per row would take minutes
  // and prove nothing about read performance
  const stamps = harness.clock.nowUtcMs();
  const rows: string[] = [];
  // a realistic spread: roughly ninety check-ins a day across three years,
  // so paging has to trim on day boundaries rather than hit one giant day
  const perDay = 90;
  const firstDay = Date.UTC(2024, 0, 1);
  for (let index = 0; index < count; index += 1) {
    const dayOffset = Math.floor(index / perDay);
    const date = new Date(firstDay + dayOffset * 86_400_000).toISOString().slice(0, 10);
    const id = `p${String(index).padStart(11, '0')}`;
    rows.push(
      `('${id}','${boardId}','${date}',NULL,NULL,NULL,NULL,NULL,'app','k${id}',${stamps},${stamps},'s${index}',NULL)`,
    );
  }
  // chunked so the statement stays inside sqlite's variable limits
  for (let start = 0; start < rows.length; start += 2_000) {
    await harness.db.runAsync(
      `INSERT INTO check_ins (id, board_id, logical_date, occurred_at_utc, time_zone_id,
         offset_minutes, amount, note, source, idempotency_key, created_at, updated_at,
         mutation_stamp, deleted_at)
       VALUES ${rows.slice(start, start + 2_000).join(',')}`,
    );
  }
}

async function timed<T>(work: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = process.hrtime.bigint();
  const value = await work();
  return { value, ms: Number(process.hrtime.bigint() - started) / 1_000_000 };
}

describe('scale budgets', () => {
  it('pages history and keeps analytics bounded with 100,000 check-ins', async () => {
    const harness = await createTestHarness();
    const boardId = await createBoardForTest(harness, { title: 'huge board' });
    await seedCheckIns(harness, boardId, HISTORY_ROWS);

    // history never materializes every row: the first page is capped
    const history = await timed(() => getGroupedCheckInHistory(harness.deps, boardId, { limit: 200 }));
    if (!history.value.ok) {
      throw new Error('history failed');
    }
    const loaded = history.value.value.months
      .flatMap((month) => month.days)
      .reduce((total, day) => total + day.checkIns.length, 0);
    expect(loaded).toBeLessThanOrEqual(400);
    expect(history.value.value.hasMore).toBe(true);
    expect(history.ms).toBeLessThan(1_500);

    // a quick check-in still commits promptly at this depth
    const quick = await timed(() =>
      createCheckIn(harness.deps, {
        commandId: harness.ids.nextCommandId(),
        boardId,
        source: 'app',
      }),
    );
    expect(quick.value.ok).toBe(true);
    expect(quick.ms).toBeLessThan(1_000);

    // every analytics section computes from aggregates, not row lists
    const sections: (() => Promise<{ ok: boolean }>)[] = [
      () => getBoardSummary(harness.deps, boardId),
      () => getTimelineAnalytics(harness.deps, boardId, 2026),
      () => getWeekdayAnalytics(harness.deps, boardId),
      () => getConsistencyAnalytics(harness.deps, boardId),
      () => getStreakAnalytics(harness.deps, boardId),
    ];
    for (const run of sections) {
      const measured = await timed(run);
      expect(measured.value.ok).toBe(true);
      expect(measured.ms).toBeLessThan(1_500);
    }
    await harness.db.closeAsync();
  }, 300_000);

  it('spans one grouped read across boards whose logical todays differ', async () => {
    const harness = await createTestHarness();
    // 15:30 utc is 11:30 in new york: a board whose day starts at noon (the
    // maximum shift) is still on yesterday, so the two boards have
    // different logical todays
    harness.clock.utcMs = Date.UTC(2026, 7, 30, 15, 30);
    const early = await createBoardForTest(harness, {
      title: 'midnight start',
      startOfDayMinute: 0,
    });
    const late = await createBoardForTest(harness, {
      title: 'noon start',
      startOfDayMinute: 12 * 60,
    });
    // a third board after the shifted one, so the window has to widen in
    // both directions rather than only backwards
    const alsoEarly = await createBoardForTest(harness, {
      title: 'another midnight start',
      startOfDayMinute: 0,
    });
    const created = await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId: early,
      source: 'app',
    });
    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const home = await getHomeBoardProjection(harness.deps);
    if (!home.ok) {
      throw new Error('home failed');
    }
    const byTitle = new Map(home.value.map((card) => [card.board.title, card]));
    expect(byTitle.get('midnight start')?.today).toBe('2026-08-30');
    expect(byTitle.get('noon start')?.today).toBe('2026-08-29');
    // each card still reads its own seven days out of the shared window
    expect(byTitle.get('midnight start')?.strip[6]).toBe(1);
    expect(byTitle.get('noon start')?.strip[6]).toBe(0);
    expect(byTitle.get('another midnight start')?.today).toBe('2026-08-30');
    void late;
    void alsoEarly;
    await harness.db.closeAsync();
  });

  it('projects a 1,000 board home and widget list without per-board scans', async () => {
    const harness = await createTestHarness();
    const now = harness.clock.nowUtcMs();
    const boards: string[] = [];
    const periods: string[] = [];
    for (let index = 0; index < BOARD_COUNT; index += 1) {
      const id = `b${String(index).padStart(11, '0')}`;
      const key = `k${String(index).padStart(6, '0')}`;
      boards.push(
        `('${id}','board ${index}','star.fill','#70A7FF',1,0,NULL,1,0,0,1,'${key}',NULL,${now},${now},'s${index}',NULL)`,
      );
      periods.push(`('${id}','2026-01-01',NULL,'s${index}',NULL)`);
    }
    for (let start = 0; start < boards.length; start += 500) {
      await harness.db.runAsync(
        `INSERT INTO boards (id, title, symbol, accent_hex, uses_tinted_background, tracks_amount,
           amount_unit, quick_amount, tracks_time, start_of_day_minute, metrics_enabled, order_key,
           archived_at, created_at, updated_at, mutation_stamp, deleted_at)
         VALUES ${boards.slice(start, start + 500).join(',')}`,
      );
      await harness.db.runAsync(
        `INSERT INTO board_activity_periods (board_id, start_date, end_date, mutation_stamp, deleted_at)
         VALUES ${periods.slice(start, start + 500).join(',')}`,
      );
    }

    const home = await timed(() => getHomeBoardProjection(harness.deps));
    if (!home.value.ok) {
      throw new Error('home failed');
    }
    expect(home.value.value).toHaveLength(BOARD_COUNT);
    // every card carries exactly seven strip values, so the list stays
    // renderable by a virtualized view
    expect(home.value.value[0].strip).toHaveLength(7);
    expect(home.ms).toBeLessThan(20_000);

    const widget = await timed(() => getWidgetProjection(harness.deps));
    expect(widget.value.ok).toBe(true);
    // the widget reads its materialized projection, so it stays fast no
    // matter how many boards exist
    expect(widget.ms).toBeLessThan(1_000);
    await harness.db.closeAsync();
  }, 300_000);
});
