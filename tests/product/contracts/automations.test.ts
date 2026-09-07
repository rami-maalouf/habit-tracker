import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  listAutomationBoards,
  runCheckInIntent,
  runRemoveLatestIntent,
  runTodayCheckInsIntent,
} from '@/core/automations/contract';
import { archiveBoard, createBoard } from '@/core/domain/commands';
import type { BoardId, CommandId, LogicalDate } from '@/core/domain/ids';
import { getGroupedCheckInHistory } from '@/core/domain/queries';

import { createTestHarness, type TestHarness } from '../helpers/test-db';

type FixtureCase = {
  name: string;
  intent: 'listBoards' | 'checkIn' | 'removeLatest' | 'today';
  input: Record<string, unknown>;
  given?: { intent: string; input: Record<string, unknown> }[];
  expect: Record<string, unknown>;
};

type Fixture = {
  contractVersion: number;
  seed: {
    timeZoneId: string;
    nowUtcMs: number;
    boards: Record<string, unknown>[];
  };
  cases: FixtureCase[];
};

const fixture = JSON.parse(
  readFileSync(
    join(__dirname, '../../../src/core/automations/fixtures/intent-contract.json'),
    'utf8',
  ),
) as Fixture;

// the fixture's board ids are stable handles, not literal row ids: each
// executor seeds its own store and resolves handles to whatever ids that
// store produced
type Seeded = { harness: TestHarness; idFor: (handle: string) => BoardId };

async function seedHarness(): Promise<Seeded> {
  const harness = await createTestHarness();
  const ids = new Map<string, BoardId>();
  harness.clock.utcMs = fixture.seed.nowUtcMs;
  harness.clock.zone = fixture.seed.timeZoneId;
  for (const board of fixture.seed.boards) {
    // the fixture's board ids are the contract's stable identifiers, so the
    // seeded rows use them verbatim rather than generated ones
    const created = await createBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      title: board.title as string,
      symbol: 'star.fill',
      accentHex: '#70A7FF',
      usesTintedBackground: true,
      tracksAmount: board.tracksAmount === true,
      amountUnit: (board.amountUnit as string | undefined) ?? null,
      quickAmount: board.quickAmount as number,
      tracksTime: board.tracksTime === true,
      startOfDayMinute: board.startOfDayMinute as number,
      metricsEnabled: true,
    });
    if (!created.ok) {
      throw new Error(created.error.message);
    }
    ids.set(board.id as string, created.value.boardId);
    if (board.archived === true) {
      const archived = await archiveBoard(harness.deps, {
        commandId: harness.ids.nextCommandId(),
        boardId: created.value.boardId,
      });
      if (!archived.ok) {
        throw new Error(archived.error.message);
      }
    }
  }
  // an unmapped handle is a deliberately unknown board in the fixture
  const idFor = (handle: string) => (ids.get(handle) ?? handle) as BoardId;
  return { harness, idFor };
}

async function runIntent(
  seeded: Seeded,
  intent: string,
  input: Record<string, unknown>,
  commandId?: CommandId,
) {
  const { harness, idFor } = seeded;
  const id = commandId ?? harness.ids.nextCommandId();
  const boardId =
    input.boardId === undefined ? undefined : idFor(input.boardId as string);
  if (intent === 'listBoards') {
    return listAutomationBoards(harness.deps);
  }
  if (intent === 'checkIn') {
    return runCheckInIntent(harness.deps, {
      commandId: id,
      boardId: boardId as BoardId,
      source: 'shortcut',
      logicalDate: input.logicalDate as LogicalDate | undefined,
      amount: input.amount as number | undefined,
      note: input.note as string | undefined,
    });
  }
  if (intent === 'removeLatest') {
    return runRemoveLatestIntent(harness.deps, {
      commandId: id,
      boardId: boardId as BoardId,
      logicalDate: input.logicalDate as LogicalDate | undefined,
    });
  }
  return runTodayCheckInsIntent(harness.deps, { boardId });
}

