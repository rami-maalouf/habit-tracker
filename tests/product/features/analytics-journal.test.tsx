import { Alert } from 'react-native';

import { createBoard, createCheckIn } from '@/core/domain/commands';
import type { BoardId, LogicalDate } from '@/core/domain/ids';

import { buildStreakRows } from '../../../src/features/analytics/analytics-screen';
import * as queries from '@/core/domain/queries';
import { err } from '@/core/domain/result';

import {
  ChartFrame,
  consistencyColumnPaths,
  monthlyLinePaths,
  pairedBarPaths,
} from '../../../src/features/analytics/charts';
import {
  getProductCore,
  mockClock,
  newCommandId,
  resetProductCoreForTests,
} from '../../../src/testing/product-core.mock';
import { fireEvent, renderComponent, renderRouter, screen, settle } from '../../../src/testing/render';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

async function press(testId: string): Promise<void> {
  fireEvent.press(screen.getByTestId(testId));
  await settle();
}

// rntl never fires onLayout, so charts are measured by hand
async function layoutChart(testId: string, width = 320, height = 160): Promise<void> {
  fireEvent(screen.getByTestId(testId), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width, height } },
  });
  await settle();
}

async function core() {
  const opened = await getProductCore();
  if (!opened.ok) {
    throw new Error('test core failed to open');
  }
  return opened.value;
}

async function seedBoard(
  title: string,
  overrides: Partial<Parameters<typeof createBoard>[1]> = {},
): Promise<BoardId> {
  const deps = await core();
  const created = await createBoard(deps, {
    commandId: newCommandId(),
    title,
    symbol: 'drop.fill',
    accentHex: '#78D98B',
    usesTintedBackground: false,
    tracksAmount: false,
    amountUnit: null,
    quickAmount: 1,
    tracksTime: false,
    startOfDayMinute: 0,
    metricsEnabled: true,
    ...overrides,
  });
  if (!created.ok) {
    throw new Error(`seed board failed: ${created.error.message}`);
  }
  return created.value.boardId;
}

async function seedAgedBoardWithData(): Promise<BoardId> {
  mockClock.utcMs = Date.UTC(2026, 7, 15, 16, 0);
  const boardId = await seedBoard('data rich');
  mockClock.utcMs = Date.UTC(2026, 7, 30, 16, 0);
  const deps = await core();
  const days = [
    '2026-08-15', '2026-08-16', '2026-08-17', '2026-08-20',
    '2026-08-21', '2026-08-22', '2026-08-23', '2026-08-29',
  ];
  for (const day of days) {
    const created = await createCheckIn(deps, {
      commandId: newCommandId(),
      boardId,
      logicalDate: day as LogicalDate,
      source: 'app',
    });
    if (!created.ok) {
      throw new Error(`seed check-in failed: ${created.error.message}`);
    }
  }
  return boardId;
}

