import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { Stack, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useRef, useState } from 'react';
import { Alert, ScrollView, TextInput, View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { currentLogicalDate, parseLogicalDate, toLogicalDate } from '@/core/calendar/logical-date';
import { createCheckIn, removeCheckIn, updateCheckIn } from '@/core/domain/commands';
import type { Board, CheckIn } from '@/core/domain/entities';
import type { BoardId, CheckInId, LogicalDate } from '@/core/domain/ids';
import type { DomainError } from '@/core/domain/result';
import { getBoard, getCheckIn } from '@/core/domain/queries';
import { minimumTouchTarget } from '@/foundation/accessibility';
import { radius, radiusCurve, semanticColor, spacing } from '@/theme';

import { BoardSymbol, deriveBoardColors } from '../boards';
import { InlineError, PrimaryButton, ProductPressable, useScheme } from '../ui';
import { useProduct, useProductQuery } from '../product-store';

type CheckInFormScreenProps = {
  boardId: BoardId;
  // null creates a new check-in; otherwise the existing record is edited
  checkInId: CheckInId | null;
};

// exactInstant preserves the picker's own instant so an ambiguous wall
// clock (the repeated hour of a backward dst shift) keeps the occurrence
// the user actually selected; it is dropped once the date changes
type TimeOfDay = { hour: number; minute: number; exactInstant: number | null };

function dateFromLogical(date: LogicalDate): Date {
  const { year, month, day } = parseLogicalDate(date);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function logicalFromDate(value: Date): LogicalDate {
  return toLogicalDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
}

// the wall-clock time a stored instant showed in its own recorded zone
function timeOfDayFromInstant(instantMs: number, timeZoneId: string): TimeOfDay {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    timeZone: timeZoneId,
  }).formatToParts(new Date(instantMs));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0) % 24;
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return { hour, minute, exactInstant: instantMs };
}

// the device-zone instant for a logical date at a wall-clock time; the
// occurrence always belongs to the selected LOGICAL date under the board's
// start-of-day shift, never to "now"
function instantFor(
  date: LogicalDate,
  time: TimeOfDay,
  timeZoneId: string,
  startOfDayMinute: number,
): number {
  if (
    time.exactInstant !== null &&
    // the picker's own instant is authoritative while it still belongs to
    // the selected logical date: it disambiguates the repeated dst hour and
    // keeps early-morning occurrences inside a shifted day intact
    currentLogicalDate(time.exactInstant, timeZoneId, startOfDayMinute) === date
  ) {
    return time.exactInstant;
  }
  const { year, month, day } = parseLogicalDate(date);
  const base = new Date(year, month - 1, day, time.hour, time.minute, 0, 0).getTime();
  if (currentLogicalDate(base, timeZoneId, startOfDayMinute) === date) {
    return base;
  }
  // inside a shifted day an early wall clock belongs to the next calendar
  // day; recombine there when that assignment matches the selection
  const nextDay = new Date(year, month - 1, day + 1, time.hour, time.minute, 0, 0).getTime();
  if (currentLogicalDate(nextDay, timeZoneId, startOfDayMinute) === date) {
    return nextDay;
  }
  // a spring-forward gap can invalidate both candidates; the next valid
  // time inside the selected logical day is its start-of-day wall clock
  // (date construction normalizes forward out of a gap, staying inside)
  return new Date(
    year,
    month - 1,
    day,
    Math.floor(startOfDayMinute / 60),
    startOfDayMinute % 60,
    0,
    0,
  ).getTime();
}

export function CheckInFormScreen({ boardId, checkInId }: CheckInFormScreenProps) {
  const router = useRouter();
  const { core } = useProduct();
  // conflicts remount the body with the reloaded record, so the notice
  // lives here where the remount cannot wipe it
  const [conflict, setConflict] = useState(false);
  const board = useProductQuery((c) => getBoard(c, boardId), [boardId]);
  const existing = useProductQuery(
    (c) =>
      checkInId ? getCheckIn(c, checkInId) : Promise.resolve({ ok: true as const, value: null }),
    [checkInId],
  );

  const loadedRecord =
    checkInId && existing.status === 'ready' ? existing.value : null;

  if (
    board.status === 'error' ||
    (checkInId && existing.status === 'ready' && existing.value === null) ||
    // a record reached through a mismatched board url is not exposed
    (loadedRecord && loadedRecord.boardId !== boardId)
  ) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg }}>
        <AppText variant="title2" accessibilityRole="header">
          This record is not available.
        </AppText>
        <PrimaryButton title="Back to Boards" onPress={() => router.dismissTo('/')} />
      </View>
    );
  }

  if (board.status !== 'ready' || (checkInId && existing.status !== 'ready')) {
    return <View testID="check-in-form-loading" style={{ flex: 1 }} />;
  }

  // an archived board is read-only: direct links to its check-in forms
  // land on an explanation instead of an editable form
  if (board.value.archivedAt !== null) {
    return (
      <View
        style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg }}
        testID="check-in-archived-board"
      >
        <AppText variant="title2" accessibilityRole="header">
          This board is archived.
        </AppText>
        <AppText>Restore it from its board page to change its check-ins.</AppText>
        <PrimaryButton title="Back to Boards" onPress={() => router.dismissTo('/')} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {conflict ? (
        <View style={{ padding: spacing.lg }}>
          <AppText testID="check-in-conflict">
            This check-in changed elsewhere. The latest values are shown - review your changes
            and save again.
          </AppText>
        </View>
      ) : null}
      <CheckInFormBody
        // a reloaded record reseeds every field, so a conflict retry carries
        // the fresh mutation stamp instead of failing forever
        key={loadedRecord ? loadedRecord.mutationStamp : 'new'}
        board={board.value}
        record={loadedRecord}
        onConflict={() => setConflict(true)}
        today={currentLogicalDate(
          core.clock.nowUtcMs(),
          core.clock.timeZoneId(),
          board.value.startOfDayMinute,
        )}
      />
    </View>
  );
}