describe('automation contract fixtures', () => {
  it('covers every intent the release exposes', () => {
    expect(fixture.contractVersion).toBe(1);
    const intents = new Set(fixture.cases.map((entry) => entry.intent));
    expect([...intents].sort()).toEqual(['checkIn', 'listBoards', 'removeLatest', 'today']);
  });

  for (const entry of fixture.cases) {
    it(entry.name, async () => {
      const seeded = await seedHarness();
      const { harness, idFor } = seeded;
      for (const step of entry.given ?? []) {
        const before = await runIntent(seeded, step.intent, step.input);
        if (!before.ok) {
          throw new Error(`given step failed: ${before.error.message}`);
        }
      }

      const replay = entry.input.replayCommandId === true;
      const commandId = harness.ids.nextCommandId();
      const result = await runIntent(seeded, entry.intent, entry.input, commandId);
      if (replay) {
        // a retried intent reuses its command id: the receipt replays and
        // the store still holds exactly one record
        const again = await runIntent(seeded, entry.intent, entry.input, commandId);
        expect(again.ok).toBe(entry.expect.ok);
      }

      expect(result.ok).toBe(entry.expect.ok);
      if (!result.ok) {
        expect(result.error.code).toBe(entry.expect.code);
        await harness.db.closeAsync();
        return;
      }

      if (entry.expect.boards !== undefined && entry.intent === 'listBoards') {
        const boards = result.value as { title: string }[];
        expect(boards.map((board) => board.title)).toEqual(entry.expect.boards);
      }

      if (entry.intent === 'checkIn') {
        const value = result.value as { checkInId: string; logicalDate: string };
        if (entry.expect.logicalDate !== undefined) {
          expect(value.logicalDate).toBe(entry.expect.logicalDate);
        }
        if (entry.expect.amount !== undefined) {
          const row = await harness.db.getFirstAsync<{ amount: number | null }>(
            'SELECT amount FROM check_ins WHERE id = ?',
            [value.checkInId],
          );
          expect(row?.amount).toBe(entry.expect.amount);
        }
        if (entry.expect.recordedCount !== undefined) {
          const rows = await harness.db.getAllAsync(
            'SELECT id FROM check_ins WHERE board_id = ? AND deleted_at IS NULL',
            [idFor(entry.input.boardId as string)],
          );
          expect(rows).toHaveLength(entry.expect.recordedCount as number);
        }
      }

      if (entry.intent === 'removeLatest' && entry.expect.remainingToday !== undefined) {
        const history = await getGroupedCheckInHistory(
          harness.deps,
          idFor(entry.input.boardId as string),
        );
        if (!history.ok) {
          throw new Error('history failed');
        }
        const remaining = history.value.months
          .flatMap((month) => month.days)
          .reduce((total, day) => total + day.count, 0);
        expect(remaining).toBe(entry.expect.remainingToday);
      }

      if (entry.intent === 'today') {
        const value = result.value as {
          boards: { title: string; count: number }[];
          total: number;
        };
        if (entry.expect.total !== undefined) {
          expect(value.total).toBe(entry.expect.total);
        }
        if (entry.expect.boards !== undefined) {
          expect(value.boards).toEqual(entry.expect.boards);
        }
        if (entry.expect.excludesNoteText === true) {
          // the spoken result never carries note text
          expect(JSON.stringify(value)).not.toContain('private thought');
        }
      }

      await harness.db.closeAsync();
    });
  }
});

describe('automation contract failures', () => {
  it('surfaces a read failure instead of an empty list', async () => {
    const harness = await createTestHarness();
    await harness.db.closeAsync();
    const boards = await listAutomationBoards(harness.deps);
    expect(!boards.ok && boards.error.code).toBe('database');
    const today = await runTodayCheckInsIntent(harness.deps);
    expect(!today.ok && today.error.code).toBe('database');
  });
});

