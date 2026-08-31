import { SectionList, View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { radius, radiusCurve, semanticColor, spacing } from '@/theme';

import { ProductPressable, useScheme } from '../ui';
import { formatAmount, formatCheckInTime } from './history-formatters';
import type { HistoryListProps } from './history-list-types';

// non-ios fallback: a react-native section list; deleting happens inside
// the edit sheet here, while ios gets native swipe actions
export function HistoryList({
  sections,
  boardTitle,
  amountUnit,
  archived,
  onOpen,
  hasMore,
  onLoadMore,
}: HistoryListProps) {
  const scheme = useScheme();
  return (
    <SectionList
      testID="history-list"
      sections={sections}
      keyExtractor={(item) => item.id}
      onEndReached={() => {
        if (hasMore) {
          onLoadMore();
        }
      }}
      onEndReachedThreshold={0.5}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      renderSectionHeader={({ section }) => (
        <View style={{ gap: spacing.xs, paddingTop: spacing.md }}>
          {section.monthHeader ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText variant="title2" accessibilityRole="header">
                {section.monthHeader}
              </AppText>
              <AppText variant="footnote">{String(section.monthCount)}</AppText>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText variant="subheadline">{section.title}</AppText>
            <AppText variant="caption1">{String(section.count)}</AppText>
          </View>
        </View>
      )}
      renderItem={({ item }) => {
        const time = formatCheckInTime(item);
        const amount = formatAmount(item, amountUnit);
        const detailParts = [time, amount, item.note ? 'note' : null].filter(Boolean);
        return (
          <ProductPressable
            onPress={archived ? undefined : () => onOpen(item.id)}
            disabled={archived}
            label={`${boardTitle}${detailParts.length > 0 ? `, ${detailParts.join(', ')}` : ''}`}
            hint={archived ? undefined : 'Opens this check-in'}
            stretch
            testID={`check-in-row-${item.id}`}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                backgroundColor: semanticColor('secondaryGroupedBackground', scheme),
                borderRadius: radius.capsule,
                borderCurve: radiusCurve,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
              }}
            >
              <AppText numberOfLines={1} style={{ flexShrink: 1 }} selectable={false}>
                {boardTitle}
              </AppText>
              <View style={{ flex: 1 }} />
              {amount ? <AppText variant="footnote">{amount}</AppText> : null}
              {time ? <AppText variant="footnote">{time}</AppText> : null}
              {item.note ? (
                <AppText variant="footnote" selectable={false}>
                  ✎
                </AppText>
              ) : null}
              <AppText variant="footnote" selectable={false}>
                ✓
              </AppText>
            </View>
          </ProductPressable>
        );
      }}
    />
  );
}
