import type { Clock } from '../domain/ports';
import type { DomainResult } from '../domain/result';
import { err, ok } from '../domain/result';
import type { SqlDatabase, SqlExecutor } from '../persistence/database';
import { rebuildWidgetRows } from '../persistence/projections/widget-rows';
import {
  deleteDeferredRecord,
  deleteOutboxRows,
  getSettings,
  getSyncState,
  listDeferredRecords,
  listOutbox,
  readRawRow,
  saveDeferredRecord,
  saveHlc,
  saveSyncState,
} from '../persistence/repositories/support';
import { observe } from './hybrid-clock';
import {
  SETTINGS_ENTITY_ID,
  parsePeriodEntityId,
  periodEntityId,
  specFor,
  toSyncRecord,
} from './records';
import type { FetchPage, SyncRecord, SyncTransport } from './transport';
import { SyncTransportError } from './transport';

export type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'up_to_date'
  | 'offline'
  | 'signed_out'
  | 'needs_attention';

export type SyncOutcome = {
  status: SyncStatus;
  uploaded: number;
  applied: number;
  // retry delay in ms when the run failed and another attempt is worth it
  retryAfterMs: number | null;
};

export type SyncDeps = {
  db: SqlDatabase;
  clock: Clock;
  transport: SyncTransport;
  // deterministic in tests; Math.random in the app
  random: () => number;
};

// bounded exponential backoff with jitter; retries never block local
// commands because the engine only ever runs outside them
const BASE_RETRY_MS = 2_000;
const MAX_RETRY_MS = 5 * 60_000;
const UPLOAD_BATCH = 200;

export function retryDelayMs(attempt: number, random: () => number): number {
  const capped = Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** Math.max(0, attempt - 1));
  // full jitter keeps a fleet of devices from retrying in lockstep
  return Math.round(capped * (0.5 + random() * 0.5));
}

type RetryState = { attempt: number };

function readRetry(raw: string | null): RetryState {
  if (raw === null) {
    return { attempt: 0 };
  }
  try {
    const parsed = JSON.parse(raw) as { attempt?: number };
    return { attempt: typeof parsed.attempt === 'number' ? parsed.attempt : 0 };
  } catch {
    return { attempt: 0 };
  }
}

function statusForFailure(cause: unknown): SyncStatus {
  if (cause instanceof SyncTransportError) {
    if (cause.code === 'offline') {
      return 'offline';
    }
    if (cause.code === 'signed_out') {
      return 'signed_out';
    }
  }
  return 'needs_attention';
}

// --- upload -------------------------------------------------------------------

async function collectUpload(
  tx: SqlExecutor,
): Promise<{ records: SyncRecord[]; outboxIds: number[] }> {
  const rows = await listOutbox(tx, UPLOAD_BATCH);
  const records: SyncRecord[] = [];
  const outboxIds: number[] = [];
  for (const row of rows) {
    outboxIds.push(row.id);
    const spec = specFor(row.entityType);
    // the settings singleton lives at primary key 1; sync addresses it by
    // its stable entity id instead
    const lookupId = row.entityType === 'settings' ? '1' : row.entityId;
    const raw = await readRawRow(tx, spec.table, spec.idColumn, lookupId);
    if (!raw) {
      // the row vanished (a hard-deleted period id); nothing to upload but
      // the outbox entry is still consumed
      continue;
    }
    const entityId =
      row.entityType === 'activity_period'
        ? periodEntityId(String(raw.board_id), String(raw.start_date))
        : row.entityType === 'settings'
          ? SETTINGS_ENTITY_ID
          : row.entityId;
    records.push(toSyncRecord(row.entityType, entityId, row.mutationStamp, raw));
  }
  return { records, outboxIds };
}

// --- apply --------------------------------------------------------------------

async function localStampFor(
  tx: SqlExecutor,
  record: SyncRecord,
): Promise<{ exists: boolean; stamp: string | null; localId: string | null }> {
  if (record.entityType === 'settings') {
    const row = await tx.getFirstAsync<{ mutation_stamp: string | null }>(
      'SELECT settings_mutation_stamp AS mutation_stamp FROM app_settings WHERE id = 1',
    );
    return { exists: row !== null, stamp: row?.mutation_stamp ?? null, localId: '1' };
  }
  if (record.entityType === 'activity_period') {
    const parsed = parsePeriodEntityId(record.entityId);
    if (!parsed) {
      return { exists: false, stamp: null, localId: null };
    }
    const row = await tx.getFirstAsync<{ id: number; mutation_stamp: string }>(
      'SELECT id, mutation_stamp FROM board_activity_periods WHERE board_id = ? AND start_date = ?',
      [parsed.boardId, parsed.startDate],
    );
    return {
      exists: row !== null && row !== undefined,
      stamp: row?.mutation_stamp ?? null,
      localId: row ? String(row.id) : null,
    };
  }
  const spec = specFor(record.entityType);
  const row = await tx.getFirstAsync<{ mutation_stamp: string }>(
    `SELECT mutation_stamp FROM ${spec.table} WHERE ${spec.idColumn} = ?`,
    [record.entityId],
  );
  return {
    exists: row !== null && row !== undefined,
    stamp: row?.mutation_stamp ?? null,
    localId: row ? record.entityId : null,
  };
}

