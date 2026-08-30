import { Platform, Text } from 'react-native';

import { AppText } from '@/components/foundation/app-text';
import { Icon, icons } from '@/components/foundation/icon';
import {
  hitSlopFor,
  minimumTouchTarget,
  touchTargetStyle,
} from '@/foundation/accessibility';
import { radius, spacing, typography } from '@/theme';

import { renderComponent, screen } from '../../src/testing/render';

// behavior-focused mock: the glass capability flag drives material selection
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    GlassView: View,
    isLiquidGlassAvailable: jest.fn(() => false),
  };
});

// resolved after the mock so the ios platform file sees the mocked module
const {
  AdaptiveMaterial,
  getMaterialKind,
} = require('@/components/foundation/adaptive-material') as typeof import('../../src/components/foundation/adaptive-material.ios');
const { isLiquidGlassAvailable } = require('expo-glass-effect') as {
  isLiquidGlassAvailable: jest.Mock;
};
const { materialGeometry } = require('@/components/foundation/material-geometry');

describe('AppText', () => {
  it('renders selectable body text by default', () => {
    renderComponent(<AppText>hello</AppText>);
    const text = screen.getByText('hello');
    expect(text.props.selectable).toBe(true);
    expect(text).toHaveStyle({ fontSize: typography.body.fontSize });
  });

  it('applies the named variant and merges style overrides last', () => {
    renderComponent(
      <AppText variant="headline" style={{ letterSpacing: 1 }}>
        title
      </AppText>,
    );
    const text = screen.getByText('title');
    expect(text).toHaveStyle({ fontSize: typography.headline.fontSize, letterSpacing: 1 });
  });
});

describe('Icon', () => {
  it('maps every semantic icon to an sf symbol and a fallback glyph', () => {
    for (const entry of Object.values(icons)) {
      expect(entry.sfSymbol.length).toBeGreaterThan(0);
      expect(entry.fallbackGlyph.length).toBeGreaterThan(0);
    }
  });

  it('is accessible with a label and hidden without one', () => {
    renderComponent(
      <>
        <Icon name="settings" label="Open settings" />
        <Icon name="checkmark" />
      </>,
    );
    expect(screen.getByRole('image', { name: 'Open settings' })).toBeOnTheScreen();
    // the expo image host adapter does not forward testID, so the decorative
    // state is asserted through the accessibility prop it must carry
    expect(screen.UNSAFE_getByProps({ accessibilityElementsHidden: true })).toBeTruthy();
  });

  it('renders the fallback glyph off ios', () => {
    const replaced = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      renderComponent(<Icon name="add" label="Add" />);
      expect(screen.getByText(icons.add.fallbackGlyph)).toBeOnTheScreen();
    } finally {
      replaced.restore();
    }
  });
});

describe('AdaptiveMaterial (ios boundary)', () => {
  it('selects blur when liquid glass is unavailable', () => {
    isLiquidGlassAvailable.mockReturnValue(false);
    expect(getMaterialKind(false)).toBe('blur');
  });

  it('selects liquid glass when the runtime supports it', () => {
    isLiquidGlassAvailable.mockReturnValue(true);
    expect(getMaterialKind(false)).toBe('liquid glass');
  });

  it('forces the fallback branch even when glass is available', () => {
    isLiquidGlassAvailable.mockReturnValue(true);
    expect(getMaterialKind(true)).toBe('blur');
  });

  it('renders children inside the shared fixed geometry for every branch', () => {
    for (const force of [false, true]) {
      isLiquidGlassAvailable.mockReturnValue(!force);
      renderComponent(
        <AdaptiveMaterial forceFallback={force} testID={`surface-${force}`}>
          <Text>content</Text>
        </AdaptiveMaterial>,
      );
      expect(screen.getByTestId(`surface-${force}`)).toHaveStyle({
        borderRadius: materialGeometry.borderRadius,
        padding: materialGeometry.padding,
      });
      expect(screen.getByText('content')).toBeOnTheScreen();
      screen.unmount();
    }
  });
});

describe('material selection edges', () => {
  it('degrades to blur when the glass capability probe throws', () => {
    isLiquidGlassAvailable.mockImplementation(() => {
      throw new Error('probe failed');
    });
    expect(getMaterialKind(false)).toBe('blur');
    isLiquidGlassAvailable.mockReturnValue(false);
  });

  it('normalizes color schemes and maps blur tints per scheme', () => {
    const { normalizeScheme } = require('@/theme') as typeof import('../../src/theme');
    const { blurTintFor } = require('@/components/foundation/material-geometry');
    expect(normalizeScheme('dark')).toBe('dark');
    expect(normalizeScheme('light')).toBe('light');
    expect(normalizeScheme(null)).toBe('light');
    expect(normalizeScheme('unspecified')).toBe('light');
    expect(blurTintFor('dark')).toBe('systemMaterialDark');
    expect(blurTintFor('light')).toBe('systemMaterialLight');
  });

  it('web-safe boundary resolves the opaque fallback', () => {
    const neutral =
      require('../../src/components/foundation/adaptive-material.tsx') as typeof import('../../src/components/foundation/adaptive-material');
    expect(neutral.getMaterialKind(false)).toBe('opaque fallback');
    renderComponent(
      <neutral.AdaptiveMaterial testID="web-surface">
        <Text>web content</Text>
      </neutral.AdaptiveMaterial>,
    );
    expect(screen.getByText('web content')).toBeOnTheScreen();
  });
});

describe('android-safe material resolution', () => {
  it('resolves the opaque fallback without importing ios-only modules', () => {
    const android =
      require('../../src/components/foundation/adaptive-material.android') as typeof import('../../src/components/foundation/adaptive-material.android');
    expect(android.getMaterialKind(false)).toBe('opaque fallback');
    renderComponent(
      <android.AdaptiveMaterial testID="android-surface">
        <Text>android content</Text>
      </android.AdaptiveMaterial>,
    );
    expect(screen.getByText('android content')).toBeOnTheScreen();
  });
});

describe('touch targets', () => {
  it('exposes the 44-point minimum and expands smaller controls', () => {
    expect(minimumTouchTarget).toBe(44);
    expect(touchTargetStyle).toEqual({ minWidth: 44, minHeight: 44 });
    expect(hitSlopFor(28)).toEqual({ top: 8, bottom: 8, left: 8, right: 8 });
    expect(hitSlopFor(44)).toBeUndefined();
  });

  it('uses theme tokens for the material geometry', () => {
    expect(materialGeometry.borderRadius).toBe(radius.lg);
    expect(materialGeometry.padding).toBe(spacing.lg);
    expect(materialGeometry.borderCurve).toBe('continuous');
  });
});
