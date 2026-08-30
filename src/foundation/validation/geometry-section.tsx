import { View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { touchTargetStyle } from '@/foundation/accessibility';
import type { ColorScheme, RadiusToken, ShadowToken, SpacingToken } from '@/theme';
import { radius, radiusCurve, semanticColor, shadows, spacing } from '@/theme';

import { Section } from './section';

const spacingTokens = Object.keys(spacing) as SpacingToken[];
const radiusTokens = Object.keys(radius) as RadiusToken[];
const shadowTokens = Object.keys(shadows) as ShadowToken[];

type GeometrySectionProps = {
  scheme: ColorScheme;
};

export function GeometrySection({ scheme }: GeometrySectionProps) {
  const fill = semanticColor('fill', scheme);
  return (
    <Section title="Geometry">
      {spacingTokens.map((token) => (
        <View
          key={token}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
        >
          <View
            testID={`spacing-bar-${token}`}
            style={{ width: spacing[token], height: spacing.xs, backgroundColor: fill }}
          />
          <AppText variant="caption1">{`${token}: ${spacing[token]}`}</AppText>
        </View>
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {radiusTokens.map((token) => (
          <View key={token} style={{ alignItems: 'center', gap: spacing.xs }}>
            <View
              testID={`radius-box-${token}`}
              style={{
                width: spacing.xxl,
                height: spacing.xxl,
                borderRadius: radius[token],
                borderCurve: radiusCurve,
                backgroundColor: fill,
              }}
            />
            <AppText variant="caption1">{token}</AppText>
          </View>
        ))}
      </View>
      <View
        testID="touch-target-marker"
        style={{
          ...touchTargetStyle,
          alignSelf: 'flex-start',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: semanticColor('separator', scheme),
          borderRadius: radius.sm,
          borderCurve: radiusCurve,
        }}
      >
        <AppText variant="caption2">44 pt</AppText>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        {shadowTokens.map((token) => (
          <View key={token} style={{ alignItems: 'center', gap: spacing.xs }}>
            <View
              testID={`shadow-card-${token}`}
              style={{
                width: spacing.xxl,
                height: spacing.xxl,
                borderRadius: radius.md,
                borderCurve: radiusCurve,
                backgroundColor: semanticColor('secondaryGroupedBackground', scheme),
                boxShadow: shadows[token],
              }}
            />
            <AppText variant="caption1">{token}</AppText>
          </View>
        ))}
      </View>
    </Section>
  );
}
