import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { SectionList, View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import type { CheckIn } from '@/core/domain/entities';
import type { BoardId } from '@/core/domain/ids';
import { getBoard, getGroupedCheckInHistory } from '@/core/domain/queries';
import { radius, radiusCurve, semanticColor, spacing } from '@/theme';

import { BoardSymbol, deriveBoardColors } from '../boards';
import { InlineError, PrimaryButton, ProductPressable, useScheme } from '../ui';
import { useProduct, useProductQuery } from '../product-store';

type DaySection = {
  title: string;
  monthHeader: string | null;
  monthCount: number;
  count: number;
  data: CheckIn[];
};

export function formatCheckInTime(checkIn: CheckIn): string | null {
  if (checkIn.occurredAtUtc === null || checkIn.timeZoneId === null) {
    return null;
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: checkIn.timeZoneId,
  }).format(new Date(checkIn.occurredAtUtc));
}

export function formatAmount(checkIn: CheckIn, unit: string | null): string | null {
  if (checkIn.amount === null) {
    return null;
  }
  return unit ? `${checkIn.amount} ${unit}` : String(checkIn.amount);
}

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
  const { core } = useProduct();
  // history loads in pages so very large boards stay responsive; the page
  // grows as the reader approaches the end of the list
  const [pageLimit, setPageLimit] = useState(200);
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
  const archived = record?.archivedAt !== null && record !== null;

  // the query reports whether older records remain; end-reached becomes a
  // no-op once everything is loaded
  const hasMore = history.status === 'ready' && history.value.hasMore;
  const sections: DaySection[] =
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
        <SectionList
          testID="history-list"
          sections={sections}
          keyExtractor={(item) => item.id}
          onEndReached={() => {
            if (hasMore) {
              setPageLimit((current) => current + 200);
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
            const amount = record ? formatAmount(item, record.amountUnit) : null;
            const detailParts = [time, amount, item.note ? 'note' : null].filter(Boolean);
            return (
              <ProductPressable
                // an archived board is read-only: its history rows are
                // plain records, not links into an editable form
                onPress={
                  archived ? undefined : () => router.push(`/boards/${boardId}/check-ins/${item.id}`)
                }
                disabled={archived}
                label={`${record?.title ?? 'Check-in'}${detailParts.length > 0 ? `, ${detailParts.join(', ')}` : ''}`}
                hint={archived ? undefined : 'Opens this check-in'}
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
                  {record && colors ? (
                    <BoardSymbol symbol={record.symbol} color={colors.accent} size={18} />
                  ) : null}
                  <AppText numberOfLines={1} style={{ flexShrink: 1 }} selectable={false}>
                    {record?.title ?? ''}
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
      )}
    </View>
  );
}
