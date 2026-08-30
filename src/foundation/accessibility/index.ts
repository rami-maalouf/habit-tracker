import type { Insets, ViewStyle } from 'react-native';

// every interactive target is at least 44 by 44 points
export const minimumTouchTarget = 44;

export const touchTargetStyle = {
  minWidth: minimumTouchTarget,
  minHeight: minimumTouchTarget,
} as const satisfies ViewStyle;

// expands the touch area of a visually smaller control to the minimum target;
// undefined means the control already meets the minimum on its own
export function hitSlopFor(visualSizePts: number): Insets | undefined {
  if (visualSizePts >= minimumTouchTarget) {
    return undefined;
  }
  const inset = Math.ceil((minimumTouchTarget - visualSizePts) / 2);
  return { top: inset, bottom: inset, left: inset, right: inset };
}
