import type {
  FetchPage,
  SyncRecord,
  SyncTransport,
} from '@/core/sync/transport';
import { SyncTransportError } from '@/core/sync/transport';

// deterministic in-memory transport: a server-side record store keyed by
// (entityType, entityId) with a monotonic change log, so conflict, retry,
// token, tombstone, and out-of-order delivery tests stay repeatable
export class FakeSyncTransport implements SyncTransport {
  zoneCreated = false;
  uploads: SyncRecord[][] = [];
  // the remote store, last write wins by arrival (the engine decides which
  // record it sends, the server just stores it)
  store = new Map<string, SyncRecord>();
  // ordered change log; tokens are indexes into it
  log: SyncRecord[] = [];
  pageSize = 50;
  failNext: SyncTransportError | null = null;
  failUploads = 0;
  ensureZoneCalls = 0;

  private key(record: { entityType: string; entityId: string }): string {
    return `${record.entityType}:${record.entityId}`;
  }

  // seeds a record as if another device had uploaded it
  seedRemote(record: SyncRecord): void {
    this.store.set(this.key(record), record);
    this.log.push(record);
  }

  async ensureZone(): Promise<void> {
    this.ensureZoneCalls += 1;
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
    this.zoneCreated = true;
  }

  async upload(records: SyncRecord[]): Promise<void> {
    if (this.failUploads > 0) {
      this.failUploads -= 1;
      throw new SyncTransportError('unavailable', 'upload rejected');
    }
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
    this.uploads.push(records);
    for (const record of records) {
      // idempotent by (entityId, mutationStamp): re-uploading the same
      // mutation never duplicates a change-log entry
      const existing = this.store.get(this.key(record));
      if (existing && existing.mutationStamp === record.mutationStamp) {
        continue;
      }
      this.store.set(this.key(record), record);
      this.log.push(record);
    }
  }

  async fetchChanges(token: string | null): Promise<FetchPage> {
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
    const from = token === null ? 0 : Number(token);
    const slice = this.log.slice(from, from + this.pageSize);
    const next = from + slice.length;
    return {
      records: slice,
      nextToken: String(next),
      more: next < this.log.length,
    };
  }
}