async function applyRecord(tx: SqlExecutor, record: SyncRecord): Promise<boolean> {
  const local = await localStampFor(tx, record);
  // whole-record last-writer-wins on the lexicographic stamp; equal stamps
  // are the same mutation and need no write
  if (local.exists && local.stamp !== null && local.stamp >= record.mutationStamp) {
    return false;
  }

  if (record.entityType === 'settings') {
    await tx.runAsync(
      'UPDATE app_settings SET metrics_education_dismissed = ?, settings_mutation_stamp = ? WHERE id = 1',
      [
        typeof record.fields.metrics_education_dismissed === 'string'
          ? record.fields.metrics_education_dismissed
          : '[]',
        record.mutationStamp,
      ],
    );
    return true;
  }

  const spec = specFor(record.entityType);
  const columns = spec.columns.filter((column) => column !== spec.idColumn);
  const values = columns.map((column) => record.fields[column] ?? null);

  if (record.entityType === 'activity_period') {
    const parsed = parsePeriodEntityId(record.entityId);
    if (!parsed) {
      return false;
    }
    if (local.exists) {
      await tx.runAsync(
        `UPDATE board_activity_periods SET end_date = ?, deleted_at = ?, mutation_stamp = ?
         WHERE id = ?`,
        [record.fields.end_date ?? null, record.fields.deleted_at ?? null, record.mutationStamp, local.localId],
      );
      return true;
    }
    await tx.runAsync(
      `INSERT INTO board_activity_periods (board_id, start_date, end_date, mutation_stamp, deleted_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        parsed.boardId,
        parsed.startDate,
        record.fields.end_date ?? null,
        record.mutationStamp,
        record.fields.deleted_at ?? null,
      ],
    );
    return true;
  }

  if (local.exists) {
    const assignments = columns.map((column) => `${column} = ?`).join(', ');
    await tx.runAsync(
      `UPDATE ${spec.table} SET ${assignments}, mutation_stamp = ? WHERE ${spec.idColumn} = ?`,
      [...values, record.mutationStamp, record.entityId],
    );
    return true;
  }

  const insertColumns = [spec.idColumn, ...columns, 'mutation_stamp'];
  const placeholders = insertColumns.map(() => '?').join(', ');
  await tx.runAsync(
    `INSERT INTO ${spec.table} (${insertColumns.join(', ')}) VALUES (${placeholders})`,
    [record.entityId, ...values, record.mutationStamp],
  );
  return true;
}

// a remote record can only be applied once its board exists locally, so
// dependents wait for their parent within the same commit
function applyOrder(records: SyncRecord[]): SyncRecord[] {
  const weight: Record<SyncRecord['entityType'], number> = {
    board: 0,
    activity_period: 1,
    check_in: 2,
    reminder: 3,
    settings: 4,
  };
  return [...records].sort((a, b) => weight[a.entityType] - weight[b.entityType]);
}

// a fetched record can arrive before its parent board. applying it would
// violate the foreign key and roll back the whole page, and because the
// change token never advances that page would fail forever. the record
// waits in sync_deferred instead and is retried on every later pass.
async function applyWithDeferral(
  tx: SqlExecutor,
  record: SyncRecord,
  now: number,
): Promise<boolean> {
  try {
    const applied = await applyRecord(tx, record);
    await deleteDeferredRecord(tx, record.entityType, record.entityId);
    return applied;
  } catch {
    await saveDeferredRecord(tx, {
      entityType: record.entityType,
      entityId: record.entityId,
      mutationStamp: record.mutationStamp,
      payload: JSON.stringify(record),
      firstSeenAt: now,
    });
    return false;
  }
}

// deferred records are retried after each page, so a parent that arrived
// either earlier or in that same page unblocks its dependents
async function drainDeferred(tx: SqlExecutor, now: number): Promise<number> {
  let applied = 0;
  for (const row of await listDeferredRecords(tx)) {
    let record: SyncRecord;
    try {
      record = JSON.parse(row.payload) as SyncRecord;
    } catch {
      // an unreadable payload can never be applied; drop it rather than
      // retrying it on every pass forever
      await deleteDeferredRecord(tx, row.entityType, row.entityId);
      continue;
    }
    if (await applyWithDeferral(tx, record, now)) {
      applied += 1;
    }
  }
  return applied;
}

// --- run ----------------------------------------------------------------------

// one sync pass: upload the outbox, then drain remote pages. the change
// token is persisted only after every fetched record in that page commits.
export function runSync(deps: SyncDeps): Promise<DomainResult<SyncOutcome>> {
  return (async () => {
    const now = deps.clock.nowUtcMs();
    const timeZoneId = deps.clock.timeZoneId();

    const preflight = await deps.db.withTransactionAsync(async (tx) => {
      const settings = await getSettings(tx);
      const state = await getSyncState(tx);
      return { settings, state };
    });
    if (!preflight.settings) {
      return err('database', 'The database is not initialized.');
    }
    if (!preflight.settings.iCloudSyncEnabled) {
      return ok({ status: 'idle' as SyncStatus, uploaded: 0, applied: 0, retryAfterMs: null });
    }

    const retry = readRetry(preflight.state.retryState);
    let uploaded = 0;
    let applied = 0;

    try {
      if (!preflight.state.zoneCreated) {
        await deps.transport.ensureZone();
        await deps.db.withExclusiveTransactionAsync(async (tx) => {
          await saveSyncState(tx, { ...(await getSyncState(tx)), zoneCreated: true });
        });
      }

      // upload in batches until the outbox drains; each batch clears only
      // its own rows, so an interrupted run never loses a mutation
      for (;;) {
        const batch = await deps.db.withTransactionAsync((tx) => collectUpload(tx));
        if (batch.outboxIds.length === 0) {
          break;
        }
        if (batch.records.length > 0) {
          await deps.transport.upload(batch.records);
          uploaded += batch.records.length;
        }
        await deps.db.withExclusiveTransactionAsync(async (tx) => {
          await deleteOutboxRows(tx, batch.outboxIds);
        });
      }

      let token = preflight.state.changeToken;
      for (;;) {
        const page: FetchPage = await deps.transport.fetchChanges(token);
        if (page.records.length > 0) {
          const committed = await deps.db.withExclusiveTransactionAsync(async (tx) => {
            // the preflight proved the settings row exists
            const settings = (await getSettings(tx)) as NonNullable<
              Awaited<ReturnType<typeof getSettings>>
            >;
            let hlc = { wallTime: settings.hlcWallTime, counter: settings.hlcCounter };
            let count = 0;
            for (const record of applyOrder(page.records)) {
              // the local clock observes every remote stamp, so later local
              // mutations sort after everything already seen
              hlc = observe(hlc, record.mutationStamp);
              if (await applyWithDeferral(tx, record, now)) {
                count += 1;
              }
            }
            // draining after the page lets a parent that arrived in this
            // very page unblock the dependents waiting on it
            count += await drainDeferred(tx, now);
            await saveHlc(tx, hlc);
            await rebuildWidgetRows(tx, now, timeZoneId);
            // the token lands in the same commit as its records
            await saveSyncState(tx, {
              ...(await getSyncState(tx)),
              changeToken: page.nextToken,
            });
            return count;
          });
          applied += committed;
        } else {
          // an empty page still gives deferred records a chance, and its
          // token still advances
          const drained = await deps.db.withExclusiveTransactionAsync(async (tx) => {
            const count = await drainDeferred(tx, now);
            if (count > 0) {
              await rebuildWidgetRows(tx, now, timeZoneId);
            }
            await saveSyncState(tx, { ...(await getSyncState(tx)), changeToken: page.nextToken });
            return count;
          });
          applied += drained;
        }
        token = page.nextToken;
        if (!page.more) {
          break;
        }
      }

      await deps.db.withExclusiveTransactionAsync(async (tx) => {
        await saveSyncState(tx, {
          ...(await getSyncState(tx)),
          retryState: null,
          lastSuccessAtUtc: now,
        });
      });
      return ok({ status: 'up_to_date' as SyncStatus, uploaded, applied, retryAfterMs: null });
    } catch (cause) {
      const attempt = retry.attempt + 1;
      const retryAfterMs = retryDelayMs(attempt, deps.random);
      await deps.db.withExclusiveTransactionAsync(async (tx) => {
        await saveSyncState(tx, {
          ...(await getSyncState(tx)),
          retryState: JSON.stringify({ attempt }),
        });
      });
      // raw provider errors and account data never reach the ui or logs
      return ok({ status: statusForFailure(cause), uploaded, applied, retryAfterMs });
    }
  })();
}
