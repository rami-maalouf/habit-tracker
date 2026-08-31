import { Stack, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Linking, ScrollView, View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { getExportSnapshot, exportFileName, serializeExport } from '@/core/export/serialize';
import { getExportMeta, saveAndShareExport } from '@/platform/data-transfer';
import { semanticColor, spacing } from '@/theme';

import { InlineError, useScheme } from '../ui';
import { useProduct } from '../product-store';
import { releaseLink } from './release-links';
import type { ReleaseLinkKey } from './release-links';
import { SettingsGroup, SettingsRow } from './rows';

// the grouped settings sheet mirroring the reference: notifications first,
// support and feedback, more products, data, utilities, app information
export function SettingsScreen() {
  const router = useRouter();
  const scheme = useScheme();
  const { core } = useProduct();
  const [linkNotice, setLinkNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const meta = getExportMeta();

  const openLink = useCallback((key: ReleaseLinkKey, title: string) => {
    const url = releaseLink(key);
    if (url === null) {
      // development builds carry no release links; the state is explicit
      setLinkNotice(`Missing release link for ${title}.`);
      return;
    }
    setLinkNotice(null);
    // support and legal destinations open in the in-app browser so the
    // person never loses their place; a store or mail scheme has to leave
    const inApp = url.startsWith('https://') && key !== 'appStoreReview';
    const open = inApp ? WebBrowser.openBrowserAsync(url) : Linking.openURL(url);
    void open.catch(() => {
      setLinkNotice(`${title} could not be opened. Try again.`);
    });
  }, []);

  const exportData = useCallback(() => {
    // the confirmation explains the file can contain private notes
    Alert.alert(
      'Export Data',
      'The export file contains all boards and check-ins, including private notes. Share it only with people you trust.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Export',
          onPress: () => {
            void (async () => {
              setExporting(true);
              setExportError(null);
              const snapshot = await getExportSnapshot(core, meta);
              if (!snapshot.ok) {
                setExportError(snapshot.error.message);
                setExporting(false);
                return;
              }
              const shared = await saveAndShareExport(
                serializeExport(snapshot.value),
                exportFileName(snapshot.value.exportedAtUtc),
              );
              if (!shared.ok) {
                setExportError(shared.error.message);
              }
              setExporting(false);
            })();
          },
        },
      ],
    );
  }, [core, meta]);

  return (
    <View style={{ flex: 1, backgroundColor: semanticColor('groupedBackground', scheme) }}>
      <Stack.Screen options={{ title: 'Settings' }} />
      {/* feedback stays above the scroll content: a notice rendered after
          the groups would sit below the fold and a tap near the top would
          appear to do nothing */}
      {linkNotice ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
          <AppText variant="footnote" testID="settings-link-notice">
            {linkNotice}
          </AppText>
        </View>
      ) : null}
      {exportError ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
          <InlineError message={exportError} testID="settings-export-error" />
        </View>
      ) : null}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      >
        <SettingsGroup>
          <SettingsRow
            title="Notifications"
            onPress={() => router.push('/settings/notifications')}
            testID="settings-notifications"
          />
        </SettingsGroup>

        <SettingsGroup title="Support and Feedback">
          <SettingsRow
            title="Request feature or report issue"
            onPress={() => openLink('feedback', 'Request feature or report issue')}
            external
            testID="settings-feedback"
          />
          <SettingsRow
            title="Rate Ripples In App Store"
            onPress={() => openLink('appStoreReview', 'Rate Ripples In App Store')}
            external
            testID="settings-rate"
          />
        </SettingsGroup>

        <SettingsGroup>
          <SettingsRow
            title="More products by us"
            onPress={() => openLink('moreProducts', 'More products by us')}
            external
            testID="settings-more-products"
          />
        </SettingsGroup>

        <SettingsGroup title="Data">
          <SettingsRow
            title="iCloud Sync"
            onPress={() => router.push('/settings/icloud')}
            testID="settings-icloud"
          />
          <SettingsRow
            title="Archived Boards"
            onPress={() => router.push('/settings/archived')}
            testID="open-archived-boards"
          />
          <SettingsRow
            title="Import Data"
            onPress={() => router.push('/settings/import')}
            testID="settings-import"
          />
        </SettingsGroup>

        <SettingsGroup title="Utilities">
          <SettingsRow
            title="Export Data"
            detail={exporting ? 'Preparing…' : undefined}
            onPress={exporting ? undefined : exportData}
            testID="settings-export"
          />
          <SettingsRow
            title="App Icon"
            onPress={() => router.push('/settings/app-icon')}
            testID="settings-app-icon"
          />
        </SettingsGroup>

        <SettingsGroup title="App information">
          <SettingsRow
            title="Timeline"
            onPress={() => router.push('/settings/timeline')}
            testID="settings-timeline"
          />
          <SettingsRow
            title="Privacy Policy"
            onPress={() => openLink('privacyPolicy', 'Privacy Policy')}
            external
            testID="settings-privacy"
          />
          <SettingsRow
            title="Terms Of Use"
            onPress={() => openLink('termsOfUse', 'Terms Of Use')}
            external
            testID="settings-terms"
          />
          <SettingsRow
            title="Version"
            detail={`${meta.appVersion} (${meta.buildVersion})`}
            testID="settings-version"
          />
        </SettingsGroup>

      </ScrollView>
    </View>
  );
}
