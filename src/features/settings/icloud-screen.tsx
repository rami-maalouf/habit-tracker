import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, Switch, View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { setICloudSyncEnabled } from '@/core/domain/commands';
import { getSyncSummary } from '@/core/domain/queries';
import type { SyncStatus } from '@/core/sync/engine';
import { runSync } from '@/core/sync/engine';
import { cloudKitAvailable, cloudKitTransport } from '@/platform/sync';
import { radius, radiusCurve, semanticColor, spacing } from '@/theme';

import { InlineError, PrimaryButton, useScheme } from '../ui';
import { useProduct, useProductQuery } from '../product-store';
import { SettingsGroup, SettingsRow } from './rows';

const STATUS_LABELS: Record<SyncStatus, string> = {
  idle: 'Off',
  syncing: 'Syncing…',
  up_to_date: 'Up to Date',
  offline: 'Offline',
  signed_out: 'Signed Out',
  needs_attention: 'Needs Attention',
};

// the toggle explains where the data goes before it turns on, then shows
// the engine's own status. raw provider errors never reach this screen.
export function ICloudScreen() {
  const scheme = useScheme();
  const { core, invalidate, nextCommandId } = useProduct();
  const summary = useProductQuery((c) => getSyncSummary(c), []);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // a generation token: turning sync off invalidates any pass already in
  // flight, so its result never lands and no retry is armed
  const generation = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopSyncWork = useCallback(() => {
    generation.current += 1;
    if (retryTimer.current !== null) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
  }, []);

  useEffect(() => stopSyncWork, [stopSyncWork]);

  const ready = summary.status === 'ready' ? summary.value : null;
  const enabled = ready !== null && ready.enabled;

  const sync = useCallback(
    async function run(): Promise<void> {
      const mine = generation.current;
      setBusy(true);
      setError(null);
      setStatus('syncing');
      const result = await runSync({
        db: core.db,
        clock: core.clock,
        transport: cloudKitTransport,
        random: Math.random,
      });
      if (mine !== generation.current) {
        // sync was turned off while this pass ran; drop its outcome
        return;
      }
      setBusy(false);
      if (!result.ok) {
        setStatus(null);
        setError(result.error.message);
        return;
      }
      setStatus(result.value.status);
      invalidate();
      // a failed pass schedules its own retry with the engine's backoff
      if (result.value.retryAfterMs !== null) {
        retryTimer.current = setTimeout(() => {
          if (mine === generation.current) {
            void run();
          }
        }, result.value.retryAfterMs);
      }
    },
    [core, invalidate],
  );

  const setEnabled = useCallback(
    (next: boolean) => {
      const apply = () => {
        if (!next) {
          // stop before the write, so nothing in flight can outlive the
          // moment the person turned sync off
          stopSyncWork();
        }
        void setICloudSyncEnabled(core, { commandId: nextCommandId(), enabled: next }).then(
          (result) => {
            if (!result.ok) {
              setError(result.error.message);
              // a failed disable leaves sync enabled while the pass it
              // cancelled can no longer clear anything, so the screen has
              // to release its own busy state or Sync Now stays unusable
              setBusy(false);
              return;
            }
            invalidate();
            if (next) {
              void sync();
            } else {
              // disabling suspends network work and keeps every local record
              setStatus(null);
              setBusy(false);
            }
          },
        );
      };
      if (!next) {
        apply();
        return;
      }
      Alert.alert(
        'Turn on iCloud Sync?',
        'Your boards, check-ins, notes, and reminders are stored in your own private iCloud account. Nothing is sent anywhere else.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Turn On', onPress: apply },
        ],
      );
    },
    [core, invalidate, nextCommandId, stopSyncWork, sync],
  );

  const pending = ready === null ? 0 : ready.pendingChanges;
  const lastSuccess = ready === null ? null : ready.lastSuccessAtUtc;

  return (
    <View style={{ flex: 1, backgroundColor: semanticColor('groupedBackground', scheme) }}>
      <Stack.Screen options={{ title: 'iCloud Sync' }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: semanticColor('secondaryGroupedBackground', scheme),
            borderRadius: radius.lg,
            borderCurve: radiusCurve,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
          }}
        >
          <AppText>iCloud Sync</AppText>
          <Switch
            accessibilityLabel="iCloud Sync"
            value={enabled}
            onValueChange={setEnabled}
            testID="icloud-toggle"
          />
        </View>

        <SettingsGroup>
          <SettingsRow
            title="Status"
            detail={status === null ? (enabled ? 'Idle' : 'Off') : STATUS_LABELS[status]}
            testID="icloud-status"
          />
          <SettingsRow title="Waiting to upload" detail={String(pending)} testID="icloud-pending" />
          <SettingsRow
            title="Last sync"
            detail={
              lastSuccess === null
                ? 'Never'
                : new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(lastSuccess))
            }
            testID="icloud-last-sync"
          />
        </SettingsGroup>

        {enabled ? (
          <PrimaryButton
            title={busy ? 'Syncing…' : 'Sync Now'}
            onPress={() => void sync()}
            disabled={busy}
            testID="icloud-sync-now"
          />
        ) : null}

        {error ? <InlineError message={error} testID="icloud-error" /> : null}

        {!cloudKitAvailable ? (
          <AppText variant="footnote" testID="icloud-unavailable">
            This build cannot reach iCloud yet: the CloudKit container needs an app signed with an
            Apple Developer team. Sync stays reported as Needs Attention until then, every local
            change is queued, and Export Data always gives you a portable copy.
          </AppText>
        ) : null}
        <AppText variant="footnote">
          Local use never depends on iCloud. Turning sync off keeps all of your data on this
          device.
        </AppText>
      </ScrollView>
    </View>
  );
}
