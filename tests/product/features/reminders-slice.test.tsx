import { Alert } from 'react-native';

import type { BoardId } from '@/core/domain/ids';
import { createReminder, updateReminder } from '@/core/domain/reminder-commands';
import { listBoardReminders } from '@/core/domain/queries';

import {
  notificationsPlatformMock,
  reminderScheduler,
} from '../../../src/testing/notifications-platform.mock';
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

const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

async function press(testId: string): Promise<void> {
  fireEvent.press(screen.getByTestId(testId));
  await settle();
}

async function seedBoard(title = 'reminder board'): Promise<BoardId> {
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

async function seedReminder(boardId: BoardId, overrides: Record<string, unknown> = {}) {
  const opened = await getProductCore();
  if (!opened.ok) {
    throw new Error('core failed');
  }
  const created = await createReminder(
    { ...opened.value, scheduler: reminderScheduler },
    {
      commandId: newCommandId(),
      boardId,
      weekdaysMask: 0b0000101,
      minuteOfDay: 540,
      enabled: true,
      ...overrides,
    },
  );
  if (!created.ok) {
    throw new Error(created.error.message);
  }
  return created.value.reminderId;
}

describe('reminders vertical slice', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    notificationsPlatformMock.reset();
    alertSpy.mockClear();
  });

  it('creates a reminder from the editor sheet with selected weekdays', async () => {
    const boardId = await seedBoard();
    renderRouter('src/app', { initialUrl: `/boards/${boardId}/edit` });
    await screen.findByTestId('add-reminder-row');
    await press('add-reminder-row');
    await screen.findByTestId('reminder-save');
    // default is every day; deselect tuesday through sunday, keep monday
    for (const iso of [2, 3, 4, 5, 6, 7]) {
      await press(`weekday-${iso}`);
    }
    fireEvent.changeText(screen.getByTestId('reminder-message'), 'morning pages time');
    await press('reminder-save');

    const opened = await getProductCore();
    if (!opened.ok) {
      throw new Error('core failed');
    }
    const listed = await listBoardReminders(opened.value, boardId);
    if (!listed.ok) {
      throw new Error('list failed');
    }
    expect(listed.value).toHaveLength(1);
    expect(listed.value[0].weekdaysMask).toBe(0b0000001);
    expect(listed.value[0].minuteOfDay).toBe(9 * 60);
    expect(listed.value[0].message).toBe('morning pages time');
    expect(listed.value[0].scheduleState).toBe('scheduled');
    expect(notificationsPlatformMock.pending.size).toBe(1);
  });

  it('requires at least one weekday before saving', async () => {
    const boardId = await seedBoard();
    renderRouter('src/app', { initialUrl: `/boards/${boardId}/reminders/new` });
    await screen.findByTestId('reminder-save');
    for (const iso of [1, 2, 3, 4, 5, 6, 7]) {
      await press(`weekday-${iso}`);
    }
    await press('reminder-save');
    expect(screen.getByTestId('reminder-error')).toHaveTextContent('Pick at least one weekday.');
    const opened = await getProductCore();
    if (!opened.ok) {
      throw new Error('core failed');
    }
    const listed = await listBoardReminders(opened.value, boardId);
    expect(listed.ok && listed.value).toHaveLength(0);
  });

  it('preserves a denied reminder disabled and explains the settings path', async () => {
    const boardId = await seedBoard();
    notificationsPlatformMock.auth = 'undetermined';
    notificationsPlatformMock.promptResult = 'denied';
    renderRouter('src/app', { initialUrl: `/boards/${boardId}/edit` });
    await screen.findByTestId('add-reminder-row');
    await press('add-reminder-row');
    await screen.findByTestId('reminder-save');
    await press('reminder-save');
    expect(alertSpy).toHaveBeenCalledWith(
      'Notifications are off',
      expect.stringContaining('Allow notifications in Settings'),
    );
    const opened = await getProductCore();
    if (!opened.ok) {
      throw new Error('core failed');
    }
    const listed = await listBoardReminders(opened.value, boardId);
    expect(listed.ok && listed.value[0].enabled).toBe(false);
    expect(listed.ok && listed.value[0].scheduleState).toBe('denied');
  });

  it('edits and deletes a reminder through its sheet', async () => {
    const boardId = await seedBoard();
    const reminderId = await seedReminder(boardId);
    renderRouter('src/app', { initialUrl: `/boards/${boardId}/edit` });
    await screen.findByTestId(`reminder-row-${reminderId}`);
    await press(`reminder-row-${reminderId}`);
    await screen.findByTestId('reminder-save');
    fireEvent(screen.getByTestId('reminder-time'), 'valueChange', null, new Date(2000, 0, 1, 20, 15));
    await press('reminder-save');

    const opened = await getProductCore();
    if (!opened.ok) {
      throw new Error('core failed');
    }
    let listed = await listBoardReminders(opened.value, boardId);
    if (!listed.ok) {
      throw new Error('list failed');
    }
    expect(listed.value[0].minuteOfDay).toBe(20 * 60 + 15);

    // the save landed back on the edit sheet in the same tree; reopen the
    // editor from there to exercise the delete path
    await screen.findByTestId(`reminder-row-${reminderId}`);
    await press(`reminder-row-${reminderId}`);
    await screen.findByTestId('delete-reminder');
    alertSpy.mockImplementationOnce((_title, _message, buttons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });
    await press('delete-reminder');
    listed = await listBoardReminders(opened.value, boardId);
    expect(listed.ok && listed.value).toHaveLength(0);
    expect(notificationsPlatformMock.pending.size).toBe(0);
  });

  it('lists reminders on the edit board sheet and toggles them', async () => {
    const boardId = await seedBoard();
    const reminderId = await seedReminder(boardId);
    renderRouter('src/app', { initialUrl: `/boards/${boardId}/edit` });
    await screen.findByTestId(`reminder-row-${reminderId}`);
    expect(notificationsPlatformMock.pending.size).toBe(2);
    fireEvent(screen.getByTestId(`reminder-toggle-${reminderId}`), 'valueChange', false);
    await settle();
    expect(notificationsPlatformMock.pending.size).toBe(0);
    const opened = await getProductCore();
    if (!opened.ok) {
      throw new Error('core failed');
    }
    const listed = await listBoardReminders(opened.value, boardId);
    expect(listed.ok && listed.value[0].enabled).toBe(false);
  });

  it('drafts reminders on a new board and commits them with the save', async () => {
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('create-board');
    await press('create-board');
    await screen.findByTestId('add-reminder-row');
    fireEvent.changeText(screen.getByLabelText('Board name'), 'board with reminder');
    await press('add-reminder-row');
    await screen.findByTestId('reminder-save');
    // deselect everything except friday
    for (const iso of [1, 2, 3, 4, 6, 7]) {
      await press(`weekday-${iso}`);
    }
    await press('reminder-save');
    // back on the create sheet, the draft row shows
    await screen.findByTestId('draft-reminder-0');
    await press('board-form-save');
    await settle();

    const opened = await getProductCore();
    if (!opened.ok) {
      throw new Error('core failed');
    }
    const { listActiveBoards } = jest.requireActual<typeof import('@/core/domain/queries')>(
      '@/core/domain/queries',
    );
    const boards = await listActiveBoards(opened.value);
    if (!boards.ok) {
      throw new Error('boards failed');
    }
    const board = boards.value.find((entry) => entry.title === 'board with reminder');
    expect(board).toBeDefined();
    const listed = await listBoardReminders(opened.value, board!.id);
    if (!listed.ok) {
      throw new Error('list failed');
    }
    expect(listed.value).toHaveLength(1);
    expect(listed.value[0].weekdaysMask).toBe(0b0010000);
    expect(listed.value[0].scheduleState).toBe('scheduled');
    expect(notificationsPlatformMock.pending.size).toBe(1);
  });

  it('deep-links a notification tap to the add check-in sheet', async () => {
    const boardId = await seedBoard('tapped board');
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByText('tapped board');
    notificationsPlatformMock.emitTap(boardId);
    await settle();
    expect(await screen.findByText('Add Check-in')).toBeOnTheScreen();
  });

  it('shows enabled counts and schedule errors in notification settings', async () => {
    const boardId = await seedBoard('counted board');
    await seedReminder(boardId, { weekdaysMask: 0b0000001 });
    notificationsPlatformMock.capacity = 0;
    await seedReminder(boardId, { weekdaysMask: 0b0000011, minuteOfDay: 700 });
    renderRouter('src/app', { initialUrl: '/settings/notifications' });
    await screen.findByTestId('notifications-reminder-count');
    await settle();
    expect(screen.getByTestId('notifications-reminder-count')).toHaveTextContent(/2$/);
    expect(screen.getByTestId('notifications-schedule-errors')).toHaveTextContent(
      /counted board: Too many scheduled notifications/,
    );
  });
});

