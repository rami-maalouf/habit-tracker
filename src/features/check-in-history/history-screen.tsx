import { Stack, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { removeCheckIn } from '@/core/domain/commands';
import type { BoardId, CheckInId } from '@/core/domain/ids';
import { getBoard, getGroupedCheckInHistory } from '@/core/domain/queries';
import { semanticColor, spacing } from '@/theme';

import { InlineError, PrimaryButton, ProductPressable, useScheme } from '../ui';
import { useProduct, useProductQuery } from '../product-store';
import { HistoryList } from './history-list';
import type { HistoryDaySection } from './history-list-types';

export { formatAmount, formatCheckInTime } from './history-formatters';

// logical dates carry no zone; format their utc instant in utc so labels
// never shift to a neighboring day or month on negative-offset hosts
function monthTitle(month: string, currentYear: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    ...(year === currentYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function dayTitle(date: string): string {
  const [year, monthNumber, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, monthNumber - 1, day)));
}

export function CheckInHistoryScreen({ boardId }: { boardId: BoardId }) {
  const router = useRouter();
  const scheme = useScheme();
  const { core, invalidate, nextCommandId } = useProduct();
  // history loads in pages so very large boards stay responsive; the page
  // grows as the reader approaches the end of the list
  const [pageLimit, setPageLimit] = useState(200);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const board = useProductQuery((c) => getBoard(c, boardId), [boardId]);
  const history = useProductQuery(
    (c) => getGroupedCheckInHistory(c, boardId, { limit: pageLimit }),
    [boardId, pageLimit],
  );
  const currentYear = Number(
    new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      timeZone: core.clock.timeZoneId(),
    }).format(new Date(core.clock.nowUtcMs())),
  );

  // a native swipe delete commits immediately, like the platform does
  const deleteCheckIn = useCallback(
    (checkInId: string) => {
      setDeleteError(null);
      void removeCheckIn(core, {
        commandId: nextCommandId(),
        checkInId: checkInId as CheckInId,
      }).then((result) => {
        if (result.ok) {
          invalidate();
        } else {
          setDeleteError(result.error.message);
        }
      });
    },
    [core, invalidate, nextCommandId],
  );

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
  const archived = record?.archivedAt !== null && record !== null;

  // the query reports whether older records remain; loading more becomes a
  // no-op once everything is loaded
  const hasMore = history.status === 'ready' && history.value.hasMore;
  const sections: HistoryDaySection[] =
    history.status === 'ready'
      ? history.value.months.flatMap((month) =>
          month.days.map((day, dayIndex) => ({
            title: dayTitle(day.date),
            monthHeader: dayIndex === 0 ? monthTitle(month.month, currentYear) : null,
            monthCount: month.count,
            count: day.count,
            data: day.checkIns,
          })),
        )
      : [];

  return (
    <View style={{ flex: 1, backgroundColor: semanticColor('groupedBackground', scheme) }}>
      <Stack.Screen
        options={{
          title: 'Check-Ins',
          headerRight:
            record && !archived
              ? () => (
                  <ProductPressable
                    onPress={() => router.push(`/boards/${boardId}/check-ins/new`)}
                    label="Add check-in"
                    testID="add-check-in"
                  >
                    <AppText variant="title2" selectable={false}>
                      +
                    </AppText>
                  </ProductPressable>
                )
              : undefined,
        }}
      />
      {deleteError ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
          <InlineError message={deleteError} testID="history-delete-error" />
        </View>
      ) : null}
      {history.status === 'loading' ? (
        <View testID="history-loading" style={{ flex: 1 }} />
      ) : history.status === 'error' ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <InlineError message={history.error.message} testID="history-error" />
          <PrimaryButton title="Try again" onPress={history.refresh} />
        </View>
      ) : sections.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg }}>
          <AppText variant="title3" accessibilityRole="header" testID="history-empty">
            No check-ins yet.
          </AppText>
          {!archived ? (
            <PrimaryButton
              title="Add Check-In"
              onPress={() => router.push(`/boards/${boardId}/check-ins/new`)}
            />
          ) : null}
        </View>
      ) : (
        <HistoryList
          sections={sections}
          boardTitle={record?.title ?? 'Check-in'}
          amountUnit={record?.amountUnit ?? null}
          archived={archived}
          onOpen={(checkInId) => router.push(`/boards/${boardId}/check-ins/${checkInId}`)}
          onDelete={deleteCheckIn}
          hasMore={hasMore}
          onLoadMore={() => setPageLimit((current) => current + 200)}
        />
      )}
    </View>
  );
}
