import { Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { AppState, Linking, ScrollView, View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { getNotificationOverview } from '@/core/domain/queries';
import { semanticColor, spacing } from '@/theme';

import { InlineError, PrimaryButton, useScheme } from '../ui';
import { useProductQuery } from '../product-store';
import { SettingsGroup, SettingsRow } from './rows';

type AuthorizationState = 'loading' | 'granted' | 'denied' | 'undetermined';

function errorLabel(code: string): string {
  if (code === 'capacity_exceeded') {
    return 'Too many scheduled notifications on this device.';
  }
  if (code === 'schedule_failed') {
    return 'The system rejected the schedule. It retries automatically.';
  }
  return 'The schedule could not be created.';
}

// current authorization, enabled reminder count, and schedule errors, with
// the settings path when permission was denied
export function NotificationsScreen() {
  const scheme = useScheme();
  const [authorization, setAuthorization] = useState<AuthorizationState>('loading');
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const overview = useProductQuery((c) => getNotificationOverview(c), []);

  // the status re-reads on every return to the foreground, so coming back
  // from the system settings app shows the fresh authorization
  useEffect(() => {
    let cancelled = false;
    const read = () => {
      Notifications.getPermissionsAsync().then(
        (permissions) => {
          if (cancelled) {
            return;
          }
          setAuthorization(
            permissions.granted
              ? 'granted'
              : permissions.canAskAgain
                ? 'undetermined'
                : 'denied',
          );
        },
        () => {
          if (!cancelled) {
            setAuthorization('undetermined');
          }
        },
      );
    };
    read();
    const subscription = AppState.addEventListener('change', (appState) => {
      if (appState === 'active') {
        read();
      }
    });
    return () => {
      cancelled = true;
      subscription?.remove?.();
    };
  }, []);

  const statusLabel =
    authorization === 'loading'
      ? 'Checking…'
      : authorization === 'granted'
        ? 'Allowed'
        : authorization === 'denied'
          ? 'Denied'
          : 'Not requested yet';

  return (
    <View style={{ flex: 1, backgroundColor: semanticColor('groupedBackground', scheme) }}>
      <Stack.Screen options={{ title: 'Notifications' }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      >
        <SettingsGroup>
          <SettingsRow title="Notification permission" detail={statusLabel} testID="notifications-status" />
          <SettingsRow
            title="Enabled reminders"
            detail={overview.status === 'ready' ? String(overview.value.enabledReminderCount) : '…'}
            testID="notifications-reminder-count"
          />
        </SettingsGroup>
        {overview.status === 'ready' && overview.value.scheduleErrors.length > 0 ? (
          <View style={{ gap: spacing.sm }} testID="notifications-schedule-errors">
            {overview.value.scheduleErrors.map((entry) => (
              <InlineError
                key={entry.reminderId}
                message={`${entry.boardTitle}: ${errorLabel(entry.code)}`}
              />
            ))}
          </View>
        ) : null}
        <AppText variant="footnote">
          The app asks for permission the first time you enable a reminder. Reminders stay on
          this device.
        </AppText>
        {settingsError ? (
          <InlineError message={settingsError} testID="notifications-settings-error" />
        ) : null}
        {authorization === 'denied' ? (
          <PrimaryButton
            title="Open Settings"
            onPress={() => {
              setSettingsError(null);
              Linking.openSettings().catch(() => {
                setSettingsError('Settings could not be opened. Open the Settings app manually.');
              });
            }}
            testID="notifications-open-settings"
          />
        ) : null}
      </ScrollView>
    </View>
  );
}
