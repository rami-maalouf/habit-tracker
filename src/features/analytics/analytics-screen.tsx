import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { currentLogicalDate, parseLogicalDate } from '@/core/calendar/logical-date';
import type { BoardId } from '@/core/domain/ids';
import type { Board } from '@/core/domain/entities';
import {
  getBoard,
  getConsistencyAnalytics,
  getEarliestCheckInDate,
  getStreakAnalytics,
  getTimelineAnalytics,
  getWeekdayAnalytics,
  getYearComparison,
} from '@/core/domain/queries';
import { radius, radiusCurve, semanticColor, spacing } from '@/theme';

import { deriveBoardColors } from '../boards';
import { InlineError, PrimaryButton, ProductPressable, useScheme } from '../ui';
import { useProduct, useProductQuery } from '../product-store';
import {
  ChartFrame,
  WeekdayDonut,
  consistencyColumnPaths,
  monthlyLinePaths,
  pairedBarPaths,
  streakRowPaths,
  weekdayBarPaths,
} from './charts';
import type { StreakRow } from './charts';

const MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const DAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function SectionCard({
  title,
  subtitle,
  control,
  children,
  testID,
}: {
  title: string;
  subtitle: string;
  control?: React.ReactNode;
  children: React.ReactNode;
  testID?: string;
}) {
  const scheme = useScheme();
  return (
    <View
      style={{
        backgroundColor: semanticColor('secondaryGroupedBackground', scheme),
        borderRadius: radius.lg,
        borderCurve: radiusCurve,
        padding: spacing.lg,
        gap: spacing.md,
      }}
      testID={testID}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <AppText variant="footnote" accessibilityRole="header">
            {title.toUpperCase()}
          </AppText>
          <AppText variant="subheadline">{subtitle}</AppText>
        </View>
        {control}
      </View>
      {children}
    </View>
  );
}

// accessible year stepper: previous / label / next, never gesture-only
function YearControl({
  year,
  minYear,
  maxYear,
  onChange,
  testID,
}: {
  year: number;
  minYear: number;
  maxYear: number;
  onChange: (year: number) => void;
  testID: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
      <ProductPressable
        onPress={() => onChange(year - 1)}
        disabled={year <= minYear}
        label={`Previous year, ${year - 1}`}
        testID={`${testID}-previous`}
      >
        <AppText selectable={false}>‹</AppText>
      </ProductPressable>
      <AppText variant="headline" testID={testID}>
        {String(year)}
      </AppText>
      <ProductPressable
        onPress={() => onChange(year + 1)}
        disabled={year >= maxYear}
        label={`Next year, ${year + 1}`}
        testID={`${testID}-next`}
      >
        <AppText selectable={false}>›</AppText>
      </ProductPressable>
    </View>
  );
}

function InsufficientCard({ message, testID }: { message: string; testID: string }) {
  return (
    <AppText variant="subheadline" testID={testID}>
      {message}
    </AppText>
  );
}

export function AnalyticsScreen({ boardId }: { boardId: BoardId }) {
  const router = useRouter();
  const board = useProductQuery((c) => getBoard(c, boardId), [boardId]);
  const earliest = useProductQuery((c) => getEarliestCheckInDate(c, boardId), [boardId]);

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
  if (board.status !== 'ready' || earliest.status === 'loading') {
    return <View testID="analytics-loading" style={{ flex: 1 }} />;
  }

  const record = board.value;
  // archived boards and disabled metrics have no analytics entry point;
  // a direct link lands on an explanation, never on charts
  if (record.archivedAt !== null || !record.metricsEnabled) {
    return (
      <View
        style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg }}
        testID="analytics-unavailable"
      >
        <Stack.Screen options={{ title: 'Analytics' }} />
        <AppText variant="title2" accessibilityRole="header">
          {record.archivedAt !== null
            ? 'This board is archived.'
            : 'Performance metrics are off for this board.'}
        </AppText>
        <AppText>
          {record.archivedAt !== null
            ? 'Restore it from its board page to see analytics.'
            : 'Enable metrics from its board page to see analytics.'}
        </AppText>
        <PrimaryButton title="Back to Boards" onPress={() => router.dismissTo('/')} />
      </View>
    );
  }

  return (
    <AnalyticsBody
      boardId={boardId}
      record={record}
      earliestDate={earliest.status === 'ready' ? earliest.value : null}
    />
  );
}

