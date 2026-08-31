import { router } from 'expo-router';
import { Alert } from 'react-native';
import { act } from '@testing-library/react-native';

import {
  archiveBoard,
  createBoard,
  createCheckIn,
  deleteBoard,
  removeCheckIn,
  restoreBoard,
} from '@/core/domain/commands';
import type { BoardId } from '@/core/domain/ids';
import type { LogicalDate } from '@/core/domain/ids';

import {
  getProductCore,
  mockClock,
  newCommandId,
  resetProductCoreForTests,
} from '../../../src/testing/product-core.mock';
import { fireEvent, renderRouter, screen, settle } from '../../../src/testing/render';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));

const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
  const destructive = buttons?.find((button) => button.style === 'destructive');
  destructive?.onPress?.();
});

async function press(testId: string): Promise<void> {
  fireEvent.press(screen.getByTestId(testId));
  await settle();
}

async function core() {
  const opened = await getProductCore();
  if (!opened.ok) {
    throw new Error('test core failed to open');
  }
  return opened.value;
}

// seeds a board created ten days before the pinned test clock so metrics are
// eligible, with check-ins across the window
async function seedAgedBoard(): Promise<BoardId> {
  const deps = await core();
  mockClock.utcMs = Date.UTC(2026, 7, 20, 16, 0);
  const created = await createBoard(deps, {
    commandId: newCommandId(),
    title: 'aged habit',
    symbol: 'drop.fill',
    accentHex: '#70A7FF',
    usesTintedBackground: true,
    tracksAmount: false,
    amountUnit: null,
    quickAmount: 1,
    tracksTime: false,
    startOfDayMinute: 0,
    metricsEnabled: true,
  });
  if (!created.ok) {
    throw new Error(`seed board failed: ${created.error.message}`);
  }
  // the activity period started on the 20th; check-ins backfill from today
  mockClock.utcMs = Date.UTC(2026, 7, 30, 16, 0);
  const days = ['2026-08-20', '2026-08-21', '2026-08-23', '2026-08-25', '2026-08-27', '2026-08-29'];
  for (const day of days) {
    const checkedIn = await createCheckIn(deps, {
      commandId: newCommandId(),
      boardId: created.value.boardId,
      logicalDate: day as LogicalDate,
      source: 'app',
    });
    if (!checkedIn.ok) {
      throw new Error(`seed check-in failed: ${checkedIn.error.message}`);
    }
  }
  mockClock.utcMs = Date.UTC(2026, 7, 30, 16, 0);
  return created.value.boardId;
}

async function seedSimpleBoard(title: string): Promise<BoardId> {
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
  });
  if (!created.ok) {
    throw new Error(`seed board failed: ${created.error.message}`);
  }
  return created.value.boardId;
}

describe('board detail states', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    alertSpy.mockClear();
  });

  it('shows metrics cards once the board has enough eligible days', async () => {
    const boardId = await seedAgedBoard();
    renderRouter('src/app', { initialUrl: `/boards/${boardId}` });

    expect(await screen.findByTestId('metrics-cards')).toBeOnTheScreen();
    expect(screen.queryByTestId('metrics-education')).toBeNull();
    expect(screen.getByText(/CURRENT STREAK/)).toBeOnTheScreen();
    expect(screen.getByText(/Longest:/)).toBeOnTheScreen();
    expect(screen.getByText(/CONSISTENCY/)).toBeOnTheScreen();
    expect(screen.getByText(/of the last 30 days/)).toBeOnTheScreen();
    expect(screen.getByText(/Current week:/)).toBeOnTheScreen();
    expect(screen.getByTestId('board-heatmap')).toBeOnTheScreen();
  });

  it('restores an archived board from its read-only detail', async () => {
    const boardId = await seedSimpleBoard('paused habit');
    const deps = await core();
    const archived = await archiveBoard(deps, { commandId: newCommandId(), boardId });
    expect(archived.ok).toBe(true);

    renderRouter('src/app', { initialUrl: `/boards/${boardId}` });
    expect(await screen.findByTestId('archived-banner')).toBeOnTheScreen();
    expect(screen.queryByTestId('edit-board')).toBeNull();
    expect(screen.queryByTestId('board-actions')).toBeNull();

    await press('restore-board');
    expect(screen.queryByTestId('archived-banner')).toBeNull();
    expect(await screen.findByTestId('board-actions')).toBeOnTheScreen();
  });

  it('deletes an archived board from detail after confirmation', async () => {
    const boardId = await seedSimpleBoard('done habit');
    const deps = await core();
    const archived = await archiveBoard(deps, { commandId: newCommandId(), boardId });
    expect(archived.ok).toBe(true);

    renderRouter('src/app', { initialUrl: `/boards/${boardId}` });
    await screen.findByTestId('archived-banner');
    await press('delete-board');
    await settle();

    expect(alertSpy).toHaveBeenCalledWith(
      'Delete Board',
      expect.stringContaining('permanently deletes'),
      expect.any(Array),
    );
    expect(screen).toHavePathname('/');
    expect(
      await screen.findByText('Boards turn habits into something you can see.'),
    ).toBeOnTheScreen();
  });

  it('deletes a board from the edit sheet with dependent counts', async () => {
    const boardId = await seedAgedBoard();
    renderRouter('src/app', { initialUrl: `/boards/${boardId}/edit` });
    await screen.findByTestId('form-delete-board');

    await press('form-delete-board');
    await settle();
    expect(alertSpy).toHaveBeenCalledWith(
      'Delete Board',
      expect.stringContaining('6 check-ins'),
      expect.any(Array),
    );
    expect(screen).toHavePathname('/');
  });

  it('shows the board unavailable state on the edit sheet for a missing id', async () => {
    renderRouter('src/app', {
      initialUrl: '/boards/00000000-0000-4000-8000-00000000dead/edit',
    });
    expect(await screen.findByText('This board is not available.')).toBeOnTheScreen();
  });
});

