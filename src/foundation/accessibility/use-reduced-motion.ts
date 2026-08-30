import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// reflects the system reduce motion setting; starts false and updates from
// the async probe plus the change listener
export function useReducedMotion(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setEnabled);
    AccessibilityInfo.isReduceMotionEnabled().then(setEnabled, () => undefined);
    return () => subscription.remove();
  }, []);

  return enabled;
}