describe('automation contract remaining paths', () => {
  it('rejects removing from an unknown board', async () => {
    const { harness } = await seedHarness();
    const result = await runRemoveLatestIntent(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId: '00000000-0000-4000-8000-00000000dead' as BoardId,
    });
    expect(!result.ok && result.error.code).toBe('not_found');
    await harness.db.closeAsync();
  });

  it('surfaces a failed removal instead of reporting success', async () => {
    const seeded = await seedHarness();
    const { harness, idFor } = seeded;
    const boardId = idFor('00000000-0000-4000-8000-00000000a001');
    const created = await runCheckInIntent(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      source: 'siri',
    });
    if (!created.ok) {
      throw new Error(created.error.message);
    }
    // the record disappears between the lookup and the delete
    const racing = Object.create(harness.db) as typeof harness.db;
    racing.withExclusiveTransactionAsync = (work) =>
      harness.db.withExclusiveTransactionAsync(async (tx) => {
        await tx.runAsync('UPDATE check_ins SET deleted_at = 1 WHERE id = ?', [
          created.value.checkInId,
        ]);
        return work(tx);
      });
    const result = await runRemoveLatestIntent(
      { ...harness.deps, db: racing },
      { commandId: harness.ids.nextCommandId(), boardId },
    );
    expect(!result.ok && result.error.code).toBe('not_found');
    await harness.db.closeAsync();
  });

  it('keeps the message from a real read failure and stringifies other throws', async () => {
    const harness = await createTestHarness();
    const failing = Object.create(harness.db) as typeof harness.db;
    failing.withTransactionAsync = () => Promise.reject(new Error('disk went away'));
    const real = await listAutomationBoards({ db: failing });
    expect(!real.ok && real.error.message).toContain('disk went away');

    const odd = Object.create(harness.db) as typeof harness.db;
    odd.withTransactionAsync = () => Promise.reject('not an error object');
    const stringified = await listAutomationBoards({ db: odd });
    expect(!stringified.ok && stringified.error.message).toContain('not an error object');
    await harness.db.closeAsync();
  });
});

