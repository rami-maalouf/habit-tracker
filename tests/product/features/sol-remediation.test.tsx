import { router } from 'expo-router';
import { Alert } from 'react-native';
import { act } from '@testing-library/react-native';

import { archiveBoard, createBoard, createCheckIn } from '@/core/domain/commands';
import type { BoardId, LogicalDate } from '@/core/domain/ids';
import { getGroupedCheckInHistory, getWidgetProjection, listActiveBoards } from '@/core/domain/queries';

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

describe('draft session ownership', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    alertSpy.mockClear();
  });

  it('rejects direct navigation to an options route with no live draft', async () => {
    const boardId = await seedBoard('quiet');
    renderRouter('src/app', { initialUrl: `/boards/${boardId}/options` });
    expect(await screen.findByTestId('options-no-draft')).toBeOnTheScreen();
  });

  it('saves an edit against the route board even after another draft existed', async () => {
    const boardId = await seedBoard('first board');
    await seedBoard('second board');
    renderRouter('src/app', { initialUrl: `/boards/${boardId}` });
    await screen.findByTestId('edit-board');
    await press('edit-board');
    await screen.findByTestId('board-title-input');

    fireEvent.changeText(screen.getByTestId('board-title-input'), 'first renamed');
    await press('board-form-save');
    await settle();

    const deps = await core();
    const boards = await listActiveBoards(deps);
    if (!boards.ok) {
      throw new Error('listing boards failed');
    }
    const titles = boards.value.map((board) => board.title).sort();
    expect(titles).toEqual(['first renamed', 'second board']);
  });
});

describe('check-in time recombination', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    alertSpy.mockClear();
  });

  it('stores a historical timed check-in at noon of the chosen date by default', async () => {
    const boardId = await seedBoard('timed habit', { tracksTime: true });
    renderRouter('src/app', { initialUrl: `/boards/${boardId}/check-ins` });
    fireEvent.press(await screen.findByText('Add Check-In'));
    await settle();
    const date = await screen.findByTestId('check-in-date');

    // move the date back two days without touching the time
    fireEvent(
      date,
      'valueChange',
      { nativeEvent: { timestamp: 0, utcOffset: 0 } },
      new Date(2026, 7, 28, 9, 0),
    );
    await press('check-in-save');
    await settle();

    const deps = await core();
    const history = await getGroupedCheckInHistory(deps, boardId);
    if (!history.ok) {
      throw new Error('history query failed');
    }
    const record = history.value[0].days[0].checkIns[0];
    expect(record.logicalDate).toBe('2026-08-28');
    expect(record.occurredAtUtc).not.toBeNull();
    // the stored instant is noon on the 28th in the device zone, never
    // an instant from today
    const stored = new Date(record.occurredAtUtc as number);
    expect(stored.getFullYear()).toBe(2026);
    expect(stored.getMonth()).toBe(7);
    expect(stored.getDate()).toBe(28);
    expect(stored.getHours()).toBe(12);
    expect(stored.getMinutes()).toBe(0);
  });

  it('recombines a picked time with the picked date', async () => {
    const boardId = await seedBoard('timed habit', { tracksTime: true });
    renderRouter('src/app', { initialUrl: `/boards/${boardId}/check-ins` });
    fireEvent.press(await screen.findByText('Add Check-In'));
    await settle();
    const date = await screen.findByTestId('check-in-date');
    const pickerEvent = { nativeEvent: { timestamp: 0, utcOffset: 0 } };

    fireEvent(date, 'valueChange', pickerEvent, new Date(2026, 7, 27, 9, 0));
    fireEvent(
      screen.getByTestId('check-in-time'),
      'valueChange',
      pickerEvent,
      new Date(2026, 7, 30, 18, 45),
    );
    await press('check-in-save');
    await settle();

    const deps = await core();
    const history = await getGroupedCheckInHistory(deps, boardId);
    if (!history.ok) {
      throw new Error('history query failed');
    }
    const record = history.value[0].days[0].checkIns[0];
    expect(record.logicalDate).toBe('2026-08-27');
    const stored = new Date(record.occurredAtUtc as number);
    expect(stored.getDate()).toBe(27);
    expect(stored.getHours()).toBe(18);
    expect(stored.getMinutes()).toBe(45);

    // reopening the record seeds the picker from the stored instant and a
    // clean save keeps the same wall-clock time
    fireEvent.press(screen.getByLabelText(/timed habit/));
    await settle();
    await screen.findByTestId('delete-check-in');
    await press('check-in-save');
    await settle();
    const reread = await getGroupedCheckInHistory(deps, boardId);
    if (!reread.ok) {
      throw new Error('history query failed');
    }
    const saved = new Date(reread.value[0].days[0].checkIns[0].occurredAtUtc as number);
    expect(saved.getDate()).toBe(27);
    expect(saved.getHours()).toBe(18);
    expect(saved.getMinutes()).toBe(45);
  });

  it('refuses a check-in url whose record belongs to another board', async () => {
    const boardA = await seedBoard('board a');
    const boardB = await seedBoard('board b');
    const deps = await core();
    const created = await createCheckIn(deps, {
      commandId: newCommandId(),
      boardId: boardB,
      source: 'app',
    });
    if (!created.ok) {
      throw new Error('seed check-in failed');
    }

    renderRouter('src/app', {
      initialUrl: `/boards/${boardA}/check-ins/${created.value.checkInId}`,
    });
    expect(await screen.findByText('This record is not available.')).toBeOnTheScreen();
  });
});

