import { AdaptiveMaterial, getMaterialKind } from '@/components/foundation/adaptive-material';
import { AppText } from '@/components/foundation/app-text';

import { Section } from './section';

type MaterialSectionProps = {
  forceFallback: boolean;
};

export function MaterialSection({ forceFallback }: MaterialSectionProps) {
  const kind = getMaterialKind(forceFallback);
  return (
    <Section title="Adaptive material">
      <AdaptiveMaterial forceFallback={forceFallback} testID="material-surface">
        <AppText variant="body">{`Material: ${kind}`}</AppText>
      </AdaptiveMaterial>
    </Section>
  );
}
