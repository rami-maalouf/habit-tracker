import { Stack, useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { radius, radiusCurve, semanticColor, spacing } from '@/theme';

import { ProductPressable, useScheme } from '../ui';

// interim settings surface: archived boards are reachable here today; the
// remaining grouped sections arrive with the settings stage
export function SettingsScreen() {
  const router = useRouter();
  const scheme = useScheme();

  return (
    <View style={{ flex: 1, backgroundColor: semanticColor('groupedBackground', scheme) }}>
      <Stack.Screen options={{ title: 'Settings' }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      >
        <ProductPressable
          onPress={() => router.push('/settings/archived')}
          label="Archived Boards"
          hint="Opens the archived boards list"
          stretch
          testID="open-archived-boards"
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
            <AppText selectable={false}>Archived Boards</AppText>
            <AppText selectable={false}>›</AppText>
          </View>
        </ProductPressable>

        <AppText variant="footnote" testID="settings-interim">
          Notifications, iCloud sync, export, and app icons arrive with the settings update.
        </AppText>
      </ScrollView>
    </View>
  );
}
