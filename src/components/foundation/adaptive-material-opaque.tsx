import { useColorScheme, View } from 'react-native';

import { normalizeScheme, semanticColor } from '@/theme';

import type { AdaptiveMaterialProps, MaterialKind } from './material-geometry';
import { materialGeometry } from './material-geometry';

// shared opaque implementation used by the web-safe and android boundaries;
// a missing material capability must never produce an invisible surface
export function getOpaqueMaterialKind(): MaterialKind {
  return 'opaque fallback';
}

export function OpaqueMaterial({ style, testID, children }: AdaptiveMaterialProps) {
  const scheme = normalizeScheme(useColorScheme());
  return (
    <View
      testID={testID}
      style={[
        materialGeometry,
        { backgroundColor: semanticColor('secondaryGroupedBackground', scheme) },
        style,
      ]}
    >
      {children}
    </View>
  );
}