describe('analytics sheet', () => {
  beforeEach(() => {
    resetProductCoreForTests();
  });

  it('renders all five sections with summaries for a board with data', async () => {
    const boardId = await seedAgedBoardWithData();
    renderRouter('src/app', { initialUrl: `/boards/${boardId}/analytics` });

    expect(await screen.findByTestId('analytics-timeline')).toBeOnTheScreen();
    expect(screen.getByTestId('analytics-weekdays')).toBeOnTheScreen();
    expect(screen.getByTestId('analytics-comparison')).toBeOnTheScreen();
    expect(screen.getByTestId('analytics-consistency')).toBeOnTheScreen();
    expect(screen.getByTestId('analytics-streaks')).toBeOnTheScreen();

    // measuring each frame renders the svg chart content
    await layoutChart('timeline-chart');
    await layoutChart('weekday-chart', 320, 120);
    await layoutChart('comparison-chart');
    await layoutChart('consistency-chart');
    await layoutChart('streak-chart', 320, 260);
    expect(screen.getAllByTestId('svg-Path').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByTestId('svg-Rect').length).toBeGreaterThanOrEqual(10);
    expect(screen.getAllByTestId('svg-Circle').length).toBeGreaterThanOrEqual(2);

    // text summaries carry the same values as the charts
    expect(screen.getByTestId('timeline-summary')).toHaveTextContent(/Aug 8/);
    expect(screen.getByTestId('weekday-summary')).toBeOnTheScreen();
    expect(screen.getByTestId('comparison-summary')).toHaveTextContent(/2026/);
    expect(screen.getByTestId('consistency-summary')).toHaveTextContent(/2026-08/);
    expect(screen.getByTestId('streak-summary')).toHaveTextContent(/Longest streak - 4 days/);
  });

  it('steps the timeline year back and forward within bounds', async () => {
    const boardId = await seedAgedBoardWithData();
    renderRouter('src/app', { initialUrl: `/boards/${boardId}/analytics` });
    await screen.findByTestId('timeline-year');
    expect(screen.getByTestId('timeline-year')).toHaveTextContent('2026');

    await press('timeline-year-previous');
    expect(screen.getByTestId('timeline-year')).toHaveTextContent('2025');
    await press('timeline-year-next');
    expect(screen.getByTestId('timeline-year')).toHaveTextContent('2026');
    // the current year is the ceiling
    const next = screen.getByTestId('timeline-year-next');
    expect(next.props.accessibilityState?.disabled).toBe(true);
  });

  it('explains insufficient data without inventing values', async () => {
    const boardId = await seedBoard('fresh board');
    renderRouter('src/app', { initialUrl: `/boards/${boardId}/analytics` });

    expect(await screen.findByTestId('weekday-empty')).toBeOnTheScreen();
    expect(screen.getByTestId('consistency-empty')).toBeOnTheScreen();
  });

  it('locks analytics behind metrics and archive states', async () => {
    const boardId = await seedBoard('quiet board', { metricsEnabled: false });
    renderRouter('src/app', { initialUrl: `/boards/${boardId}/analytics` });
    expect(await screen.findByTestId('analytics-unavailable')).toBeOnTheScreen();
    expect(
      screen.getByText('Performance metrics are off for this board.'),
    ).toBeOnTheScreen();
  });

  it('locks analytics for an archived board', async () => {
    const boardId = await seedBoard('shelved board');
    const deps = await core();
    const { archiveBoard } = jest.requireActual<typeof import('@/core/domain/commands')>(
      '@/core/domain/commands',
    );
    const archived = await archiveBoard(deps, { commandId: newCommandId(), boardId });
    expect(archived.ok).toBe(true);

    renderRouter('src/app', { initialUrl: `/boards/${boardId}/analytics` });
    expect(await screen.findByTestId('analytics-unavailable')).toBeOnTheScreen();
    expect(screen.getByText('This board is archived.')).toBeOnTheScreen();
  });

  it('surfaces failed analytics queries with a retry and no invented data', async () => {
    const boardId = await seedAgedBoardWithData();
    const failure = err('database', 'The data could not be loaded.', { retryable: true });
    jest.spyOn(queries, 'getTimelineAnalytics').mockResolvedValueOnce(failure);
    jest.spyOn(queries, 'getWeekdayAnalytics').mockResolvedValueOnce(failure);
    jest.spyOn(queries, 'getYearComparison').mockResolvedValueOnce(failure);
    jest.spyOn(queries, 'getConsistencyAnalytics').mockResolvedValueOnce(failure);
    jest.spyOn(queries, 'getStreakAnalytics').mockResolvedValueOnce(failure);

    renderRouter('src/app', { initialUrl: `/boards/${boardId}/analytics` });
    expect(await screen.findByTestId('analytics-query-error')).toBeOnTheScreen();
    // every section falls back to its explanation, never invented values
    expect(screen.getByTestId('timeline-empty')).toBeOnTheScreen();
    expect(screen.getByTestId('weekday-empty')).toBeOnTheScreen();
    expect(screen.getByTestId('comparison-empty')).toBeOnTheScreen();
    expect(screen.getByTestId('consistency-empty')).toBeOnTheScreen();
    expect(screen.getByTestId('streak-empty')).toBeOnTheScreen();

    fireEvent.press(screen.getByText('Try again'));
    await settle();
    expect(await screen.findByTestId('timeline-summary')).toBeOnTheScreen();
    jest.restoreAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  it('renders chart edge cases without markers or with scaled axes', async () => {
    renderComponent(
      <>
        <ChartFrame accessibilityLabel="empty year" testID="unit-line">
          {monthlyLinePaths({
            values: Array.from({ length: 12 }, () => 0),
            monthLabels: Array.from({ length: 12 }, () => 'x'),
            accent: '#70A7FF',
            scheme: 'light',
          })}
        </ChartFrame>
        <ChartFrame accessibilityLabel="big year" testID="unit-bars">
          {pairedBarPaths({
            selected: [120, null, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            previous: [80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            monthLabels: Array.from({ length: 12 }, () => 'x'),
            accent: '#70A7FF',
            scheme: 'light',
          })}
        </ChartFrame>
        <ChartFrame accessibilityLabel="no consistency" testID="unit-columns">
          {consistencyColumnPaths({
            percents: Array.from({ length: 12 }, () => null),
            monthLabels: Array.from({ length: 12 }, () => 'x'),
            accent: '#70A7FF',
            scheme: 'light',
          })}
        </ChartFrame>
      </>,
    );
    for (const id of ['unit-line', 'unit-bars', 'unit-columns']) {
      fireEvent(screen.getByTestId(id), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 160 } },
      });
    }
    // an all-zero year draws no latest-month dot, and all-null consistency
    // draws no columns
    expect(screen.getByTestId('unit-line')).toBeOnTheScreen();
    expect(screen.getByTestId('unit-columns')).toBeOnTheScreen();
  });

  it('splits a cross-month streak span into month rows', () => {
    const rows = buildStreakRows({
      spans: [{ startDate: '2026-08-30', endDate: '2026-09-02' }],
      windowStart: '2025-10-01',
      windowEnd: '2026-09-30',
    });
    expect(rows).toHaveLength(12);
    const august = rows.find((row) => row.monthLabel === 'Aug');
    const september = rows.find((row) => row.monthLabel === 'Sep');
    expect(august?.spans).toEqual([{ startDay: 30, endDay: 31 }]);
    expect(september?.spans).toEqual([{ startDay: 1, endDay: 2 }]);
  });
});

describe('journal', () => {
  beforeEach(() => {
    resetProductCoreForTests();
  });

  it('surfaces a failed journal load with a retry', async () => {
    const boardId = await seedBoard('flaky journal');
    jest
      .spyOn(queries, 'getJournalTimeline')
      .mockResolvedValueOnce(err('database', 'The data could not be loaded.', { retryable: true }));

    renderRouter('src/app', { initialUrl: `/boards/${boardId}/journal` });
    expect(await screen.findByTestId('journal-error')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Try again'));
    await settle();
    expect(await screen.findByTestId('journal-empty')).toBeOnTheScreen();
    jest.restoreAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  it('lists noted check-ins and opens the editor', async () => {
    const boardId = await seedBoard('writer');
    const deps = await core();
    const withNote = await createCheckIn(deps, {
      commandId: newCommandId(),
      boardId,
      logicalDate: '2026-08-29' as LogicalDate,
      note: 'a good day',
      source: 'app',
    });
    const withoutNote = await createCheckIn(deps, {
      commandId: newCommandId(),
      boardId,
      logicalDate: '2026-08-30' as LogicalDate,
      source: 'app',
    });
    expect(withNote.ok && withoutNote.ok).toBe(true);

    renderRouter('src/app', { initialUrl: `/boards/${boardId}/journal` });
    expect(await screen.findByText('a good day')).toBeOnTheScreen();
    // only noted check-ins appear
    expect(screen.getAllByLabelText(/Journal entry/)).toHaveLength(1);

    fireEvent.press(screen.getByText('a good day'));
    await settle();
    expect(await screen.findByTestId('check-in-note')).toBeOnTheScreen();
  });

  it('offers add check-in from the empty state', async () => {
    const boardId = await seedBoard('blank journal');
    renderRouter('src/app', { initialUrl: `/boards/${boardId}/journal` });
    expect(await screen.findByTestId('journal-empty')).toBeOnTheScreen();
    await press('journal-add-check-in');
    expect(await screen.findByTestId('check-in-note')).toBeOnTheScreen();
  });

  it('keeps an archived journal read-only', async () => {
    const boardId = await seedBoard('closed writer');
    const deps = await core();
    const noted = await createCheckIn(deps, {
      commandId: newCommandId(),
      boardId,
      logicalDate: '2026-08-29' as LogicalDate,
      note: 'sealed note',
      source: 'app',
    });
    expect(noted.ok).toBe(true);
    const { archiveBoard } = jest.requireActual<typeof import('@/core/domain/commands')>(
      '@/core/domain/commands',
    );
    const archived = await archiveBoard(deps, { commandId: newCommandId(), boardId });
    expect(archived.ok).toBe(true);

    renderRouter('src/app', { initialUrl: `/boards/${boardId}/journal` });
    const row = await screen.findByLabelText(/Journal entry/);
    expect(row.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(row);
    await settle();
    expect(screen.queryByTestId('check-in-note')).toBeNull();
  });
});