describe('home extras', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    alertSpy.mockClear();
  });

  it('opens settings from the home header', async () => {
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('empty-create-board');
    await press('open-settings');
    expect(screen).toHavePathname('/settings');
    expect(await screen.findByTestId('settings-interim')).toBeOnTheScreen();
  });

  it('expires the undo window after five seconds', async () => {
    await seedSimpleBoard('fleeting');
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('board-card-0');

    await press('board-card-0-quick');
    expect(screen.getByTestId('undo-check-in')).toBeOnTheScreen();

    await act(async () => {
      jest.advanceTimersByTime(5100);
      await Promise.resolve();
    });
    expect(screen.queryByTestId('undo-check-in')).toBeNull();
  });

  it('moves a board down in edit mode', async () => {
    await seedSimpleBoard('alpha');
    await seedSimpleBoard('beta');
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('board-card-1');

    await press('toggle-edit-boards');
    await press('board-card-0-move-down');

    expect(screen.getByTestId('board-card-0')).toHaveTextContent(/beta/);
    expect(screen.getByTestId('board-card-1')).toHaveTextContent(/alpha/);
  });
});

describe('detail add check-in', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    alertSpy.mockClear();
  });

  it('opens the add check-in sheet from the detail plus, defaulting to today', async () => {
    const boardId = await seedSimpleBoard('deliberate');
    renderRouter('src/app', { initialUrl: `/boards/${boardId}` });
    await screen.findByTestId('detail-add-check-in');

    await press('detail-add-check-in');
    // the sheet opens with today's date preselected and a save lands today
    const date = await screen.findByTestId('check-in-date');
    expect(new Date(date.props.children as string).getUTCDate()).toBe(30);
    await press('check-in-save');
    await settle();

    const deps = await core();
    const { getGroupedCheckInHistory } = jest.requireActual<
      typeof import('@/core/domain/queries')
    >('@/core/domain/queries');
    const history = await getGroupedCheckInHistory(deps, boardId);
    if (!history.ok) {
      throw new Error('history query failed');
    }
    expect(history.value.months[0].days[0].date).toBe('2026-08-30');
  });
});

describe('failure surfaces behind stale screens', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    alertSpy.mockClear();
  });

  it('shows a quick check-in error when the board archived elsewhere', async () => {
    const boardId = await seedSimpleBoard('vanishing');
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('board-card-0');

    const deps = await core();
    const archived = await archiveBoard(deps, { commandId: newCommandId(), boardId });
    expect(archived.ok).toBe(true);

    await press('board-card-0-quick');
    expect(await screen.findByTestId('quick-error')).toBeOnTheScreen();
  });

  it('replaces a pending undo when a second quick check-in lands', async () => {
    await seedSimpleBoard('steady');
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('board-card-0');

    await press('board-card-0-quick');
    expect(screen.getByTestId('undo-check-in')).toBeOnTheScreen();
    await press('board-card-0-quick');
    expect(screen.getByTestId('undo-check-in')).toBeOnTheScreen();
    await press('undo-check-in');
    expect(screen.queryByTestId('undo-check-in')).toBeNull();
  });

  it('ignores a move up at the top of the list', async () => {
    await seedSimpleBoard('alpha');
    await seedSimpleBoard('beta');
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('board-card-1');

    await press('toggle-edit-boards');
    await press('board-card-0-move-up');
    expect(screen.getByTestId('board-card-0')).toHaveTextContent(/alpha/);
  });

  it('locks the add sheet when the board archived elsewhere', async () => {
    const boardId = await seedSimpleBoard('slipping');
    renderRouter('src/app', { initialUrl: `/boards/${boardId}` });
    await screen.findByTestId('detail-add-check-in');

    const deps = await core();
    const archived = await archiveBoard(deps, { commandId: newCommandId(), boardId });
    expect(archived.ok).toBe(true);

    await press('detail-add-check-in');
    expect(await screen.findByTestId('check-in-archived-board')).toBeOnTheScreen();
  });

  it('recovers from history for a missing board', async () => {
    renderRouter('src/app', {
      initialUrl: '/boards/00000000-0000-4000-8000-00000000dead/check-ins',
    });
    expect(await screen.findByText('This board is not available.')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Back to Boards'));
    await settle();
    expect(screen).toHavePathname('/');
  });

  it('returns home from the invalid-id recovery surface', async () => {
    renderRouter('src/app', { initialUrl: '/boards/not-a-uuid' });
    await screen.findByTestId('recovery-home');
    await press('recovery-home');
    expect(screen).toHavePathname('/');
  });

  it('closes a clean create sheet without a confirmation', async () => {
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('empty-create-board');
    await press('create-board');
    await screen.findByTestId('board-title-input');

    alertSpy.mockClear();
    await press('board-form-cancel');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(screen).toHavePathname('/');
  });
});