describe('quick check-in domain effects', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    alertSpy.mockClear();
  });

  it('writes the check-in, projection, and outbox, and undo erases them', async () => {
    const boardId = await seedBoard('verified habit');
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('board-card-0');

    await press('board-card-0-quick');
    await settle();

    const deps = await core();
    const afterCheckIn = await getGroupedCheckInHistory(deps, boardId);
    if (!afterCheckIn.ok) {
      throw new Error('history query failed');
    }
    expect(afterCheckIn.value).toHaveLength(1);
    expect(afterCheckIn.value[0].count).toBe(1);

    const projection = await getWidgetProjection(deps);
    if (!projection.ok) {
      throw new Error('projection query failed');
    }
    const row = projection.value.find((entry) => entry.boardId === boardId);
    expect(row).toBeDefined();
    // the strip's last slot is today; the quick check-in lands there
    expect(row?.strip.at(-1)).toBeGreaterThanOrEqual(1);

    const outbox = await deps.db.getAllAsync<{ entity_type: string }>(
      'SELECT entity_type FROM mutation_outbox',
    );
    expect(outbox.length).toBeGreaterThanOrEqual(2);

    await press('undo-check-in');
    await settle();
    const afterUndo = await getGroupedCheckInHistory(deps, boardId);
    if (!afterUndo.ok) {
      throw new Error('history query failed');
    }
    expect(afterUndo.value).toHaveLength(0);
  });
});

describe('archived boards through settings', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    alertSpy.mockClear();
  });

  it('lists archived boards in settings and restores through detail', async () => {
    const boardId = await seedBoard('shelved habit');
    const deps = await core();
    const archived = await archiveBoard(deps, { commandId: newCommandId(), boardId });
    expect(archived.ok).toBe(true);

    renderRouter('src/app', { initialUrl: '/settings' });
    await screen.findByTestId('open-archived-boards');
    await press('open-archived-boards');
    await screen.findByTestId(`archived-board-${boardId}`);
    await press(`archived-board-${boardId}`);
    await settle();

    expect(await screen.findByTestId('archived-banner')).toBeOnTheScreen();
    await press('restore-board');
    expect(screen.queryByTestId('archived-banner')).toBeNull();
  });

  it('shows the empty archived state when nothing is archived', async () => {
    renderRouter('src/app', { initialUrl: '/settings/archived' });
    expect(await screen.findByTestId('archived-empty')).toBeOnTheScreen();
  });

  it('renders archived history rows as read-only records', async () => {
    const boardId = await seedBoard('closed book');
    const deps = await core();
    const created = await createCheckIn(deps, {
      commandId: newCommandId(),
      boardId,
      logicalDate: '2026-08-29' as LogicalDate,
      source: 'app',
    });
    expect(created.ok).toBe(true);
    const archived = await archiveBoard(deps, { commandId: newCommandId(), boardId });
    expect(archived.ok).toBe(true);

    renderRouter('src/app', { initialUrl: `/boards/${boardId}/check-ins` });
    await screen.findByText('Aug 29');
    const row = screen.getByLabelText('closed book');
    expect(row.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(row);
    await settle();
    // the row does not open the editable form
    expect(screen.queryByTestId('check-in-note')).toBeNull();
  });
});

