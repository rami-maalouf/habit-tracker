import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import type { ColorScheme } from '@/theme';
import { semanticColor } from '@/theme';

// all charts render through react-native-svg with semantic tokens; each
// chart is one accessible image whose label carries its values, and the
// screen pairs it with a selectable text summary

const CHART_HEIGHT = 160;
const AXIS_GAP = 4;

type MeasuredProps = {
  height?: number;
  accessibilityLabel: string;
  testID?: string;
  children: (width: number, height: number) => React.ReactNode;
};

// svg needs concrete pixel sizes; the frame measures the available width
export function ChartFrame({ height = CHART_HEIGHT, accessibilityLabel, testID, children }: MeasuredProps) {
  const [width, setWidth] = useState(0);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
      style={{ width: '100%', height }}
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          {children(width, height)}
        </Svg>
      ) : null}
    </View>
  );
}

function niceMax(value: number): number {
  if (value <= 4) {
    return 4;
  }
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

export function gridColor(scheme: ColorScheme): string {
  return semanticColor('separator', scheme) as string;
}

type MonthlyLineProps = {
  // null marks an unavailable month (future in the current year); the line
  // stops there instead of drawing an invented zero
  values: (number | null)[];
  monthLabels: string[];
  accent: string;
  scheme: ColorScheme;
};

// timeline: monthly totals for one year as a line with a dot on the last
// month that has data
export function monthlyLinePaths({ values, monthLabels, accent, scheme }: MonthlyLineProps) {
  return function MonthlyLine(width: number, height: number) {
    const labelBand = 18;
    const plotHeight = height - labelBand;
    const max = niceMax(Math.max(...values.map((value) => value ?? 0), 1));
    const stepX = width / 12;
    const yFor = (value: number) => plotHeight - (value / max) * (plotHeight - 8) - 4;
    const points = values.map((value, index) =>
      value === null
        ? null
        : {
            x: stepX * index + stepX / 2,
            y: yFor(value),
          },
    );
    let path = '';
    let drawing = false;
    for (const point of points) {
      if (point === null) {
        drawing = false;
        continue;
      }
      path += `${drawing ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)} `;
      drawing = true;
    }
    const lastWithData = values.reduce<number>(
      (keep, value, index) => (value !== null && value > 0 ? index : keep),
      -1,
    );
    const labelColor = semanticColor('secondaryLabel', scheme) as string;
    return (
      <>
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
          <Line
            key={fraction}
            x1={0}
            x2={width}
            y1={yFor(max * fraction)}
            y2={yFor(max * fraction)}
            stroke={gridColor(scheme)}
            strokeWidth={0.5}
          />
        ))}
        <Path d={path.trim()} stroke={accent} strokeWidth={2} fill="none" />
        {lastWithData >= 0 && points[lastWithData] ? (
          <Circle
            cx={(points[lastWithData] as { x: number }).x}
            cy={(points[lastWithData] as { y: number }).y}
            r={5}
            fill={semanticColor('background', scheme) as string}
            stroke={accent}
            strokeWidth={3}
          />
        ) : null}
        {monthLabels.map((label, index) => (
          <SvgText
            key={index}
            x={stepX * index + stepX / 2}
            y={height - AXIS_GAP}
            fontSize={10}
            fill={labelColor}
            textAnchor="middle"
          >
            {label}
          </SvgText>
        ))}
      </>
    );
  };
}

type PairedBarsProps = {
  selected: (number | null)[];
  previous: number[];
  monthLabels: string[];
  accent: string;
  scheme: ColorScheme;
};

