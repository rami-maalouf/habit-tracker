// android-readiness interfaces and android-safe stubs. this release ships
// no kotlin: importing a route on android must never evaluate CloudKit,
// WidgetKit, AppIntents, SwiftUI, or UIKit code, so every ios-only adapter
// resolves here to an explicit unavailable implementation.
import type { ReminderScheduleRequest, ReminderScheduler } from '@/core/domain/ports';
import type { FetchPage, SyncRecord, SyncTransport } from '@/core/sync/transport';
import { SyncTransportError } from '@/core/sync/transport';
import type { WidgetRowProps } from '@/features/widgets/widget-props';

export type AdapterAvailability = {
  available: false;
  // the future native implementation named in the spec
  plannedImplementation: string;
};

// AndroidReminderAdapter maps the same reminder model to android
// notification permission, channels, alarms, and rescheduling without
// changing any core record. until that kotlin lands, enabling a reminder
// reports denied rather than pretending to schedule.
export const androidReminderAdapter: ReminderScheduler & { readiness: AdapterAvailability } = {
  readiness: {
    available: false,
    plannedImplementation: 'AndroidReminderAdapter (notification channels + AlarmManager)',
  },
  async authorization() {
    return 'denied';
  },
  async requestAuthorization() {
    return 'denied';
  },
  async remainingCapacity() {
    return 0;
  },
  async pendingIdentifiers() {
    return [];
  },
  async schedule(_request: ReminderScheduleRequest): Promise<string> {
    throw new Error('Reminders are not scheduled on Android in this release.');
  },
  async cancel(_identifiers: string[]): Promise<void> {
    // nothing was ever scheduled, so cancelling is a no-op rather than a
    // failure: the reconciler must stay quiet on android
  },
};

// Android Glance consumes the very same widget projection and command
// contract. Glance is kotlin-native and remains a future implementation,
// never an Expo widget fallback.
export type AndroidWidgetAdapter = {
  readiness: AdapterAvailability;
  // the projection rows Glance would render, unchanged from ios
  render(rows: WidgetRowProps[]): { rowCount: number };
  quickCheckIn(boardId: string): Promise<never>;
};

export const androidWidgetAdapter: AndroidWidgetAdapter = {
  readiness: {
    available: false,
    plannedImplementation: 'Android Glance AppWidget over widget_board_rows',
  },
  render(rows) {
    return { rowCount: rows.length };
  },
  async quickCheckIn(_boardId: string): Promise<never> {
    throw new Error('Android widget actions are not implemented in this release.');
  },
};

// Android App Actions maps shortcuts.xml capabilities and deep-link or
// activity fulfillment to the same shared commands.
export type AndroidAutomationAdapter = {
  readiness: AdapterAvailability;
  // the capability ids shortcuts.xml would declare, one per shared command
  capabilities: readonly string[];
};

export const androidAutomationAdapter: AndroidAutomationAdapter = {
  readiness: {
    available: false,
    plannedImplementation: 'shortcuts.xml capabilities + deep-link fulfillment',
  },
  capabilities: ['actions.intent.CHECK_IN', 'actions.intent.REMOVE_CHECK_IN', 'actions.intent.GET_CHECK_INS'],
};

export const androidSyncTransport: SyncTransport & { readiness: AdapterAvailability } = {
  readiness: { available: false, plannedImplementation: 'not in this release (iOS-first)' },
  async ensureZone(): Promise<void> {
    throw new SyncTransportError('unavailable', 'Sync is iOS-only in this release.');
  },
  async upload(_records: SyncRecord[]): Promise<void> {
    throw new SyncTransportError('unavailable', 'Sync is iOS-only in this release.');
  },
  async fetchChanges(_token: string | null): Promise<FetchPage> {
    throw new SyncTransportError('unavailable', 'Sync is iOS-only in this release.');
  },
};
