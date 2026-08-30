import * as Haptics from 'expo-haptics';

// the one approved haptic path for confirming a primary action; later
// modules call this instead of choosing feedback styles ad hoc
export function triggerActionHaptic(): Promise<void> {
  return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}
