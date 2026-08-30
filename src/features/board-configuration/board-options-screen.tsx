import { Slider } from '@expo/ui/community/slider';
import { Stack, useRouter } from 'expo-router';
import { Switch, View, ScrollView } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { boardLimits } from '@/core/domain/entities';
import type { BoardId } from '@/core/domain/ids';
import { radius, radiusCurve, semanticColor, spacing } from '@/theme';

import { PrimaryButton, ProductPressable, useScheme } from '../ui';
import { updateDraft, useDraftState } from './draft-store';

function formatShift(minute: number): string {
  const hour24 = Math.floor(minute / 60);
  const minutes = minute % 60;
  const suffix = hour24 < 12 ? 'AM' : 'PM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

// operates on the shared in-flight draft: values commit with the board save
// expectedBoardId is the route's authority: null for the create flow's
// draft segment, the parsed id for an edit flow
export function BoardOptionsScreen({ expectedBoardId }: { expectedBoardId: BoardId | null }) {
  const router = useRouter();
  const scheme = useScheme();
  const { draft, active } = useDraftState();
  const step = boardLimits.startOfDayMinuteStep;
  const max = boardLimits.startOfDayMinuteMax;

  // options only operate on the live draft session belonging to this
  // route's board; any other session or a dead one is rejected
  if (!active || draft.boardId !== expectedBoardId) {
    return (
      <View
        style={{ flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md }}
        testID="options-no-draft"
      >
        <AppText variant="title2" accessibilityRole="header">
          No board is being edited.
        </AppText>
        <PrimaryButton title="Back to Boards" onPress={() => router.dismissTo('/')} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: semanticColor('groupedBackground', scheme) }}>
      <Stack.Screen
        options={{
          title: 'Options',
          headerLeft: () => (
            <ProductPressable
              onPress={() => router.back()}
              label="Back to board"
              testID="options-back"
            >
              <AppText selectable={false}>Back</AppText>
            </ProductPressable>
          ),
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
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
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText>Track check-in time</AppText>
            <Switch
              accessibilityLabel="Track check-in time"
              value={draft.tracksTime}
              onValueChange={(tracksTime) => updateDraft({ tracksTime })}
              testID="track-time-toggle"
            />
          </View>
          <AppText variant="footnote">
            When disabled, you will not need to enter an exact time for each check-in, only the date.
          </AppText>
        </View>

        <AppText variant="title3" accessibilityRole="header">
          Start of day shift
        </AppText>
        <View
          style={{
            backgroundColor: semanticColor('secondaryGroupedBackground', scheme),
            borderRadius: radius.lg,
            borderCurve: radiusCurve,
            padding: spacing.lg,
            gap: spacing.md,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText>New day starts at</AppText>
            <AppText variant="headline" testID="start-of-day-value">
              {formatShift(draft.startOfDayMinute)}
            </AppText>
          </View>
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between' }}
            accessibilityRole="adjustable"
            accessible
            accessibilityLabel="Start of day shift"
            accessibilityValue={{ text: formatShift(draft.startOfDayMinute) }}
            accessibilityActions={[
              { name: 'increment', label: 'Later' },
              { name: 'decrement', label: 'Earlier' },
            ]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'increment') {
                updateDraft({ startOfDayMinute: Math.min(max, draft.startOfDayMinute + step) });
              } else {
                updateDraft({ startOfDayMinute: Math.max(0, draft.startOfDayMinute - step) });
              }
            }}
          >
            <ProductPressable
              onPress={() =>
                updateDraft({ startOfDayMinute: Math.max(0, draft.startOfDayMinute - step) })
              }
              disabled={draft.startOfDayMinute === 0}
              label="Shift start of day earlier"
              testID="shift-earlier"
            >
              <AppText variant="title2" selectable={false}>
                −
              </AppText>
            </ProductPressable>
            <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: spacing.md }}>
              {/* the native slider drags in the same 30-minute steps the
                  buttons use */}
              <Slider
                value={draft.startOfDayMinute}
                minimumValue={0}
                maximumValue={max}
                step={step}
                onValueChange={(value) =>
                  updateDraft({
                    startOfDayMinute: Math.min(max, Math.max(0, Math.round(value / step) * step)),
                  })
                }
                style={{ width: '100%', height: 32 }}
              />
            </View>
            <ProductPressable
              onPress={() =>
                updateDraft({ startOfDayMinute: Math.min(max, draft.startOfDayMinute + step) })
              }
              disabled={draft.startOfDayMinute === max}
              label="Shift start of day later"
              testID="shift-later"
            >
              <AppText variant="title2" selectable={false}>
                +
              </AppText>
            </ProductPressable>
          </View>
          <AppText variant="footnote">
            Delay when this board starts tracking a new day. Useful when you check in after
            midnight but still consider it the continuation of the previous day.
          </AppText>
        </View>

        <View
          style={{
            backgroundColor: semanticColor('secondaryGroupedBackground', scheme),
            borderRadius: radius.lg,
            borderCurve: radiusCurve,
            padding: spacing.lg,
            gap: spacing.sm,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText>Track performance metrics</AppText>
            <Switch
              accessibilityLabel="Track performance metrics"
              value={draft.metricsEnabled}
              onValueChange={(metricsEnabled) => updateDraft({ metricsEnabled })}
              testID="metrics-toggle"
            />
          </View>
          <AppText variant="footnote">
            When disabled, this board will not show Streak and Consistency metrics.
          </AppText>
        </View>
      </ScrollView>
    </View>
  );
}
