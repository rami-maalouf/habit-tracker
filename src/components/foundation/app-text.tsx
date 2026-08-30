import type { TextProps } from 'react-native';
import { Text, useColorScheme, useWindowDimensions } from 'react-native';

import type { TypographyVariant } from '@/theme';
import { lineHeightFor, normalizeScheme, semanticColor, typography } from '@/theme';

type AppTextProps = TextProps & {
  variant?: TypographyVariant;
};

export function AppText({ variant = 'body', style, ...props }: AppTextProps) {
  const scheme = normalizeScheme(useColorScheme());
  const { fontScale } = useWindowDimensions();
  return (
    <Text
      selectable
      style={[
        typography[variant],
        {
          lineHeight: lineHeightFor(variant, fontScale),
          color: semanticColor('label', scheme),
        },
        style,
      ]}
      {...props}
    />
  );
}
