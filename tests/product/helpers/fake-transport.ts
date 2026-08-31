import type {
  FetchPage,
  SyncRecord,
  SyncTransport,
} from '@/core/sync/transport';
import { SyncTransportError } from '@/core/sync/transport';

// deterministic in-memory transport: a server-side record store keyed by
// (entityType, entityId) with a monotonic change log, so conflict, retry,
// token, tombstone, and out-of-order delivery tests stay repeatable.
// the store resolves writes the way a converging server must - the greater
// mutation stamp wins - so a client that uploads stale data is caught here
// instead of silently diverging.
export class FakeSyncTransport implements SyncTransport {
  zoneCreated = false;
  uploads: SyncRecord[][] = [];
  // the remote store, last writer wins by mutation stamp
  store = new Map<string, SyncRecord>();
  // uploads the server refused because it already held a greater stamp
  rejectedStaleUploads: SyncRecord[] = [];
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
      if (existing && existing.mutationStamp > record.mutationStamp) {
        // a converging server keeps the greater stamp; the client's stale
        // write is recorded so a test can assert it happened
        this.rejectedStaleUploads.push(record);
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