function AnalyticsBody({
  boardId,
  record,
  earliestDate,
}: {
  boardId: BoardId;
  record: Board;
  earliestDate: string | null;
}) {
  const scheme = useScheme();
  const { core } = useProduct();
  // the board's shifted start of day decides which year "today" is in
  const logicalToday = currentLogicalDate(
    core.clock.nowUtcMs(),
    core.clock.timeZoneId(),
    record.startOfDayMinute,
  );
  const currentYear = Number(logicalToday.slice(0, 4));
  const currentMonth = Number(logicalToday.slice(5, 7));
  // the selectors reach back exactly as far as the data does
  const minYear = earliestDate ? Number(earliestDate.slice(0, 4)) : currentYear;
  const [timelineYear, setTimelineYear] = useState(currentYear);
  const [comparisonYear, setComparisonYear] = useState(currentYear);

  const timeline = useProductQuery(
    (c) => getTimelineAnalytics(c, boardId, timelineYear),
    [boardId, timelineYear],
  );
  const weekdays = useProductQuery((c) => getWeekdayAnalytics(c, boardId), [boardId]);
  const comparison = useProductQuery(
    (c) => getYearComparison(c, boardId, comparisonYear),
    [boardId, comparisonYear],
  );
  const consistency = useProductQuery((c) => getConsistencyAnalytics(c, boardId), [boardId]);
  const streaks = useProductQuery((c) => getStreakAnalytics(c, boardId), [boardId]);

  const colors = deriveBoardColors(record.accentHex, scheme);
  const queryError = [timeline, weekdays, comparison, consistency, streaks].find(
    (query) => query.status === 'error',
  );

  // future months of the current logical year are unavailable, not zero
  const timelineValues =
    timeline.status === 'ready' && timeline.value
      ? timeline.value.months.map((value, index) =>
          timelineYear === currentYear && index + 1 > currentMonth ? null : value,
        )
      : null;
  const timelineTotal = timelineValues
    ? timelineValues.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : 0;
  const weekdayData = weekdays.status === 'ready' ? weekdays.value : null;
  const comparisonData = comparison.status === 'ready' ? comparison.value : null;
  const consistencyData = consistency.status === 'ready' ? consistency.value : null;
  const streakData =
    streaks.status === 'ready' && streaks.value && streaks.value.allTimeLongest > 0
      ? streaks.value
      : null;
  const previousYearTotal = comparisonData
    ? comparisonData.previous.reduce((sum, value) => sum + value, 0)
    : 0;
  const weekdayTotal = weekdayData
    ? weekdayData.weekdayCounts.reduce((sum, value) => sum + value, 0)
    : 0;

  return (
    <View style={{ flex: 1, backgroundColor: semanticColor('groupedBackground', scheme) }}>
      <Stack.Screen options={{ title: 'Analytics' }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      >
        {queryError && queryError.status === 'error' ? (
          <View style={{ gap: spacing.md }} testID="analytics-query-error">
            <InlineError message={queryError.error.message} />
            <PrimaryButton title="Try again" onPress={queryError.refresh} />
          </View>
        ) : null}

        <SectionCard
          title="Timeline"
          subtitle="Total check-ins over time"
          testID="analytics-timeline"
          control={
            <YearControl
              year={timelineYear}
              minYear={minYear}
              maxYear={currentYear}
              onChange={setTimelineYear}
              testID="timeline-year"
            />
          }
        >
          {timelineValues && timelineTotal > 0 ? (
            <>
              <ChartFrame
                accessibilityLabel={`Timeline for ${timelineYear}: monthly check-in totals ${timelineValues
                  .map((value) => (value === null ? 'unavailable' : String(value)))
                  .join(', ')}`}
                testID="timeline-chart"
              >
                {monthlyLinePaths({
                  values: timelineValues,
                  monthLabels: MONTH_INITIALS,
                  accent: colors.accent,
                  scheme,
                })}
              </ChartFrame>
              <AppText variant="footnote" testID="timeline-summary">
                {`${timelineYear}: ${timelineValues
                  .map((value, index) => `${MONTH_SHORT[index]} ${value === null ? 'n/a' : value}`)
                  .join(', ')}. Total ${timelineTotal}.`}
              </AppText>
            </>
          ) : (
            <InsufficientCard
              message={`No check-ins in ${timelineYear} yet.`}
              testID="timeline-empty"
            />
          )}
        </SectionCard>

        <SectionCard
          title="Weekdays"
          subtitle="Total check-ins by day of the week in the past 12 months"
          testID="analytics-weekdays"
        >
          {weekdayData && weekdayData.workdayPercent !== null && weekdayData.weekendPercent !== null ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
                <View
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={`Workdays ${Math.round(weekdayData.workdayPercent)} percent, weekends ${Math.round(weekdayData.weekendPercent)} percent`}
                >
                  <WeekdayDonut
                    workdayPercent={weekdayData.workdayPercent}
                    accent={colors.accent}
                    scheme={scheme}
                  />
                </View>
                <View style={{ gap: spacing.sm, flex: 1 }}>
                  <AppText variant="subheadline">{`Workdays ${Math.round(weekdayData.workdayPercent)}%`}</AppText>
                  <AppText variant="subheadline">{`Weekends ${Math.round(weekdayData.weekendPercent)}%`}</AppText>
                  <AppText variant="footnote" testID="weekday-direction">
                    {weekdayData.direction === 'up'
                      ? 'Trending up vs the prior period'
                      : weekdayData.direction === 'down'
                        ? 'Trending down vs the prior period'
                        : 'Even with the prior period'}
                  </AppText>
                </View>
              </View>
              <ChartFrame
                height={120}
                accessibilityLabel={`Check-ins by weekday: ${weekdayData.weekdayCounts
                  .map((count, index) => `${DAY_NAMES[index]} ${count}`)
                  .join(', ')}`}
                testID="weekday-chart"
              >
                {weekdayBarPaths({
                  counts: weekdayData.weekdayCounts,
                  dayLabels: DAY_INITIALS,
                  accent: colors.accent,
                  scheme,
                })}
              </ChartFrame>
              <AppText variant="footnote" testID="weekday-summary">
                {weekdayData.weekdayCounts
                  .map((count, index) => `${DAY_NAMES[index]} ${count}`)
                  .join(', ')}
              </AppText>
            </>
          ) : (
            <InsufficientCard
              message={
                weekdayData && weekdayTotal === 0 && consistencyData !== null
                  ? 'No check-ins in the past 12 months yet.'
                  : 'Weekday analysis needs at least seven eligible days of history.'
              }
              testID="weekday-empty"
            />
          )}
        </SectionCard>

        <SectionCard
          title="Year Comparison"
          subtitle="Total monthly check-ins for selected year vs previous year"
          testID="analytics-comparison"
          control={
            <YearControl
              year={comparisonYear}
              minYear={minYear}
              maxYear={currentYear}
              onChange={setComparisonYear}
              testID="comparison-year"
            />
          }
        >
          {comparisonData ? (
            <>
              <ChartFrame
                accessibilityLabel={`Year comparison ${comparisonData.selectedYear} vs ${comparisonData.previousYear}`}
                testID="comparison-chart"
              >
                {pairedBarPaths({
                  selected: comparisonData.selected,
                  previous: comparisonData.previous,
                  monthLabels: MONTH_SHORT,
                  accent: colors.accent,
                  scheme,
                })}
              </ChartFrame>
              <View style={{ flexDirection: 'row', gap: spacing.lg }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
                  <AppText variant="footnote">{String(comparisonData.selectedYear)}</AppText>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: semanticColor('fill', scheme),
                    }}
                  />
                  <AppText variant="footnote">{String(comparisonData.previousYear)}</AppText>
                </View>
              </View>
              {previousYearTotal === 0 ? (
                <AppText variant="footnote" testID="comparison-no-prior">
                  {`No check-ins in ${comparisonData.previousYear}.`}
                </AppText>
              ) : null}
              <AppText variant="footnote" testID="comparison-summary">
                {`${comparisonData.selectedYear}: ${comparisonData.selected
                  .map((value, index) => `${MONTH_SHORT[index]} ${value === null ? 'n/a' : value}`)
                  .join(', ')}. ${comparisonData.previousYear}: ${comparisonData.previous
                  .map((value, index) => `${MONTH_SHORT[index]} ${value}`)
                  .join(', ')}.`}
              </AppText>
            </>
          ) : (
            <InsufficientCard message="No data for this year yet." testID="comparison-empty" />
          )}
        </SectionCard>

        <SectionCard
          title="Consistency"
          subtitle="Monthly consistency score over the past 12 months"
          testID="analytics-consistency"
        >
          {consistencyData ? (
            <>
              <ChartFrame
                accessibilityLabel={`Monthly consistency: ${consistencyData
                  .map((month) =>
                    `${month.month} ${month.percent === null ? 'no data' : `${Math.round(month.percent)} percent`}`,
                  )
                  .join(', ')}`}
                testID="consistency-chart"
              >
                {consistencyColumnPaths({
                  percents: consistencyData.map((month) => month.percent),
                  monthLabels: consistencyData.map(
                    (month) => MONTH_INITIALS[Number(month.month.slice(5, 7)) - 1],
                  ),
                  accent: colors.accent,
                  scheme,
                })}
              </ChartFrame>
              <AppText variant="footnote" testID="consistency-summary">
                {consistencyData
                  .map(
                    (month) =>
                      `${month.month}: ${
                        month.percent === null
                          ? 'no data'
                          : `${Math.round(month.percent)}% (${month.band})`
                      }`,
                  )
                  .join(', ')}
              </AppText>
            </>
          ) : (
            <InsufficientCard
              message="Consistency needs at least seven eligible days of history."
              testID="consistency-empty"
            />
          )}
        </SectionCard>

        <SectionCard
          title="Streaks"
          subtitle="Streaks timeline over the past 12 months"
          testID="analytics-streaks"
        >
          {streakData ? (
            <>
              <ChartFrame
                height={260}
                accessibilityLabel={`Streak spans over the past twelve months. All-time longest streak ${streakData.allTimeLongest} days`}
                testID="streak-chart"
              >
                {streakRowPaths({
                  rows: buildStreakRows(streakData),
                  accent: colors.accent,
                  scheme,
                })}
              </ChartFrame>
              <AppText variant="footnote" testID="streak-summary">
                {`Longest streak - ${streakData.allTimeLongest} ${streakData.allTimeLongest === 1 ? 'day' : 'days'}. ${
                  streakData.spans.length > 0
                    ? `Spans: ${streakData.spans
                        .map((span) => formatSpan(span.startDate, span.endDate))
                        .join('; ')}.`
                    : 'No streaks inside the last twelve months.'
                }`}
              </AppText>
            </>
          ) : (
            <InsufficientCard
              message="Streaks appear after your first completed day."
              testID="streak-empty"
            />
          )}
        </SectionCard>
      </ScrollView>
    </View>
  );
}

