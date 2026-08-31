// provider-neutral sync records and the transport port a CloudKit (or
// fake) adapter implements. records never carry receipts, outbox rows,
// device ids, widget rows, schedule identifiers, or link configuration.

export type SyncEntityType = 'board' | 'activity_period' | 'check_in' | 'reminder' | 'settings';

export type SyncRecord = {
  schemaVersion: number;
  entityType: SyncEntityType;
  // stable uuid, except activity periods which use `boardId|startDate`
  // (their local integer ids never leave the device) and settings which
  // uses the fixed id `app-settings`
  entityId: string;
  mutationStamp: string;
  deleted: boolean;
  // snake_case column data; tombstones strip user content and keep only
  // structural linkage and timestamps
  fields: Record<string, string | number | null>;
};

export type FetchPage = {
  records: SyncRecord[];
  nextToken: string | null;
  more: boolean;
};

export type SyncFailureCode = 'offline' | 'signed_out' | 'unavailable' | 'failure';

export class SyncTransportError extends Error {
  readonly code: SyncFailureCode;

  constructor(code: SyncFailureCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface SyncTransport {
  // creates the custom private zone when missing; idempotent
  ensureZone(): Promise<void>;
  // idempotent by (entityId, mutationStamp); re-uploading is safe
  upload(records: SyncRecord[]): Promise<void>;
  fetchChanges(token: string | null): Promise<FetchPage>;
}
