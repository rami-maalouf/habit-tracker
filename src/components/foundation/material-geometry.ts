import type { ViewStyle } from 'react-native';

import { radius, radiusCurve, spacing } from '@/theme';

// every adaptive-material branch shares this exact geometry so a capability
// fallback never changes bounds, radius, padding, or content order
export const materialGeometry = {
  borderRadius: radius.lg,
  borderCurve: radiusCurve,
  overflow: 'hidden',
  padding: spacing.lg,
} as const satisfies ViewStyle;

export type MaterialKind = 'liquid glass' | 'blur' | 'opaque fallback';

export function blurTintFor(scheme: 'light' | 'dark'): 'systemMaterialLight' | 'systemMaterialDark' {
  return scheme === 'dark' ? 'systemMaterialDark' : 'systemMaterialLight';
}

export type AdaptiveMaterialProps = {
  // development-only escape hatch used by the foundation preview to compare
  // the fallback branch against the primary material on one simulator
  forceFallback?: boolean;
  style?: ViewStyle;
  testID?: string;
  children?: React.ReactNode;
};
