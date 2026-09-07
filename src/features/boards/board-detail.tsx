import { Stack, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/foundation/app-text';
import { Icon } from '@/components/foundation/icon';
import {
  deleteBoard,
  restoreBoard,
  updateBoard,
} from '@/core/domain/commands';
import type { BoardId } from '@/core/domain/ids';
import {
  getBoard,
  getBoardDependentCounts,
  getBoardHeatmap,
  getBoardSummary,
} from '@/core/domain/queries';
import { radius, radiusCurve, semanticColor, semanticFallbacks, spacing } from '@/theme';

import { deriveBoardColors } from './board-colors';
import { HeatmapView } from './heatmap-view';
import { InlineError, PrimaryButton, ProductPressable, useScheme } from '../ui';
import { useProduct, useProductQuery } from '../product-store';
import { HabitProgress } from '../analytics';

export function BoardDetailScreen({ boardId }: { boardId: BoardId }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useScheme();
  const { core, invalidate, nextCommandId } = useProduct();
  const board = useProductQuery((c) => getBoard(c, boardId), [boardId]);
  const summary = useProductQuery((c) => getBoardSummary(c, boardId), [boardId]);
  const heatmap = useProductQuery((c) => getBoardHeatmap(c, boardId), [boardId]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [scrollHeaderReady, setScrollHeaderReady] = useState(false);
  const resetScrollHeader = useCallback((view: ScrollView | null) => {
    if (view === null) setScrollHeaderReady(false);
  }, []);

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
  const supportError =
    summary.status === 'error'
      ? summary.error
      : heatmap.status === 'error'
        ? heatmap.error
        : null;

  // keep the scroll view in the first native descendant chain for ios edge effects.
  return (
    <View collapsable={false} style={{ flex: 1, backgroundColor: semanticColor('groupedBackground', scheme) }}>
      <Stack.Screen
        options={{
          title: record.title,
          // native layout must finish before navigation can find the scroll view.
          scrollEdgeEffects: { top: scrollHeaderReady ? 'soft' : 'automatic' },
          headerRight: archived
            ? undefined
            : () => (
                <ProductPressable
                  onPress={() => router.push(`/boards/${record.id}/edit`)}
                  label="Edit board"
                  testID="edit-board"
                >
                  <Icon name="pencil" size={22} color={semanticFallbacks.label[scheme]} />
                </ProductPressable>
              ),
        }}
      />
      <ScrollView
        ref={resetScrollHeader}
        onLayout={() => setScrollHeaderReady(true)}
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

        {record.metricsEnabled && summary.status === 'ready' && summary.value ? (
          <HabitProgress
            summary={summary.value}
            weeks={heatmap.status === 'ready' ? heatmap.value?.weeks : undefined}
            colors={colors}
          />
        ) : null}

        {actionError ? <InlineError message={actionError} testID="board-action-error" /> : null}
      </ScrollView>

      {!archived ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: Math.max(insets.bottom, spacing.md),
            gap: spacing.md,
          }}
          testID="board-actions"
        >
          <View
            style={{
              flexDirection: 'row',
              gap: spacing.sm,
              backgroundColor: semanticColor('secondaryGroupedBackground', scheme),
              borderRadius: radius.capsule,
              borderCurve: radiusCurve,
              paddingHorizontal: spacing.sm,
              paddingVertical: 4,
            }}
          >
            <ProductPressable
              onPress={record.metricsEnabled ? () => router.push(`/boards/${record.id}/analytics`) : undefined}
              disabled={!record.metricsEnabled}
              label="Analytics"
              testID="open-analytics"
            >
              <Icon name="analytics" size={23} color={semanticFallbacks.label[scheme]} />
            </ProductPressable>
            <ProductPressable
              onPress={() => router.push(`/boards/${record.id}/check-ins`)}
              label="Check-Ins"
              testID="open-check-ins"
            >
              <Icon name="checkIns" size={23} color={semanticFallbacks.label[scheme]} />
            </ProductPressable>
            <ProductPressable
              onPress={() => router.push(`/boards/${record.id}/journal`)}
              label="Journal"
              testID="open-journal"
            >
              <Icon name="journal" size={23} color={semanticFallbacks.label[scheme]} />
            </ProductPressable>
          </View>
          <ProductPressable
            // the reference opens the add check-in sheet: date defaults to
            // today and any past date is selectable there
            onPress={() => router.push(`/boards/${record.id}/check-ins/new`)}
            label="Add check-in"
            hint="Opens the add check-in sheet"
            testID="detail-add-check-in"
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
              <Icon name="add" size={27} color={colors.onAccent} />
            </View>
          </ProductPressable>
        </View>
      ) : null}
    </View>
  );
}
