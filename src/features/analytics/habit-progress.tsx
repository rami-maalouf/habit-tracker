import { useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { Icon } from '@/components/foundation/icon';
import { addDays, parseLogicalDate, startOfIsoWeek } from '@/core/calendar/logical-date';
import type { BoardSummary, HeatmapWeek } from '@/core/domain/queries';
import { radius, radiusCurve, semanticColor, spacing } from '@/theme';

import type { DerivedBoardColors } from '../boards';
import { useScheme } from '../ui';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function MetricCard({ title, children }: { title: string; children: React.ReactNode }) {
  const scheme = useScheme();
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        backgroundColor: semanticColor('secondaryGroupedBackground', scheme),
        borderRadius: radius.lg,
        borderCurve: radiusCurve,
        padding: spacing.lg,
        gap: spacing.sm,
      }}
    >
      <AppText variant="footnote" style={{ color: semanticColor('secondaryLabel', scheme) }}>
        {title.toUpperCase()}
      </AppText>
      {children}
    </View>
  );
}

export function HabitProgress({
  summary,
  weeks,
  colors,
  testID = 'metrics-cards',
}: {
  summary: BoardSummary;
  weeks?: HeatmapWeek[];
  colors: DerivedBoardColors;
  testID?: string;
}) {
  const scheme = useScheme();
  const { fontScale } = useWindowDimensions();
  const secondary = semanticColor('secondaryLabel', scheme);
  const weekStart = startOfIsoWeek(summary.today);
  const cells = new Map(weeks?.flatMap((week) => week.days).map((day) => [day.date, day]));
  const completedDays = summary.currentMonthDaily.filter((count) => count > 0).length;
  const maximum = Math.max(0, ...summary.currentMonthDaily);
  const today = parseLogicalDate(summary.today);
  const monthDays = new Date(Date.UTC(today.year, today.month, 0)).getUTCDate();
  const month = new Date(`${summary.today}T12:00:00Z`).toLocaleDateString(undefined, {
    month: 'long',
    timeZone: 'UTC',
  });
  const band = summary.consistencyBand;

  return (
    <View style={{ gap: spacing.md }} testID={testID}>
      <View style={{ flexDirection: fontScale > 1.35 ? 'column' : 'row', gap: spacing.md }}>
        <MetricCard title="Current streak">
          <AppText variant="largeTitle" style={{ color: colors.accent, fontVariant: ['tabular-nums'] }}>
            {summary.currentStreak}
          </AppText>
          <AppText variant="subheadline">{summary.currentStreak === 1 ? 'day in a row' : 'days in a row'}</AppText>
          <AppText variant="footnote" style={{ color: secondary }}>
            {`Longest: ${summary.longestStreak} ${summary.longestStreak === 1 ? 'day' : 'days'}`}
          </AppText>
        </MetricCard>
        <MetricCard title="Consistency">
          <AppText variant="largeTitle" style={{ color: colors.accent, fontVariant: ['tabular-nums'] }}>
            {summary.consistencyPercent === null ? '-' : `${Math.round(summary.consistencyPercent)}%`}
          </AppText>
          <AppText variant="subheadline">
            {summary.metricsReady && band
              ? band === 'high' ? 'High' : band === 'average' ? 'Average' : 'Low'
              : `${summary.eligibleDayCount} ${summary.eligibleDayCount === 1 ? 'tracked day' : 'tracked days'}`}
          </AppText>
          <AppText variant="footnote" style={{ color: secondary }}>
            Active days of the last 30 days
          </AppText>
        </MetricCard>
      </View>

      <MetricCard title="This week">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: spacing.sm }}>
          <AppText variant="title1" style={{ fontVariant: ['tabular-nums'] }}>
            {summary.currentWeekCount}
          </AppText>
          <AppText variant="subheadline" style={{ color: secondary }}>
            {summary.currentWeekCount === 1 ? 'check-in' : 'check-ins'}
          </AppText>
        </View>
        {weeks ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm }} testID="weekly-progress">
            {WEEKDAYS.map((label, index) => {
              const date = addDays(weekStart, index);
              const cell = cells.get(date);
              const count = cell?.count ?? 0;
              const future = date > summary.today;
              const available = cell?.eligible === true || count > 0;
              return (
                <View
                  key={date}
                  accessible
                  accessibilityLabel={`${date}: ${future ? 'upcoming' : !available ? 'not tracked' : `${count} check-ins`}${date === summary.today ? ', today' : ''}`}
                  style={{ flex: 1, alignItems: 'center', gap: spacing.sm }}
                >
                  <AppText variant="caption1" style={{ color: secondary }}>{label}</AppText>
                  <View
                    style={{
                      width: '100%',
                      maxWidth: 36,
                      aspectRatio: 1,
                      borderRadius: radius.capsule,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: count > 0 ? colors.accent : colors.unavailableCell,
                      opacity: future || !available ? 0.35 : 1,
                      borderWidth: date === summary.today ? 1.5 : 0,
                      borderColor: colors.accent,
                    }}
                  >
                    {count > 0 ? <Icon name="checkmark" size={15} color={colors.onAccent} /> : null}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
      </MetricCard>

      <MetricCard title={month}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: spacing.sm }}>
          <AppText variant="title1" style={{ fontVariant: ['tabular-nums'] }}>
            {summary.currentMonthCount}
          </AppText>
          <AppText variant="subheadline" style={{ color: secondary }}>
            {`${summary.currentMonthCount === 1 ? 'check-in' : 'check-ins'} · ${completedDays} ${completedDays === 1 ? 'active day' : 'active days'}`}
          </AppText>
        </View>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Daily check-ins in ${month}: ${summary.currentMonthDaily.map((count, index) => `${index + 1}: ${count}`).join(', ')}`}
          testID="month-progress-chart"
          style={{ gap: spacing.xs }}
        >
          <AppText variant="caption2" style={{ color: secondary, textAlign: 'right' }}>
            {`${maximum} / day`}
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 72 }}>
            {Array.from({ length: monthDays }, (_, index) => {
              const count = summary.currentMonthDaily[index] ?? 0;
              const future = index >= today.day;
              return (
                <View
                  key={index}
                  style={{
                    flex: 1,
                    height: count > 0 ? Math.max(4, (count / Math.max(1, maximum)) * 72) : 2,
                    borderRadius: 3,
                    borderCurve: radiusCurve,
                    backgroundColor: count > 0 ? colors.accent : colors.inactiveBar,
                    opacity: future ? 0.25 : 1,
                  }}
                />
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="caption2" style={{ color: secondary }}>{`${month} 1`}</AppText>
            <AppText variant="caption2" style={{ color: secondary }}>{`${month} ${monthDays}`}</AppText>
          </View>
        </View>
      </MetricCard>
    </View>
  );
}
