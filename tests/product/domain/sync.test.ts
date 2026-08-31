import { archiveBoard, createCheckIn, deleteBoard, dismissMetricsEducation, setICloudSyncEnabled, updateBoard } from '@/core/domain/commands';
import type { BoardId, LogicalDate } from '@/core/domain/ids';
import { getBoard, getGroupedCheckInHistory, getMetricsEducationDismissed, getSyncSummary, listActiveBoards, listArchivedBoards } from '@/core/domain/queries';
import { runSync, retryDelayMs } from '@/core/sync/engine';
import type { SyncDeps } from '@/core/sync/engine';
import { SYNC_SCHEMA_VERSION, periodEntityId } from '@/core/sync/records';
import type { SyncRecord } from '@/core/sync/transport';
import { SyncTransportError } from '@/core/sync/transport';

import { FakeSyncTransport } from '../helpers/fake-transport';
import { createBoardForTest } from '../helpers/product-fixtures';
import { createTestHarness, type TestHarness } from '../helpers/test-db';

// deterministic jitter so retry delays are exact in tests
const RANDOM = () => 0.5;

async function setup(): Promise<{
  harness: TestHarness;
  transport: FakeSyncTransport;
  deps: SyncDeps;
}> {
  const harness = await createTestHarness();
  const transport = new FakeSyncTransport();
  const enabled = await setICloudSyncEnabled(harness.deps, {
    commandId: harness.ids.nextCommandId(),
    enabled: true,
  });
  if (!enabled.ok) {
    throw new Error(enabled.error.message);
  }
  return {
    harness,
    transport,
    deps: { db: harness.db, clock: harness.clock, transport, random: RANDOM },
  };
}

function remoteBoard(overrides: Partial<SyncRecord> & { id: string; stamp: string; title?: string }): SyncRecord {
  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    entityType: 'board',
    entityId: overrides.id,
    mutationStamp: overrides.stamp,
    deleted: overrides.deleted ?? false,
    fields: {
      id: overrides.id,
      title: overrides.title ?? 'remote board',
      symbol: 'star.fill',
      accent_hex: '#70A7FF',
      uses_tinted_background: 1,
      tracks_amount: 0,
      amount_unit: null,
      quick_amount: 1,
      tracks_time: 0,
      start_of_day_minute: 0,
      metrics_enabled: 1,
      order_key: 'm0',
      archived_at: null,
      created_at: Date.UTC(2026, 7, 1),
      updated_at: Date.UTC(2026, 7, 1),
      deleted_at: overrides.deleted ? Date.UTC(2026, 7, 2) : null,
      ...(overrides.fields ?? {}),
    },
  };
}

