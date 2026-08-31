import { useCallback, useRef } from 'react';
import { ScrollView, View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import type { HeatmapWeek } from '@/core/domain/queries';
import { radius, radiusCurve, spacing } from '@/theme';

import type { DerivedBoardColors } from './board-colors';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type HeatmapViewProps = {
  weeks: HeatmapWeek[];
  colors: DerivedBoardColors;
  testID?: string;
};

// github-style grid: every day in the window renders a visible cell whose
// color deepens with the check-in count; days outside the board's activity
// periods stay a fainter gray so archived gaps read unavailable, not missed
function cellColor(intensity: string, eligible: boolean, colors: DerivedBoardColors): string {
  switch (intensity) {
    case 'low':
      return `${colors.accent}66`;
    case 'medium':
      return `${colors.accent}AA`;
    case 'high':
      return colors.accent;
    default:
      return eligible ? colors.inactiveBar : colors.unavailableCell;
  }
}

// iso monday-through-sunday rows; weeks scroll horizontally, newest at the end
export function HeatmapView({ weeks, colors, testID }: HeatmapViewProps) {
  // scroll to the newest week once per mount; re-renders (any product
  // invalidation) must not snap a user-scrolled heatmap back to the end
  const didAutoScroll = useRef(false);
  const autoScrollToEnd = useCallback((scroll: ScrollView | null) => {
    if (scroll && !didAutoScroll.current) {
      didAutoScroll.current = true;
      scroll.scrollToEnd?.({ animated: false });
    }
  }, []);
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm }} testID={testID}>
      <View
        style={{ justifyContent: 'space-between', paddingVertical: 1 }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {WEEKDAY_LABELS.map((label) => (
          <AppText key={label} variant="caption2" selectable={false}>
            {label}
          </AppText>
        ))}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 3 }}
        ref={autoScrollToEnd}
      >
        {weeks.map((week, weekIndex) => (
          <View key={weekIndex} style={{ gap: 3 }}>
            {week.days.map((cell) => (
              <View
                key={cell.date}
                accessible
                accessibilityLabel={`${cell.date}, ${cell.count} check-ins${cell.isToday ? ', today' : ''}`}
                style={{
                  width: 13,
                  height: 13,
                  borderRadius: radius.sm / 2,
                  borderCurve: radiusCurve,
                  backgroundColor: cellColor(cell.intensity, cell.eligible, colors),
                  borderWidth: cell.isToday ? 1.5 : 0,
                  borderColor: cell.isToday ? colors.accent : 'transparent',
                  opacity: cell.isFuture ? 0.25 : 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* intensity is never color-only: one dot marks a multi
                    check-in day, a ring marks three or more */}
                {cell.intensity === 'medium' || cell.intensity === 'high' ? (
                  <View
                    testID={`heatmap-marker-${cell.date}`}
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor:
                        cell.intensity === 'high' ? 'transparent' : colors.onAccent,
                      borderWidth: cell.intensity === 'high' ? 1.25 : 0,
                      borderColor: colors.onAccent,
                    }}
                  />
                ) : null}
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