// year comparison: selected-year bars in the accent, previous-year bars in
// the muted fill, side by side per month
export function pairedBarPaths({ selected, previous, monthLabels, accent, scheme }: PairedBarsProps) {
  return function PairedBars(width: number, height: number) {
    const labelBand = 18;
    const plotHeight = height - labelBand;
    const max = niceMax(
      Math.max(...selected.map((value) => value ?? 0), ...previous, 1),
    );
    const stepX = width / 12;
    const barWidth = Math.max(3, stepX / 3.4);
    const heightFor = (value: number) => (value / max) * (plotHeight - 10);
    const mutedBar = semanticColor('fill', scheme) as string;
    const labelColor = semanticColor('secondaryLabel', scheme) as string;
    return (
      <>
        {[0, 0.5, 1].map((fraction) => (
          <Line
            key={fraction}
            x1={0}
            x2={width}
            y1={plotHeight - heightFor(max * fraction) - 2}
            y2={plotHeight - heightFor(max * fraction) - 2}
            stroke={gridColor(scheme)}
            strokeWidth={0.5}
          />
        ))}
        {previous.map((value, index) => (
          <Rect
            key={`p${index}`}
            x={stepX * index + stepX / 2 - barWidth - 1}
            y={plotHeight - heightFor(value) - 2}
            width={barWidth}
            height={heightFor(value)}
            rx={2}
            fill={mutedBar}
          />
        ))}
        {selected.map((value, index) =>
          value === null ? null : (
            <Rect
              key={`s${index}`}
              x={stepX * index + stepX / 2 + 1}
              y={plotHeight - heightFor(value) - 2}
              width={barWidth}
              height={heightFor(value)}
              rx={2}
              fill={accent}
            />
          ),
        )}
        {monthLabels.map((label, index) => (
          <SvgText
            key={index}
            x={stepX * index + stepX / 2}
            y={height - AXIS_GAP}
            fontSize={9}
            fill={labelColor}
            textAnchor="middle"
          >
            {label}
          </SvgText>
        ))}
      </>
    );
  };
}

type DonutProps = {
  workdayPercent: number;
  accent: string;
  scheme: ColorScheme;
  size?: number;
};

