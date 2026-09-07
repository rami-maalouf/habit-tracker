import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, ScrollView, Switch, View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { setICloudSyncEnabled } from '@/core/domain/commands';
import { getSyncSummary } from '@/core/domain/queries';
import type { SyncStatus } from '@/core/sync/engine';
import { cloudKitAvailable } from '@/platform/sync';
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
  const { core, invalidate, nextCommandId, sync: syncState, syncNow, pauseSync, resumeSync } = useProduct();
  const summary = useProductQuery((c) => getSyncSummary(c), []);
  const { status, busy } = syncState;
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void cloudKitAvailable().then(
        (value) => { if (!cancelled) setAvailable(value); },
        () => { if (!cancelled) setAvailable(false); },
      );
    };
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => { cancelled = true; subscription.remove(); };
  }, [status]);
  const ready = summary.status === 'ready' ? summary.value : null;
  const enabled = ready !== null && ready.enabled;

  const setEnabled = useCallback(
    (next: boolean) => {
      const apply = () => {
        setError(null);
        if (!next) {
          // stop before the write, so nothing in flight can outlive the
          // moment the person turned sync off
          pauseSync();
        }
        void setICloudSyncEnabled(core, { commandId: nextCommandId(), enabled: next }).then(
          (result) => {
            if (!result.ok) {
              setError(result.error.message);
              if (!next) resumeSync();
              return;
            }
            invalidate();
            if (next) resumeSync();

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
    [core, invalidate, nextCommandId, pauseSync, resumeSync],
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
            detail={enabled ? STATUS_LABELS[status] : 'Off'}
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
            onPress={syncNow}
            disabled={busy}
            testID="icloud-sync-now"
          />
        ) : null}

        {error || syncState.error ? <InlineError message={error ?? syncState.error!} testID="icloud-error" /> : null}

        {available === false || status === 'needs_attention' ? (
          <AppText variant="footnote" testID="icloud-unavailable">
            iCloud is unavailable on this device right now. Your changes stay queued, and Export
            Data always gives you a portable copy.
            {' '}If you changed iCloud accounts, sign back into the account originally used for
            sync on this device.
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
