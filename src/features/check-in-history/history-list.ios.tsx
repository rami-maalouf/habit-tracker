import { Host } from '@expo/ui';
import { Button, HStack, List, Section, Spacer, Text } from '@expo/ui/swift-ui';
import { contentShape, foregroundStyle, onTapGesture, shapes } from '@expo/ui/swift-ui/modifiers';

import { formatAmount, formatCheckInTime } from './history-formatters';
import type { HistoryListProps } from './history-list-types';

// the ios history renders through a real swiftui list, so swipe to delete,
// full swipes, and section styling come straight from the platform
export function HistoryList({
  sections,
  boardTitle,
  amountUnit,
  archived,
  onOpen,
  onDelete,
  hasMore,
  onLoadMore,
}: HistoryListProps) {
  return (
    <Host style={{ flex: 1 }} testID="history-list">
      <List>
        {sections.map((section) => {
          const rows = section.data.map((item) => {
            const meta = [formatCheckInTime(item), formatAmount(item, amountUnit)]
              .filter(Boolean)
              .join(' · ');
            const label = `${boardTitle}${item.note ? ' ✎' : ''}`;
            // a tap-gesture row keeps the text label-colored and the whole
            // width tappable; a swiftui button would tint the row like a
            // link, and its plain style only hit-tests the label itself
            return (
              <HStack
                key={item.id}
                modifiers={
                  archived
                    ? undefined
                    : [contentShape(shapes.rectangle()), onTapGesture(() => onOpen(item.id))]
                }
              >
                <Text>{label}</Text>
                <Spacer />
                <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                  {meta.length > 0 ? `${meta} ✓` : '✓'}
                </Text>
              </HStack>
            );
          });
          const title = `${section.monthHeader ? `${section.monthHeader}  ·  ` : ''}${section.title}  ·  ${section.count}`;
          return (
            <Section key={section.title} title={title}>
              {archived ? (
                rows
              ) : (
                <List.ForEach
                  onDelete={(indices) => {
                    for (const index of indices) {
                      const item = section.data[index];
                      if (item) {
                        onDelete(item.id);
                      }
                    }
                  }}
                >
                  {rows}
                </List.ForEach>
              )}
            </Section>
          );
        })}
        {hasMore ? (
          <Section>
            <Button onPress={onLoadMore} testID="history-load-more">
              <Text>Load more</Text>
            </Button>
          </Section>
        ) : null}
      </List>
    </Host>
  );
}
