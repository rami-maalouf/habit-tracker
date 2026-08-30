import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { createCheckIn, reorderBoard, undoCreatedCheckIn } from '@/core/domain/commands';
import type { BoardId, CheckInId, CommandId } from '@/core/domain/ids';
import type { HomeBoardCard } from '@/core/domain/queries';
import { getHomeBoardProjection } from '@/core/domain/queries';
import { triggerActionHaptic } from '@/foundation/haptics';
import { semanticColor, spacing } from '@/theme';

import { BoardCard } from './board-card';
import { InlineError, PrimaryButton, ProductPressable, useScheme } from '../ui';
import { useProduct, useProductQuery } from '../product-store';

type UndoState = {
  boardTitle: string;
  checkInId: CheckInId;
  createdByCommandId: CommandId;
};

const UNDO_WINDOW_MS = 5000;

export function BoardsHomeScreen() {
  const router = useRouter();
  const scheme = useScheme();
  const { core, invalidate, nextCommandId } = useProduct();
  const boards = useProductQuery((c) => getHomeBoardProjection(c), []);
  const [editMode, setEditMode] = useState(false);
  // pending is a set: concurrent quick check-ins on different boards must
  // not re-enable or clear each other
  const [pendingBoardIds, setPendingBoardIds] = useState<ReadonlySet<BoardId>>(new Set());
  const [quickError, setQuickError] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimer.current) {
        clearTimeout(undoTimer.current);
      }
    };
  }, []);

  const quickCheckIn = useCallback(
    async (card: HomeBoardCard) => {
      setPendingBoardIds((current) => new Set(current).add(card.board.id));
      setQuickError(null);
      const commandId = nextCommandId();
      const result = await createCheckIn(core, {
        commandId,
        boardId: card.board.id,
        source: 'app',
      });
      setPendingBoardIds((current) => {
        const next = new Set(current);
        next.delete(card.board.id);
        return next;
      });
      if (!result.ok) {
        setQuickError(result.error.message);
        return;
      }
      void triggerActionHaptic();
      invalidate();
      if (undoTimer.current) {
        clearTimeout(undoTimer.current);
      }
      setUndo({
        boardTitle: card.board.title,
        checkInId: result.value.checkInId,
        createdByCommandId: commandId,
      });
      undoTimer.current = setTimeout(() => setUndo(null), UNDO_WINDOW_MS);
    },
    [core, invalidate, nextCommandId],
  );

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
      // the undo surface is gone, so its failure lands on the shared line
      setQuickError(result.error.message);
    }
  }, [core, invalidate, nextCommandId, undo]);

  const move = useCallback(
    async (cards: HomeBoardCard[], index: number, direction: -1 | 1) => {
      const target = cards[index + direction];
      if (!target) {
        return;
      }
      // moving up places the board before its previous neighbor
      const newIndex = index + direction;
      const previous = direction === -1 ? cards[newIndex - 1] : cards[newIndex];
      const next = direction === -1 ? cards[newIndex] : cards[newIndex + 1];
      const result = await reorderBoard(core, {
        commandId: nextCommandId(),
        boardId: cards[index].board.id,
        previousBoardId: previous ? previous.board.id : null,
        nextBoardId: next ? next.board.id : null,
      });
      if (result.ok) {
        invalidate();
      } else {
        // a neighbor may have vanished concurrently; say so instead of a
        // silently dead control
        setQuickError(result.error.message);
      }
    },
    [core, invalidate, nextCommandId],
  );

  return (
    <View style={{ flex: 1, backgroundColor: semanticColor('groupedBackground', scheme) }}>
      <Stack.Screen
        options={{
          title: 'Boards',
          headerLeft: () => (
            <ProductPressable
              onPress={() => router.push('/settings')}
              label="Settings"
              hint="Opens settings"
              testID="open-settings"
            >
              <AppText selectable={false}>•••</AppText>
            </ProductPressable>
          ),
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <ProductPressable
                onPress={() => setEditMode((current) => !current)}
                label={editMode ? 'Done editing boards' : 'Edit boards'}
                selected={editMode}
                testID="toggle-edit-boards"
              >
                <AppText selectable={false}>{editMode ? 'Done' : 'Edit'}</AppText>
              </ProductPressable>
              <ProductPressable
                onPress={() => router.push('/boards/new')}
                label="Create board"
                testID="create-board"
              >
                <AppText variant="title2" selectable={false}>
                  +
                </AppText>
              </ProductPressable>
            </View>
          ),
        }}
      />
      {boards.status === 'loading' ? (
        <View testID="boards-loading" style={{ flex: 1 }} />
      ) : boards.status === 'error' ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <InlineError message={boards.error.message} testID="boards-error" />
          <PrimaryButton title="Try again" onPress={boards.refresh} />
        </View>
      ) : boards.value.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg }}>
          <AppText variant="title2" accessibilityRole="header">
            Boards turn habits into something you can see.
          </AppText>
          <PrimaryButton
            title="Create Board"
            onPress={() => router.push('/boards/new')}
            testID="empty-create-board"
          />
        </View>
      ) : (
        <FlatList
          data={boards.value}
          keyExtractor={(card) => card.board.id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          renderItem={({ item, index }) => (
            <BoardCard
              card={item}
              testID={`board-card-${index}`}
              onOpen={() => router.push(`/boards/${item.board.id}`)}
              onQuickCheckIn={() => quickCheckIn(item)}
              quickPending={pendingBoardIds.has(item.board.id)}
              editMode={editMode}
              canMoveUp={index > 0}
              canMoveDown={index < boards.value.length - 1}
              onMoveUp={() => move(boards.value, index, -1)}
              onMoveDown={() => move(boards.value, index, 1)}
            />
          )}
        />
      )}
      {quickError ? (
        <View style={{ padding: spacing.lg }}>
          <InlineError message={quickError} testID="quick-error" />
        </View>
      ) : null}
      {undo ? (
        <View
          style={{
            padding: spacing.lg,
            backgroundColor: semanticColor('secondaryGroupedBackground', scheme),
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <AppText variant="subheadline">{`Checked in to ${undo.boardTitle}`}</AppText>
          <ProductPressable onPress={undoLast} label="Undo check-in" testID="undo-check-in">
            <AppText variant="headline" selectable={false}>
              Undo
            </AppText>
          </ProductPressable>
        </View>
      ) : null}
    </View>
  );
}