describe('heatmap intensity markers', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    alertSpy.mockClear();
  });

  it('marks multi check-in days with a non-color signal', async () => {
    const boardId = await seedBoard('busy habit');
    const deps = await core();
    for (let index = 0; index < 3; index += 1) {
      const created = await createCheckIn(deps, {
        commandId: newCommandId(),
        boardId,
        logicalDate: '2026-08-30' as LogicalDate,
        source: 'app',
      });
      expect(created.ok).toBe(true);
    }

    renderRouter('src/app', { initialUrl: `/boards/${boardId}` });
    await screen.findByTestId('board-heatmap');
    expect(screen.getByTestId('heatmap-marker-2026-08-30')).toBeOnTheScreen();
  });
});

describe('undo failure surfacing', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    alertSpy.mockClear();
  });

  it('surfaces an undo failure on the shared error line', async () => {
    const boardId = await seedBoard('slippery');
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('board-card-0');
    await press('board-card-0-quick');
    expect(screen.getByTestId('undo-check-in')).toBeOnTheScreen();

    // the board archives elsewhere, so the undo command is rejected
    const deps = await core();
    const archived = await archiveBoard(deps, { commandId: newCommandId(), boardId });
    expect(archived.ok).toBe(true);

    await press('undo-check-in');
    expect(await screen.findByTestId('quick-error')).toBeOnTheScreen();
  });
});

describe('round two: session isolation and read-only surfaces', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    alertSpy.mockClear();
  });

  it('rejects another board\'s options while a create draft is live', async () => {
    const otherBoard = await seedBoard('other board');
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('board-card-0');
    await press('create-board');
    await screen.findByTestId('board-title-input');

    // the create sheet owns the live session (boardId null); board B's
    // options route must not read it
    act(() => {
      router.push(`/boards/${otherBoard}/options`);
    });
    await settle();
    expect(await screen.findByTestId('options-no-draft')).toBeOnTheScreen();
  });

  it('scopes endDraft to the owner that started the session', () => {
    const store = jest.requireActual<
      typeof import('../../../src/features/board-configuration/draft-store')
    >('../../../src/features/board-configuration/draft-store');
    store.startDraft(store.newBoardDraft(), 'owner-a');
    store.startDraft(store.newBoardDraft(), 'owner-b');
    store.endDraft('owner-a');
    expect(store.getDraftState().active).toBe(true);
    expect(store.getDraftState().owner).toBe('owner-b');
    store.endDraft('owner-b');
    expect(store.getDraftState().active).toBe(false);
  });

  it('keeps the picked occurrence through the repeated dst hour', async () => {
    // november 1 2026 repeats 1:30 am in us zones; the board lives across
    // the transition and the clock sits the day after
    mockClock.utcMs = Date.UTC(2026, 9, 25, 16, 0);
    const boardId = await seedBoard('exact habit', { tracksTime: true });
    mockClock.utcMs = Date.UTC(2026, 10, 2, 16, 0);

    renderRouter('src/app', { initialUrl: `/boards/${boardId}/check-ins` });
    fireEvent.press(await screen.findByText('Add Check-In'));
    await settle();
    const pickerEvent = { nativeEvent: { timestamp: 0, utcOffset: 0 } };
    fireEvent(
      await screen.findByTestId('check-in-date'),
      'valueChange',
      pickerEvent,
      new Date(2026, 10, 1, 12, 0),
    );

    // the second occurrence of the repeated wall clock: one hour after the
    // instant date construction picks, same local calendar date
    const firstOccurrence = new Date(2026, 10, 1, 1, 30);
    const picked = new Date(firstOccurrence.getTime() + 3_600_000);
    fireEvent(screen.getByTestId('check-in-time'), 'valueChange', pickerEvent, picked);
    await press('check-in-save');
    await settle();

    const deps = await core();
    const history = await getGroupedCheckInHistory(deps, boardId);
    if (!history.ok) {
      throw new Error('history query failed');
    }
    const stored = history.value[0].days[0].checkIns[0].occurredAtUtc;
    // the picker's exact instant is stored verbatim, not the recombined
    // first occurrence of the ambiguous wall clock
    expect(stored).toBe(picked.getTime());
    if (picked.getHours() === firstOccurrence.getHours()) {
      // host zone observes the fall-back: the two occurrences share a wall
      // clock and only the exact instant distinguishes them
      expect(stored).not.toBe(firstOccurrence.getTime());
    }
  });

  it('locks archived boards out of the edit and check-in forms', async () => {
    const boardId = await seedBoard('sealed habit');
    const deps = await core();
    const archived = await archiveBoard(deps, { commandId: newCommandId(), boardId });
    expect(archived.ok).toBe(true);

    renderRouter('src/app', { initialUrl: `/boards/${boardId}/edit` });
    expect(await screen.findByTestId('edit-archived-board')).toBeOnTheScreen();

    // the locked edit sheet never seeded a draft, so the board's options
    // route has no session to expose
    act(() => {
      router.push(`/boards/${boardId}/options`);
    });
    await settle();
    expect(await screen.findByTestId('options-no-draft')).toBeOnTheScreen();

    act(() => {
      router.replace(`/boards/${boardId}/check-ins/new`);
    });
    await settle();
    expect(await screen.findByTestId('check-in-archived-board')).toBeOnTheScreen();
  });
});

