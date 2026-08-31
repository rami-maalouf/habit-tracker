import { View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import type { HomeBoardCard } from '@/core/domain/queries';
import { minimumTouchTarget } from '@/foundation/accessibility';
import { radius, radiusCurve, semanticColor, spacing } from '@/theme';

import { deriveBoardColors } from './board-colors';
import { BoardSymbol } from './board-symbol';
import { ProductPressable, useScheme } from '../ui';
import { SevenDayStrip } from './seven-day-strip';

type BoardCardProps = {
  card: HomeBoardCard;
  onOpen?: () => void;
  onQuickCheckIn?: () => void;
  quickPending?: boolean;
  // edit-boards mode replaces the quick action with move controls
  editMode?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  testID?: string;
};

export function BoardCard({
  card,
  onOpen,
  onQuickCheckIn,
  quickPending,
  editMode,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  testID,
}: BoardCardProps) {
  const scheme = useScheme();
  const colors = deriveBoardColors(card.board.accentHex, scheme);
  const background = card.board.usesTintedBackground
    ? colors.tintedCardBackground
    : semanticColor('secondaryGroupedBackground', scheme);

  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: background,
        borderRadius: radius.capsule,
        borderCurve: radiusCurve,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        gap: spacing.md,
        minHeight: 72,
      }}
    >
      <ProductPressable
        onPress={onOpen}
        label={card.board.title}
        hint="Opens the board"
        disabled={!onOpen}
        stretch
        style={{ flex: 1 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <BoardSymbol symbol={card.board.symbol} color={colors.accent} />
          <AppText
            variant="headline"
            numberOfLines={1}
            selectable={false}
            style={{ flexShrink: 1 }}
          >
            {card.board.title}
          </AppText>
        </View>
      </ProductPressable>
      {editMode ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <ProductPressable
            onPress={onMoveUp}
            disabled={!canMoveUp}
            label={`Move ${card.board.title} up`}
            testID={`${testID}-move-up`}
          >
            <AppText selectable={false}>Up</AppText>
          </ProductPressable>
          <ProductPressable
            onPress={onMoveDown}
            disabled={!canMoveDown}
            label={`Move ${card.board.title} down`}
            testID={`${testID}-move-down`}
          >
            <AppText selectable={false}>Down</AppText>
          </ProductPressable>
        </View>
      ) : (
        <>
          <SevenDayStrip strip={card.stripData} colors={colors} />
          <ProductPressable
            onPress={onQuickCheckIn}
            disabled={quickPending || !onQuickCheckIn}
            label={`Check in to ${card.board.title}`}
            hint="Records one check-in for today"
            testID={`${testID}-quick`}
          >
            <View
              style={{
                width: minimumTouchTarget,
                height: minimumTouchTarget,
                borderRadius: radius.capsule,
                borderCurve: radiusCurve,
                backgroundColor: colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: radius.capsule,
                  borderCurve: radiusCurve,
                  borderWidth: 3,
                  borderColor: colors.onAccent,
                }}
              />
            </View>
          </ProductPressable>
        </>
      )}
    </View>
  );
}