// weekday split donut: the workday share in the accent, the weekend share
// in the muted fill
export function WeekdayDonut({ workdayPercent, accent, scheme, size = 96 }: DonutProps) {
  const radius = size / 2 - 8;
  const circumference = 2 * Math.PI * radius;
  const workdayLength = (workdayPercent / 100) * circumference;
  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={semanticColor('fill', scheme) as string}
        strokeWidth={12}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={accent}
        strokeWidth={12}
        fill="none"
        strokeDasharray={`${workdayLength} ${circumference - workdayLength}`}
        strokeLinecap="round"
        // start the workday arc at twelve o'clock
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

type WeekdayBarsProps = {
  counts: number[];
  dayLabels: string[];
  accent: string;
  scheme: ColorScheme;
};

// monday-through-sunday bars with the highest day in the accent
export function weekdayBarPaths({ counts, dayLabels, accent, scheme }: WeekdayBarsProps) {
  return function WeekdayBars(width: number, height: number) {
    const labelBand = 18;
    const plotHeight = height - labelBand;
    const max = Math.max(...counts, 1);
    const stepX = width / 7;
    const barWidth = Math.min(18, stepX * 0.5);
    const highest = counts.indexOf(Math.max(...counts));
    const mutedBar = semanticColor('fill', scheme) as string;
    const labelColor = semanticColor('secondaryLabel', scheme) as string;
    return (
      <>
        {counts.map((value, index) => {
          const barHeight = Math.max(4, (value / max) * (plotHeight - 8));
          return (
            <Rect
              key={index}
              x={stepX * index + (stepX - barWidth) / 2}
              y={plotHeight - barHeight}
              width={barWidth}
              height={barHeight}
              rx={barWidth / 2}
              fill={index === highest && value > 0 ? accent : mutedBar}
            />
          );
        })}
        {dayLabels.map((label, index) => (
          <SvgText
            key={index}
            x={stepX * index + stepX / 2}
            y={height - AXIS_GAP}
            fontSize={10}
            fill={labelColor}
            textAnchor="middle"
          >
            {label}
          </SvgText>
        ))}
      </>
    );
  };
}

type ConsistencyColumnsProps = {
  percents: (number | null)[];
  monthLabels: string[];
  accent: string;
  scheme: ColorScheme;
};

// monthly consistency columns against the low, average, and high bands;
// band boundaries sit at 40 and 75 percent
export function consistencyColumnPaths({ percents, monthLabels, accent, scheme }: ConsistencyColumnsProps) {
  return function ConsistencyColumns(width: number, height: number) {
    const labelBand = 18;
    const bandBand = 56;
    const plotWidth = width - bandBand;
    const plotHeight = height - labelBand;
    const stepX = plotWidth / 12;
    const barWidth = Math.max(6, stepX * 0.55);
    const yFor = (percent: number) => plotHeight - (percent / 100) * (plotHeight - 6) - 2;
    const mutedBar = semanticColor('fill', scheme) as string;
    const labelColor = semanticColor('secondaryLabel', scheme) as string;
    const latest = percents.reduce<number>((keep, value, index) => (value !== null ? index : keep), -1);
    return (
      <>
        {[40, 75].map((boundary) => (
          <Line
            key={boundary}
            x1={0}
            x2={plotWidth}
            y1={yFor(boundary)}
            y2={yFor(boundary)}
            stroke={gridColor(scheme)}
            strokeWidth={0.5}
          />
        ))}
        {['Low', 'Average', 'High'].map((band, index) => (
          <SvgText
            key={band}
            x={plotWidth + 8}
            y={yFor([20, 57, 88][index]) + 4}
            fontSize={11}
            fill={labelColor}
          >
            {band}
          </SvgText>
        ))}
        {percents.map((percent, index) =>
          percent === null ? null : (
            <Rect
              key={index}
              x={stepX * index + (stepX - barWidth) / 2}
              y={yFor(percent)}
              width={barWidth}
              height={plotHeight - yFor(percent) - 2}
              rx={2}
              fill={index === latest ? accent : mutedBar}
            />
          ),
        )}
        {latest >= 0 && percents[latest] !== null ? (
          <Circle
            cx={stepX * latest + stepX / 2}
            cy={yFor(percents[latest] as number) - 6}
            r={5}
            fill={semanticColor('background', scheme) as string}
            stroke={accent}
            strokeWidth={3}
          />
        ) : null}
        {monthLabels.map((label, index) => (
          <SvgText
            key={index}
            x={stepX * index + stepX / 2}
            y={height - AXIS_GAP}
            fontSize={10}
            fill={labelColor}
            textAnchor="middle"
          >
            {label}
          </SvgText>
        ))}
      </>
    );
  };
}

export type StreakRow = {
  monthLabel: string;
  // one bar per span: day-of-month range within this row's month
  spans: { startDay: number; endDay: number }[];
  daysInMonth: number;
};

type StreakChartProps = {
  rows: StreakRow[];
  accent: string;
  scheme: ColorScheme;
};

// streak gantt: one row per month, spans as rounded bars across days 1..31
export function streakRowPaths({ rows, accent, scheme }: StreakChartProps) {
  return function StreakRows(width: number, height: number) {
    const labelBand = 34;
    const axisBand = 16;
    const plotWidth = width - labelBand;
    const rowHeight = (height - axisBand) / Math.max(rows.length, 1);
    const dayWidth = plotWidth / 31;
    const labelColor = semanticColor('secondaryLabel', scheme) as string;
    return (
      <>
        {rows.map((row, rowIndex) => (
          <SvgText
            key={`m${rowIndex}`}
            x={0}
            y={rowHeight * rowIndex + rowHeight / 2 + 4}
            fontSize={10}
            fill={labelColor}
          >
            {row.monthLabel}
          </SvgText>
        ))}
        {rows.flatMap((row, rowIndex) =>
          row.spans.map((span, spanIndex) => (
            <Rect
              key={`s${rowIndex}-${spanIndex}`}
              x={labelBand + (span.startDay - 1) * dayWidth}
              y={rowHeight * rowIndex + rowHeight / 2 - 3}
              width={Math.max(dayWidth * (span.endDay - span.startDay + 1), 6)}
              height={6}
              rx={3}
              fill={accent}
            />
          )),
        )}
        {[1, 7, 13, 19, 25, 31].map((day) => (
          <SvgText
            key={`d${day}`}
            x={labelBand + (day - 0.5) * dayWidth}
            y={height - 2}
            fontSize={10}
            fill={labelColor}
            textAnchor="middle"
          >
            {String(day)}
          </SvgText>
        ))}
      </>
    );
  };
}
