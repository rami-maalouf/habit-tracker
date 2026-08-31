import type { WidgetBoardRow } from '@/core/domain/entities';
import type { BoardId, LogicalDate } from '@/core/domain/ids';
import { getGroupedCheckInHistory } from '@/core/domain/queries';
import {
  WIDGET_ROW_LIMITS,
  nextWidgetRefreshUtc,
  widgetPropsFromProjection,
} from '@/features/widgets/widget-props';

import { widgetsPlatformMock } from '../../../src/testing/widgets-platform.mock';
import { notificationsPlatformMock } from '../../../src/testing/notifications-platform.mock';
import {
  getProductCore,
  newCommandId,
  resetProductCoreForTests,
} from '../../../src/testing/product-core.mock';
import { fireEvent, renderRouter, screen, settle } from '../../../src/testing/render';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));

function projectionRow(index: number): WidgetBoardRow {
  return {
    boardId: `00000000-0000-4000-8000-0000000000${String(index).padStart(2, '0')}` as BoardId,
    position: index,
    title: `board ${index}`,
    symbol: 'star.fill',
    accentHex: '#70A7FF',
    strip: [0, 1, 0, 2, 0, 0, 1],
    stripEndDate: '2026-08-30' as LogicalDate,
  };
}

describe('widget props', () => {
  it('maps the projection in order and caps at the largest family', () => {
    const rows = Array.from({ length: 15 }, (_, index) => projectionRow(index));
    const props = widgetPropsFromProjection(rows);
    expect(props.rows).toHaveLength(WIDGET_ROW_LIMITS.systemExtraLarge);
    expect(props.rows[0].title).toBe('board 0');
    expect(props.rows[0].strip).toEqual([0, 1, 0, 2, 0, 0, 1]);
    expect(props.stale).toBe(false);
  });

  it('keeps an empty projection empty', () => {
    expect(widgetPropsFromProjection([]).rows).toHaveLength(0);
  });

  it('schedules the stale entry just past the next local midnight', () => {
    // 2026-08-30 16:00 utc is noon in new york; 12 hours to midnight
    const now = Date.UTC(2026, 7, 30, 16, 0, 0);
    const next = nextWidgetRefreshUtc(now, 'America/New_York');
    expect(next).toBe(now + 12 * 3600 * 1000 + 1000);
    // exactly at midnight the next boundary is a full day away
    const atMidnight = nextWidgetRefreshUtc(Date.UTC(2026, 7, 31, 4, 0, 0), 'America/New_York');
    expect(atMidnight).toBe(Date.UTC(2026, 8, 1, 4, 0, 0) + 1000);
  });
});

describe('widget wiring', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    widgetsPlatformMock.reset();
    notificationsPlatformMock.reset();
  });

  async function seedBoard(title = 'widget board'): Promise<BoardId> {
    const opened = await getProductCore();
    if (!opened.ok) {
      throw new Error('core failed');
    }
    const { createBoard } = jest.requireActual<typeof import('@/core/domain/commands')>(
      '@/core/domain/commands',
    );
    const created = await createBoard(opened.value, {
      commandId: newCommandId(),
      title,
      symbol: 'star.fill',
      accentHex: '#70A7FF',
      usesTintedBackground: true,
      tracksAmount: false,
      tracksTime: false,
      startOfDayMinute: 0,
      metricsEnabled: true,
    });
    if (!created.ok) {
      throw new Error(created.error.message);
    }
    return created.value.boardId;
  }

  it('pushes the widget timeline on start and after mutations', async () => {
    const boardId = await seedBoard();
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByText('widget board');
    const callsAfterMount = widgetsPlatformMock.refreshCalls;
    expect(callsAfterMount).toBeGreaterThan(0);
    fireEvent.press(screen.getByTestId('board-card-0-quick'));
    await settle();
    expect(widgetsPlatformMock.refreshCalls).toBeGreaterThan(callsAfterMount);
    void boardId;
  });

  it('records a widget quick action through the shared command contract', async () => {
    const boardId = await seedBoard();
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByText('widget board');
    widgetsPlatformMock.emitQuickAction(boardId);
    await settle();
    const opened = await getProductCore();
    if (!opened.ok) {
      throw new Error('core failed');
    }
    const history = await getGroupedCheckInHistory(opened.value, boardId);
    if (!history.ok) {
      throw new Error('history failed');
    }
    expect(history.value.months[0].days[0].checkIns[0].source).toBe('widget');
  });

  it('deep-links to the add check-in sheet when the action cannot execute', async () => {
    const boardId = await seedBoard('archived widget board');
    const opened = await getProductCore();
    if (!opened.ok) {
      throw new Error('core failed');
    }
    const { archiveBoard } = jest.requireActual<typeof import('@/core/domain/commands')>(
      '@/core/domain/commands',
    );
    const archived = await archiveBoard(opened.value, {
      commandId: newCommandId(),
      boardId,
    });
    if (!archived.ok) {
      throw new Error(archived.error.message);
    }
    renderRouter('src/app', { initialUrl: '/' });
    await settle();
    widgetsPlatformMock.emitQuickAction(boardId);
    await settle();
    // the archived board rejects the write; the sheet explains instead
    expect(await screen.findByTestId('check-in-archived-board')).toBeOnTheScreen();
  });
});