describe('stale sheets against removed records', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    alertSpy.mockClear();
  });

  it('surfaces an archive failure on the edit sheet', async () => {
    const boardId = await seedSimpleBoard('contested');
    renderRouter('src/app', { initialUrl: `/boards/${boardId}/edit` });
    await screen.findByTestId('archive-board');

    const deps = await core();
    const archived = await archiveBoard(deps, { commandId: newCommandId(), boardId });
    expect(archived.ok).toBe(true);

    alertSpy.mockImplementationOnce((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Archive')?.onPress?.();
    });
    await press('archive-board');
    await settle();
    expect(await screen.findByTestId('board-form-error')).toBeOnTheScreen();
  });

  it('surfaces a delete failure on the edit sheet for a deleted board', async () => {
    const boardId = await seedSimpleBoard('gone soon');
    renderRouter('src/app', { initialUrl: `/boards/${boardId}/edit` });
    await screen.findByTestId('form-delete-board');

    const deps = await core();
    const removed = await deleteBoard(deps, { commandId: newCommandId(), boardId });
    expect(removed.ok).toBe(true);

    await press('form-delete-board');
    await settle();
    // dependent counts fall back to the generic message for a missing board
    expect(alertSpy).toHaveBeenCalledWith(
      'Delete Board',
      expect.any(String),
      expect.any(Array),
    );
    expect(await screen.findByTestId('board-form-error')).toBeOnTheScreen();
  });

  it('surfaces restore and delete failures on a stale archived detail', async () => {
    const boardId = await seedSimpleBoard('flickering');
    const deps = await core();
    const archived = await archiveBoard(deps, { commandId: newCommandId(), boardId });
    expect(archived.ok).toBe(true);

    renderRouter('src/app', { initialUrl: `/boards/${boardId}` });
    await screen.findByTestId('archived-banner');

    // another writer restores it first, so the visible restore now fails
    const restored = await restoreBoard(deps, { commandId: newCommandId(), boardId });
    expect(restored.ok).toBe(true);

    await press('restore-board');
    expect(await screen.findByTestId('board-action-error')).toBeOnTheScreen();
  });

  it('opens the journal from the detail actions', async () => {
    const boardId = await seedSimpleBoard('curious');
    renderRouter('src/app', { initialUrl: `/boards/${boardId}` });
    await screen.findByTestId('board-actions');

    await press('open-journal');
    expect(await screen.findByTestId('journal-empty')).toBeOnTheScreen();
  });

  it('fails a stale check-in save and delete after the record is removed', async () => {
    const boardId = await seedSimpleBoard('note keeper');
    const deps = await core();
    const created = await createCheckIn(deps, {
      commandId: newCommandId(),
      boardId,
      source: 'app',
    });
    if (!created.ok) {
      throw new Error('seed check-in failed');
    }

    renderRouter('src/app', {
      initialUrl: `/boards/${boardId}/check-ins/${created.value.checkInId}`,
    });
    await screen.findByTestId('check-in-note');

    const removed = await removeCheckIn(deps, {
      commandId: newCommandId(),
      checkInId: created.value.checkInId,
    });
    expect(removed.ok).toBe(true);

    await press('check-in-save');
    expect(await screen.findByTestId('check-in-error')).toBeOnTheScreen();

    await press('delete-check-in');
    await settle();
    expect(screen.getByTestId('check-in-error')).toBeOnTheScreen();
  });
});

