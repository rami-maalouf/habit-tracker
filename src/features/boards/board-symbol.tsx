import { Image } from 'expo-image';
import { Platform, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { radius, radiusCurve } from '@/theme';

import { getBoardIcon } from './board-icon-catalog';

type BoardSymbolProps = {
  symbol: string;
  color: string;
  size?: number;
  testID?: string;
};

// unsupported names use a deterministic circle fallback; the picker only
// offers allowlisted names, so the fallback marks stale or foreign data
export function BoardSymbol({ symbol, color, size = 22, testID }: BoardSymbolProps) {
  const icon = getBoardIcon(symbol);
  if (icon && Platform.OS === 'ios') {
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
  if (icon) {
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        testID={testID}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Path d={icon.path} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
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
