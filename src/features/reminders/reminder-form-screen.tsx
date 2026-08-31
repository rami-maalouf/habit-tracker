import {
  BottomSheet,
  BottomSheetView,
  type BottomSheetMethods,
} from '@expo/ui/community/bottom-sheet';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, ScrollView, TextInput, View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import type { Board, Reminder } from '@/core/domain/entities';
import type { BoardId, ReminderId } from '@/core/domain/ids';
import type { DomainError } from '@/core/domain/result';
import { getBoard, getReminder } from '@/core/domain/queries';
import {
  createReminder,
  deleteReminder,
  updateReminder,
} from '@/core/domain/reminder-commands';
import { minimumTouchTarget } from '@/foundation/accessibility';
import { reminderScheduler } from '@/platform/notifications';
import { radius, radiusCurve, semanticColor, spacing } from '@/theme';

import { deriveBoardColors } from '../boards';
import { getDraftState, updateDraft } from '../board-configuration/draft-store';
import type { DraftReminder } from '../board-configuration/draft-store';
import { InlineError, PrimaryButton, ProductPressable, useScheme } from '../ui';
import { useProduct, useProductQuery } from '../product-store';
import { WEEKDAYS, formatMinuteOfDay, isWeekdaySelected, toggleWeekday } from './weekdays';

type ReminderFormScreenProps = {
  // null targets the unsaved board draft session
  boardId: BoardId | null;
  // an existing reminder to edit, on a saved board
  reminderId: ReminderId | null;
  // an existing draft entry to edit, on an unsaved board
  draftIndex: number | null;
};

const DEFAULT_MINUTE = 9 * 60;

function minuteToDate(minute: number): Date {
  return new Date(2000, 0, 1, Math.floor(minute / 60), minute % 60, 0, 0);
}

export function ReminderFormScreen({ boardId, reminderId, draftIndex }: ReminderFormScreenProps) {
  const router = useRouter();
  const scheme = useScheme();
  const sheetRef = useRef<BottomSheetMethods>(null);
  const dirtyRef = useRef(false);
  const skipGuardRef = useRef(false);
  // a conflict remounts the body with the reloaded record; the notice
  // lives here where the remount cannot wipe it
  const [conflict, setConflict] = useState(false);

  const board = useProductQuery(
    (c) => (boardId ? getBoard(c, boardId) : Promise.resolve({ ok: true as const, value: null })),
    [boardId],
  );
  const existing = useProductQuery(
    (c) =>
      reminderId ? getReminder(c, reminderId) : Promise.resolve({ ok: true as const, value: null }),
    [reminderId],
  );

  const closeFromSheet = useCallback(() => {
    if (skipGuardRef.current) {
      return;
    }
    if (dirtyRef.current) {
      Alert.alert('Discard changes?', 'Your edits to this reminder are not saved.', [
        { text: 'Keep editing', style: 'cancel', onPress: () => sheetRef.current?.present() },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            skipGuardRef.current = true;
            router.back();
          },
        },
      ]);
      return;
    }
    skipGuardRef.current = true;
    router.back();
  }, [router]);

  const draftState = getDraftState();
  const draftMode = boardId === null;
  const draftReminder =
    draftMode && draftIndex !== null ? (draftState.draft.reminders[draftIndex] ?? null) : null;

  let content;
  if (draftMode && (!draftState.active || draftState.draft.boardId !== null)) {
    // a direct link to the draft editor without a live create session
    content = (
      <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg }}>
        <AppText variant="title2" accessibilityRole="header">
          This reminder is not available.
        </AppText>
        <PrimaryButton title="Back to Boards" onPress={() => router.dismissTo('/')} />
      </View>
    );
  } else if (draftMode && draftIndex !== null && draftReminder === null) {
    content = (
      <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg }}>
        <AppText variant="title2" accessibilityRole="header">
          This reminder is not available.
        </AppText>
        <PrimaryButton title="Back to Boards" onPress={() => router.dismissTo('/')} />
      </View>
    );
  } else if (!draftMode && (board.status === 'error' || (reminderId && existing.status === 'error'))) {
    content = (
      <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg }}>
        <AppText variant="title2" accessibilityRole="header">
          This reminder is not available.
        </AppText>
        <PrimaryButton title="Back to Boards" onPress={() => router.dismissTo('/')} />
      </View>
    );
  } else if (
    !draftMode &&
    (board.status !== 'ready' ||
      board.value === null ||
      (reminderId !== null && existing.status !== 'ready'))
  ) {
    content = <View testID="reminder-form-loading" style={{ flex: 1 }} />;
  } else if (!draftMode && reminderId !== null && existing.status === 'ready' && existing.value === null) {
    content = (
      <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg }}>
        <AppText variant="title2" accessibilityRole="header">
          This reminder no longer exists.
        </AppText>
        <PrimaryButton title="Back to Boards" onPress={() => router.dismissTo('/')} />
      </View>
    );
  } else {
    const record = !draftMode && existing.status === 'ready' ? existing.value : null;
    content = (
      <View style={{ flex: 1 }}>
        {conflict ? (
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
            <AppText testID="reminder-conflict">
              This reminder changed elsewhere. The latest values are shown - review your
              changes and save again.
            </AppText>
          </View>
        ) : null}
        <ReminderFormBody
        key={record ? record.mutationStamp : draftIndex !== null ? `draft-${draftIndex}` : 'new'}
        board={!draftMode && board.status === 'ready' ? board.value : null}
        record={record}
        draftReminder={draftReminder}
        draftIndex={draftIndex}
        draftTitle={draftState.draft.title}
        dirtyRef={dirtyRef}
        skipGuardRef={skipGuardRef}
          // cancel routes through the sheet-close guard so unsaved edits
          // always get the same discard confirmation
          onCancel={closeFromSheet}
          onConflict={() => setConflict(true)}
        />
      </View>
    );
  }

  return (
    <BottomSheet
      ref={sheetRef}
      snapPoints={['50%', '100%']}
      enablePanDownToClose
      onClose={closeFromSheet}
      backgroundStyle={{ backgroundColor: semanticColor('groupedBackground', scheme) as string }}
    >
      <BottomSheetView style={{ flex: 1 }}>{content}</BottomSheetView>
    </BottomSheet>
  );
}

