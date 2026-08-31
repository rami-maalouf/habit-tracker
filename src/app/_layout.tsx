import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { ProductProvider } from '@/features/product-store';
import { cleanupStaleExports } from '@/platform/data-transfer';

// most modal surfaces present as native page sheets (slide-up card with
// drag-to-dismiss). the generic formSheet presentation was abandoned after
// it intermittently committed react content into a hidden native sheet when
// one sheet opened while another was still dismissing (verified on device:
// the react tree stayed fully mounted while the pixels and accessibility
// tree were empty until a js reload)
const sheet = {
  presentation: 'modal' as const,
};

// the add and edit check-in sheets are half-height per the reference. the
// native-stack formSheet presentation is unusable here: on device its react
// content commits into a hidden native sheet and never paints at any detent
// (react tree mounted, pixels and accessibility empty). instead the route is
// a transparent modal hosting the @expo/ui native swiftui sheet, which owns
// its own detents (50% with the full detent one drag away)
const halfSheet = {
  presentation: 'transparentModal' as const,
  animation: 'none' as const,
  headerShown: false,
  contentStyle: { backgroundColor: 'transparent' },
};

export default function RootLayout() {
  // without an explicit navigation theme the headers stay light in dark
  // mode (invisible sheet titles, light button pills on black)
  const scheme = useColorScheme();

  // export files a previous session left in the cache are removed on the
  // next launch per the export spec
  useEffect(() => {
    cleanupStaleExports();
  }, []);
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <ProductProvider>
        <Stack>
          <Stack.Screen name="boards/new" options={sheet} />
          <Stack.Screen name="boards/[boardId]/edit" options={sheet} />
          <Stack.Screen name="boards/[boardId]/options" options={sheet} />
          <Stack.Screen name="boards/[boardId]/analytics" options={sheet} />
          <Stack.Screen name="boards/[boardId]/journal" options={sheet} />
          <Stack.Screen name="boards/[boardId]/check-ins/index" options={sheet} />
          <Stack.Screen name="boards/[boardId]/check-ins/new" options={halfSheet} />
          <Stack.Screen name="boards/[boardId]/check-ins/[checkInId]" options={halfSheet} />
          <Stack.Screen name="settings/index" options={sheet} />
          <Stack.Screen name="settings/archived" options={sheet} />
          <Stack.Screen name="settings/import" options={sheet} />
          <Stack.Screen name="settings/notifications" options={sheet} />
          <Stack.Screen name="settings/icloud" options={sheet} />
          <Stack.Screen name="settings/app-icon" options={sheet} />
          <Stack.Screen name="settings/timeline" options={sheet} />
        </Stack>
      </ProductProvider>
    </ThemeProvider>
  );
}