describe('self-review fixes', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    alertSpy.mockClear();
  });

  it('retains saved amount configuration when amounts are toggled off in an edit', async () => {
    const boardId = await seedBoard('units kept', {
      tracksAmount: true,
      amountUnit: 'km',
      quickAmount: 5,
    });
    renderRouter('src/app', { initialUrl: `/boards/${boardId}` });
    await screen.findByTestId('edit-board');
    await press('edit-board');
    await screen.findByTestId('board-title-input');
    fireEvent(screen.getByTestId('amounts-toggle'), 'valueChange', false);
    await settle();
    await press('board-form-save');
    await settle();

    const deps = await core();
    const boards = await listActiveBoards(deps);
    if (!boards.ok) {
      throw new Error('listing boards failed');
    }
    const saved = boards.value[0];
    expect(saved.tracksAmount).toBe(false);
    // the configuration survives the toggle for a later re-enable
    expect(saved.amountUnit).toBe('km');
    expect(saved.quickAmount).toBe(5);
  });

  it('saves a board with amounts off despite stale hidden amount text', async () => {
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('empty-create-board');
    await press('empty-create-board');
    await screen.findByTestId('board-title-input');
    fireEvent.changeText(screen.getByTestId('board-title-input'), 'toggled');

    // enter garbage while amounts are on, then turn amounts off
    fireEvent(screen.getByTestId('amounts-toggle'), 'valueChange', true);
    await settle();
    fireEvent.changeText(await screen.findByTestId('quick-amount-input'), 'not a number');
    fireEvent(screen.getByTestId('amounts-toggle'), 'valueChange', false);
    await settle();

    await press('board-form-save');
    await settle();
    expect(screen).toHavePathname('/');
    expect(screen.getByText('toggled')).toBeOnTheScreen();
  });

  it('recovers a check-in edit conflict by reloading the record', async () => {
    const boardId = await seedBoard('conflict habit');
    const deps = await core();
    const created = await createCheckIn(deps, {
      commandId: newCommandId(),
      boardId,
      logicalDate: '2026-08-29' as LogicalDate,
      note: 'original',
      source: 'app',
    });
    if (!created.ok) {
      throw new Error('seed check-in failed');
    }

    renderRouter('src/app', { initialUrl: `/boards/${boardId}/check-ins` });
    fireEvent.press(await screen.findByLabelText(/conflict habit/));
    await settle();
    await screen.findByTestId('check-in-note');

    // another writer updates the record behind the open sheet
    const { updateCheckIn } = jest.requireActual<typeof import('@/core/domain/commands')>(
      '@/core/domain/commands',
    );
    const history = await getGroupedCheckInHistory(deps, boardId);
    if (!history.ok) {
      throw new Error('history query failed');
    }
    const current = history.value[0].days[0].checkIns[0];
    const concurrent = await updateCheckIn(deps, {
      commandId: newCommandId(),
      checkInId: current.id,
      expectedMutationStamp: current.mutationStamp,
      logicalDate: current.logicalDate,
      note: 'changed elsewhere',
    });
    expect(concurrent.ok).toBe(true);

    fireEvent.changeText(screen.getByTestId('check-in-note'), 'my edit');
    await press('check-in-save');
    expect(await screen.findByTestId('check-in-conflict')).toBeOnTheScreen();
    await settle();

    // the reloaded sheet carries the fresh stamp; a second save lands
    fireEvent.changeText(await screen.findByTestId('check-in-note'), 'my second edit');
    await press('check-in-save');
    await settle();
    const after = await getGroupedCheckInHistory(deps, boardId);
    if (!after.ok) {
      throw new Error('history query failed');
    }
    expect(after.value[0].days[0].checkIns[0].note).toBe('my second edit');
  });
});

