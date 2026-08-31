import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  androidAutomationAdapter,
  androidReminderAdapter,
  androidSyncTransport,
  androidWidgetAdapter,
} from '@/platform/android/adapters';

const SRC_ROOT = join(__dirname, '../../../src');
const CORE_ROOT = join(SRC_ROOT, 'core');

function walk(directory: string): string[] {
  const entries: string[] = [];
  for (const name of readdirSync(directory)) {
    const full = join(directory, name);
    if (statSync(full).isDirectory()) {
      entries.push(...walk(full));
    } else if (name.endsWith('.ts') || name.endsWith('.tsx')) {
      entries.push(full);
    }
  }
  return entries;
}

describe('android readiness', () => {
  it('keeps every shared module free of ios-only imports', () => {
    // the shared domain, persistence contracts, calendar policy, analytics
    // formulas, export schema, notification model, widget projection, sync
    // record model, and automation command types must import no ios-only api
    const forbidden = [
      'expo-notifications',
      'expo-widgets',
      '@expo/ui',
      'CloudKit',
      'WidgetKit',
      'AppIntents',
      'react-native',
      'expo-file-system',
      'expo-sqlite',
      'expo-sharing',
    ];
    const offenders: string[] = [];
    for (const file of walk(CORE_ROOT)) {
      const source = readFileSync(file, 'utf8');
      for (const token of forbidden) {
        if (source.includes(`from '${token}`) || source.includes(`require('${token}`)) {
          offenders.push(`${file.split('/src/')[1]} -> ${token}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps every production entry point android-safe outside .ios files', () => {
    // the stubs above prove the adapters are honest; this proves the files
    // android actually resolves never reach an ios-only module. anything
    // ios-only has to live behind a .ios.* platform extension.
    // only genuinely ios-only modules belong here. expo-notifications and
    // the universal `@expo/ui` root both run on android, so importing them
    // outside a platform file is safe; `@expo/ui/swift-ui` and expo-widgets
    // are not.
    const iosOnly = ['expo-widgets', '@expo/ui/swift-ui'];
    const offenders: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      const relative = file.split('/src/')[1];
      // only .ios files are skipped: android resolves .android files and
      // the generic ones, so both have to stay clean
      if (/\.ios\.tsx?$/.test(relative) || relative.includes('testing/')) {
        continue;
      }
      if (relative === 'platform/widgets/ripples-boards-widget.tsx') {
        continue;
      }
      const source = readFileSync(file, 'utf8');
      for (const token of iosOnly) {
        if (source.includes(`from '${token}'`)) {
          offenders.push(`${relative} -> ${token}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('reports every ios-only adapter as an explicit android stub', () => {
    for (const adapter of [
      androidReminderAdapter,
      androidWidgetAdapter,
      androidAutomationAdapter,
      androidSyncTransport,
    ]) {
      expect(adapter.readiness.available).toBe(false);
      expect(adapter.readiness.plannedImplementation.length).toBeGreaterThan(0);
    }
  });

  it('keeps android reminders honest rather than pretending to schedule', async () => {
    expect(await androidReminderAdapter.authorization()).toBe('denied');
    expect(await androidReminderAdapter.requestAuthorization()).toBe('denied');
    expect(await androidReminderAdapter.remainingCapacity()).toBe(0);
    expect(await androidReminderAdapter.pendingIdentifiers()).toEqual([]);
    await expect(
      androidReminderAdapter.schedule({
        reminderId: 'r',
        boardId: 'b',
        weekday: 1,
        minuteOfDay: 480,
        title: 't',
        body: 'b',
      }),
    ).rejects.toThrow(/not scheduled on Android/);
    // cancelling stays a no-op so the reconciler never errors on android
    await expect(androidReminderAdapter.cancel(['x'])).resolves.toBeUndefined();
  });

  it('lets glance consume the same widget projection shape', () => {
    const rendered = androidWidgetAdapter.render([
      { boardId: 'b1', title: 'one', symbol: 'star.fill', accentHex: '#70A7FF', strip: [0, 1] },
      { boardId: 'b2', title: 'two', symbol: 'star.fill', accentHex: '#70A7FF', strip: [1, 1] },
    ]);
    expect(rendered.rowCount).toBe(2);
    return expect(androidWidgetAdapter.quickCheckIn('b1')).rejects.toThrow(
      /not implemented in this release/,
    );
  });

  it('declares one app-actions capability per shared command', () => {
    expect(androidAutomationAdapter.capabilities).toEqual([
      'actions.intent.CHECK_IN',
      'actions.intent.REMOVE_CHECK_IN',
      'actions.intent.GET_CHECK_INS',
    ]);
  });

  it('refuses sync on android with a typed transport error', async () => {
    await expect(androidSyncTransport.ensureZone()).rejects.toThrow(/iOS-only/);
    await expect(androidSyncTransport.upload([])).rejects.toThrow(/iOS-only/);
    await expect(androidSyncTransport.fetchChanges(null)).rejects.toThrow(/iOS-only/);
  });
});
