import { Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { exportFileName, getExportSnapshot, serializeExport } from '@/core/export/serialize';
import { getExportMeta, saveAndShareExport } from '@/platform/data-transfer';
import { semanticColor, spacing } from '@/theme';

import { InlineError, PrimaryButton, useScheme } from '../ui';
import { useProduct } from '../product-store';

// the export destination: the file can carry private notes, so the screen
// says so before the share sheet opens
export function ExportScreen() {
  const scheme = useScheme();
  const { core } = useProduct();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const meta = getExportMeta();

  const exportData = useCallback(async () => {
    setExporting(true);
    setError(null);
    setShared(false);
    const snapshot = await getExportSnapshot(core, meta);
    if (!snapshot.ok) {
      setError(snapshot.error.message);
      setExporting(false);
      return;
    }
    const result = await saveAndShareExport(
      serializeExport(snapshot.value),
      exportFileName(snapshot.value.exportedAtUtc),
    );
    if (!result.ok) {
      setError(result.error.message);
    } else {
      setShared(true);
    }
    setExporting(false);
  }, [core, meta]);

  return (
    <View style={{ flex: 1, backgroundColor: semanticColor('groupedBackground', scheme) }}>
      <Stack.Screen options={{ title: 'Export Data' }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      >
        <AppText>
          The export is one JSON file holding every board, check-in, note, amount, and reminder
          rule on this device.
        </AppText>
        <AppText variant="footnote">
          It contains your private notes. Share it only with people you trust. Importing it back
          into Ripples skips anything already here, so a restore is safe to repeat.
        </AppText>
        <PrimaryButton
          title={exporting ? 'Preparing…' : 'Export Data'}
          onPress={() => void exportData()}
          disabled={exporting}
          testID="export-start"
        />
        {shared ? (
          <AppText variant="footnote" testID="export-shared">
            The export file is ready in the share sheet.
          </AppText>
        ) : null}
        {error ? <InlineError message={error} testID="export-error" /> : null}
      </ScrollView>
    </View>
  );
}
