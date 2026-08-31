// shared product ui primitives (public feature index)
import type { ReactNode } from 'react';
import type { AccessibilityRole, StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { minimumTouchTarget } from '@/foundation/accessibility';
import type { ColorScheme } from '@/theme';
import { brand, normalizeScheme, radius, semanticColor, spacing } from '@/theme';

export function useScheme(): ColorScheme {
  return normalizeScheme(useColorScheme());
}

type ProductPressableProps = {
  onPress?: () => void;
  disabled?: boolean;
  label: string;
  hint?: string;
  role?: AccessibilityRole;
  selected?: boolean;
  testID?: string;
  // full-width row pressables opt out of horizontal content centering
  stretch?: boolean;
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  children: ReactNode;
};

// accessible pressable with the 44-point minimum and semantic states
export function ProductPressable({
  onPress,
  disabled,
  label,
  hint,
  role = 'button',
  selected,
  testID,
  stretch,
  style,
  children,
}: ProductPressableProps) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: disabled === true, selected }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      // the 44-point minimum applies to both axes and cannot be shrunk by
      // caller styles; a caller may only widen it
      style={(state) => {
        const resolved = typeof style === 'function' ? style(state) : style;
        const flat = StyleSheet.flatten(resolved) ?? {};
        const minHeight = Math.max(
          minimumTouchTarget,
          typeof flat.minHeight === 'number' ? flat.minHeight : 0,
        );
        const minWidth = Math.max(
          minimumTouchTarget,
          typeof flat.minWidth === 'number' ? flat.minWidth : 0,
        );
        return [
          // glyph buttons center inside their 44-point target; rows stretch
          { justifyContent: 'center', alignItems: stretch ? 'stretch' : 'center' },
          state.pressed ? { opacity: 0.6 } : null,
          disabled ? { opacity: 0.4 } : null,
          resolved,
          { minHeight, minWidth },
        ];
      }}
    >
      {children}
    </Pressable>
  );
}

type PrimaryButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
  testID?: string;
};

export function PrimaryButton({ title, onPress, disabled, destructive, testID }: PrimaryButtonProps) {
  const scheme = useScheme();
  const background = destructive ? semanticColor('destructive', scheme) : brand.accent[scheme];
  const color = destructive ? semanticColor('onDestructive', scheme) : brand.onAccent[scheme];
  return (
    <ProductPressable onPress={onPress} disabled={disabled} label={title} testID={testID} stretch>
      <View
        style={{
          backgroundColor: background,
          borderRadius: radius.capsule,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          alignItems: 'center',
        }}
      >
        <AppText variant="headline" style={{ color: color as string }} selectable={false}>
          {title}
        </AppText>
      </View>
    </ProductPressable>
  );
}

export function InlineError({ message, testID }: { message: string; testID?: string }) {
  const scheme = useScheme();
  return (
    <AppText
      variant="footnote"
      testID={testID}
      style={{ color: semanticColor('destructive', scheme) }}
    >
      {message}
    </AppText>
  );
}

