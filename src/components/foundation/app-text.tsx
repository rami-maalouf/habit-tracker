import type { TextProps } from 'react-native';
import { Text } from 'react-native';

import type { TypographyVariant } from '@/theme';
import { typography } from '@/theme';

type AppTextProps = TextProps & {
  variant?: TypographyVariant;
};

export function AppText({ variant = 'body', style, ...props }: AppTextProps) {
  return <Text selectable style={[typography[variant], style]} {...props} />;
}