describe('round four: archived transitions and shifted days', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    alertSpy.mockClear();
  });

  it('releases a live edit session when its board archives mid-edit', async () => {
    const boardId = await seedBoard('mid-edit');
    renderRouter('src/app', { initialUrl: `/boards/${boardId}` });
    await screen.findByTestId('edit-board');
    await press('edit-board');
    await screen.findByTestId('board-title-input');

    // another writer archives the board while the edit sheet is open
    const deps = await core();
    const archived = await archiveBoard(deps, { commandId: newCommandId(), boardId });
    expect(archived.ok).toBe(true);

    // the sheet only learns about it on the next invalidation cycle; a
    // failing save triggers one
    await press('board-form-save');
    await settle();
    await settle();
    expect(await screen.findByTestId('edit-archived-board')).toBeOnTheScreen();

    // with the session released, the board's options expose nothing
    act(() => {
      router.push(`/boards/${boardId}/options`);
    });
    await settle();
    expect(await screen.findByTestId('options-no-draft')).toBeOnTheScreen();
  });

  it('keeps a default-now check-in inside a shifted day window', async () => {
    // run the whole scenario in the host zone so wall-clock construction
    // and logical-date checks agree
    const hostZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    mockClock.zone = hostZone;
    mockClock.utcMs = new Date(2026, 9, 25, 16, 0).getTime();
    const boardId = await seedBoard('night owl', {
      tracksTime: true,
      startOfDayMinute: 60,
    });

    // 00:30 on november 3 sits inside the one-hour shift window, so the
    // logical date is still november 2
    const now = new Date(2026, 10, 3, 0, 30);
    mockClock.utcMs = now.getTime();

    renderRouter('src/app', { initialUrl: `/boards/${boardId}/check-ins` });
    fireEvent.press(await screen.findByText('Add Check-In'));
    await settle();
    await screen.findByTestId('check-in-time');
    await press('check-in-save');
    await settle();

    const deps = await core();
    const history = await getGroupedCheckInHistory(deps, boardId);
    if (!history.ok) {
      throw new Error('history query failed');
    }
    const record = history.value[0].days[0].checkIns[0];
    expect(record.logicalDate).toBe('2026-11-02');
    // the occurrence stays at the real 00:30 instant on november 3; it is
    // never rewritten to 00:30 of the previous calendar day
    expect(record.occurredAtUtc).toBe(now.getTime());
  });

  it('recombines a shift-window time onto the next calendar day', async () => {
    const hostZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    mockClock.zone = hostZone;
    mockClock.utcMs = new Date(2026, 9, 25, 16, 0).getTime();
    const boardId = await seedBoard('late diary', {
      tracksTime: true,
      startOfDayMinute: 60,
    });
    mockClock.utcMs = new Date(2026, 10, 3, 16, 0).getTime();

    renderRouter('src/app', { initialUrl: `/boards/${boardId}/check-ins` });
    fireEvent.press(await screen.findByText('Add Check-In'));
    await settle();
    const pickerEvent = { nativeEvent: { timestamp: 0, utcOffset: 0 } };
    fireEvent(
      await screen.findByTestId('check-in-date'),
      'valueChange',
      pickerEvent,
      new Date(2026, 10, 1, 12, 0),
    );
    // a 00:30 wall clock belongs to logical november 1 only on the next
    // calendar day; the picker's own instant sits on the wrong logical day
    fireEvent(
      screen.getByTestId('check-in-time'),
      'valueChange',
      pickerEvent,
      new Date(2026, 10, 1, 0, 30),
    );
    await press('check-in-save');
    await settle();

    const deps = await core();
    const history = await getGroupedCheckInHistory(deps, boardId);
    if (!history.ok) {
      throw new Error('history query failed');
    }
    const record = history.value[0].days[0].checkIns[0];
    expect(record.logicalDate).toBe('2026-11-01');
    expect(record.occurredAtUtc).toBe(new Date(2026, 10, 2, 0, 30).getTime());
  });
});