describe('history and check-in edge states', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    alertSpy.mockClear();
  });

  it('groups plain check-ins under one month header across days', async () => {
    const boardId = await seedSimpleBoard('bare rows');
    const deps = await core();
    for (const day of ['2025-12-31', '2026-08-29', '2026-08-30']) {
      const created = await createCheckIn(deps, {
        commandId: newCommandId(),
        boardId,
        logicalDate: day as LogicalDate,
        source: 'app',
      });
      expect(created.ok).toBe(true);
    }

    renderRouter('src/app', { initialUrl: `/boards/${boardId}/check-ins` });
    // one month header, two day sections, rows without time/amount/note detail
    expect(await screen.findByText('August')).toBeOnTheScreen();
    expect(screen.getAllByText('August')).toHaveLength(1);
    expect(screen.getByText('Aug 29')).toBeOnTheScreen();
    expect(screen.getByText('Aug 30')).toBeOnTheScreen();
    // a month outside the current year keeps its year in the header
    expect(screen.getByText('December 2025')).toBeOnTheScreen();
    expect(screen.getAllByLabelText('bare rows')).toHaveLength(3);
  });

  it('labels consistency bands from the completion rate', async () => {
    // low band: one completion across eleven eligible days
    const deps = await core();
    mockClock.utcMs = Date.UTC(2026, 7, 20, 16, 0);
    const low = await createBoard(deps, {
      commandId: newCommandId(),
      title: 'low band',
      symbol: 'drop.fill',
      accentHex: '#8F82FF',
      usesTintedBackground: false,
      tracksAmount: false,
      amountUnit: null,
      quickAmount: 1,
      tracksTime: false,
      startOfDayMinute: 0,
      metricsEnabled: true,
    });
    const high = await createBoard(deps, {
      commandId: newCommandId(),
      title: 'high band',
      symbol: 'drop.fill',
      accentHex: '#E58BA6',
      usesTintedBackground: false,
      tracksAmount: false,
      amountUnit: null,
      quickAmount: 1,
      tracksTime: false,
      startOfDayMinute: 0,
      metricsEnabled: true,
    });
    if (!low.ok || !high.ok) {
      throw new Error('seed boards failed');
    }
    mockClock.utcMs = Date.UTC(2026, 7, 30, 16, 0);
    const lowDays = ['2026-08-21'];
    const highDays = [
      '2026-08-20',
      '2026-08-21',
      '2026-08-22',
      '2026-08-23',
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
      '2026-08-28',
      '2026-08-29',
    ];
    for (const day of lowDays) {
      const created = await createCheckIn(deps, {
        commandId: newCommandId(),
        boardId: low.value.boardId,
        logicalDate: day as LogicalDate,
        source: 'app',
      });
      expect(created.ok).toBe(true);
    }
    for (const day of highDays) {
      const created = await createCheckIn(deps, {
        commandId: newCommandId(),
        boardId: high.value.boardId,
        logicalDate: day as LogicalDate,
        source: 'app',
      });
      expect(created.ok).toBe(true);
    }

    renderRouter('src/app', { initialUrl: `/boards/${low.value.boardId}` });
    await screen.findByTestId('metrics-cards');
    expect(screen.getByText('Low')).toBeOnTheScreen();

    act(() => {
      router.replace(`/boards/${high.value.boardId}`);
    });
    await settle();
    await screen.findByText('High');
  });

  it('hides the add controls for an archived board history', async () => {
    const boardId = await seedSimpleBoard('quiet habit');
    const deps = await core();
    const archived = await archiveBoard(deps, { commandId: newCommandId(), boardId });
    expect(archived.ok).toBe(true);

    renderRouter('src/app', { initialUrl: `/boards/${boardId}/check-ins` });
    expect(await screen.findByTestId('history-empty')).toBeOnTheScreen();
    expect(screen.queryByTestId('add-check-in')).toBeNull();
    expect(screen.queryByText('Add Check-In')).toBeNull();
  });

  it('shows the record unavailable state for a missing check-in id', async () => {
    const boardId = await seedSimpleBoard('present habit');
    renderRouter('src/app', {
      initialUrl: `/boards/${boardId}/check-ins/00000000-0000-4000-8000-00000000beef`,
    });
    expect(await screen.findByText('This record is not available.')).toBeOnTheScreen();
  });

  it('adjusts the start of day through accessibility actions', async () => {
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('empty-create-board');
    await press('create-board');
    await screen.findByTestId('board-title-input');
    await press('open-options');
    const stepper = await screen.findByLabelText('Start of day shift');

    fireEvent(stepper, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    await settle();
    expect(screen.getByTestId('start-of-day-value')).toHaveTextContent(/12:30 AM/);
    fireEvent(stepper, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    await settle();
    expect(screen.getByTestId('start-of-day-value')).toHaveTextContent(/12:00 AM/);

    // step to the 12:00 PM ceiling to cover the noon formatting path
    for (let index = 0; index < 24; index += 1) {
      fireEvent(stepper, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    }
    await settle();
    expect(screen.getByTestId('start-of-day-value')).toHaveTextContent(/12:00 PM/);
  });
});