describe('sync engine', () => {
  it('stays idle and uploads nothing while sync is disabled', async () => {
    const harness = await createTestHarness();
    const transport = new FakeSyncTransport();
    await createBoardForTest(harness);
    const result = await runSync({
      db: harness.db,
      clock: harness.clock,
      transport,
      random: RANDOM,
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.value.status).toBe('idle');
    expect(transport.uploads).toHaveLength(0);
    expect(transport.ensureZoneCalls).toBe(0);
    await harness.db.closeAsync();
  });

  it('creates the zone once and uploads the local outbox', async () => {
    const { harness, transport, deps } = await setup();
    const boardId = await createBoardForTest(harness, { title: 'uploaded board' });
    const created = await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      logicalDate: '2026-08-29' as LogicalDate,
      source: 'app',
    });
    if (!created.ok) {
      throw new Error(created.error.message);
    }
    const first = await runSync(deps);
    if (!first.ok) {
      throw new Error(first.error.message);
    }
    expect(first.value.status).toBe('up_to_date');
    expect(transport.ensureZoneCalls).toBe(1);
    const uploaded = transport.uploads.flat();
    const types = uploaded.map((record) => record.entityType).sort();
    expect(types).toContain('board');
    expect(types).toContain('check_in');
    expect(types).toContain('activity_period');
    // settings never leak device-local state
    const board = uploaded.find((record) => record.entityType === 'board');
    expect(Object.keys(board?.fields ?? {})).not.toContain('mutation_stamp');
    // a period travels under boardId|startDate, never a local integer id
    const period = uploaded.find((record) => record.entityType === 'activity_period');
    expect(period?.entityId).toContain('|');

    // the outbox drained, so a second pass uploads nothing new
    const second = await runSync(deps);
    expect(second.ok && second.value.uploaded).toBe(0);
    expect(transport.ensureZoneCalls).toBe(1);
    await harness.db.closeAsync();
  });

  it('applies a remote board and its dependents in one commit', async () => {
    const { harness, transport, deps } = await setup();
    const boardId = '00000000-0000-4000-8000-0000000000b1';
    transport.seedRemote(remoteBoard({ id: boardId, stamp: '00000000000900-00001-remote', title: 'from other device' }));
    transport.seedRemote({
      schemaVersion: SYNC_SCHEMA_VERSION,
      entityType: 'activity_period',
      entityId: periodEntityId(boardId, '2026-08-01'),
      mutationStamp: '00000000000900-00002-remote',
      deleted: false,
      fields: { board_id: boardId, start_date: '2026-08-01', end_date: null, deleted_at: null },
    });
    transport.seedRemote({
      schemaVersion: SYNC_SCHEMA_VERSION,
      entityType: 'check_in',
      entityId: '00000000-0000-4000-8000-0000000000c1',
      mutationStamp: '00000000000900-00003-remote',
      deleted: false,
      fields: {
        id: '00000000-0000-4000-8000-0000000000c1',
        board_id: boardId,
        logical_date: '2026-08-20',
        occurred_at_utc: null,
        time_zone_id: null,
        offset_minutes: null,
        amount: null,
        note: 'remote note',
        source: 'sync',
        idempotency_key: '00000000-0000-4000-8000-0000000000c9',
        created_at: Date.UTC(2026, 7, 20),
        updated_at: Date.UTC(2026, 7, 20),
        deleted_at: null,
      },
    });

    const result = await runSync(deps);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.value.status).toBe('up_to_date');
    expect(result.value.applied).toBe(3);

    const boards = await listActiveBoards(harness.deps);
    if (!boards.ok) {
      throw new Error('boards failed');
    }
    expect(boards.value.map((board) => board.title)).toContain('from other device');
    const history = await getGroupedCheckInHistory(harness.deps, boardId as BoardId);
    if (!history.ok) {
      throw new Error('history failed');
    }
    expect(history.value.months[0].days[0].checkIns[0].note).toBe('remote note');

    // the widget projection rebuilt inside the same commit
    const rows = await harness.db.getAllAsync<{ title: string }>(
      'SELECT title FROM widget_board_rows',
    );
    expect(rows.map((row) => row.title)).toContain('from other device');
    await harness.db.closeAsync();
  });

  it('resolves same-record conflicts by the greatest mutation stamp', async () => {
    const { harness, transport, deps } = await setup();
    const boardId = await createBoardForTest(harness, { title: 'local title' });
    await runSync(deps);
    const local = await getBoard(harness.deps, boardId);
    if (!local.ok || local.value === null) {
      throw new Error('board missing');
    }

    // a remote edit with a LOWER stamp loses
    transport.seedRemote(
      remoteBoard({ id: boardId, stamp: '00000000000001-00001-other', title: 'older remote' }),
    );
    const loser = await runSync(deps);
    expect(loser.ok && loser.value.applied).toBe(0);
    const afterLoser = await getBoard(harness.deps, boardId);
    expect(afterLoser.ok && afterLoser.value?.title).toBe('local title');

    // a remote edit with a GREATER stamp wins the whole record
    transport.seedRemote(
      remoteBoard({ id: boardId, stamp: '99999999999999-00001-other', title: 'newer remote' }),
    );
    const winner = await runSync(deps);
    expect(winner.ok && winner.value.applied).toBe(1);
    const afterWinner = await getBoard(harness.deps, boardId);
    expect(afterWinner.ok && afterWinner.value?.title).toBe('newer remote');
    await harness.db.closeAsync();
  });

  it('observes remote stamps so later local mutations sort after them', async () => {
    const { harness, transport, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    transport.seedRemote(
      remoteBoard({ id: '00000000-0000-4000-8000-0000000000d1', stamp: '99999999999999-00007-other' }),
    );
    await runSync(deps);
    const edited = await updateBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      expectedMutationStamp: (await getBoard(harness.deps, boardId)).ok
        ? ((await getBoard(harness.deps, boardId)) as { value: { mutationStamp: string } }).value
            .mutationStamp
        : '',
      title: 'after remote',
      symbol: 'star.fill',
      accentHex: '#70A7FF',
      usesTintedBackground: true,
      tracksAmount: false,
      tracksTime: false,
      startOfDayMinute: 0,
      metricsEnabled: true,
    });
    if (!edited.ok) {
      throw new Error(edited.error.message);
    }
    const after = await getBoard(harness.deps, boardId);
    if (!after.ok || after.value === null) {
      throw new Error('board missing');
    }
    // the local stamp now sorts above the observed remote one
    expect(after.value.mutationStamp > '99999999999999-00007-other').toBe(true);
    await harness.db.closeAsync();
  });

  it('applies a remote tombstone that strips user content', async () => {
    const { harness, transport, deps } = await setup();
    const boardId = await createBoardForTest(harness, { title: 'doomed remotely' });
    await runSync(deps);
    transport.seedRemote(
      remoteBoard({
        id: boardId,
        stamp: '99999999999999-00001-other',
        deleted: true,
        title: 'doomed remotely',
        fields: { title: '' },
      }),
    );
    const result = await runSync(deps);
    expect(result.ok && result.value.applied).toBe(1);
    const active = await listActiveBoards(harness.deps);
    expect(active.ok && active.value.map((board) => board.id)).not.toContain(boardId);
    const archived = await listArchivedBoards(harness.deps);
    expect(archived.ok && archived.value.map((board) => board.id)).not.toContain(boardId);
    await harness.db.closeAsync();
  });

  it('uploads a local tombstone without its user content', async () => {
    const { harness, transport, deps } = await setup();
    const boardId = await createBoardForTest(harness, { title: 'secret board' });
    const created = await createCheckIn(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
      logicalDate: '2026-08-29' as LogicalDate,
      note: 'private note',
      source: 'app',
    });
    if (!created.ok) {
      throw new Error(created.error.message);
    }
    await runSync(deps);
    transport.uploads = [];
    const deleted = await deleteBoard(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
    });
    if (!deleted.ok) {
      throw new Error(deleted.error.message);
    }
    await runSync(deps);
    const tombstones = transport.uploads.flat().filter((record) => record.deleted);
    expect(tombstones.length).toBeGreaterThan(0);
    const checkInTombstone = tombstones.find((record) => record.entityType === 'check_in');
    expect(checkInTombstone?.fields.note).toBeNull();
    // structural linkage and timestamps survive so replicas can order it
    expect(checkInTombstone?.fields.board_id).toBe(boardId);
    expect(checkInTombstone?.fields.deleted_at).not.toBeNull();
    const boardTombstone = tombstones.find((record) => record.entityType === 'board');
    // the title column is NOT NULL locally, so its stripped value is empty
    expect(boardTombstone?.fields.title).toBe('');
    expect(boardTombstone?.fields.accent_hex).toBe('');
    await harness.db.closeAsync();
  });

  it('keeps a tombstone winning over a later-arriving create', async () => {
    const { harness, transport, deps } = await setup();
    const boardId = '00000000-0000-4000-8000-0000000000e1';
    // the delete carries the greater stamp but arrives first
    transport.seedRemote(
      remoteBoard({ id: boardId, stamp: '99999999999999-00001-other', deleted: true, fields: { title: '' } }),
    );
    transport.seedRemote(remoteBoard({ id: boardId, stamp: '00000000000005-00001-other' }));
    const result = await runSync(deps);
    expect(result.ok).toBe(true);
    const active = await listActiveBoards(harness.deps);
    expect(active.ok && active.value.map((board) => board.id)).not.toContain(boardId);
    await harness.db.closeAsync();
  });

  it('drains multiple pages and persists the token with its records', async () => {
    const { harness, transport, deps } = await setup();
    transport.pageSize = 1;
    for (let index = 0; index < 3; index += 1) {
      transport.seedRemote(
        remoteBoard({
          id: `00000000-0000-4000-8000-00000000f${index}0`,
          stamp: `0000000000000${index + 1}-00001-other`,
          title: `paged ${index}`,
        }),
      );
    }
    const result = await runSync(deps);
    expect(result.ok && result.value.applied).toBe(3);
    const state = await harness.db.getFirstAsync<{ change_token: string }>(
      'SELECT change_token FROM sync_state WHERE id = 1',
    );
    expect(state?.change_token).toBe('3');
    // a second run fetches nothing new
    const again = await runSync(deps);
    expect(again.ok && again.value.applied).toBe(0);
    await harness.db.closeAsync();
  });

  it('reports offline and signed out without exposing provider detail', async () => {
    const { harness, transport, deps } = await setup();
    await createBoardForTest(harness);
    transport.failNext = new SyncTransportError('offline', 'CKErrorNetworkUnavailable: host');
    const offline = await runSync(deps);
    if (!offline.ok) {
      throw new Error(offline.error.message);
    }
    expect(offline.value.status).toBe('offline');
    // full jitter at random()=0.5 gives three quarters of the capped delay
    expect(offline.value.retryAfterMs).toBe(1500);
    expect(JSON.stringify(offline.value)).not.toContain('CKError');

    transport.failNext = new SyncTransportError('signed_out', 'no iCloud account');
    const signedOut = await runSync(deps);
    expect(signedOut.ok && signedOut.value.status).toBe('signed_out');
    // the attempt counter grows, so the delay backs off
    expect(signedOut.ok && signedOut.value.retryAfterMs).toBe(3000);

    transport.failNext = new SyncTransportError('failure', 'quota exceeded');
    const attention = await runSync(deps);
    expect(attention.ok && attention.value.status).toBe('needs_attention');

    // a success clears the retry state
    const recovered = await runSync(deps);
    expect(recovered.ok && recovered.value.status).toBe('up_to_date');
    const state = await harness.db.getFirstAsync<{ retry_state: string | null }>(
      'SELECT retry_state FROM sync_state WHERE id = 1',
    );
    expect(state?.retry_state).toBeNull();
    await harness.db.closeAsync();
  });

  it('treats an unknown throw as needing attention', async () => {
    const { harness, transport, deps } = await setup();
    await createBoardForTest(harness);
    transport.upload = () => Promise.reject(new Error('unexpected'));
    const result = await runSync(deps);
    expect(result.ok && result.value.status).toBe('needs_attention');
    await harness.db.closeAsync();
  });

  it('retries an interrupted upload without losing the mutation', async () => {
    const { harness, transport, deps } = await setup();
    const boardId = await createBoardForTest(harness, { title: 'retried board' });
    transport.failUploads = 1;
    const failed = await runSync(deps);
    expect(failed.ok && failed.value.status).toBe('needs_attention');
    expect(transport.uploads).toHaveLength(0);

    const retried = await runSync(deps);
    expect(retried.ok && retried.value.status).toBe('up_to_date');
    const uploadedBoards = transport.uploads
      .flat()
      .filter((record) => record.entityType === 'board');
    expect(uploadedBoards.map((record) => record.entityId)).toContain(boardId);
    await harness.db.closeAsync();
  });

  it('is idempotent when the same mutation uploads twice', async () => {
    const { harness, transport, deps } = await setup();
    await createBoardForTest(harness);
    await runSync(deps);
    const logLength = transport.log.length;
    // replaying the same records adds no change-log entries
    await transport.upload(transport.uploads.flat());
    expect(transport.log).toHaveLength(logLength);
    await harness.db.closeAsync();
  });

  it('syncs archived state and metrics dismissal, never the device-local settings', async () => {
    const { harness, transport, deps } = await setup();
    const boardId = await createBoardForTest(harness, { title: 'archived later' });
    await archiveBoard(harness.deps, { commandId: harness.ids.nextCommandId(), boardId });
    await dismissMetricsEducation(harness.deps, {
      commandId: harness.ids.nextCommandId(),
      boardId,
    });
    await runSync(deps);
    const uploaded = transport.uploads.flat();
    const board = uploaded.filter((record) => record.entityType === 'board').pop();
    expect(board?.fields.archived_at).not.toBeNull();
    const settings = uploaded.find((record) => record.entityType === 'settings');
    expect(settings?.entityId).toBe('app-settings');
    expect(settings?.fields.metrics_education_dismissed).toContain(boardId);
    // selected icon, sync-enabled state, and device id never travel
    const keys = Object.keys(settings?.fields ?? {});
    expect(keys).toEqual(['metrics_education_dismissed']);
    await harness.db.closeAsync();
  });

  it('applies a remote settings record by stamp', async () => {
    const { harness, transport, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    transport.seedRemote({
      schemaVersion: SYNC_SCHEMA_VERSION,
      entityType: 'settings',
      entityId: 'app-settings',
      mutationStamp: '99999999999999-00001-other',
      deleted: false,
      fields: { metrics_education_dismissed: JSON.stringify([boardId]) },
    });
    const result = await runSync(deps);
    expect(result.ok && result.value.applied).toBe(1);
    const dismissed = await getMetricsEducationDismissed(harness.deps);
    expect(dismissed.ok && dismissed.value).toContain(boardId);

    // an older remote settings record loses
    transport.seedRemote({
      schemaVersion: SYNC_SCHEMA_VERSION,
      entityType: 'settings',
      entityId: 'app-settings',
      mutationStamp: '00000000000001-00001-other',
      deleted: false,
      fields: { metrics_education_dismissed: '[]' },
    });
    await runSync(deps);
    const after = await getMetricsEducationDismissed(harness.deps);
    expect(after.ok && after.value).toContain(boardId);
    await harness.db.closeAsync();
  });

  it('backs off with bounded jittered delays', () => {
    expect(retryDelayMs(1, () => 0)).toBe(1000);
    expect(retryDelayMs(1, () => 1)).toBe(2000);
    expect(retryDelayMs(3, () => 0.5)).toBe(6000);
    // the cap holds at five minutes
    expect(retryDelayMs(50, () => 1)).toBe(300000);
    expect(retryDelayMs(0, () => 1)).toBe(2000);
  });
});

