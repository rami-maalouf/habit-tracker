import { View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import type { ColorScheme } from '@/theme';
import { brand, radius, radiusCurve, semanticColor, semanticRoles, spacing } from '@/theme';

import { Section } from './section';

type ColorsSectionProps = {
  scheme: ColorScheme;
};

export function ColorsSection({ scheme }: ColorsSectionProps) {
  return (
    <Section title="Semantic colors">
      {semanticRoles.map((role) => (
        <View key={role} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View
            testID={`color-swatch-${role}`}
            style={{
              width: spacing.xl,
              height: spacing.xl,
              borderRadius: radius.sm,
              borderCurve: radiusCurve,
              borderWidth: 1,
              borderColor: semanticColor('separator', scheme),
              backgroundColor: semanticColor(role, scheme),
            }}
          />
          <AppText variant="footnote">{role}</AppText>
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View
          testID="color-swatch-accent"
          style={{
            borderRadius: radius.sm,
            borderCurve: radiusCurve,
            backgroundColor: brand.accent[scheme],
            paddingHorizontal: spacing.sm,
            paddingVertical: spacing.xs,
          }}
        >
          <AppText variant="footnote" style={{ color: brand.onAccent[scheme] }}>
            on accent
          </AppText>
        </View>
        <AppText variant="footnote">accent</AppText>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View
          testID="color-swatch-on-destructive"
          style={{
            borderRadius: radius.sm,
            borderCurve: radiusCurve,
            backgroundColor: semanticColor('destructive', scheme),
            paddingHorizontal: spacing.sm,
            paddingVertical: spacing.xs,
          }}
        >
          <AppText
            variant="footnote"
            style={{ color: semanticColor('onDestructive', scheme) }}
          >
            on destructive
          </AppText>
        </View>
        <AppText variant="footnote">destructive contrast</AppText>
      </View>
    </Section>
  );
}
