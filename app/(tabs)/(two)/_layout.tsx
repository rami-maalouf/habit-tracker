import { Stack } from 'expo-router';

import { useClientOnlyValue } from '@/components/useClientOnlyValue';

// native tabs don't render headers, so each tab nests its own stack
export default function TwoStackLayout() {
  return (
    <Stack
      screenOptions={{
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Stack.Screen name="two" options={{ title: 'Tab Two' }} />
    </Stack>
  );
}
