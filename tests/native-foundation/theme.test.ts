import {
  brand,
  brandColor,
  durations,
  radius,
  radiusCurve,
  resolveDuration,
  resolveSemanticPalette,
  resolveSpring,
  semanticColor,
  semanticFallbacks,
  semanticRoles,
  shadows,
  spacing,
  springs,
  typography,
} from '@/theme';

const HEX_OR_RGBA = /^(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|rgba?\([\d.,\s%]+\))$/;

// wcag relative luminance over an sRGB hex color
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => {
    const c = parseInt(value.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = channels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('semantic colors', () => {
  const requiredRoles = [
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

  it('defines every required role with light and dark web-safe fallbacks', () => {
    for (const role of requiredRoles) {
      expect(semanticRoles).toContain(role);
      const fallback = semanticFallbacks[role];
      expect(fallback.light).toMatch(HEX_OR_RGBA);
      expect(fallback.dark).toMatch(HEX_OR_RGBA);
    }
  });

  it('resolves a full palette for each scheme', () => {
    const light = resolveSemanticPalette('light');
    const dark = resolveSemanticPalette('dark');
    for (const role of semanticRoles) {
      expect(light[role]).toBeDefined();
      expect(dark[role]).toBeDefined();
    }
    expect(light.background).not.toEqual(dark.background);
  });

  it('returns a defined color value from semanticColor on this platform', () => {
    expect(semanticColor('label', 'light')).toBeDefined();
  });

  it('serves the web-safe fallback on non-ios platforms', () => {
    const { Platform } = jest.requireActual<typeof import('react-native')>('react-native');
    const replaced = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      expect(semanticColor('label', 'dark')).toBe(semanticFallbacks.label.dark);
    } finally {
      replaced.restore();
    }
  });

  it('keeps brand accents separate from semantic roles', () => {
    for (const name of Object.keys(brand)) {
      expect(semanticRoles).not.toContain(name);
    }
    expect(brandColor('accent', 'light')).toMatch(HEX_OR_RGBA);
  });

  it('meets 4.5:1 for label on backgrounds and on-accent text in both schemes', () => {
    for (const scheme of ['light', 'dark'] as const) {
      expect(contrast(semanticFallbacks.label[scheme], semanticFallbacks.background[scheme])).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(semanticFallbacks.label[scheme], semanticFallbacks.groupedBackground[scheme]),
      ).toBeGreaterThanOrEqual(4.5);
      expect(contrast(brand.onAccent[scheme], brand.accent[scheme])).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(semanticFallbacks.onDestructive[scheme], semanticFallbacks.destructive[scheme]),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('spacing', () => {
  it('uses a named ascending 4-point grid', () => {
    const values = Object.values(spacing);
    expect(values.length).toBeGreaterThanOrEqual(6);
    for (const value of values) {
      expect(value % 4).toBe(0);
    }
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });
});

describe('typography', () => {
  const requiredStyles = [
    'largeTitle',
    'title1',
    'title2',
    'title3',
    'headline',
    'body',
    'callout',
    'subheadline',
    'footnote',
    'caption1',
    'caption2',
  ] as const;

  it('defines the system dynamic-type ramp', () => {
    for (const name of requiredStyles) {
      const style = typography[name];
      expect(style).toBeDefined();
      expect(style.fontSize).toBeGreaterThan(0);
      expect(style.lineHeight).toBeGreaterThanOrEqual(style.fontSize);
      // system font: no custom fontFamily is set anywhere in the ramp
      expect('fontFamily' in style).toBe(false);
    }
    expect(typography.body.fontSize).toBe(17);
  });
});

describe('radius', () => {
  it('uses named ascending tokens and a continuous curve for non-capsule shapes', () => {
    const { capsule, ...named } = radius;
    const values = Object.values(named);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
    expect(capsule).toBeGreaterThan(Math.max(...values));
    expect(radiusCurve).toBe('continuous');
  });
});

describe('shadows', () => {
  it('defines box-shadow strings only, never legacy shadow or elevation props', () => {
    for (const token of Object.values(shadows)) {
      expect(typeof token).toBe('string');
      expect(token).toMatch(/^-?\d/);
      expect(token).toContain('px');
    }
  });
});

describe('motion', () => {
  it('names timing and spring tokens', () => {
    expect(durations.instant).toBe(0);
    expect(durations.fast).toBeGreaterThan(0);
    expect(durations.standard).toBeGreaterThan(durations.fast);
    for (const spring of Object.values(springs)) {
      expect(spring.damping).toBeGreaterThan(0);
      expect(spring.stiffness).toBeGreaterThan(0);
    }
  });

  it('collapses to no decorative motion under reduce motion', () => {
    expect(resolveDuration(true, 'standard')).toBe(0);
    expect(resolveDuration(false, 'standard')).toBe(durations.standard);
    expect(resolveSpring(true, 'snappy')).toBeUndefined();
    expect(resolveSpring(false, 'snappy')).toEqual(springs.snappy);
  });
});