function ReminderFormBody({
  board,
  record,
  draftReminder,
  draftIndex,
  draftTitle,
  dirtyRef,
  skipGuardRef,
  onCancel,
  onConflict,
}: {
  board: Board | null;
  record: Reminder | null;
  draftReminder: DraftReminder | null;
  draftIndex: number | null;
  draftTitle: string;
  dirtyRef: React.MutableRefObject<boolean>;
  skipGuardRef: React.MutableRefObject<boolean>;
  onCancel: () => void;
  onConflict: () => void;
}) {
  const router = useRouter();
  const scheme = useScheme();
  const { core, invalidate, nextCommandId } = useProduct();
  const seed = record ?? draftReminder;
  const [weekdaysMask, setWeekdaysMask] = useState(seed?.weekdaysMask ?? 0b1111111);
  const [minuteOfDay, setMinuteOfDay] = useState(seed?.minuteOfDay ?? DEFAULT_MINUTE);
  const [message, setMessage] = useState(seed?.message ?? '');
  const [error, setError] = useState<DomainError | null>(null);
  const [saving, setSaving] = useState(false);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, [dirtyRef]);

  const boardTitle = board?.title ?? draftTitle;
  const colors = deriveBoardColors(board?.accentHex ?? '#78D98B', scheme);
  const editing = record !== null || draftIndex !== null;

  const save = useCallback(async () => {
    if (saving) {
      return;
    }
    if (weekdaysMask === 0) {
      setError({ code: 'validation', message: 'Pick at least one weekday.', retryable: false });
      return;
    }
    setError(null);
    // an unsaved board keeps its reminders in the draft; they commit
    // together with the board only after both validate
    if (board === null) {
      const trimmed = message.trim();
      const entry: DraftReminder = {
        weekdaysMask,
        minuteOfDay,
        message: trimmed,
        enabled: draftReminder?.enabled ?? true,
      };
      const reminders = [...getDraftState().draft.reminders];
      if (draftIndex !== null) {
        reminders[draftIndex] = entry;
      } else {
        reminders.push(entry);
      }
      updateDraft({ reminders });
      skipGuardRef.current = true;
      router.back();
      return;
    }
    setSaving(true);
    const deps = { ...core, scheduler: reminderScheduler };
    const result = record
      ? await updateReminder(deps, {
          commandId: nextCommandId(),
          reminderId: record.id,
          expectedMutationStamp: record.mutationStamp,
          weekdaysMask,
          minuteOfDay,
          message: message.trim().length > 0 ? message : null,
        })
      : await createReminder(deps, {
          commandId: nextCommandId(),
          boardId: board.id,
          weekdaysMask,
          minuteOfDay,
          message: message.trim().length > 0 ? message : null,
          enabled: true,
        });
    if (result.ok) {
      invalidate();
      if (result.value.scheduleState === 'denied') {
        // saved but silent: explain the settings path once, no re-prompt
        Alert.alert(
          'Notifications are off',
          'The reminder is saved but disabled. Allow notifications in Settings to turn it on.',
        );
      }
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
  }, [board, core, draftIndex, draftReminder, invalidate, message, minuteOfDay, nextCommandId, onConflict, record, router, saving, skipGuardRef, weekdaysMask]);

  const confirmDelete = useCallback(() => {
    Alert.alert('Delete Reminder', 'This removes the reminder and its notifications.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete Reminder',
        style: 'destructive',
        onPress: () => {
          if (record) {
            void deleteReminder(
              { ...core, scheduler: reminderScheduler },
              { commandId: nextCommandId(), reminderId: record.id },
            ).then((result) => {
              if (result.ok) {
                invalidate();
                skipGuardRef.current = true;
                router.back();
              } else {
                setError(result.error);
              }
            });
            return;
          }
          if (draftIndex !== null) {
            const reminders = getDraftState().draft.reminders.filter(
              (_, index) => index !== draftIndex,
            );
            updateDraft({ reminders });
            skipGuardRef.current = true;
            router.back();
          }
        },
      },
    ]);
  }, [core, draftIndex, invalidate, nextCommandId, record, router, skipGuardRef]);

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.lg,
        }}
      >
        <ProductPressable onPress={onCancel} label="Cancel" testID="reminder-cancel">
          <AppText selectable={false}>Cancel</AppText>
        </ProductPressable>
        <AppText variant="headline" accessibilityRole="header" selectable={false}>
          {editing ? 'Edit Reminder' : 'Add Reminder'}
        </AppText>
        <ProductPressable onPress={() => void save()} label="Save reminder" testID="reminder-save">
          <AppText variant="headline" selectable={false}>
            {editing ? 'Save' : 'Add'}
          </AppText>
        </ProductPressable>
      </View>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            backgroundColor: semanticColor('secondaryGroupedBackground', scheme),
            borderRadius: radius.lg,
            borderCurve: radiusCurve,
            padding: spacing.lg,
            gap: spacing.md,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {WEEKDAYS.map((weekday) => {
              const selected = isWeekdaySelected(weekdaysMask, weekday.iso);
              return (
                <ProductPressable
                  key={weekday.iso}
                  onPress={() => {
                    setWeekdaysMask((mask) => toggleWeekday(mask, weekday.iso));
                    markDirty();
                  }}
                  label={weekday.name}
                  selected={selected}
                  testID={`weekday-${weekday.iso}`}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: selected
                        ? colors.accent
                        : (semanticColor('fill', scheme) as string),
                    }}
                  >
                    <AppText selectable={false}>{weekday.short}</AppText>
                  </View>
                </ProductPressable>
              );
            })}
          </View>
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <AppText>Time</AppText>
            <DateTimePicker
              value={minuteToDate(minuteOfDay)}
              mode="time"
              display="compact"
              style={{ width: 110, height: 36 }}
              accentColor={colors.accent}
              onValueChange={(_event, date) => {
                setMinuteOfDay(date.getHours() * 60 + date.getMinutes());
                markDirty();
              }}
              testID="reminder-time"
            />
          </View>
        </View>

        <TextInput
          accessibilityLabel="Reminder message"
          placeholder={boardTitle.length > 0 ? `Check in to ${boardTitle}` : 'Message…'}
          placeholderTextColor={semanticColor('secondaryLabel', scheme) as string}
          value={message}
          onChangeText={(text) => {
            setMessage(text);
            markDirty();
          }}
          style={{
            minHeight: minimumTouchTarget,
            backgroundColor: semanticColor('secondaryGroupedBackground', scheme) as string,
            borderRadius: radius.lg,
            borderCurve: radiusCurve,
            padding: spacing.lg,
            color: semanticColor('label', scheme) as string,
            fontSize: 17,
          }}
          testID="reminder-message"
        />

        <AppText variant="footnote">
          {`Repeats ${formatMinuteOfDay(minuteOfDay)} on the selected days.`}
        </AppText>

        {error ? <InlineError message={error.message} testID="reminder-error" /> : null}

        {editing ? (
          <PrimaryButton
            title="Delete Reminder"
            destructive
            onPress={confirmDelete}
            testID="delete-reminder"
          />
        ) : null}
      </ScrollView>
    </View>
  );
}
