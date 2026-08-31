import { Stack } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { radius, radiusCurve, semanticColor, spacing } from '@/theme';

import { useScheme } from '../ui';

const ICON_PREVIEWS = [
  { name: 'Default', light: '#78D98B', dark: '#111111' },
  { name: 'Midnight', light: '#111111', dark: '#78D98B' },
  { name: 'Paper', light: '#F2F2F7', dark: '#3A3A3C' },
];

// alternate icons persist only after the platform confirms the switch; the
// native adapter arrives with the local module, so selection stays off
export function AppIconScreen() {
  const scheme = useScheme();
  return (
    <View style={{ flex: 1, backgroundColor: semanticColor('groupedBackground', scheme) }}>
      <Stack.Screen options={{ title: 'App Icon' }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      >
        <View style={{ flexDirection: 'row', gap: spacing.lg }}>
          {ICON_PREVIEWS.map((icon) => (
            <View key={icon.name} style={{ alignItems: 'center', gap: spacing.sm }}>
              <View
                accessible
                accessibilityLabel={`${icon.name} icon preview`}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: radius.lg,
                  borderCurve: radiusCurve,
                  backgroundColor: icon.light,
                  borderWidth: 1,
                  borderColor: semanticColor('separator', scheme),
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                testID={`icon-preview-${icon.name.toLowerCase()}`}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: icon.dark,
                  }}
                />
              </View>
              <AppText variant="footnote">{icon.name}</AppText>
            </View>
          ))}
        </View>
        <AppText variant="footnote" testID="app-icon-interim">
          Choosing an alternate icon arrives with a native update. The previews show what will be
          available.
        </AppText>
      </ScrollView>
    </View>
  );
}
