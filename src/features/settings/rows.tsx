import { View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { minimumTouchTarget } from '@/foundation/accessibility';
import { radius, radiusCurve, semanticColor, spacing } from '@/theme';

import { ProductPressable, useScheme } from '../ui';

// grouped-list building blocks shared by every settings surface

export function SettingsGroup({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const scheme = useScheme();
  return (
    <View style={{ gap: spacing.sm }}>
      {title ? (
        <AppText variant="footnote" accessibilityRole="header" style={{ paddingHorizontal: spacing.sm }}>
          {title.toUpperCase()}
        </AppText>
      ) : null}
      <View
        style={{
          backgroundColor: semanticColor('secondaryGroupedBackground', scheme),
          borderRadius: radius.lg,
          borderCurve: radiusCurve,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </View>
  );
}

export function SettingsRow({
  title,
  detail,
  onPress,
  external,
  disabled,
  testID,
}: {
  title: string;
  detail?: string;
  onPress?: () => void;
  // external rows leave the app; internal rows push a destination
  external?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        gap: spacing.md,
      }}
    >
      <AppText accessible={false} selectable={false} style={{ flexShrink: 1 }}>
        {title}
      </AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        {detail ? (
          <AppText accessible={false} variant="footnote" selectable={false}>
            {detail}
          </AppText>
        ) : null}
        {onPress ? (
          <AppText accessible={false} variant="footnote" selectable={false}>
            {external ? '↗' : '›'}
          </AppText>
        ) : null}
      </View>
    </View>
  );

  if (!onPress) {
    return (
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={title}
        accessibilityValue={detail === undefined ? undefined : { text: detail }}
        testID={testID}
        style={{ minHeight: minimumTouchTarget, justifyContent: 'center' }}
      >
        {content}
      </View>
    );
  }

  return (
    <ProductPressable
      onPress={onPress}
      disabled={disabled}
      label={detail ? `${title}, ${detail}` : title}
      hint={external ? 'Opens outside the app' : undefined}
      stretch
      testID={testID}
    >
      {content}
    </ProductPressable>
  );
}