function formatSpan(startDate: string, endDate: string): string {
  const start = parseLogicalDate(startDate as never);
  const end = parseLogicalDate(endDate as never);
  const startText = `${MONTH_SHORT[start.month - 1]} ${start.day}`;
  const endText = `${MONTH_SHORT[end.month - 1]} ${end.day}`;
  return startDate === endDate ? startText : `${startText} to ${endText}`;
}

// slices streak spans into month rows for the gantt chart
export function buildStreakRows(streakData: {
  spans: { startDate: string; endDate: string }[];
  windowStart: string;
  windowEnd: string;
}): StreakRow[] {
  // rows end at the window's final month so the current month is always
  // the last row, matching the reference's prior-12-months framing
  const end = parseLogicalDate(streakData.windowEnd as never);
  const rows: StreakRow[] = [];
  const monthIndex = new Map<string, number>();
  for (let offset = 11; offset >= 0; offset -= 1) {
    const total = end.year * 12 + (end.month - 1) - offset;
    const year = Math.floor(total / 12);
    const month = (total % 12) + 1;
    const key = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
    monthIndex.set(key, rows.length);
    rows.push({
      monthLabel: MONTH_SHORT[month - 1],
      spans: [],
      daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate(),
    });
  }
  for (const span of streakData.spans) {
    // a span may cross month boundaries: split it per month row
    let cursor = parseLogicalDate(span.startDate as never);
    const end = parseLogicalDate(span.endDate as never);
    while (cursor.year * 12 + cursor.month <= end.year * 12 + end.month) {
      const key = `${String(cursor.year).padStart(4, '0')}-${String(cursor.month).padStart(2, '0')}`;
      const index = monthIndex.get(key);
      const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month, 0)).getUTCDate();
      if (index !== undefined) {
        const sameMonthAsEnd = cursor.year === end.year && cursor.month === end.month;
        rows[index].spans.push({
          startDay: cursor.day,
          endDay: sameMonthAsEnd ? end.day : daysInMonth,
        });
      }
      const nextTotal = cursor.year * 12 + cursor.month;
      cursor = { year: Math.floor(nextTotal / 12), month: (nextTotal % 12) + 1, day: 1 };
    }
  }
  return rows;
}
