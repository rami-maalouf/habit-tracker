import { Stack, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, Switch, TextInput, View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { archiveBoard, createBoard, deleteBoard, updateBoard } from '@/core/domain/commands';
import { boardPalette, boardSymbolAllowlist } from '@/core/domain/entities';
import type { BoardId } from '@/core/domain/ids';
import type { DomainError } from '@/core/domain/result';
import { getBoard, getBoardDependentCounts } from '@/core/domain/queries';
import { minimumTouchTarget } from '@/foundation/accessibility';
import { radius, radiusCurve, semanticColor, spacing } from '@/theme';

import { BoardSymbol, SevenDayStrip, deriveBoardColors } from '../boards';
import { InlineError, PrimaryButton, ProductPressable, useScheme } from '../ui';
import { useProduct, useProductQuery } from '../product-store';
import type { BoardDraft } from './draft-store';
import {
  draftFromBoard,
  endDraft,
  newBoardDraft,
  startDraft,
  updateDraft,
  useDraftState,
} from './draft-store';

function parseQuickAmount(text: string): number | null {
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function draftToCommandFields(draft: BoardDraft) {
  return {
    title: draft.title,
    symbol: draft.symbol,
    accentHex: draft.accentHex,
    usesTintedBackground: draft.usesTintedBackground,
    tracksAmount: draft.tracksAmount,
    amountUnit: draft.amountUnit.trim().length === 0 ? null : draft.amountUnit,
    quickAmount: parseQuickAmount(draft.quickAmountText) ?? -1,
    tracksTime: draft.tracksTime,
    startOfDayMinute: draft.startOfDayMinute,
    metricsEnabled: draft.metricsEnabled,
  };
}

function FormRow({ children }: { children: React.ReactNode }) {
  const scheme = useScheme();
  return (
    <View
      style={{
        backgroundColor: semanticColor('secondaryGroupedBackground', scheme),
        borderRadius: radius.lg,
        borderCurve: radiusCurve,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        gap: spacing.sm,
      }}
    >
      {children}
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
  testID,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <AppText>{label}</AppText>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        testID={testID}
      />
    </View>
  );
}

// shared by create board and edit board; a null boardId means creation
export function BoardFormScreen({ boardId }: { boardId: BoardId | null }) {
  const router = useRouter();
  const navigation = useNavigation();
  const scheme = useScheme();
  const { core, invalidate, nextCommandId } = useProduct();
  const existing = useProductQuery(
    (c) => (boardId ? getBoard(c, boardId) : Promise.resolve({ ok: true as const, value: null })),
    [boardId],
  );
  const draftState = useDraftState();
  const draft = draftState.draft;
  const [error, setError] = useState<DomainError | null>(null);
  const [conflict, setConflict] = useState(false);
  const [symbolPickerOpen, setSymbolPickerOpen] = useState(false);
  const [symbolSearch, setSymbolSearch] = useState('');
  const [customColorOpen, setCustomColorOpen] = useState(false);
  // set before a deliberate exit (save, archive, delete, confirmed discard)
  // so the removal guard lets that navigation through
  const skipGuardRef = useRef(false);
  // identifies this sheet instance as the draft session owner
  const ownerId = useId();

  // seed the shared draft store when the sheet opens or reloads
  useEffect(() => {
    if (boardId === null) {
      startDraft(newBoardDraft(), ownerId);
    } else if (existing.status === 'ready' && existing.value) {
      if (existing.value.archivedAt === null) {
        startDraft(draftFromBoard(existing.value), ownerId);
      } else {
        // an archived board never holds a draft session: its edit surface
        // is the lockout, and a live edit that archives mid-session must
        // release the session so options cannot expose it
        endDraft(ownerId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reseed only when the loaded record identity changes
  }, [boardId, existing.status === 'ready' ? existing.value?.mutationStamp : null]);

  // the draft session ends with the sheet, so a later direct navigation to
  // an options route cannot observe a stale draft as live
  useEffect(() => () => endDraft(ownerId), [ownerId]);

  const editing = boardId !== null;
  // the draft is trusted only when this sheet instance seeded it; anything
  // else means seeding has not landed yet or another sheet owned the store
  const draftMatches =
    draftState.active && draftState.owner === ownerId && draft.boardId === boardId;

  // a swipe-down or any other removal of a dirty sheet must confirm first
  usePreventRemove(draftMatches && draft.dirty, ({ data }) => {
    if (skipGuardRef.current) {
      navigation.dispatch(data.action);
      return;
    }
    Alert.alert('Discard changes?', 'Your edits to this board are not saved.', [
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

  const colors = deriveBoardColors(draft.accentHex, scheme);

  const save = useCallback(async () => {
    if (!draftMatches) {
      return;
    }
    setError(null);
    setConflict(false);
    const fields = draftToCommandFields(draft);
    // the route id is the authority for which board a save mutates
    const result = editing
      ? await updateBoard(core, {
          commandId: nextCommandId(),
          boardId: boardId as BoardId,
          expectedMutationStamp: draft.expectedMutationStamp ?? '',
          ...fields,
        })
      : await createBoard(core, { commandId: nextCommandId(), ...fields });
    if (result.ok) {
      invalidate();
      skipGuardRef.current = true;
      router.back();
      return;
    }
    if (result.error.code === 'conflict') {
      // a stale edit reloads the latest record for review
      setConflict(true);
      invalidate();
      return;
    }
    if (result.error.code === 'archived') {
      // the board archived under this sheet: refresh so the edit surface
      // converges to the read-only lockout and releases its session
      invalidate();
    }
    setError(result.error);
  }, [boardId, core, draft, draftMatches, editing, invalidate, nextCommandId, router]);

  const confirmArchive = useCallback(() => {
    if (!editing || !boardId) {
      return;
    }
    Alert.alert('Archive Board', 'The board moves to Archived Boards. Its data stays.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        onPress: () => {
          void archiveBoard(core, { commandId: nextCommandId(), boardId }).then((result) => {
            if (result.ok) {
              invalidate();
              skipGuardRef.current = true;
              router.dismissTo('/');
            } else {
              setError(result.error);
            }
          });
        },
      },
    ]);
  }, [boardId, core, editing, invalidate, nextCommandId, router]);

  const confirmDelete = useCallback(async () => {
    if (!editing || !boardId) {
      return;
    }
    const counts = await getBoardDependentCounts(core, boardId);
    const message = counts.ok
      ? `This permanently deletes ${counts.value.checkIns} check-ins, ${counts.value.notes} notes, and ${counts.value.reminders} reminders.`
      : 'This permanently deletes the board and everything it contains.';
    Alert.alert('Delete Board', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete Board',
        style: 'destructive',
        onPress: () => {
          void deleteBoard(core, { commandId: nextCommandId(), boardId }).then((result) => {
            if (result.ok) {
              invalidate();
              skipGuardRef.current = true;
              router.dismissTo('/');
            } else {
              setError(result.error);
            }
          });
        },
      },
    ]);
  }, [boardId, core, editing, invalidate, nextCommandId, router]);

  const filteredSymbols = useMemo(
    () =>
      boardSymbolAllowlist.filter((symbol) =>
        symbol.toLowerCase().includes(symbolSearch.trim().toLowerCase()),
      ),
    [symbolSearch],
  );

  if (editing && existing.status === 'error') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg }}>
        <AppText variant="title2" accessibilityRole="header">
          This board is not available.
        </AppText>
        <PrimaryButton title="Back to Boards" onPress={() => router.dismissTo('/')} />
      </View>
    );
  }

  // an archived board is read-only everywhere: a direct link to its edit
  // sheet lands on the restore path instead of an editable form
  if (editing && existing.status === 'ready' && existing.value?.archivedAt != null) {
    return (
      <View
        style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg }}
        testID="edit-archived-board"
      >
        <AppText variant="title2" accessibilityRole="header">
          This board is archived.
        </AppText>
        <AppText>Restore it from its board page to edit it.</AppText>
        <PrimaryButton title="Back to Boards" onPress={() => router.dismissTo('/')} />
      </View>
    );
  }

  if (!draftMatches) {
    return <View testID="board-form-loading" style={{ flex: 1 }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: semanticColor('groupedBackground', scheme) }}>
      <Stack.Screen
        options={{
          title: editing ? 'Edit Board' : 'Create Board',
          headerLeft: () => (
            <ProductPressable
              onPress={() => router.back()}
              label="Cancel"
              testID="board-form-cancel"
            >
              <AppText selectable={false}>Cancel</AppText>
            </ProductPressable>
          ),
          headerRight: () => (
            <ProductPressable onPress={save} label="Save board" testID="board-form-save">
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
        {conflict ? (
          <FormRow>
            <AppText testID="board-form-conflict">
              This board changed elsewhere. The latest values are shown - review your changes and
              save again.
            </AppText>
          </FormRow>
        ) : null}

        {/* live preview uses the same renderers as saved data */}
        <FormRow>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <BoardSymbol symbol={draft.symbol} color={colors.accent} />
            <AppText variant="headline" numberOfLines={1} style={{ flexShrink: 1 }} selectable={false}>
              {draft.title.trim().length === 0 ? 'New board' : draft.title}
            </AppText>
            <View style={{ flex: 1 }} />
            <SevenDayStrip strip={[0, 1, 0, 1, 1, 0, 1]} colors={colors} barHeight={22} />
          </View>
        </FormRow>

        <FormRow>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <ProductPressable
              onPress={() => setSymbolPickerOpen((current) => !current)}
              label="Choose symbol"
              testID="open-symbol-picker"
            >
              <BoardSymbol symbol={draft.symbol} color={colors.accent} size={28} />
            </ProductPressable>
            <TextInput
              accessibilityLabel="Board name"
              placeholder="Board name"
              placeholderTextColor={semanticColor('secondaryLabel', scheme) as string}
              value={draft.title}
              onChangeText={(title) => updateDraft({ title })}
              style={{
                flex: 1,
                minHeight: minimumTouchTarget,
                color: semanticColor('label', scheme) as string,
                fontSize: 17,
              }}
              testID="board-title-input"
            />
          </View>
          {symbolPickerOpen ? (
            <View style={{ gap: spacing.sm }} testID="symbol-picker">
              <TextInput
                accessibilityLabel="Search symbols"
                placeholder="Search symbols"
                placeholderTextColor={semanticColor('secondaryLabel', scheme) as string}
                value={symbolSearch}
                onChangeText={setSymbolSearch}
                style={{ minHeight: minimumTouchTarget, color: semanticColor('label', scheme) as string }}
                testID="symbol-search"
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {filteredSymbols.map((symbol) => (
                  <ProductPressable
                    key={symbol}
                    onPress={() => {
                      updateDraft({ symbol });
                      setSymbolPickerOpen(false);
                    }}
                    label={`Symbol ${symbol}`}
                    selected={draft.symbol === symbol}
                    testID={`symbol-${symbol}`}
                  >
                    <View
                      style={{
                        width: minimumTouchTarget,
                        height: minimumTouchTarget,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: radius.md,
                        borderCurve: radiusCurve,
                        borderWidth: draft.symbol === symbol ? 2 : 0,
                        borderColor: colors.accent,
                      }}
                    >
                      <BoardSymbol symbol={symbol} color={colors.accent} />
                    </View>
                  </ProductPressable>
                ))}
              </View>
            </View>
          ) : null}
        </FormRow>

        <FormRow>
          {/* seven 44-point targets exceed the card width, so the row wraps */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: spacing.sm,
            }}
          >
            <ProductPressable
              onPress={() => setCustomColorOpen((current) => !current)}
              label="Custom color"
              testID="custom-color"
            >
              <AppText selectable={false}>Custom</AppText>
            </ProductPressable>
            {boardPalette.map((entry) => (
              <ProductPressable
                key={entry.name}
                onPress={() => updateDraft({ accentHex: entry.hex })}
                label={`Color ${entry.name}`}
                selected={draft.accentHex.toUpperCase() === entry.hex}
                testID={`color-${entry.name}`}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: radius.capsule,
                    borderCurve: radiusCurve,
                    backgroundColor: entry.hex,
                    borderWidth: draft.accentHex.toUpperCase() === entry.hex ? 3 : 0,
                    borderColor: semanticColor('label', scheme),
                  }}
                />
              </ProductPressable>
            ))}
          </View>
          {customColorOpen ? (
            <TextInput
              accessibilityLabel="Custom color hex"
              placeholder="#RRGGBB"
              autoCapitalize="characters"
              placeholderTextColor={semanticColor('secondaryLabel', scheme) as string}
              value={draft.accentHex}
              onChangeText={(accentHex) => updateDraft({ accentHex })}
              style={{ minHeight: minimumTouchTarget, color: semanticColor('label', scheme) as string }}
              testID="custom-color-input"
            />
          ) : null}
          <ToggleRow
            label="Tinted Background"
            value={draft.usesTintedBackground}
            onValueChange={(usesTintedBackground) => updateDraft({ usesTintedBackground })}
            testID="tinted-toggle"
          />
        </FormRow>

        <FormRow>
          <ToggleRow
            label="Track Amounts"
            value={draft.tracksAmount}
            onValueChange={(tracksAmount) => updateDraft({ tracksAmount })}
            testID="amounts-toggle"
          />
          <AppText variant="footnote">
            Attach additional value to every check-in (time, distance, weight, arbitrary number).
            Color of each cell will then be based on the total value for the day.
          </AppText>
          {draft.tracksAmount ? (
            <View style={{ gap: spacing.sm }} testID="amount-config">
              <TextInput
                accessibilityLabel="Unit"
                placeholder="Unit (optional)"
                placeholderTextColor={semanticColor('secondaryLabel', scheme) as string}
                value={draft.amountUnit}
                onChangeText={(amountUnit) => updateDraft({ amountUnit })}
                style={{ minHeight: minimumTouchTarget, color: semanticColor('label', scheme) as string }}
                testID="unit-input"
              />
              <TextInput
                accessibilityLabel="Quick check-in amount"
                placeholder="Quick check-in amount"
                keyboardType="decimal-pad"
                placeholderTextColor={semanticColor('secondaryLabel', scheme) as string}
                value={draft.quickAmountText}
                onChangeText={(quickAmountText) => updateDraft({ quickAmountText })}
                style={{ minHeight: minimumTouchTarget, color: semanticColor('label', scheme) as string }}
                testID="quick-amount-input"
              />
            </View>
          ) : null}
        </FormRow>

        <FormRow>
          <ProductPressable label="Add reminder" disabled testID="add-reminder-row">
            <AppText selectable={false}>Add reminder…</AppText>
          </ProductPressable>
          <AppText variant="footnote">Reminders arrive with the reminders update.</AppText>
        </FormRow>

        <FormRow>
          <ProductPressable
            onPress={() =>
              router.push(editing && boardId ? `/boards/${boardId}/options` : '/boards/draft/options')
            }
            label="Options"
            testID="open-options"
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText selectable={false}>Options</AppText>
              <AppText selectable={false}>›</AppText>
            </View>
          </ProductPressable>
        </FormRow>

        {error ? <InlineError message={error.message} testID="board-form-error" /> : null}

        {editing ? (
          <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
            <PrimaryButton title="Archive Board" onPress={confirmArchive} testID="archive-board" />
            <PrimaryButton title="Delete Board" destructive onPress={confirmDelete} testID="form-delete-board" />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
