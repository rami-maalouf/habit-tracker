import { View } from 'react-native';

import { radius, radiusCurve, spacing } from '@/theme';

import type { DerivedBoardColors } from './board-colors';

type SevenDayStripProps = {
  // seven counts, oldest first, ending today
  strip: number[];
  colors: DerivedBoardColors;
  barHeight?: number;
};

// six slim history bars plus a separated outlined slot for today
export function SevenDayStrip({ strip, colors, barHeight = 30 }: SevenDayStripProps) {
  const history = strip.slice(0, 6);
  const today = strip[6] ?? 0;
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {history.map((count, index) => (
        <View
          key={index}
          style={{
            width: 6,
            height: barHeight,
            borderRadius: radius.sm,
            borderCurve: radiusCurve,
            backgroundColor: count > 0 ? colors.accent : colors.inactiveBar,
          }}
        />
      ))}
      <View style={{ width: spacing.sm }} />
      <View
        style={{
          width: 8,
          height: barHeight + 4,
          borderRadius: radius.sm,
          borderCurve: radiusCurve,
          borderWidth: 1.5,
          borderColor: today > 0 ? colors.accent : colors.inactiveBar,
          backgroundColor: today > 0 ? colors.accent : 'transparent',
        }}
      />
    </View>
  );
}
