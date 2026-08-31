import type { FetchPage, SyncRecord, SyncTransport } from '@/core/sync/transport';
import { SyncTransportError } from '@/core/sync/transport';

// the CloudKit transport is the one remaining native adapter: CKSyncEngine
// lives behind a local Expo module that Expo SDK 57 does not ship, and the
// container entitlement needs a signed Apple Developer team this build does
// not have. until that lands the adapter reports itself unavailable rather
// than pretending to sync, and the engine surfaces `needs_attention`.
export const cloudKitAvailable = false;

const unavailable = () =>
  new SyncTransportError(
    'unavailable',
    'iCloud sync needs a signed build with the CloudKit container.',
  );

export const cloudKitTransport: SyncTransport = {
  async ensureZone(): Promise<void> {
    throw unavailable();
  },
  async upload(_records: SyncRecord[]): Promise<void> {
    throw unavailable();
  },
  async fetchChanges(_token: string | null): Promise<FetchPage> {
    throw unavailable();
  },
};

// ios-only feature; android sync is out of scope for this release
export const syncSupportedPlatform = true;
