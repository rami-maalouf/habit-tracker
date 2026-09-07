import type { FetchPage, SyncFailureCode, SyncRecord, SyncTransport } from '@/core/sync/transport';
import { SyncTransportError } from '@/core/sync/transport';

import nativeModule from './cloudkit-native';

const MESSAGES: Record<SyncFailureCode, string> = {
  offline: 'iCloud sync will try again when the connection returns.',
  signed_out: 'Sign in to iCloud in Settings to sync your data.',
  unavailable: 'iCloud sync is unavailable in this build or account.',
  failure: 'iCloud sync could not finish. Try again.',
};

function transportError(code: SyncFailureCode): SyncTransportError {
  return new SyncTransportError(code, MESSAGES[code]);
}

function requireTransport() {
  if (
    typeof nativeModule?.cloudKitAvailable !== 'function' ||
    typeof nativeModule.cloudKitEnsureZone !== 'function' ||
    typeof nativeModule.cloudKitUpload !== 'function' ||
    typeof nativeModule.cloudKitFetchChanges !== 'function'
  ) {
    throw transportError('unavailable');
  }
  return nativeModule as Required<NonNullable<typeof nativeModule>>;
}

async function callNative<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? error.code
      : null;
    throw transportError(
      code === 'offline' || code === 'signed_out' || code === 'unavailable' ? code : 'failure',
    );
  }
}

export async function cloudKitAvailable(): Promise<boolean> {
  try {
    return (await requireTransport().cloudKitAvailable()) === true;
  } catch {
    return false;
  }
}

function isSyncRecord(value: unknown): value is SyncRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<SyncRecord>;
  return record.schemaVersion === 1 &&
    ['board', 'activity_period', 'check_in', 'reminder', 'settings'].includes(record.entityType ?? '') &&
    typeof record.entityId === 'string' && record.entityId.length > 0 &&
    typeof record.mutationStamp === 'string' && record.mutationStamp.length > 0 &&
    typeof record.deleted === 'boolean' &&
    typeof record.fields === 'object' && record.fields !== null && !Array.isArray(record.fields) &&
    Object.values(record.fields).every((field) => field === null || typeof field === 'string' ||
      (typeof field === 'number' && Number.isFinite(field)));
}

function decodePage(json: string, previousToken: string | null): FetchPage {
  const page: unknown = JSON.parse(json);
  if (typeof page !== 'object' || page === null) throw transportError('failure');
  const value = page as Partial<FetchPage>;
  if (
    !Array.isArray(value.records) || !value.records.every(isSyncRecord) ||
    (value.nextToken !== null && typeof value.nextToken !== 'string') ||
    typeof value.more !== 'boolean' ||
    (value.more && (value.nextToken === null || value.nextToken === previousToken))
  ) {
    throw transportError('failure');
  }
  return value as FetchPage;
}

export const cloudKitTransport: SyncTransport = {
  async ensureZone(): Promise<void> {
    await callNative(() => requireTransport().cloudKitEnsureZone());
  },
  async upload(records: SyncRecord[]): Promise<void> {
    await callNative(() => requireTransport().cloudKitUpload(JSON.stringify(records)));
  },
  async fetchChanges(token: string | null): Promise<FetchPage> {
    return callNative(async () => decodePage(await requireTransport().cloudKitFetchChanges(token), token));
  },
};

// ios-only feature; android sync is out of scope for this release
export const syncSupportedPlatform = true;