describe('reminder editor guards and states', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    notificationsPlatformMock.reset();
    alertSpy.mockClear();
  });

  it('confirms before discarding unsaved edits from cancel', async () => {
    const boardId = await seedBoard();
    renderRouter('src/app', { initialUrl: `/boards/${boardId}/edit` });
    await screen.findByTestId('add-reminder-row');
    await press('add-reminder-row');
    await screen.findByTestId('reminder-cancel');
    fireEvent.changeText(screen.getByTestId('reminder-message'), 'unsaved edit');
    // keep editing first
    alertSpy.mockImplementationOnce((_title, _message, buttons) => {
      buttons?.find((button) => button.style === 'cancel')?.onPress?.();
    });
    await press('reminder-cancel');
    expect(alertSpy).toHaveBeenCalledWith(
      'Discard changes?',
      expect.stringContaining('not saved'),
      expect.anything(),
    );
    expect(screen.getByTestId('reminder-message')).toBeOnTheScreen();
    // then discard
    alertSpy.mockImplementationOnce((_title, _message, buttons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });
    await press('reminder-cancel');
    const opened = await getProductCore();
    if (!opened.ok) {
      throw new Error('core failed');
    }
    const listed = await listBoardReminders(opened.value, boardId);
    expect(listed.ok && listed.value).toHaveLength(0);
  });

  it('cancels without confirmation when nothing changed', async () => {
    const boardId = await seedBoard();
    renderRouter('src/app', { initialUrl: `/boards/${boardId}/edit` });
    await screen.findByTestId('add-reminder-row');
    await press('add-reminder-row');
    await screen.findByTestId('reminder-cancel');
    await press('reminder-cancel');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(await screen.findByTestId('add-reminder-row')).toBeOnTheScreen();
  });

  it('edits and removes a drafted reminder before the board exists', async () => {
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('create-board');
    await press('create-board');
    await screen.findByTestId('add-reminder-row');
    await press('add-reminder-row');
    await screen.findByTestId('reminder-save');
    await press('reminder-save');
    await screen.findByTestId('draft-reminder-0');

    // edit the drafted entry: keep only sunday
    await press('draft-reminder-0');
    await screen.findByTestId('reminder-save');
    for (const iso of [1, 2, 3, 4, 5, 6]) {
      await press(`weekday-${iso}`);
    }
    await press('reminder-save');
    await screen.findByTestId('draft-reminder-0');

    // delete the drafted entry from its editor
    await press('draft-reminder-0');
    await screen.findByTestId('delete-reminder');
    alertSpy.mockImplementationOnce((_title, _message, buttons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });
    await press('delete-reminder');
    expect(screen.queryByTestId('draft-reminder-0')).toBeNull();
  });

  it('renders explicit states for broken reminder links', async () => {
    renderRouter('src/app', { initialUrl: '/boards/draft/reminders/new' });
    expect(
      await screen.findByText('This reminder is not available.'),
    ).toBeOnTheScreen();
  });

  it('rejects malformed reminder links', async () => {
    renderRouter('src/app', { initialUrl: '/boards/bad/reminders/also-bad' });
    expect(await screen.findByText('This reminder link is not valid.')).toBeOnTheScreen();
  });

  it('rejects a non-numeric draft index', async () => {
    renderRouter('src/app', { initialUrl: '/boards/draft/reminders/new?index=nope' });
    expect(await screen.findByText('This reminder link is not valid.')).toBeOnTheScreen();
  });

  it('surfaces an edit conflict from a concurrent change', async () => {
    const boardId = await seedBoard();
    const reminderId = await seedReminder(boardId);
    renderRouter('src/app', { initialUrl: `/boards/${boardId}/edit` });
    await screen.findByTestId(`reminder-row-${reminderId}`);
    await press(`reminder-row-${reminderId}`);
    await screen.findByTestId('reminder-save');
    // another writer updates the record behind the open sheet
    const opened = await getProductCore();
    if (!opened.ok) {
      throw new Error('core failed');
    }
    const current = await listBoardReminders(opened.value, boardId);
    if (!current.ok) {
      throw new Error('list failed');
    }
    const conflictUpdate = await updateReminder(
      { ...opened.value, scheduler: reminderScheduler },
      {
        commandId: newCommandId(),
        reminderId,
        expectedMutationStamp: current.value[0].mutationStamp,
        weekdaysMask: 0b1111111,
        minuteOfDay: 60,
      },
    );
    if (!conflictUpdate.ok) {
      throw new Error(conflictUpdate.error.message);
    }
    await press('reminder-save');
    expect(await screen.findByTestId('reminder-conflict')).toHaveTextContent(/changed elsewhere/);
    // the reseeded sheet shows the latest values and carries the fresh
    // stamp; re-applying an edit now saves cleanly
    fireEvent(
      screen.getByTestId('reminder-time'),
      'valueChange',
      null,
      new Date(2000, 0, 1, 8, 0),
    );
    await press('reminder-save');
    const after = await listBoardReminders(opened.value, boardId);
    expect(after.ok && after.value[0].minuteOfDay).toBe(480);
  });
});

