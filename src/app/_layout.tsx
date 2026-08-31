import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { ProductProvider } from '@/features/product-store';

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
        </Stack>
      </ProductProvider>
    </ThemeProvider>
  );
}
