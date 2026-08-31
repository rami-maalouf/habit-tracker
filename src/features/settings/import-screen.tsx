import { Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { importSnapshot } from '@/core/domain/commands';
import type { ImportSummary } from '@/core/domain/commands';
import type { ImportDraft } from '@/core/export/import-parsers';
import { parseOwnExport, parseRipplesCsv } from '@/core/export/import-parsers';
import { pickImportFile } from '@/platform/data-transfer';
import { radius, radiusCurve, semanticColor, spacing } from '@/theme';

import { InlineError, PrimaryButton, useScheme } from '../ui';
import { useProduct } from '../product-store';
import { SettingsGroup, SettingsRow } from './rows';

type ImportState =
  | { step: 'choose' }
  | { step: 'preview'; fileName: string; draft: ImportDraft }
  | { step: 'importing'; fileName: string; draft: ImportDraft }
  | { step: 'done'; fileName: string; summary: ImportSummary };

function count(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? '' : 's'}`;
}

// two import sources: a ripples csv export from the original app, and this
// app's own json export (a restore that skips records it already has)
export function ImportScreen() {
  const scheme = useScheme();
  const { core, invalidate, nextCommandId } = useProduct();
  const [state, setState] = useState<ImportState>({ step: 'choose' });
  const [error, setError] = useState<string | null>(null);

  const pick = useCallback(
    async (source: 'ripples-csv' | 'own') => {
      setError(null);
      const picked = await pickImportFile();
      if (!picked.ok) {
        setError(picked.error.message);
        return;
      }
      if (picked.value === null) {
        // cancelling the picker keeps the chooser open
        return;
      }
      const parsed =
        source === 'ripples-csv'
          ? parseRipplesCsv(picked.value.contents)
          : parseOwnExport(picked.value.contents);
      if (!parsed.ok) {
        setError(parsed.error.message);
        return;
      }
      setState({ step: 'preview', fileName: picked.value.name, draft: parsed.value });
    },
    [],
  );

  const runImport = useCallback(async () => {
    if (state.step !== 'preview') {
      return;
    }
    setState({ step: 'importing', fileName: state.fileName, draft: state.draft });
    setError(null);
    const result = await importSnapshot(core, {
      commandId: nextCommandId(),
      draft: state.draft,
    });
    if (!result.ok) {
      setError(result.error.message);
      setState({ step: 'preview', fileName: state.fileName, draft: state.draft });
      return;
    }
    invalidate();
    setState({ step: 'done', fileName: state.fileName, summary: result.value });
  }, [core, invalidate, nextCommandId, state]);

  return (
    <View style={{ flex: 1, backgroundColor: semanticColor('groupedBackground', scheme) }}>
      <Stack.Screen options={{ title: 'Import Data' }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      >
        {state.step === 'choose' ? (
          <>
            <AppText variant="subheadline">
              Imports add to your existing boards. Nothing is deleted or overwritten.
            </AppText>
            <SettingsGroup title="Import from">
              <SettingsRow
                title="Ripples (CSV export)"
                onPress={() => void pick('ripples-csv')}
                testID="import-ripples"
              />
              <SettingsRow
                title="This app (JSON export)"
                onPress={() => void pick('own')}
                testID="import-own"
              />
            </SettingsGroup>
          </>
        ) : null}

        {state.step === 'preview' || state.step === 'importing' ? (
          <View
            style={{
              backgroundColor: semanticColor('secondaryGroupedBackground', scheme),
              borderRadius: radius.lg,
              borderCurve: radiusCurve,
              padding: spacing.lg,
              gap: spacing.md,
            }}
            testID="import-preview"
          >
            <AppText variant="headline">{state.fileName}</AppText>
            <AppText testID="import-preview-counts">
              {`${count(state.draft.boards.length, 'board')}, ${count(state.draft.checkIns.length, 'check-in')}.`}
            </AppText>
            <AppText variant="footnote">
              {state.draft.source === 'ripples-csv'
                ? 'Boards keep their original creation dates, so streaks and consistency include the imported history.'
                : 'Records that already exist are skipped, so restoring the same file twice is safe.'}
            </AppText>
            <PrimaryButton
              title={state.step === 'importing' ? 'Importing…' : 'Import'}
              onPress={() => void runImport()}
              disabled={state.step === 'importing'}
              testID="import-confirm"
            />
          </View>
        ) : null}

        {state.step === 'done' ? (
          <View
            style={{
              backgroundColor: semanticColor('secondaryGroupedBackground', scheme),
              borderRadius: radius.lg,
              borderCurve: radiusCurve,
              padding: spacing.lg,
              gap: spacing.md,
            }}
            testID="import-done"
          >
            <AppText variant="headline">Import complete</AppText>
            <AppText testID="import-summary">
              {`Added ${count(state.summary.boardsCreated, 'board')} and ${count(state.summary.checkInsCreated, 'check-in')}.${
                state.summary.boardsSkipped + state.summary.checkInsSkipped > 0
                  ? ` Skipped ${count(state.summary.boardsSkipped, 'board')} and ${count(state.summary.checkInsSkipped, 'check-in')} that already existed or were invalid.`
                  : ''
              }`}
            </AppText>
            <PrimaryButton
              title="Import another file"
              onPress={() => setState({ step: 'choose' })}
              testID="import-again"
            />
          </View>
        ) : null}

        {error ? <InlineError message={error} testID="import-error" /> : null}
      </ScrollView>
    </View>
  );
}