// mounted only once its data exists, so form state seeds in useState
function CheckInFormBody({
  board,
  record,
  today,
  onConflict,
}: {
  board: Board;
  record: CheckIn | null;
  today: LogicalDate;
  onConflict: () => void;
}) {
  const router = useRouter();
  const navigation = useNavigation();
  const scheme = useScheme();
  const { core, invalidate, nextCommandId } = useProduct();
  const deviceZone = core.clock.timeZoneId();
  const [dirty, setDirty] = useState(false);
  const skipGuardRef = useRef(false);
  const [logicalDate, setLogicalDate] = useState<LogicalDate>(record?.logicalDate ?? today);
  // time is stored as a wall-clock time of day and recombined with the
  // selected date at save, so a historical date never carries today's instant
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay | null>(() => {
    if (record && record.occurredAtUtc !== null) {
      return timeOfDayFromInstant(record.occurredAtUtc, record.timeZoneId ?? deviceZone);
    }
    if (record || !board.tracksTime) {
      return null;
    }
    return timeOfDayFromInstant(core.clock.nowUtcMs(), deviceZone);
  });
  const [timeTouched, setTimeTouched] = useState(record !== null);
  // a record edit resubmits its occurrence only when the user changed the
  // date or time; otherwise the stored instant, zone, and offset survive a
  // device zone change untouched
  const [occurrenceEdited, setOccurrenceEdited] = useState(false);
  const [amountText, setAmountText] = useState(
    record
      ? record.amount === null
        ? ''
        : String(record.amount)
      : board.tracksAmount
        ? String(board.quickAmount)
        : '',
  );
  const [note, setNote] = useState(record?.note ?? '');
  const [error, setError] = useState<DomainError | null>(null);
  const [saving, setSaving] = useState(false);

  // a swipe-down or other removal of an edited form must confirm first
  usePreventRemove(dirty, ({ data }) => {
    if (skipGuardRef.current) {
      navigation.dispatch(data.action);
      return;
    }
    Alert.alert('Discard changes?', 'Your edits to this check-in are not saved.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          skipGuardRef.current = true;
          navigation.dispatch(data.action);
        },
      },
    ]);
  });

  const changeDate = useCallback(
    (value: Date) => {
      const next = logicalFromDate(value);
      setLogicalDate(next);
      setDirty(true);
      setOccurrenceEdited(true);
      // an untouched time follows the date: now for today, noon for the past
      if (!timeTouched && board.tracksTime) {
        setTimeOfDay(
          next === today
            ? timeOfDayFromInstant(core.clock.nowUtcMs(), deviceZone)
            : { hour: 12, minute: 0, exactInstant: null },
        );
      } else if (board.tracksTime) {
        // a chosen time survives a date change as wall clock only; the
        // exact instant belonged to the previous date
        setTimeOfDay((current) =>
          current === null ? current : { ...current, exactInstant: null },
        );
      }
    },
    [board.tracksTime, core, deviceZone, timeTouched, today],
  );

  const save = useCallback(async () => {
    if (saving) {
      return;
    }
    setSaving(true);
    setError(null);
    const amount =
      board.tracksAmount && amountText.trim().length > 0
        ? Number(amountText.replace(',', '.'))
        : undefined;
    const occurredAtUtc =
      board.tracksTime && timeOfDay !== null && (record === null || occurrenceEdited)
        ? instantFor(logicalDate, timeOfDay, deviceZone, board.startOfDayMinute)
        : undefined;
    const result = record
      ? await updateCheckIn(core, {
          commandId: nextCommandId(),
          checkInId: record.id,
          expectedMutationStamp: record.mutationStamp,
          logicalDate,
          occurredAtUtc,
          amount,
          note,
        })
      : await createCheckIn(core, {
          commandId: nextCommandId(),
          boardId: board.id,
          logicalDate,
          occurredAtUtc,
          amount,
          note,
          source: 'app',
        });
    if (result.ok) {
      invalidate();
      skipGuardRef.current = true;
      router.back();
      return;
    }
    if (result.error.code === 'conflict') {
      // reload the record so the reseeded sheet carries the fresh stamp;
      // the parent shows the notice across the remount
      onConflict();
      invalidate();
    }
    setError(result.error);
    setSaving(false);
  }, [amountText, board, core, deviceZone, invalidate, logicalDate, nextCommandId, note, occurrenceEdited, onConflict, record, router, saving, timeOfDay]);

  const confirmDelete = useCallback(() => {
    if (!record) {
      return;
    }
    Alert.alert('Delete Check-In', 'This permanently deletes the check-in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete Check-In',
        style: 'destructive',
        onPress: () => {
          void removeCheckIn(core, { commandId: nextCommandId(), checkInId: record.id }).then(
            (result) => {
              if (result.ok) {
                invalidate();
                skipGuardRef.current = true;
                router.back();
              } else {
                setError(result.error);
              }
            },
          );
        },
      },
    ]);
  }, [core, invalidate, nextCommandId, record, router]);

  const colors = deriveBoardColors(board.accentHex, scheme);
  const timePickerValue =
    timeOfDay === null
      ? // an untimed record shows a neutral noon of its date; the value is
        // only persisted once the user actually picks a time
        dateFromLogical(logicalDate)
      : (() => {
          const { year, month, day } = parseLogicalDate(logicalDate);
          return new Date(year, month - 1, day, timeOfDay.hour, timeOfDay.minute, 0, 0);
        })();

  return (
    <View style={{ flex: 1, backgroundColor: semanticColor('groupedBackground', scheme) }}>
      <Stack.Screen
        options={{
          title: record ? 'Edit Check-in' : 'Add Check-in',
          headerLeft: () => (
            <ProductPressable onPress={() => router.back()} label="Cancel" testID="check-in-cancel">
              <AppText selectable={false}>Cancel</AppText>
            </ProductPressable>
          ),
          headerRight: () => (
            <ProductPressable onPress={save} label="Save check-in" testID="check-in-save">
              <AppText variant="headline" selectable={false}>
                Save
              </AppText>
            </ProductPressable>
          ),
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        keyboardShouldPersistTaps="handled"
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
          accessible
          accessibilityLabel={`Board: ${board.title}`}
        >
          <BoardSymbol symbol={board.symbol} color={colors.accent} size={18} />
          <AppText selectable={false}>{board.title}</AppText>
        </View>

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
            <AppText>Date</AppText>
            <DateTimePicker
              value={dateFromLogical(logicalDate)}
              mode="date"
              display="compact"
              maximumDate={new Date(core.clock.nowUtcMs())}
              accentColor={colors.accent}
              onValueChange={(_event, date) => changeDate(date)}
              testID="check-in-date"
            />
          </View>
          {board.tracksTime ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText>Time</AppText>
              <DateTimePicker
                value={timePickerValue}
                mode="time"
                display="compact"
                accentColor={colors.accent}
                onValueChange={(_event, date) => {
                  setTimeOfDay({
                    hour: date.getHours(),
                    minute: date.getMinutes(),
                    exactInstant: date.getTime(),
                  });
                  setTimeTouched(true);
                  setOccurrenceEdited(true);
                  setDirty(true);
                }}
                testID="check-in-time"
              />
            </View>
          ) : null}
          {board.tracksAmount ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText>{board.amountUnit ? `Amount (${board.amountUnit})` : 'Amount'}</AppText>
              <TextInput
                accessibilityLabel="Amount"
                keyboardType="decimal-pad"
                value={amountText}
                onChangeText={(text) => {
                  setAmountText(text);
                  setDirty(true);
                }}
                style={{
                  minHeight: minimumTouchTarget,
                  minWidth: 90,
                  textAlign: 'right',
                  color: semanticColor('label', scheme) as string,
                  fontSize: 17,
                }}
                testID="check-in-amount"
              />
            </View>
          ) : null}
        </View>

        <TextInput
          accessibilityLabel="Note"
          placeholder="Note…"
          placeholderTextColor={semanticColor('secondaryLabel', scheme) as string}
          value={note}
          onChangeText={(text) => {
            setNote(text);
            setDirty(true);
          }}
          multiline
          style={{
            minHeight: 120,
            backgroundColor: semanticColor('secondaryGroupedBackground', scheme) as string,
            borderRadius: radius.lg,
            borderCurve: radiusCurve,
            padding: spacing.lg,
            color: semanticColor('label', scheme) as string,
            fontSize: 17,
            textAlignVertical: 'top',
          }}
          testID="check-in-note"
        />

        {error ? <InlineError message={error.message} testID="check-in-error" /> : null}

        {record ? (
          <PrimaryButton
            title="Delete Check-In"
            destructive
            onPress={confirmDelete}
            testID="delete-check-in"
          />
        ) : null}
      </ScrollView>
    </View>
  );
}