describe('automation contract retry and failure paths', () => {
  it('replays a check-in retry with its original date across midnight', async () => {
    const seeded = await seedHarness();
    const { harness, idFor } = seeded;
    const boardId = idFor('00000000-0000-4000-8000-00000000a001');
    const commandId = harness.ids.nextCommandId();
    const first = await runCheckInIntent(harness.deps, {
      commandId,
      boardId,
      source: 'siri',
    });
    if (!first.ok) {
      throw new Error(first.error.message);
    }
    // the clock crosses into the next logical day before the retry
    harness.clock.advanceDays(1);
    const retry = await runCheckInIntent(harness.deps, {
      commandId,
      boardId,
      source: 'siri',
    });
    if (!retry.ok) {
      throw new Error(retry.error.message);
    }
    // the receipt replays the original outcome: same record, same date
    expect(retry.value.checkInId).toBe(first.value.checkInId);
    expect(retry.value.logicalDate).toBe(first.value.logicalDate);
    const rows = await harness.db.getAllAsync(
      'SELECT id FROM check_ins WHERE board_id = ? AND deleted_at IS NULL',
      [boardId],
    );
    expect(rows).toHaveLength(1);
    await harness.db.closeAsync();
  });

  it('replays a removal retry instead of resolving a different record', async () => {
    const seeded = await seedHarness();
    const { harness, idFor } = seeded;
    const boardId = idFor('00000000-0000-4000-8000-00000000a001');
    for (let index = 0; index < 2; index += 1) {
      const created = await runCheckInIntent(harness.deps, {
        commandId: harness.ids.nextCommandId(),
        boardId,
        source: 'shortcut',
      });
      if (!created.ok) {
        throw new Error(created.error.message);
      }
    }
    const commandId = harness.ids.nextCommandId();
    const first = await runRemoveLatestIntent(harness.deps, { commandId, boardId });
    if (!first.ok) {
      throw new Error(first.error.message);
    }
    const retry = await runRemoveLatestIntent(harness.deps, { commandId, boardId });
    if (!retry.ok) {
      throw new Error(retry.error.message);
    }
    // the same record, and the survivor is untouched
    expect(retry.value.removedCheckInId).toBe(first.value.removedCheckInId);
    const rows = await harness.db.getAllAsync(
      'SELECT id FROM check_ins WHERE board_id = ? AND deleted_at IS NULL',
      [boardId],
    );
    expect(rows).toHaveLength(1);
    await harness.db.closeAsync();
  });

  it('returns an actionable result when a board read fails', async () => {
    const seeded = await seedHarness();
    const { harness, idFor } = seeded;
    const boardId = idFor('00000000-0000-4000-8000-00000000a001');
    const broken = Object.create(harness.db) as typeof harness.db;
    broken.withTransactionAsync = () => Promise.reject(new Error('storage offline'));
    const deps = { ...harness.deps, db: broken };

    const checkIn = await runCheckInIntent(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      source: 'shortcut',
    });
    expect(!checkIn.ok && checkIn.error.code).toBe('database');
    expect(!checkIn.ok && checkIn.error.message).toContain('storage offline');

    const removal = await runRemoveLatestIntent(deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
    });
    expect(!removal.ok && removal.error.code).toBe('database');
    await harness.db.closeAsync();
  });

  it('fails an unknown or archived board for today\'s check-ins', async () => {
    const seeded = await seedHarness();
    const { harness, idFor } = seeded;
    const unknown = await runTodayCheckInsIntent(harness.deps, {
      boardId: '00000000-0000-4000-8000-00000000dead' as BoardId,
    });
    expect(!unknown.ok && unknown.error.code).toBe('not_found');

    const archived = await runTodayCheckInsIntent(harness.deps, {
      boardId: idFor('00000000-0000-4000-8000-00000000a003'),
    });
    expect(!archived.ok && archived.error.code).toBe('not_found');
    await harness.db.closeAsync();
  });

  it('rejects a removal on a board that vanished inside the command', async () => {
    const seeded = await seedHarness();
    const { harness, idFor } = seeded;
    const boardId = idFor('00000000-0000-4000-8000-00000000a001');
    const created = await runCheckInIntent(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      source: 'shortcut',
    });
    if (!created.ok) {
      throw new Error(created.error.message);
    }
    // the preflight sees a live board; the command's own transaction sees
    // it archived, and must still refuse
    const racing = Object.create(harness.db) as typeof harness.db;
    racing.withExclusiveTransactionAsync = (work) =>
      harness.db.withExclusiveTransactionAsync(async (tx) => {
        await tx.runAsync('UPDATE boards SET archived_at = 1 WHERE id = ?', [boardId]);
        return work(tx);
      });
    const result = await runRemoveLatestIntent(
      { ...harness.deps, db: racing },
      { commandId: harness.ids.nextCommandId(), boardId },
    );
    expect(!result.ok && result.error.code).toBe('archived');
    await harness.db.closeAsync();
  });

  it('rejects a removal when the board row is gone inside the command', async () => {
    const seeded = await seedHarness();
    const { harness, idFor } = seeded;
    const boardId = idFor('00000000-0000-4000-8000-00000000a001');
    const racing = Object.create(harness.db) as typeof harness.db;
    racing.withExclusiveTransactionAsync = (work) =>
      harness.db.withExclusiveTransactionAsync(async (tx) => {
        await tx.runAsync('UPDATE boards SET deleted_at = 1 WHERE id = ?', [boardId]);
        return work(tx);
      });
    const result = await runRemoveLatestIntent(
      { ...harness.deps, db: racing },
      { commandId: harness.ids.nextCommandId(), boardId },
    );
    expect(!result.ok && result.error.code).toBe('not_found');
    await harness.db.closeAsync();
  });
});
