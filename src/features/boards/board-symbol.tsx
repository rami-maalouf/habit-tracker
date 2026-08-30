import { Image } from 'expo-image';
import { Platform, View } from 'react-native';

import { boardSymbolAllowlist } from '@/core/domain/entities';
import { radius, radiusCurve } from '@/theme';

type BoardSymbolProps = {
  symbol: string;
  color: string;
  size?: number;
  testID?: string;
};

// unsupported names use a deterministic circle fallback; the picker only
// offers allowlisted names, so the fallback marks stale or foreign data
export function BoardSymbol({ symbol, color, size = 22, testID }: BoardSymbolProps) {
  const supported = (boardSymbolAllowlist as readonly string[]).includes(symbol);
  if (supported && Platform.OS === 'ios') {
    return (
      <Image
        source={`sf:${symbol}`}
        tintColor={color}
        style={{ width: size, height: size }}
        testID={testID}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    );
  }
  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: radius.capsule,
        borderCurve: radiusCurve,
        borderWidth: 2,
        borderColor: color,
      }}
    />
  );
}