describe('notification settings states', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    notificationsPlatformMock.reset();
    alertSpy.mockClear();
  });

  it('shows the settings path when permission is denied', async () => {
    const { notificationsMock } = jest.requireActual<{
      notificationsMock: { granted: boolean; canAskAgain: boolean; reject: boolean };
    }>('../../../src/testing/expo-notifications.mock');
    notificationsMock.granted = false;
    notificationsMock.canAskAgain = false;
    renderRouter('src/app', { initialUrl: '/settings/notifications' });
    await screen.findByTestId('notifications-status');
    await settle();
    expect(screen.getByTestId('notifications-status')).toHaveTextContent(/Denied/);
    expect(screen.getByTestId('notifications-open-settings')).toBeOnTheScreen();
    notificationsMock.granted = false;
    notificationsMock.canAskAgain = true;
  });

  it('labels schedule failures and unknown codes', async () => {
    const boardId = await seedBoard('failing board');
    // keep failing so the mount-time reconciler cannot heal the state
    notificationsPlatformMock.failNextSchedules = 99;
    await seedReminder(boardId, { weekdaysMask: 0b0000001 });
    renderRouter('src/app', { initialUrl: '/settings/notifications' });
    await screen.findByTestId('notifications-schedule-errors');
    expect(screen.getByTestId('notifications-schedule-errors')).toHaveTextContent(
      /failing board: The system rejected the schedule/,
    );
  });

  it('alerts when enabling a reminder while notifications are off', async () => {
    const boardId = await seedBoard();
    const reminderId = await seedReminder(boardId, { enabled: false });
    notificationsPlatformMock.auth = 'denied';
    renderRouter('src/app', { initialUrl: `/boards/${boardId}/edit` });
    await screen.findByTestId(`reminder-toggle-${reminderId}`);
    fireEvent(screen.getByTestId(`reminder-toggle-${reminderId}`), 'valueChange', true);
    await settle();
    expect(alertSpy).toHaveBeenCalledWith(
      'Notifications are off',
      expect.stringContaining('Allow notifications in Settings'),
    );
  });
});
