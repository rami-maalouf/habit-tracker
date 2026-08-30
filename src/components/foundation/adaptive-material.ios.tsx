import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useColorScheme, View } from 'react-native';

import { normalizeScheme } from '@/theme';

import type { AdaptiveMaterialProps, MaterialKind } from './material-geometry';
import { blurTintFor, materialGeometry } from './material-geometry';

// ios boundary: native liquid glass where the runtime supports it, adaptive
// blur otherwise. the forced fallback branch exists so the preview can
// compare fallback geometry and contrast on the primary ios simulator.
export function getMaterialKind(forceFallback: boolean): MaterialKind {
  if (!forceFallback && glassAvailable()) {
    return 'liquid glass';
  }
  return 'blur';
}

function glassAvailable(): boolean {
  try {
    return isLiquidGlassAvailable();
  } catch {
    // a capability probe failure must degrade, never crash the surface
    return false;
  }
}

export function AdaptiveMaterial({
  forceFallback = false,
  style,
  testID,
  children,
}: AdaptiveMaterialProps) {
  const scheme = normalizeScheme(useColorScheme());
  const kind = getMaterialKind(forceFallback);

  if (kind === 'liquid glass') {
    return (
      <GlassView testID={testID} style={[materialGeometry, style]}>
        {children}
      </GlassView>
    );
  }

  return (
    <View testID={testID} style={[materialGeometry, style]}>
      <BlurView
        tint={blurTintFor(scheme)}
        intensity={100}
        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
      />
      {children}
    </View>
  );
}
