import { Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { semanticColor, spacing } from '@/theme';

import { PrimaryButton, useScheme } from '../ui';
import { SettingsGroup, SettingsRow } from './rows';

type AuthorizationState = 'loading' | 'granted' | 'denied' | 'undetermined';

// current notification authorization; reminder rules arrive with the
// reminders stage and this surface reports readiness honestly until then
export function NotificationsScreen() {
  const scheme = useScheme();
  const [authorization, setAuthorization] = useState<AuthorizationState>('loading');

  useEffect(() => {
    let cancelled = false;
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
    return () => {
      cancelled = true;
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
          <SettingsRow title="Enabled reminders" detail="0" testID="notifications-reminder-count" />
        </SettingsGroup>
        <AppText variant="footnote" testID="notifications-interim">
          Per-board reminders arrive with the reminders update. The app asks for permission the
          first time you enable one.
        </AppText>
        {authorization === 'denied' ? (
          <PrimaryButton
            title="Open Settings"
            onPress={() => void Linking.openSettings()}
            testID="notifications-open-settings"
          />
        ) : null}
      </ScrollView>
    </View>
  );
}
