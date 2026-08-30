import { fireEvent, renderRouter, screen } from '../../src/testing/render';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    GlassView: View,
    isLiquidGlassAvailable: jest.fn(() => true),
  };
});

const haptics = require('expo-haptics') as { impactAsync: jest.Mock };
const glass = require('expo-glass-effect') as { isLiquidGlassAvailable: jest.Mock };

const sectionTitles = [
  'Typography',
  'Semantic colors',
  'Geometry',
  'Adaptive material',
  'Native controls',
  'Interaction states',
  'Accessibility and motion',
];

describe('foundation preview (development)', () => {
  it('renders the seven ordered sections', async () => {
    renderRouter('src/app', { initialUrl: '/foundation-preview' });

    await screen.findByText('Typography');
    const headers = screen.getAllByRole('header');
    const titles = headers.map((node) => node.props.children);
    expect(titles).toEqual(sectionTitles);
  });

  it('renders every labeled fixture from the preview contract', async () => {
    const { radius, semanticRoles, shadows, spacing, typography } =
      require('@/theme') as typeof import('../../src/theme');

    renderRouter('src/app', { initialUrl: '/foundation-preview' });
    await screen.findByText('Typography');

    // native controls by accessible role and name inside @expo/ui hosts
    expect(screen.getAllByTestId('expo-ui-host').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: 'Primary action' })).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Habit enabled' })).toBeOnTheScreen();
    // the universal slider and picker expose no accessible-name prop; their
    // labels are the adjacent text fixtures, and the pairing is pinned by
    // testID (a real @expo/ui prop) plus role and value
    expect(screen.getByTestId('intensity-slider')).toHaveAccessibilityValue({ now: 0.5 });
    expect(screen.getByRole('adjustable')).toBe(screen.getByTestId('intensity-slider'));
    expect(screen.getByTestId('frequency-picker')).toHaveAccessibilityValue({ text: 'Daily' });
    expect(screen.getByRole('combobox')).toBe(screen.getByTestId('frequency-picker'));
    for (const label of ['Intensity', 'Frequency', 'Note']) {
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
    }
    expect(screen.getByPlaceholderText('Note')).toBeOnTheScreen();

    // one wrapping sample per named type style
    for (const variant of Object.keys(typography)) {
      expect(screen.getByTestId(`type-sample-${variant}`)).toBeOnTheScreen();
    }
    // every semantic role plus the accent and destructive contrast chips
    for (const role of semanticRoles) {
      expect(screen.getByTestId(`color-swatch-${role}`)).toBeOnTheScreen();
    }
    expect(screen.getByTestId('color-swatch-accent')).toBeOnTheScreen();
    expect(screen.getByTestId('color-swatch-on-destructive')).toBeOnTheScreen();

    // every spacing, radius, and shadow token plus the touch-target marker
    for (const token of Object.keys(spacing)) {
      expect(screen.getByTestId(`spacing-bar-${token}`)).toBeOnTheScreen();
    }
    for (const token of Object.keys(radius)) {
      expect(screen.getByTestId(`radius-box-${token}`)).toBeOnTheScreen();
    }
    for (const token of Object.keys(shadows)) {
      expect(screen.getByTestId(`shadow-card-${token}`)).toBeOnTheScreen();
    }
    expect(screen.getByTestId('touch-target-marker')).toBeOnTheScreen();
  });

  it('exposes disabled interaction states semantically', async () => {
    renderRouter('src/app', { initialUrl: '/foundation-preview' });
    await screen.findByText('Typography');

    expect(screen.getByRole('button', { name: 'Disabled action' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Disabled switch' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Primary action' })).toBeEnabled();
  });

  it('increments the action count through the haptic path', async () => {
    renderRouter('src/app', { initialUrl: '/foundation-preview' });

    expect(await screen.findByText('Action count: 0')).toBeOnTheScreen();
    fireEvent.press(screen.getAllByText('Primary action')[0]);
    expect(screen.getByText('Action count: 1')).toBeOnTheScreen();
    expect(haptics.impactAsync).toHaveBeenCalled();
  });

  it('reports liquid glass by default and blur when material=fallback forces the branch', async () => {
    glass.isLiquidGlassAvailable.mockReturnValue(true);

    renderRouter('src/app', { initialUrl: '/foundation-preview' });
    expect(await screen.findByText('Material: liquid glass')).toBeOnTheScreen();
    expect(screen.getByText('Material mode: automatic')).toBeOnTheScreen();
    screen.unmount();

    renderRouter('src/app', { initialUrl: '/foundation-preview?material=fallback' });
    expect(await screen.findByText('Material: blur')).toBeOnTheScreen();
    expect(screen.getByText('Material mode: fallback forced')).toBeOnTheScreen();
  });

  it('reports appearance, font scale, and reduce motion as selectable status text', async () => {
    renderRouter('src/app', { initialUrl: '/foundation-preview' });
    await screen.findByText('Typography');

    const statusLines = [
      screen.getByText(/^Appearance: (light|dark)$/),
      screen.getByText(/^Font scale: [\d.]+$/),
      screen.getByText(/^Reduce motion: (on|off)$/),
      screen.getByText(/^Material mode: /),
      screen.getByText(/^Material: /),
      screen.getByText(/^Action count: /),
    ];
    for (const line of statusLines) {
      expect(line).toBeOnTheScreen();
      expect(line.props.selectable).toBe(true);
    }
  });
});

describe('foundation preview (production mode)', () => {
  it('renders no preview fixture and redirects to /', async () => {
    const devFlag = global as unknown as { __DEV__: boolean };
    const original = devFlag.__DEV__;
    devFlag.__DEV__ = false;
    try {
      renderRouter('src/app', { initialUrl: '/foundation-preview' });
      await screen.findByTestId('empty-create-board');
      expect(screen.queryByText('Primary action')).toBeNull();
      expect(screen.queryByText('Typography')).toBeNull();
      expect(screen).toHavePathname('/');
    } finally {
      devFlag.__DEV__ = original;
    }
  });
});
