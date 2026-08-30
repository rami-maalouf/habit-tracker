import type { ColorValue } from 'react-native';
import { Platform, PlatformColor } from 'react-native';

export type ColorScheme = 'light' | 'dark';

// react-native's useColorScheme can report null or 'unspecified'; every
// consumer normalizes through this single policy (light unless clearly dark)
export function normalizeScheme(value: string | null | undefined): ColorScheme {
  return value === 'dark' ? 'dark' : 'light';
}

export const semanticRoles = [
  'label',
  'secondaryLabel',
  'background',
  'groupedBackground',
  'secondaryGroupedBackground',
  'separator',
  'fill',
  'destructive',
  'onDestructive',
] as const;

export type SemanticRole = (typeof semanticRoles)[number];

const pureBlack = '#000000';
const pureWhite = '#ffffff';

// ios resolves through system colors at render time; every other platform
// uses these web-safe values, taken from the ios system palette
export const semanticFallbacks: Record<SemanticRole, Record<ColorScheme, string>> = {
  label: { light: pureBlack, dark: pureWhite },
  secondaryLabel: { light: 'rgba(60, 60, 67, 0.6)', dark: 'rgba(235, 235, 245, 0.6)' },
  background: { light: pureWhite, dark: pureBlack },
  groupedBackground: { light: '#f2f2f7', dark: pureBlack },
  secondaryGroupedBackground: { light: pureWhite, dark: '#1c1c1e' },
  separator: { light: 'rgba(60, 60, 67, 0.29)', dark: 'rgba(84, 84, 88, 0.6)' },
  fill: { light: 'rgba(120, 120, 128, 0.2)', dark: 'rgba(120, 120, 128, 0.36)' },
  destructive: { light: '#d70015', dark: '#ff453a' },
  onDestructive: { light: pureWhite, dark: pureBlack },
};

const iosSystemColorNames: Record<SemanticRole, string> = {
  label: 'label',
  secondaryLabel: 'secondaryLabel',
  background: 'systemBackground',
  groupedBackground: 'systemGroupedBackground',
  secondaryGroupedBackground: 'secondarySystemGroupedBackground',
  separator: 'separator',
  fill: 'systemFill',
  destructive: 'systemRed',
  onDestructive: 'systemBackground',
};

export function semanticColor(role: SemanticRole, scheme: ColorScheme): ColorValue {
  if (Platform.OS === 'ios') {
    return PlatformColor(iosSystemColorNames[role]);
  }
  return semanticFallbacks[role][scheme];
}

// static fallback resolution, used for contrast checks and non-ios rendering
export function resolveSemanticPalette(scheme: ColorScheme): Record<SemanticRole, string> {
  const palette = {} as Record<SemanticRole, string>;
  for (const role of semanticRoles) {
    palette[role] = semanticFallbacks[role][scheme];
  }
  return palette;
}

// brand accents stay separate from the semantic interface roles above
export const brand = {
  accent: { light: '#2563eb', dark: '#7cb3ff' },
  onAccent: { light: '#ffffff', dark: '#001433' },
} as const;

export type BrandRole = keyof typeof brand;

export function brandColor(role: BrandRole, scheme: ColorScheme): string {
  return brand[role][scheme];
}
