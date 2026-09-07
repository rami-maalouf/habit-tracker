import { createBoard, deleteBoard } from '@/core/domain/commands';
import { getHomeBoardProjection, getWidgetProjection, listActiveBoards } from '@/core/domain/queries';
import {
  REFERENCE_AUGUST_2026_DEMO_LABELS,
  referenceAugust2026Draft,
  seedReferenceAugust2026,
} from '@/testing/fixtures/reference-august-2026';

import { createTestHarness } from '../helpers/test-db';

describe('august 2026 reference fixture', () => {
  it('contains deterministic validated demo labels and activity', async () => {
    const harness = await createTestHarness();
    const originalNow = harness.clock.utcMs;
    const result = await seedReferenceAugust2026(harness.deps, harness.ids.nextCommandId());

    expect(result).toEqual({
      ok: true,
      value: {
        boardsCreated: 7,
        boardsSkipped: 0,
        checkInsCreated: referenceAugust2026Draft.checkIns.length,
        checkInsSkipped: 0,
        remindersCreated: 0,
        remindersSkipped: 0,
      },
    });
    expect(harness.clock.utcMs).toBe(originalNow);

    const boards = await listActiveBoards(harness.deps);
    expect(boards.ok && boards.value.map((board) => board.title)).toEqual(
      REFERENCE_AUGUST_2026_DEMO_LABELS,
    );

    const home = await getHomeBoardProjection(harness.deps);
    expect(home.ok).toBe(true);
    if (home.ok) {
      expect(home.value).toHaveLength(7);
      expect(home.value.every((card) => card.today === '2026-08-30')).toBe(true);
      expect(home.value.every((card) => card.strip.length === 14)).toBe(true);
      expect(home.value[0].strip).toEqual([1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1]);
    }

    const widget = await getWidgetProjection(harness.deps);
    expect(widget.ok).toBe(true);
    if (widget.ok) {
      expect(widget.value).toHaveLength(7);
      expect(widget.value.every((row) => row.strip.length === 7)).toBe(true);
      expect(widget.value.every((row) => row.stripEndDate === '2026-08-30')).toBe(true);
    }
  });

  it('is idempotent for a repeated command id', async () => {
    const harness = await createTestHarness();
    const commandId = harness.ids.nextCommandId();
    const first = await seedReferenceAugust2026(harness.deps, commandId);
    const second = await seedReferenceAugust2026(harness.deps, commandId);

    expect(second).toEqual(first);
    const boards = await listActiveBoards(harness.deps);
    expect(boards.ok && boards.value).toHaveLength(7);
    const row = await harness.db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM check_ins WHERE deleted_at IS NULL',
    );
    expect(row?.count).toBe(referenceAugust2026Draft.checkIns.length);
  });

  it('refuses an existing database without adding fixture records', async () => {
    const harness = await createTestHarness();
    await createBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      title: 'my existing board',
      symbol: 'star.fill',
      accentHex: '#78D98B',
      usesTintedBackground: true,
      tracksAmount: false,
      tracksTime: false,
      startOfDayMinute: 0,
      metricsEnabled: true,
    });

    const result = await seedReferenceAugust2026(harness.deps, harness.ids.nextCommandId());
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'conflict',
        message: 'Demo data can only be added to an empty database.',
        field: undefined,
        retryable: false,
      },
    });
    const boards = await listActiveBoards(harness.deps);
    expect(boards.ok && boards.value.map((board) => board.title)).toEqual(['my existing board']);
  });

  it('rolls back the entire fixture when any row fails', async () => {
    const harness = await createTestHarness();
    await harness.db.execAsync(`
      CREATE TRIGGER reject_reference_check_in
      BEFORE INSERT ON check_ins
      BEGIN
        SELECT RAISE(ABORT, 'fixture write rejected');
      END
    `);

    const result = await seedReferenceAugust2026(harness.deps, harness.ids.nextCommandId());
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.code).toBe('database');

    for (const table of ['boards', 'check_ins', 'board_activity_periods', 'mutation_outbox']) {
      const row = await harness.db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${table}`,
      );
      expect(row?.count).toBe(0);
    }
  });

  it('treats tombstoned user data as a nonempty database', async () => {
    const harness = await createTestHarness();
    const created = await createBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      title: 'previously deleted board',
      symbol: 'star.fill',
      accentHex: '#78D98B',
      usesTintedBackground: true,
      tracksAmount: false,
      tracksTime: false,
      startOfDayMinute: 0,
      metricsEnabled: true,
    });
    if (!created.ok) throw new Error(created.error.message);
    await deleteBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId: created.value.boardId,
    });

    const result = await seedReferenceAugust2026(harness.deps, harness.ids.nextCommandId());
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.code).toBe('conflict');
    const row = await harness.db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM boards',
    );
    expect(row?.count).toBe(1);
  });

  it('is unavailable when the production build guard is active', async () => {
    const harness = await createTestHarness();
    const devFlag = global as unknown as { __DEV__: boolean };
    const original = devFlag.__DEV__;
    devFlag.__DEV__ = false;
    try {
      const result = await seedReferenceAugust2026(harness.deps, harness.ids.nextCommandId());
      expect(result).toEqual({
        ok: false,
        error: {
          code: 'unavailable',
          message: 'Reference demo data is available only in development builds.',
          field: undefined,
          retryable: false,
        },
      });
      const boards = await listActiveBoards(harness.deps);
      expect(boards.ok && boards.value).toHaveLength(0);
    } finally {
      devFlag.__DEV__ = original;
    }
  });
});