describe('round five: dst gaps and zone-stable edits', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    alertSpy.mockClear();
  });

  it('lands on the next valid time when the shift window hits a dst gap', async () => {
    // march 8 2026 02:00-03:00 does not exist in us zones; a three-hour
    // shift makes 02:30 belong to logical march 7 via the next calendar day
    const hostZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    mockClock.zone = hostZone;
    mockClock.utcMs = new Date(2026, 1, 20, 16, 0).getTime();
    const boardId = await seedBoard('gap habit', {
      tracksTime: true,
      startOfDayMinute: 180,
    });
    mockClock.utcMs = new Date(2026, 2, 10, 16, 0).getTime();

    renderRouter('src/app', { initialUrl: `/boards/${boardId}/check-ins` });
    fireEvent.press(await screen.findByText('Add Check-In'));
    await settle();
    const pickerEvent = { nativeEvent: { timestamp: 0, utcOffset: 0 } };
    fireEvent(
      await screen.findByTestId('check-in-date'),
      'valueChange',
      pickerEvent,
      new Date(2026, 2, 7, 12, 0),
    );
    fireEvent(
      screen.getByTestId('check-in-time'),
      'valueChange',
      pickerEvent,
      new Date(2026, 2, 7, 2, 30),
    );
    await press('check-in-save');
    await settle();

    const deps = await core();
    const history = await getGroupedCheckInHistory(deps, boardId);
    if (!history.ok) {
      throw new Error('history query failed');
    }
    const record = history.value[0].days[0].checkIns[0];
    expect(record.logicalDate).toBe('2026-03-07');
    const gapHost = new Date(2026, 2, 8, 2, 30).getHours() !== 2;
    const expected = gapHost
      ? // both candidates fail in a gap zone: the start-of-day wall clock
        // of the selected logical day is the next valid time
        new Date(2026, 2, 7, 3, 0).getTime()
      : // without a gap the next-calendar-day recombination holds
        new Date(2026, 2, 8, 2, 30).getTime();
    expect(record.occurredAtUtc).toBe(expected);
  });

  it('preserves the stored occurrence through a note-only edit after a zone change', async () => {
    const boardId = await seedBoard('traveler', { tracksTime: true });
    const deps = await core();
    const created = await createCheckIn(deps, {
      commandId: newCommandId(),
      boardId,
      logicalDate: '2026-08-29' as LogicalDate,
      occurredAtUtc: Date.UTC(2026, 7, 29, 18, 45),
      source: 'app',
    });
    if (!created.ok) {
      throw new Error('seed check-in failed');
    }
    const before = await getGroupedCheckInHistory(deps, boardId);
    if (!before.ok) {
      throw new Error('history query failed');
    }
    const seeded = before.value[0].days[0].checkIns[0];

    // the device moves to a far zone; a note-only edit must not resubmit
    // or rewrite the occurrence instant, zone, or offset
    mockClock.zone = 'Pacific/Kiritimati';
    renderRouter('src/app', { initialUrl: `/boards/${boardId}/check-ins` });
    fireEvent.press(await screen.findByLabelText(/traveler/));
    await settle();
    const note = await screen.findByTestId('check-in-note');
    fireEvent.changeText(note, 'same moment, new zone');
    await press('check-in-save');
    await settle();

    const after = await getGroupedCheckInHistory(deps, boardId);
    if (!after.ok) {
      throw new Error('history query failed');
    }
    const record = after.value[0].days[0].checkIns[0];
    expect(record.note).toBe('same moment, new zone');
    expect(record.occurredAtUtc).toBe(seeded.occurredAtUtc);
    expect(record.timeZoneId).toBe(seeded.timeZoneId);
  });
});

describe('provider retry after a failed open', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    mockClock.utcMs = Date.UTC(2026, 7, 30, 16, 0);
  });

  it('platform core does not cache a failed open result', async () => {
    // the platform adapter cannot open on jest; this asserts the caching
    // contract directly on the platform module
    const platform = jest.requireActual<
      typeof import('../../../src/platform/database/product-core')
    >('../../../src/platform/database/product-core');
    const first = platform.getProductCore();
    const second = platform.getProductCore();
    // while in flight the promise is shared
    expect(first).toBe(second);
    const settled = await first.catch(() => null);
    // a failure (expo modules are absent under jest) is not cached: the next
    // call starts a fresh attempt instead of replaying the failure
    if (settled === null || (settled && !settled.ok)) {
      const retry = platform.getProductCore();
      expect(retry).not.toBe(first);
      await retry.catch(() => null);
    }
  });
});
