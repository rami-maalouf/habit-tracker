import { useWindowDimensions } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { useReducedMotion } from '@/foundation/accessibility/use-reduced-motion';
import type { ColorScheme } from '@/theme';

import { Section } from './section';

type AccessibilitySectionProps = {
  scheme: ColorScheme;
  materialFallbackForced: boolean;
};

export function AccessibilitySection({ scheme, materialFallbackForced }: AccessibilitySectionProps) {
  const { fontScale } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  return (
    <Section title="Accessibility and motion">
      <AppText variant="body">{`Appearance: ${scheme}`}</AppText>
      <AppText variant="body">{`Font scale: ${fontScale}`}</AppText>
      <AppText variant="body">{`Reduce motion: ${reducedMotion ? 'on' : 'off'}`}</AppText>
      <AppText variant="body">{`Material mode: ${materialFallbackForced ? 'fallback forced' : 'automatic'}`}</AppText>
    </Section>
  );
}
