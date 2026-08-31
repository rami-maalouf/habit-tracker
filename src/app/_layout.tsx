import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { ProductProvider } from '@/features/product-store';
import { cleanupStaleExports } from '@/platform/data-transfer';

// every modal surface presents as a native page sheet (slide-up card with
// drag-to-dismiss). the formSheet presentation was abandoned after it
// intermittently committed react content into a hidden native sheet when
// one sheet opened while another was still dismissing (verified on device:
// the react tree stayed fully mounted while the pixels and accessibility
// tree were empty until a js reload)
const sheet = {
  presentation: 'modal' as const,
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
          <Stack.Screen name="boards/[boardId]/index" options={sheet} />
          <Stack.Screen name="boards/new" options={sheet} />
          <Stack.Screen name="boards/[boardId]/edit" options={sheet} />
          <Stack.Screen name="boards/[boardId]/options" options={sheet} />
          <Stack.Screen name="boards/[boardId]/analytics" options={sheet} />
          <Stack.Screen name="boards/[boardId]/journal" options={sheet} />
          <Stack.Screen name="boards/[boardId]/check-ins/index" options={sheet} />
          <Stack.Screen name="boards/[boardId]/check-ins/new" options={sheet} />
          <Stack.Screen name="boards/[boardId]/check-ins/[checkInId]" options={sheet} />
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
