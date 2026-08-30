// behavior-focused test double for react-native-svg: shapes render as
// plain views so chart structure stays queryable without native svg
import type { ReactNode } from 'react';
import { View } from 'react-native';

type AnyProps = { children?: ReactNode; testID?: string } & Record<string, unknown>;

function makeShape(name: string) {
  function Shape({ children, testID }: AnyProps) {
    return <View testID={testID ?? `svg-${name}`}>{children}</View>;
  }
  Shape.displayName = name;
  return Shape;
}

export const Svg = makeShape('Svg');
export const G = makeShape('G');
export const Path = makeShape('Path');
export const Rect = makeShape('Rect');
export const Circle = makeShape('Circle');
export const Line = makeShape('Line');
export const Text = makeShape('SvgText');
export default Svg;
