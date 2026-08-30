import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import {
  createCheckIn,
  deleteBoard,
  dismissMetricsEducation,
  restoreBoard,
  undoCreatedCheckIn,
  updateBoard,
} from '@/core/domain/commands';
import type { BoardId, CheckInId, CommandId } from '@/core/domain/ids';
import {
  getBoard,
  getBoardDependentCounts,
  getBoardHeatmap,
  getBoardSummary,
  getMetricsEducationDismissed,
} from '@/core/domain/queries';
import { triggerActionHaptic } from '@/foundation/haptics';
import { radius, radiusCurve, semanticColor, spacing } from '@/theme';

import { deriveBoardColors } from './board-colors';
import { HeatmapView } from './heatmap-view';
import { InlineError, PrimaryButton, ProductPressable, useScheme } from '../ui';
import { useProduct, useProductQuery } from '../product-store';

function SummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
  const scheme = useScheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: semanticColor('secondaryGroupedBackground', scheme),
        borderRadius: radius.lg,
        borderCurve: radiusCurve,
        padding: spacing.lg,
        gap: spacing.sm,
        minHeight: 110,
      }}
    >
      <AppText variant="footnote">{title.toUpperCase()}</AppText>
      {children}
    </View>
  );
}

export function BoardDetailScreen({ boardId }: { boardId: BoardId }) {
  const router = useRouter();
  const scheme = useScheme();
  const { core, invalidate, nextCommandId } = useProduct();
  const board = useProductQuery((c) => getBoard(c, boardId), [boardId]);
  const summary = useProductQuery((c) => getBoardSummary(c, boardId), [boardId]);
  const heatmap = useProductQuery((c) => getBoardHeatmap(c, boardId), [boardId]);
  const dismissed = useProductQuery((c) => getMetricsEducationDismissed(c), []);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [quickPending, setQuickPending] = useState(false);
  const [undo, setUndo] = useState<{
    checkInId: CheckInId;
    createdByCommandId: CommandId;
  } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimer.current) {
        clearTimeout(undoTimer.current);
      }
    };
  }, []);

  const quickAdd = useCallback(async () => {
    // a rapid double tap must not record two check-ins
    setQuickPending(true);
    setActionError(null);
    const commandId = nextCommandId();
    const result = await createCheckIn(core, {
      commandId,
      boardId,
      source: 'app',
    });
    setQuickPending(false);
    if (result.ok) {
      void triggerActionHaptic();
      invalidate();
      if (undoTimer.current) {
        clearTimeout(undoTimer.current);
      }
      setUndo({ checkInId: result.value.checkInId, createdByCommandId: commandId });
      undoTimer.current = setTimeout(() => setUndo(null), 5000);
    } else {
      setActionError(result.error.message);
    }
  }, [boardId, core, invalidate, nextCommandId]);

  const undoLast = useCallback(async () => {
    if (!undo) {
      return;
    }
    if (undoTimer.current) {
      clearTimeout(undoTimer.current);
    }
    setUndo(null);
    const result = await undoCreatedCheckIn(core, {
      commandId: nextCommandId(),
      checkInId: undo.checkInId,
      createdByCommandId: undo.createdByCommandId,
    });
    if (result.ok) {
      invalidate();
    } else {
      setActionError(result.error.message);
    }
  }, [core, invalidate, nextCommandId, undo]);

  const confirmDelete = useCallback(async () => {
    const counts = await getBoardDependentCounts(core, boardId);
    const summaryText = counts.ok
      ? `This permanently deletes ${counts.value.checkIns} check-ins, ${counts.value.notes} notes, and ${counts.value.reminders} reminders.`
      : 'This permanently deletes the board and everything it contains.';
    Alert.alert('Delete Board', summaryText, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete Board',
        style: 'destructive',
        onPress: () => {
          void deleteBoard(core, { commandId: nextCommandId(), boardId }).then((result) => {
            if (result.ok) {
              invalidate();
              router.dismissTo('/');
            } else {
              setActionError(result.error.message);
            }
          });
        },
      },
    ]);
  }, [boardId, core, invalidate, nextCommandId, router]);

  if (board.status === 'loading') {
    return <View testID="board-loading" style={{ flex: 1 }} />;
  }

  if (board.status === 'error') {
    // covers missing and deleted boards with a recovery path home
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg }}>
        <Stack.Screen options={{ title: 'Board unavailable' }} />
        <AppText variant="title2" accessibilityRole="header">
          This board is not available.
        </AppText>
        <AppText>{board.error.message}</AppText>
        <PrimaryButton title="Back to Boards" onPress={() => router.dismissTo('/')} testID="board-recovery-home" />
      </View>
    );
  }

  const record = board.value;
  const colors = deriveBoardColors(record.accentHex, scheme);
  const archived = record.archivedAt !== null;
  const educationDismissed =
    dismissed.status === 'ready' && dismissed.value.includes(record.id);
  const metricsReady = summary.status === 'ready' && summary.value !== null && summary.value.metricsReady;
  // a failed supporting query surfaces with a retry instead of silently
  // hiding a section or misrendering the education card
  const supportError =
    summary.status === 'error'
      ? summary.error
      : heatmap.status === 'error'
        ? heatmap.error
        : dismissed.status === 'error'
          ? dismissed.error
          : null;
  const supportReady = summary.status === 'ready' && dismissed.status === 'ready';

  return (
    <View style={{ flex: 1, backgroundColor: semanticColor('groupedBackground', scheme) }}>
      <Stack.Screen
        options={{
          title: record.title,
          headerRight: archived
            ? undefined
            : () => (
                <ProductPressable
                  onPress={() => router.push(`/boards/${record.id}/edit`)}
                  label="Edit board"
                  testID="edit-board"
                >
                  <AppText selectable={false}>Edit</AppText>
                </ProductPressable>
              ),
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      >
        {archived ? (
          <View
            style={{
              backgroundColor: semanticColor('secondaryGroupedBackground', scheme),
              borderRadius: radius.lg,
              borderCurve: radiusCurve,
              padding: spacing.lg,
              gap: spacing.md,
            }}
            testID="archived-banner"
          >
            <AppText variant="headline">This board is archived.</AppText>
            <AppText variant="subheadline">
              It is read-only until you restore it. Its history stays safe.
            </AppText>
            <PrimaryButton
              title="Restore Board"
              testID="restore-board"
              onPress={() => {
                void restoreBoard(core, { commandId: nextCommandId(), boardId }).then((result) => {
                  if (result.ok) {
                    invalidate();
                  } else {
                    setActionError(result.error.message);
                  }
                });
              }}
            />
            <PrimaryButton title="Delete Board" destructive onPress={confirmDelete} testID="delete-board" />
          </View>
        ) : null}

        {supportError ? (
          <View style={{ gap: spacing.md }} testID="detail-query-error">
            <InlineError message={supportError.message} />
            <PrimaryButton
              title="Try again"
              onPress={invalidate}
              testID="detail-query-retry"
            />
          </View>
        ) : null}

        {heatmap.status === 'ready' && heatmap.value ? (
          <View
            style={{
              backgroundColor: semanticColor('secondaryGroupedBackground', scheme),
              borderRadius: radius.lg,
              borderCurve: radiusCurve,
              padding: spacing.lg,
            }}
          >
            <HeatmapView weeks={heatmap.value.weeks} colors={colors} testID="board-heatmap" />
          </View>
        ) : null}

        {supportReady && record.metricsEnabled && !metricsReady && !educationDismissed && !archived ? (
          <View
            style={{
              backgroundColor: semanticColor('secondaryGroupedBackground', scheme),
              borderRadius: radius.lg,
              borderCurve: radiusCurve,
              padding: spacing.lg,
              gap: spacing.md,
            }}
            testID="metrics-education"
          >
            <AppText>
              Metrics appear and become meaningful with more data. Stick with your goal and
              Ripples will help you uncover useful insights.
            </AppText>
            <ProductPressable
              onPress={() => setExamplesOpen((current) => !current)}
              label="Look at example boards"
              testID="example-boards"
            >
              <AppText variant="headline" selectable={false}>
                Look at example boards
              </AppText>
            </ProductPressable>
            {examplesOpen ? (
              <AppText variant="subheadline" testID="example-boards-copy">
                Example: a reading board checked in five days a week shows a growing streak, a
                high consistency band, and weekday patterns after its first week. No sample data
                is added to your own boards.
              </AppText>
            ) : null}
            <ProductPressable
              onPress={() => {
                void dismissMetricsEducation(core, {
                  commandId: nextCommandId(),
                  boardId,
                }).then((result) => {
                  if (result.ok) {
                    invalidate();
                  } else {
                    setActionError(result.error.message);
                  }
                });
              }}
              label="Dismiss metrics education"
              testID="dismiss-education"
            >
              <AppText variant="subheadline" selectable={false}>
                Dismiss
              </AppText>
            </ProductPressable>
          </View>
        ) : null}

        {!record.metricsEnabled && !archived ? (
          <View
            style={{
              backgroundColor: semanticColor('secondaryGroupedBackground', scheme),
              borderRadius: radius.lg,
              borderCurve: radiusCurve,
              padding: spacing.lg,
              gap: spacing.md,
            }}
            testID="metrics-disabled"
          >
            <AppText>Performance metrics are off for this board.</AppText>
            <PrimaryButton
              title="Enable Metrics"
              testID="enable-metrics"
              onPress={() => {
                void updateBoard(core, {
                  commandId: nextCommandId(),
                  boardId,
                  expectedMutationStamp: record.mutationStamp,
                  title: record.title,
                  symbol: record.symbol,
                  accentHex: record.accentHex,
                  usesTintedBackground: record.usesTintedBackground,
                  tracksAmount: record.tracksAmount,
                  tracksTime: record.tracksTime,
                  startOfDayMinute: record.startOfDayMinute,
                  metricsEnabled: true,
                }).then((result) => {
                  if (result.ok) {
                    invalidate();
                  } else {
                    setActionError(result.error.message);
                  }
                });
              }}
            />
          </View>
        ) : null}

        {record.metricsEnabled && metricsReady && summary.status === 'ready' && summary.value ? (
          <View style={{ gap: spacing.md }} testID="metrics-cards">
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <SummaryCard title="Current streak">
                <AppText variant="title1">{String(summary.value.currentStreak)}</AppText>
                <AppText variant="footnote">{`Longest: ${summary.value.longestStreak}`}</AppText>
              </SummaryCard>
              <SummaryCard title="Consistency">
                <AppText variant="title2">
                  {summary.value.consistencyBand === null
                    ? 'Not yet'
                    : summary.value.consistencyBand === 'low'
                      ? 'Low'
                      : summary.value.consistencyBand === 'average'
                        ? 'Average'
                        : 'High'}
                </AppText>
                {summary.value.consistencyPercent !== null ? (
                  <AppText variant="footnote">{`${Math.round(summary.value.consistencyPercent)}% of the last 30 days`}</AppText>
                ) : null}
              </SummaryCard>
            </View>
            <SummaryCard title="Current month">
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
                <AppText variant="title1">{String(summary.value.currentMonthCount)}</AppText>
                <AppText variant="subheadline">check-ins</AppText>
              </View>
              <AppText variant="footnote">{`Current week: ${summary.value.currentWeekCount}`}</AppText>
              <View
                style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 42 }}
                accessible
                accessibilityLabel={`Daily counts this month: ${summary.value.currentMonthDaily.join(', ')}`}
              >
                {summary.value.currentMonthDaily.map((count, index) => (
                  <View
                    key={index}
                    style={{
                      flex: 1,
                      height: Math.max(3, Math.min(42, count * 14)),
                      borderRadius: 2,
                      backgroundColor: count > 0 ? colors.accent : colors.inactiveBar,
                    }}
                  />
                ))}
              </View>
            </SummaryCard>
          </View>
        ) : null}

        {actionError ? <InlineError message={actionError} testID="board-action-error" /> : null}
      </ScrollView>

      {undo ? (
        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            backgroundColor: semanticColor('secondaryGroupedBackground', scheme),
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <AppText variant="subheadline">{`Checked in to ${record.title}`}</AppText>
          <ProductPressable onPress={undoLast} label="Undo check-in" testID="detail-undo">
            <AppText variant="headline" selectable={false}>
              Undo
            </AppText>
          </ProductPressable>
        </View>
      ) : null}

      {!archived ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: spacing.lg,
            gap: spacing.md,
          }}
          testID="board-actions"
        >
          <View
            style={{
              flexDirection: 'row',
              gap: spacing.xl,
              backgroundColor: semanticColor('secondaryGroupedBackground', scheme),
              borderRadius: radius.capsule,
              borderCurve: radiusCurve,
              paddingHorizontal: spacing.xl,
            }}
          >
            <ProductPressable
              onPress={record.metricsEnabled ? () => router.push(`/boards/${record.id}/analytics`) : undefined}
              disabled={!record.metricsEnabled}
              label="Analytics"
              testID="open-analytics"
            >
              <AppText selectable={false}>Analytics</AppText>
            </ProductPressable>
            <ProductPressable
              onPress={() => router.push(`/boards/${record.id}/check-ins`)}
              label="Check-Ins"
              testID="open-check-ins"
            >
              <AppText selectable={false}>Check-Ins</AppText>
            </ProductPressable>
            <ProductPressable
              onPress={() => router.push(`/boards/${record.id}/journal`)}
              label="Journal"
              testID="open-journal"
            >
              <AppText selectable={false}>Journal</AppText>
            </ProductPressable>
          </View>
          <ProductPressable
            onPress={quickAdd}
            disabled={quickPending}
            label={`Check in to ${record.title}`}
            testID="detail-quick"
          >
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: radius.capsule,
                borderCurve: radiusCurve,
                backgroundColor: colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppText variant="title2" style={{ color: colors.onAccent }} selectable={false}>
                +
              </AppText>
            </View>
          </ProductPressable>
        </View>
      ) : null}
    </View>
  );
}
