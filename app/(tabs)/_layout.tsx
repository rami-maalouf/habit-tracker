import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { ColorValue, DynamicColorIOS, Platform } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  // on iOS, DynamicColorIOS lets the tint adapt to the liquid glass material
  const tintColor = Platform.select<ColorValue>({
    ios: DynamicColorIOS({ light: Colors.light.tint, dark: Colors.dark.tint }),
    default: Colors[colorScheme].tint,
  });

  return (
    <NativeTabs tintColor={tintColor} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="(home)">
        <NativeTabs.Trigger.Icon sf="chevron.left.forwardslash.chevron.right" md="code" />
        <NativeTabs.Trigger.Label>Tab One</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(two)">
        <NativeTabs.Trigger.Icon sf="chevron.left.forwardslash.chevron.right" md="code" />
        <NativeTabs.Trigger.Label>Tab Two</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
