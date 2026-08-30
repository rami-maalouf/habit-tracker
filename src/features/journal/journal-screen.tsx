import { Stack, useRouter } from 'expo-router';
import { FlatList, View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import type { BoardId } from '@/core/domain/ids';
import { getBoard, getJournalTimeline } from '@/core/domain/queries';
import { radius, radiusCurve, semanticColor, spacing } from '@/theme';

import { BoardSymbol, deriveBoardColors } from '../boards';
import { formatAmount, formatCheckInTime } from '../check-in-history/history-screen';
import { InlineError, PrimaryButton, ProductPressable, useScheme } from '../ui';
import { useProductQuery } from '../product-store';

function journalDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

// board-scoped reverse-chronological timeline of check-ins with notes
export function JournalScreen({ boardId }: { boardId: BoardId }) {
  const router = useRouter();
  const scheme = useScheme();
  const board = useProductQuery((c) => getBoard(c, boardId), [boardId]);
  const journal = useProductQuery((c) => getJournalTimeline(c, boardId), [boardId]);

  if (board.status === 'error') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg }}>
        <AppText variant="title2" accessibilityRole="header">
          This board is not available.
        </AppText>
        <PrimaryButton title="Back to Boards" onPress={() => router.dismissTo('/')} />
      </View>
    );
  }

  const record = board.status === 'ready' ? board.value : null;
  const colors = record ? deriveBoardColors(record.accentHex, scheme) : null;
  const archived = record !== null && record.archivedAt !== null;

  return (
    <View style={{ flex: 1, backgroundColor: semanticColor('groupedBackground', scheme) }}>
      <Stack.Screen options={{ title: 'Journal' }} />
      {journal.status === 'loading' || record === null ? (
        <View testID="journal-loading" style={{ flex: 1 }} />
      ) : journal.status === 'error' ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <InlineError message={journal.error.message} testID="journal-error" />
          <PrimaryButton title="Try again" onPress={journal.refresh} />
        </View>
      ) : journal.value.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg }}>
          <AppText variant="title3" accessibilityRole="header" testID="journal-empty">
            Notes you add to check-ins appear here.
          </AppText>
          {!archived ? (
            <PrimaryButton
              title="Add Check-In"
              onPress={() => router.push(`/boards/${boardId}/check-ins/new`)}
              testID="journal-add-check-in"
            />
          ) : null}
        </View>
      ) : (
        <FlatList
          testID="journal-list"
          data={journal.value}
          keyExtractor={(item) => item.id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          renderItem={({ item }) => {
            const time = formatCheckInTime(item);
            const amount = record ? formatAmount(item, record.amountUnit) : null;
            const meta = [journalDate(item.logicalDate), time, amount]
              .filter(Boolean)
              .join(' · ');
            return (
              <ProductPressable
                // an archived board keeps a read-only journal
                onPress={
                  archived
                    ? undefined
                    : () => router.push(`/boards/${boardId}/check-ins/${item.id}`)
                }
                disabled={archived}
                label={`Journal entry, ${meta}`}
                hint={archived ? undefined : 'Opens this check-in'}
                testID={`journal-entry-${item.id}`}
              >
                <View
                  style={{
                    backgroundColor: semanticColor('secondaryGroupedBackground', scheme),
                    borderRadius: radius.lg,
                    borderCurve: radiusCurve,
                    padding: spacing.lg,
                    gap: spacing.sm,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    {colors ? (
                      <BoardSymbol symbol={record.symbol} color={colors.accent} size={14} />
                    ) : null}
                    <AppText variant="footnote">{meta}</AppText>
                  </View>
                  <AppText>{item.note ?? ''}</AppText>
                </View>
              </ProductPressable>
            );
          }}
        />
      )}
    </View>
  );
}
