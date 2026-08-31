import { androidSyncTransport } from '@/platform/android/adapters';
import type { SyncTransport } from '@/core/sync/transport';

// android-safe entry: the ios CloudKit boundary lives in index.ios.ts, so a
// route imported on android never evaluates it. sync itself is ios-only in
// this release (see docs/android-readiness.md).
export const cloudKitAvailable = false;

export const cloudKitTransport: SyncTransport = androidSyncTransport;

export const syncSupportedPlatform = false;
