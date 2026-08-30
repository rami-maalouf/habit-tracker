import { Stack } from 'expo-router';

import { ProductProvider } from '@/features/product-store';

// every modal surface is a form sheet at the full detent with a visible
// grabber, matching the reference app's sheet presentation
const sheet = {
  presentation: 'formSheet' as const,
  sheetGrabberVisible: true,
  sheetAllowedDetents: [1.0],
};

export default function RootLayout() {
  return (
    <ProductProvider>
      <Stack>
        <Stack.Screen name="boards/new" options={sheet} />
        <Stack.Screen name="boards/[boardId]/edit" options={sheet} />
        <Stack.Screen name="boards/[boardId]/options" options={sheet} />
        <Stack.Screen name="boards/[boardId]/check-ins/index" options={sheet} />
        <Stack.Screen name="boards/[boardId]/check-ins/new" options={sheet} />
        <Stack.Screen name="boards/[boardId]/check-ins/[checkInId]" options={sheet} />
        <Stack.Screen name="settings/index" options={sheet} />
      </Stack>
    </ProductProvider>
  );
}
