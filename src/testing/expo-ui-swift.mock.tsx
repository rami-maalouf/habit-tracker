// behavior-focused test double for @expo/ui/swift-ui: layout shapes render
// as views, buttons press, and List.ForEach exposes per-row delete triggers
// so tests can drive the native swipe-to-delete path
import type { ReactNode } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';
import React from 'react';

type AnyProps = { children?: ReactNode; testID?: string } & Record<string, unknown>;

export function Text({ children }: AnyProps) {
  return <RNText>{children}</RNText>;
}

export function HStack({ children, modifiers }: AnyProps & { modifiers?: unknown[] }) {
  // an onTapGesture modifier makes the mocked stack pressable, mirroring
  // the native tap-gesture row
  const tap = (modifiers ?? []).find(
    (modifier): modifier is { __onTap: () => void } =>
      typeof modifier === 'object' && modifier !== null && '__onTap' in modifier,
  );
  if (tap) {
    return (
      <Pressable accessibilityRole="button" onPress={tap.__onTap}>
        {children}
      </Pressable>
    );
  }
  return <View>{children}</View>;
}

export function VStack({ children }: AnyProps) {
  return <View>{children}</View>;
}

export function Spacer() {
  return <View />;
}

export function Section({ title, children }: AnyProps & { title?: string }) {
  return (
    <View>
      {title ? <RNText>{title}</RNText> : null}
      {children}
    </View>
  );
}

export function Button({ onPress, children, testID }: AnyProps & { onPress?: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} testID={testID}>
      {children}
    </Pressable>
  );
}

function ListForEach({
  children,
  onDelete,
}: AnyProps & { onDelete?: (indices: number[]) => void }) {
  const items = React.Children.toArray(children);
  return (
    <View>
      {items.map((child, index) => (
        <View key={index}>
          {child}
          {onDelete ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete row ${index}`}
              testID={`swipe-delete-${index}`}
              onPress={() => onDelete([index])}
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function List({ children }: AnyProps) {
  return <View>{children}</View>;
}
List.ForEach = ListForEach;

// modifier factories from @expo/ui/swift-ui/modifiers resolve here too; the
// mocked components ignore the configs except the tap gesture, which HStack
// turns into a pressable
export function buttonStyle() {
  return {};
}

export function foregroundStyle() {
  return {};
}

export function contentShape() {
  return {};
}

export function onTapGesture(handler: () => void) {
  return { __onTap: handler };
}

export const shapes = {
  rectangle: () => ({}),
};
