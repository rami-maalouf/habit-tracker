import { View } from 'react-native';

import { radius, radiusCurve, spacing } from '@/theme';

import type { DerivedBoardColors } from './board-colors';

type SevenDayStripProps = {
  // daily counts, oldest first, ending today
  strip: number[];
  colors: DerivedBoardColors;
  barHeight?: number;
  barWidth?: number;
  barGap?: number;
};

// today's outline shares the same rhythm as the preceding history
export function SevenDayStrip({ strip, colors, barHeight = 30, barWidth = 6, barGap = spacing.xs }: SevenDayStripProps) {
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: barGap }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {strip.map((count, index) => (
        <View
          key={index}
          style={{
            width: barWidth,
            height: barHeight,
            borderRadius: radius.sm,
            borderCurve: radiusCurve,
            borderWidth: index === strip.length - 1 ? 1 : 0,
            borderColor: count > 0 ? colors.accent : colors.inactiveBar,
            backgroundColor: count > 0 ? colors.accent : index === strip.length - 1 ? 'transparent' : colors.inactiveBar,
          }}
        />
      ))}
    </View>
  );
}
