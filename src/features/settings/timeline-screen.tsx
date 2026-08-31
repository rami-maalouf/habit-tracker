import { Stack } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { radius, radiusCurve, semanticColor, spacing } from '@/theme';

import { useScheme } from '../ui';

const RELEASES = [
  {
    version: 'In development',
    notes: [
      'Boards with quick check-ins, undo, and reordering',
      'Board configuration, options, and archived boards',
      'Check-in history with paging and a journal',
      'Analytics with timeline, weekdays, comparison, consistency, and streaks',
      'Offline export plus import from Ripples CSV and app backups',
    ],
  },
];

// release notes destination; distinct from the board journal by design
export function TimelineScreen() {
  const scheme = useScheme();
  return (
    <View style={{ flex: 1, backgroundColor: semanticColor('groupedBackground', scheme) }}>
      <Stack.Screen options={{ title: 'Timeline' }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      >
        {RELEASES.map((release) => (
          <View
            key={release.version}
            style={{
              backgroundColor: semanticColor('secondaryGroupedBackground', scheme),
              borderRadius: radius.lg,
              borderCurve: radiusCurve,
              padding: spacing.lg,
              gap: spacing.sm,
            }}
          >
            <AppText variant="headline">{release.version}</AppText>
            {release.notes.map((note) => (
              <AppText key={note} variant="subheadline">
                {`- ${note}`}
              </AppText>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
