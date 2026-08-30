import type { ReactNode } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { spacing } from '@/theme';

type SectionProps = {
  title: string;
  children: ReactNode;
};

export function Section({ title, children }: SectionProps) {
  return (
    <View style={{ gap: spacing.sm, marginBottom: spacing.xl }}>
      <AppText variant="title2" accessibilityRole="header">
        {title}
      </AppText>
      {children}
    </View>
  );
}
