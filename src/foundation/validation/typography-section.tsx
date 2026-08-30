import { AppText } from '@/components/foundation/app-text';
import { typography } from '@/theme';
import type { TypographyVariant } from '@/theme';

import { typographySampleText } from './fixtures';
import { Section } from './section';

const variants = Object.keys(typography) as TypographyVariant[];

export function TypographySection() {
  return (
    <Section title="Typography">
      {variants.map((variant) => (
        <AppText key={variant} variant={variant} testID={`type-sample-${variant}`}>
          {`${variant}: ${typographySampleText}`}
        </AppText>
      ))}
    </Section>
  );
}
