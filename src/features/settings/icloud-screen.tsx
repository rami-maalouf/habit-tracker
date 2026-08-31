import { Stack } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { semanticColor, spacing } from '@/theme';

import { useScheme } from '../ui';
import { SettingsGroup, SettingsRow } from './rows';

// icloud sync ships with the sync stage and additionally needs the signed
// apple developer team; the state stays explicit instead of a dead toggle
export function ICloudScreen() {
  const scheme = useScheme();
  return (
    <View style={{ flex: 1, backgroundColor: semanticColor('groupedBackground', scheme) }}>
      <Stack.Screen options={{ title: 'iCloud Sync' }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      >
        <SettingsGroup>
          <SettingsRow title="iCloud Sync" detail="Not available yet" testID="icloud-status" />
        </SettingsGroup>
        <AppText variant="footnote" testID="icloud-interim">
          Sync across devices arrives with the sync update. It also requires the app to be built
          with an Apple Developer team, which this build does not have yet. Your data stays on
          this device; use Export Data for a portable copy.
        </AppText>
      </ScrollView>
    </View>
  );
}