describe('sync engine edges', () => {
  it('refuses to sync an uninitialized database', async () => {
    const { harness, deps } = await setup();
    await harness.db.runAsync('DELETE FROM app_settings');
    const result = await runSync(deps);
    expect(!result.ok && result.error.code).toBe('database');
    await harness.db.closeAsync();
  });

  it('consumes an outbox row whose record no longer exists', async () => {
    const { harness, transport, deps } = await setup();
    // a period row hard-deleted behind its outbox entry
    await harness.db.runAsync(
      `INSERT INTO mutation_outbox (entity_type, entity_id, mutation_stamp, created_at)
       VALUES ('activity_period', '99999', '00000000000001-00001-x', 1)`,
    );
    const result = await runSync(deps);
    expect(result.ok && result.value.status).toBe('up_to_date');
    expect(transport.uploads.flat().map((record) => record.entityId)).not.toContain('99999');
    const remaining = await harness.db.getAllAsync('SELECT id FROM mutation_outbox');
    expect(remaining).toHaveLength(0);
    await harness.db.closeAsync();
  });

  it('handles an empty remote page and a fresh token', async () => {
    const { harness, deps } = await setup();
    const result = await runSync(deps);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.value.applied).toBe(0);
    const state = await harness.db.getFirstAsync<{ change_token: string | null }>(
      'SELECT change_token FROM sync_state WHERE id = 1',
    );
    expect(state?.change_token).toBe('0');
    await harness.db.closeAsync();
  });

  it('updates an existing period from a remote record and ignores a malformed id', async () => {
    const { harness, transport, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    await runSync(deps);
    const period = await harness.db.getFirstAsync<{ start_date: string }>(
      'SELECT start_date FROM board_activity_periods WHERE board_id = ?',
      [boardId],
    );
    if (!period) {
      throw new Error('period missing');
    }
    // a remote close of the same period, addressed by boardId|startDate
    transport.seedRemote({
      schemaVersion: SYNC_SCHEMA_VERSION,
      entityType: 'activity_period',
      entityId: periodEntityId(boardId, period.start_date),
      mutationStamp: '99999999999999-00001-other',
      deleted: false,
      fields: {
        board_id: boardId,
        start_date: period.start_date,
        end_date: '2026-08-30',
        deleted_at: null,
      },
    });
    // a malformed period id is skipped rather than corrupting state
    transport.seedRemote({
      schemaVersion: SYNC_SCHEMA_VERSION,
      entityType: 'activity_period',
      entityId: 'no-separator',
      mutationStamp: '99999999999999-00002-other',
      deleted: false,
      fields: { board_id: boardId, start_date: '2026-08-05', end_date: null, deleted_at: null },
    });
    const result = await runSync(deps);
    expect(result.ok && result.value.applied).toBe(1);
    const closed = await harness.db.getFirstAsync<{ end_date: string | null }>(
      'SELECT end_date FROM board_activity_periods WHERE board_id = ?',
      [boardId],
    );
    expect(closed?.end_date).toBe('2026-08-30');
    const count = await harness.db.getAllAsync('SELECT id FROM board_activity_periods');
    expect(count).toHaveLength(1);
    await harness.db.closeAsync();
  });

  it('defaults a malformed remote settings payload to an empty list', async () => {
    const { harness, transport, deps } = await setup();
    transport.seedRemote({
      schemaVersion: SYNC_SCHEMA_VERSION,
      entityType: 'settings',
      entityId: 'app-settings',
      mutationStamp: '99999999999999-00001-other',
      deleted: false,
      fields: { metrics_education_dismissed: 42 },
    });
    const result = await runSync(deps);
    expect(result.ok && result.value.applied).toBe(1);
    const dismissed = await getMetricsEducationDismissed(harness.deps);
    expect(dismissed.ok && dismissed.value).toEqual([]);
    await harness.db.closeAsync();
  });

  it('recovers from a malformed retry state', async () => {
    const { harness, transport, deps } = await setup();
    await createBoardForTest(harness);
    await harness.db.runAsync(
      `INSERT INTO sync_state (id, change_token, zone_created, retry_state, last_success_at)
       VALUES (1, NULL, 0, 'not json', NULL)
       ON CONFLICT (id) DO UPDATE SET retry_state = 'not json'`,
    );
    transport.failNext = new SyncTransportError('offline', 'down');
    const first = await runSync(deps);
    // a malformed counter restarts the backoff at the first attempt
    expect(first.ok && first.value.retryAfterMs).toBe(1500);

    await harness.db.runAsync(`UPDATE sync_state SET retry_state = '{"attempt":"two"}' WHERE id = 1`);
    transport.failNext = new SyncTransportError('offline', 'down');
    const second = await runSync(deps);
    expect(second.ok && second.value.retryAfterMs).toBe(1500);
    await harness.db.closeAsync();
  });

  it('treats absent period fields from an older peer as empty', async () => {
    const { harness, transport, deps } = await setup();
    const boardId = await createBoardForTest(harness);
    await runSync(deps);
    const period = await harness.db.getFirstAsync<{ start_date: string }>(
      'SELECT start_date FROM board_activity_periods WHERE board_id = ?',
      [boardId],
    );
    if (!period) {
      throw new Error('period missing');
    }
    // a peer that omits the optional columns entirely
    transport.seedRemote({
      schemaVersion: SYNC_SCHEMA_VERSION,
      entityType: 'activity_period',
      entityId: periodEntityId(boardId, period.start_date),
      mutationStamp: '99999999999999-00009-other',
      deleted: false,
      fields: { board_id: boardId, start_date: period.start_date },
    });
    const result = await runSync(deps);
    expect(result.ok && result.value.applied).toBe(1);
    const row = await harness.db.getFirstAsync<{ end_date: string | null; deleted_at: number | null }>(
      'SELECT end_date, deleted_at FROM board_activity_periods WHERE board_id = ?',
      [boardId],
    );
    expect(row?.end_date).toBeNull();
    expect(row?.deleted_at).toBeNull();
    await harness.db.closeAsync();
  });

  it('summarizes sync state for the settings surface', async () => {
    const { harness, deps } = await setup();
    await createBoardForTest(harness);
    const before = await getSyncSummary(harness.deps);
    if (!before.ok) {
      throw new Error('summary failed');
    }
    expect(before.value.enabled).toBe(true);
    expect(before.value.pendingChanges).toBeGreaterThan(0);
    expect(before.value.lastSuccessAtUtc).toBeNull();

    await runSync(deps);
    const after = await getSyncSummary(harness.deps);
    if (!after.ok) {
      throw new Error('summary failed');
    }
    expect(after.value.pendingChanges).toBe(0);
    expect(after.value.lastSuccessAtUtc).toBe(harness.clock.nowUtcMs());
    await harness.db.closeAsync();
  });

  it('reads an empty outbox count and a missing settings row defensively', async () => {
    const { getSyncSummary: actual } = jest.requireActual<
      typeof import('@/core/domain/queries')
    >('@/core/domain/queries');
    const stubDb = {
      withTransactionAsync: async <T,>(work: (tx: unknown) => Promise<T>) =>
        work({
          getFirstAsync: async (sql: string) =>
            sql.includes('sync_state') || sql.includes('app_settings') ? null : null,
        }),
    };
    const result = await actual(
      { db: stubDb as never, clock: { nowUtcMs: () => 0, timeZoneId: () => 'UTC' } },
    );
    if (!result.ok) {
      throw new Error('summary failed');
    }
    expect(result.value).toEqual({
      enabled: false,
      pendingChanges: 0,
      lastSuccessAtUtc: null,
    });
  });

  it('parses and rejects period entity ids', () => {
    const { parsePeriodEntityId } = jest.requireActual<
      typeof import('@/core/sync/records')
    >('@/core/sync/records');
    expect(parsePeriodEntityId('board|2026-08-01')).toEqual({
      boardId: 'board',
      startDate: '2026-08-01',
    });
    expect(parsePeriodEntityId('nopipe')).toBeNull();
    expect(parsePeriodEntityId('|leading')).toBeNull();
    expect(parsePeriodEntityId('trailing|')).toBeNull();
  });
});
