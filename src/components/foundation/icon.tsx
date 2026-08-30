import { Image } from 'expo-image';
import { Platform, Text } from 'react-native';

// the platform icon mapping boundary: semantic names resolve to an sf symbol
// on ios and to a text glyph everywhere else. later platform work replaces
// the glyph path with compose-native icons.
export const icons = {
  add: { sfSymbol: 'plus', fallbackGlyph: '+' },
  settings: { sfSymbol: 'gearshape.fill', fallbackGlyph: '⚙' },
  checkmark: { sfSymbol: 'checkmark', fallbackGlyph: '✓' },
  close: { sfSymbol: 'xmark', fallbackGlyph: '×' },
} as const;

export type IconName = keyof typeof icons;

type IconProps = {
  name: IconName;
  size?: number;
  // expo-image tint accepts plain color strings; resolve platform colors to
  // their web-safe values before passing them here
  color?: string;
  // a label makes the icon an accessible image; without one it is decorative
  // and hidden from assistive technology
  label?: string;
  testID?: string;
};

export function Icon({ name, size = 20, color, label, testID }: IconProps) {
  const entry = icons[name];
  const accessibilityProps = label
    ? ({ accessible: true, accessibilityRole: 'image', accessibilityLabel: label } as const)
    : ({ accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const);

  if (Platform.OS === 'ios') {
    return (
      <Image
        source={`sf:${entry.sfSymbol}`}
        tintColor={color}
        style={{ width: size, height: size }}
        testID={testID}
        {...accessibilityProps}
      />
    );
  }

  return (
    <Text
      style={{ fontSize: size, lineHeight: size, color }}
      testID={testID}
      {...accessibilityProps}
    >
      {entry.fallbackGlyph}
    </Text>
  );
}
