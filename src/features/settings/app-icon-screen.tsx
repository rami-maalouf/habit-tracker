import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { setSelectedIcon } from '@/core/domain/commands';
import type { SelectedIcon } from '@/core/domain/entities';
import { getAppSettings } from '@/core/domain/queries';
import { setAlternateIcon, supportsAlternateIcons } from '@/platform/alternate-icons';
import { radius, radiusCurve, semanticColor, spacing } from '@/theme';

import { useProduct, useProductQuery } from '../product-store';
import { InlineError, PrimaryButton, ProductPressable, useScheme } from '../ui';

const ICON_PREVIEWS = [
  { id: 'default', name: 'Default', light: '#78D98B', dark: '#111111' },
  { id: 'midnight', name: 'Midnight', light: '#111111', dark: '#78D98B' },
  { id: 'paper', name: 'Paper', light: '#F2F2F7', dark: '#3A3A3C' },
] as const;

function nativeName(icon: SelectedIcon) {
  return icon === 'default' ? null : icon;
}

export function AppIconScreen() {
  const scheme = useScheme();
  const { core, invalidate, nextCommandId } = useProduct();
  const settings = useProductQuery(getAppSettings, []);
  const [availability, setAvailability] = useState<'loading' | 'supported' | 'unsupported' | 'error'>('loading');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [failure, setFailure] = useState<{ icon: SelectedIcon; message: string } | null>(null);
  const selected = settings.status === 'ready' ? settings.value?.selectedIcon : undefined;

  useEffect(() => {
    let cancelled = false;
    supportsAlternateIcons().then(
      (supported) => { if (!cancelled) setAvailability(supported ? 'supported' : 'unsupported'); },
      () => { if (!cancelled) setAvailability('error'); },
    );
    return () => { cancelled = true; };
  }, [revision]);

  async function choose(icon: SelectedIcon) {
    if (busyRef.current || availability !== 'supported' || selected === undefined) return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    const previous = selected;
    let platformChanged = false;
    try {
      await setAlternateIcon(nativeName(icon));
      platformChanged = true;
      const result = await setSelectedIcon(core, { commandId: nextCommandId(), icon });
      if (!result.ok) throw new Error('icon setting could not be saved');
      invalidate();
    } catch {
      let restored = true;
      if (platformChanged) {
        try { await setAlternateIcon(nativeName(previous)); } catch { restored = false; }
      }
      setFailure({
        icon,
        message: restored
          ? 'The app icon could not be changed. Try again.'
          : 'The icon changed, but its setting could not be saved. Try again to finish the change.',
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function retryAvailability() {
    setAvailability('loading');
    setRevision((value) => value + 1);
    invalidate();
  }

  return (
    <View style={{ flex: 1, backgroundColor: semanticColor('groupedBackground', scheme) }}>
      <Stack.Screen options={{ title: 'App Icon' }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: spacing.lg }}>
          {ICON_PREVIEWS.map((icon) => (
            <ProductPressable
              key={icon.id}
              label={`Use ${icon.name} icon`}
              selected={selected === icon.id}
              disabled={availability !== 'supported' || selected === undefined || busy}
              onPress={() => { void choose(icon.id); }}
              style={{ alignItems: 'center', gap: spacing.sm }}
            >
              <View
                accessible
                accessibilityLabel={`${icon.name} icon preview`}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: radius.lg,
                  borderCurve: radiusCurve,
                  backgroundColor: icon.light,
                  borderWidth: 1,
                  borderColor: semanticColor('separator', scheme),
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                testID={`icon-preview-${icon.name.toLowerCase()}`}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: icon.dark,
                  }}
                />
              </View>
              <AppText variant="footnote">{icon.name}</AppText>
              {selected === icon.id ? <AppText variant="footnote">Selected</AppText> : null}
            </ProductPressable>
          ))}
        </View>
        {availability === 'unsupported' ? (
          <AppText variant="footnote" testID="app-icon-interim">
            Alternate icons are not available yet.
          </AppText>
        ) : null}
        {busy ? <AppText variant="footnote">Changing app icon…</AppText> : null}
        {availability === 'error' || settings.status === 'error' || (settings.status === 'ready' && settings.value === null) ? (
          <View style={{ gap: spacing.sm }}>
            <InlineError message="App icons could not be loaded. Try again." />
            <PrimaryButton title="Retry app icons" onPress={retryAvailability} />
          </View>
        ) : null}
        {failure ? (
          <View style={{ gap: spacing.sm }}>
            <InlineError message={failure.message} />
            <PrimaryButton title="Retry icon change" disabled={busy} onPress={() => { void choose(failure.icon); }} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
