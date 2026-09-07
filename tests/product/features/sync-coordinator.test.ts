import { createBoard, createCheckIn, setICloudSyncEnabled } from '@/core/domain/commands';
import { getSyncSummary } from '@/core/domain/queries';
import { SyncTransportError } from '@/core/sync/transport';
import { SyncCoordinator, type SyncSnapshot } from '@/features/product-store/sync-coordinator';

import { FakeSyncTransport } from '../helpers/fake-transport';
import { createTestHarness } from '../helpers/test-db';

async function setup(enabled = true) {
  const harness = await createTestHarness();
  await setICloudSyncEnabled(harness.deps, { commandId: harness.ids.nextCommandId(), enabled });
  const transport = new FakeSyncTransport();
  const states: SyncSnapshot[] = [];
  const committed = jest.fn();
  const coordinator = new SyncCoordinator(harness.deps, transport, (state) => states.push(state), committed);
  return { ...harness, transport, states, committed, coordinator };
}

describe('app lifetime sync coordinator', () => {
  afterEach(() => jest.useRealTimers());

  it('performs no network work while disabled', async () => {
    const { coordinator, transport, states } = await setup(false);
    await coordinator.request();
    expect(transport.ensureZoneCalls).toBe(0);
    expect(transport.uploads).toHaveLength(0);
    expect(states.at(-1)?.status).toBe('idle');
    coordinator.dispose();
  });

  it('syncs enabled mutations independently of the settings screen', async () => {
    const { coordinator, deps, ids, transport, states, committed } = await setup();
    await coordinator.request();
    const board = await createBoard(deps, { commandId: ids.nextCommandId(), title: 'walk', symbol: 'star.fill', accentHex: '#78D98B', usesTintedBackground: true, tracksAmount: false, tracksTime: false, startOfDayMinute: 0, metricsEnabled: true });
    if (!board.ok) throw new Error('board failed');
    await createCheckIn(deps, { commandId: ids.nextCommandId(), boardId: board.value.boardId, source: 'app' });
    await coordinator.request();
    expect([...transport.store.values()].filter((row) => row.entityType === 'check_in')).toHaveLength(1);
    expect(states.at(-1)).toEqual({ status: 'up_to_date', busy: false, error: null });
    expect(committed).toHaveBeenCalled();
    const summary = await getSyncSummary(deps);
    expect(summary.ok && summary.value.pendingChanges).toBe(0);
    coordinator.dispose();
  });

  it('retries offline work without a mounted sync screen and stops on disposal', async () => {
    jest.useFakeTimers();
    const { coordinator, transport, states } = await setup();
    transport.failNext = new SyncTransportError('offline', 'private network details');
    await coordinator.request();
    expect(states.at(-1)?.status).toBe('offline');
    await jest.advanceTimersByTimeAsync(2000);
    expect(states.at(-1)?.status).toBe('up_to_date');
    transport.failNext = new SyncTransportError('offline', 'private network details');
    await coordinator.request();
    coordinator.dispose();
    const count = states.length;
    await jest.advanceTimersByTimeAsync(300000);
    expect(states).toHaveLength(count);
  });

  it('cancels a late fetch when sync is turned off, without advancing its token', async () => {
    const { coordinator, transport, deps, ids, states } = await setup();
    let finish!: () => void;
    let fetching!: () => void;
    const started = new Promise<void>((resolve) => { fetching = resolve; });
    transport.fetchChanges = () => new Promise((resolve) => {
      finish = () => resolve({ records: [], nextToken: 'uncommitted', more: false });
      fetching();
    });
    const run = coordinator.request();
    await started;
    coordinator.pause();
    await setICloudSyncEnabled(deps, { commandId: ids.nextCommandId(), enabled: false });
    finish();
    await run;
    const row = await deps.db.getFirstAsync<{ change_token: string | null }>('SELECT change_token FROM sync_state WHERE id = 1');
    expect(row?.change_token).not.toBe('uncommitted');
    expect(states.at(-1)).toEqual({ status: 'idle', busy: false, error: null });
    coordinator.dispose();
  });

  it('cancels a fetched page queued behind the write that disables sync', async () => {
    const { coordinator, transport, deps, states } = await setup();
    await deps.db.runAsync('UPDATE sync_state SET zone_created = 1');
    let fetched = false;
    transport.fetchChanges = async () => {
      fetched = true;
      return { records: [], nextToken: 'must-not-commit', more: false };
    };
    const exclusive = deps.db.withExclusiveTransactionAsync.bind(deps.db);
    let pauseBeforeCommit = true;
    const transactions = jest.spyOn(deps.db, 'withExclusiveTransactionAsync').mockImplementation(async (work) => {
      if (fetched && pauseBeforeCommit) {
        pauseBeforeCommit = false;
        coordinator.pause();
        // the fetched page has passed the transport guard, but the user's
        // disable transaction reaches sqlite before the page transaction.
        await exclusive(async (tx) => {
          await tx.runAsync('UPDATE app_settings SET icloud_sync_enabled = 0');
        });
      }
      return exclusive(work);
    });
    try {
      await coordinator.request();
      const row = await deps.db.getFirstAsync<{
        change_token: string | null; last_success_at: number | null; retry_state: string | null;
      }>('SELECT change_token, last_success_at, retry_state FROM sync_state WHERE id = 1');
      expect(row).toEqual({ change_token: null, last_success_at: null, retry_state: null });
      expect(states.at(-1)).toEqual({ status: 'idle', busy: false, error: null });
    } finally {
      transactions.mockRestore();
      coordinator.dispose();
    }
  });

  it('keeps refresh triggers paused until the disabling write succeeds or sync is explicitly resumed', async () => {
    const { coordinator, transport, states } = await setup();
    coordinator.pause();
    await coordinator.request();
    await coordinator.request();
    // persisted settings still say enabled while the disable write is pending.
    expect(transport.ensureZoneCalls).toBe(0);
    expect(transport.uploads).toHaveLength(0);
    expect(states.at(-1)?.status).toBe('idle');
    coordinator.resume();
    await coordinator.request();
    expect(transport.ensureZoneCalls).toBe(1);
    expect(states.at(-1)?.status).toBe('up_to_date');
    coordinator.dispose();
  });

  it('drains a trigger queued as the current pass completes before resolving its callers', async () => {
    const { coordinator, transport, committed } = await setup();
    const fetch = jest.spyOn(transport, 'fetchChanges');
    let followup: Promise<void> | undefined;
    committed.mockImplementationOnce(() => {
      queueMicrotask(() => { followup = coordinator.request(); });
    });
    await coordinator.request();
    expect(followup).toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(2);
    await followup;
    coordinator.dispose();
  });

  it('coalesces concurrent triggers instead of overlapping sync passes', async () => {
    const { coordinator, transport } = await setup();
    let finish!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const fetch = jest.spyOn(transport, 'fetchChanges').mockImplementationOnce(() => new Promise((resolve) => {
      finish = () => resolve({ records: [], nextToken: '0', more: false });
      entered();
    }));
    const first = coordinator.request();
    await started;
    const second = coordinator.request();
    const third = coordinator.request();
    expect(fetch).toHaveBeenCalledTimes(1);
    finish();
    await Promise.all([first, second, third]);
    expect(fetch).toHaveBeenCalledTimes(2);
    coordinator.dispose();
  });

  it('sanitizes database failures and remains retryable', async () => {
    const { coordinator, deps, states } = await setup();
    const read = jest.spyOn(deps.db, 'withTransactionAsync').mockRejectedValueOnce(new Error('private sql failure'));
    await coordinator.request();
    expect(states.at(-1)).toEqual({ status: 'needs_attention', busy: false, error: 'Sync could not finish. Try again.' });
    read.mockRestore();
    await coordinator.request();
    expect(states.at(-1)?.status).toBe('up_to_date');
    coordinator.dispose();
  });
});
