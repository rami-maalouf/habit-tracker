import { Text, View } from 'react-native';

import type { HeatmapWeek } from '@/core/domain/queries';

import type { CheckIn } from '@/core/domain/entities';

import { deriveBoardColors } from '../../../src/features/boards/board-colors';
import { formatAmount, formatCheckInTime } from '../../../src/features/check-in-history/history-screen';
import { BoardSymbol } from '../../../src/features/boards/board-symbol';
import { HeatmapView } from '../../../src/features/boards/heatmap-view';
import { SevenDayStrip } from '../../../src/features/boards/seven-day-strip';
import { ProductPressable } from '../../../src/features/ui';
import { renderComponent, screen } from '../../../src/testing/render';

const light = deriveBoardColors('#70A7FF', 'light');

describe('derived board colors', () => {
  it('uses deeper tint values in dark mode', () => {
    const dark = deriveBoardColors('#70A7FF', 'dark');
    expect(dark.tintedCardBackground).toContain('0.18');
    expect(dark.inactiveBar).toContain('0.28');
    expect(light.tintedCardBackground).toContain('0.14');
    expect(light.inactiveBar).toContain('0.2');
  });
});

describe('history row formatters', () => {
  const base = {
    amount: 4,
    occurredAtUtc: null,
    timeZoneId: null,
  } as unknown as CheckIn;

  it('formats an amount without a unit as the bare number', () => {
    expect(formatAmount(base, null)).toBe('4');
    expect(formatAmount(base, 'km')).toBe('4 km');
    expect(formatAmount({ ...base, amount: null } as unknown as CheckIn, 'km')).toBeNull();
  });

  it('formats time only when both instant and zone exist', () => {
    expect(formatCheckInTime(base)).toBeNull();
    const timed = {
      ...base,
      occurredAtUtc: Date.UTC(2026, 7, 30, 16, 30),
      timeZoneId: 'America/New_York',
    } as unknown as CheckIn;
    expect(formatCheckInTime(timed)).toMatch(/12:30/);
  });
});

describe('board symbol', () => {
  it('falls back to a circle for a symbol outside the allowlist', () => {
    renderComponent(<BoardSymbol symbol="not.a.real.symbol" color="#70A7FF" testID="fallback" />);
    // the fallback renders a plain bordered view, not an sf image
    expect(screen.getByTestId('fallback').type).toBe('View');
  });
});

describe('seven day strip', () => {
  it('treats a short strip as an empty today slot', () => {
    const result = renderComponent(<SevenDayStrip strip={[1, 0, 1]} colors={light} />);
    // three history bars, the separator, and the outlined today slot: the
    // today slot renders even when the strip has no seventh value
    const bars = result.toJSON();
    expect(bars).not.toBeNull();
    const root = Array.isArray(bars) ? bars[0] : bars;
    expect(root?.children?.length).toBe(5);
  });
});

describe('heatmap view', () => {
  it('colors every intensity level and ineligible cells', () => {
    const cell = (
      date: string,
      count: number,
      intensity: 'none' | 'low' | 'medium' | 'high',
      eligible: boolean,
    ) =>
      ({
        date,
        count,
        intensity,
        isToday: date === '2026-08-30',
        isFuture: false,
        eligible,
      }) as unknown as HeatmapWeek['days'][number];
    renderComponent(
      <HeatmapView
        weeks={[
          {
            days: [
              cell('2026-08-24', 0, 'none', true),
              cell('2026-08-25', 1, 'low', true),
              cell('2026-08-26', 2, 'medium', true),
              cell('2026-08-27', 3, 'high', true),
              cell('2026-08-28', 0, 'none', false),
              cell('2026-08-29', 0, 'none', true),
              cell('2026-08-30', 0, 'none', true),
            ],
          },
        ]}
        colors={light}
        testID="unit-heatmap"
      />,
    );
    expect(screen.getByTestId('unit-heatmap')).toBeOnTheScreen();
    // each intensity level carries a distinct accessibility label and the
    // multi check-in days carry a visible non-color marker
    expect(screen.getByLabelText('2026-08-25, 1 check-ins')).toBeOnTheScreen();
    expect(screen.getByTestId('heatmap-marker-2026-08-26')).toBeOnTheScreen();
    expect(screen.getByTestId('heatmap-marker-2026-08-27')).toBeOnTheScreen();
    expect(screen.queryByTestId('heatmap-marker-2026-08-25')).toBeNull();
  });
});

describe('product pressable styles', () => {
  it('merges a style function over the 44-point minimum target', () => {
    renderComponent(
      <ProductPressable
        onPress={() => undefined}
        label="Styled"
        testID="styled-pressable"
        style={(state) => ({ opacity: state.pressed ? 0.5 : 1 })}
      >
        <View>
          <Text>styled</Text>
        </View>
      </ProductPressable>,
    );
    const pressable = screen.getByTestId('styled-pressable');
    const flat = Object.assign(
      {},
      ...[pressable.props.style].flat(Infinity).filter(Boolean),
    ) as Record<string, unknown>;
    expect(flat.minHeight).toBe(44);
    expect(flat.minWidth).toBe(44);
    expect(flat.opacity).toBe(1);
  });

  it('refuses to shrink below the 44-point minimum but allows widening', () => {
    renderComponent(
      <>
        <ProductPressable onPress={() => undefined} label="Tiny" testID="tiny" style={{ minWidth: 10, minHeight: 8 }}>
          <Text>t</Text>
        </ProductPressable>
        <ProductPressable onPress={() => undefined} label="Wide" testID="wide" style={{ minWidth: 60 }}>
          <Text>w</Text>
        </ProductPressable>
      </>,
    );
    const flatten = (testId: string) =>
      Object.assign(
        {},
        ...[screen.getByTestId(testId).props.style].flat(Infinity).filter(Boolean),
      ) as Record<string, unknown>;
    expect(flatten('tiny').minWidth).toBe(44);
    expect(flatten('tiny').minHeight).toBe(44);
    expect(flatten('wide').minWidth).toBe(60);
    expect(flatten('wide').minHeight).toBe(44);
  });
});
