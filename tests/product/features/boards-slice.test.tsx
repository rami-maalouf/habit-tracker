import { Alert } from 'react-native';

import { resetProductCoreForTests } from '../../../src/testing/product-core.mock';

import { fireEvent, renderRouter, screen, settle } from '../../../src/testing/render';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));

// auto-confirm destructive dialogs so delete flows can be exercised
const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
  const destructive = buttons?.find((button) => button.style === 'destructive');
  destructive?.onPress?.();
});

async function press(testId: string): Promise<void> {
  fireEvent.press(screen.getByTestId(testId));
  await settle();
}

async function createBoardThroughUi(title: string): Promise<void> {
  await press('create-board');
  await screen.findByTestId('board-title-input');
  fireEvent.changeText(screen.getByTestId('board-title-input'), title);
  await press('board-form-save');
  await settle();
}

describe('boards vertical slice', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    alertSpy.mockClear();
  });

  it('shows the empty state and creates a board end to end', async () => {
    renderRouter('src/app', { initialUrl: '/' });
    expect(
      await screen.findByText('Boards turn habits into something you can see.'),
    ).toBeOnTheScreen();

    await press('empty-create-board');
    expect(await screen.findByTestId('board-title-input')).toBeOnTheScreen();

    // saving without a name surfaces the validation error in place
    await press('board-form-save');
    expect(await screen.findByTestId('board-form-error')).toHaveTextContent(
      'A board needs a name.',
    );

    fireEvent.changeText(screen.getByTestId('board-title-input'), 'morning pages');
    await press('board-form-save');
    await settle();

    expect(screen).toHavePathname('/');
    expect(screen.getByText('morning pages')).toBeOnTheScreen();
  });

  it('quick checks in with undo from the home card', async () => {
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('empty-create-board');
    await createBoardThroughUi('hydrate');

    await press('board-card-0-quick');
    expect(screen.getByText('Checked in to hydrate')).toBeOnTheScreen();

    await press('undo-check-in');
    expect(screen.queryByText('Checked in to hydrate')).toBeNull();
  });

  it('reorders boards with accessible move controls', async () => {
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('empty-create-board');
    await createBoardThroughUi('first');
    await createBoardThroughUi('second');
    await screen.findByTestId('board-card-1');

    await press('toggle-edit-boards');
    await press('board-card-1-move-up');

    expect(screen.getByTestId('board-card-0')).toHaveTextContent(/second/);
    expect(screen.getByTestId('board-card-1')).toHaveTextContent(/first/);
  });

  it('opens board detail with education, dismissal, and quick add', async () => {
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('empty-create-board');
    await createBoardThroughUi('read daily');

    fireEvent.press(screen.getByText('read daily'));
    await settle();
    expect(await screen.findByTestId('metrics-education')).toBeOnTheScreen();
    expect(await screen.findByTestId('board-heatmap')).toBeOnTheScreen();

    await press('example-boards');
    expect(screen.getByTestId('example-boards-copy')).toBeOnTheScreen();

    await press('detail-quick');
    await press('dismiss-education');
    expect(screen.queryByTestId('metrics-education')).toBeNull();
  });

  it('records and edits manual check-ins through history', async () => {
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('empty-create-board');
    await createBoardThroughUi('journal habit');
    fireEvent.press(screen.getByText('journal habit'));
    await settle();
    await press('open-check-ins');

    expect(await screen.findByTestId('history-empty')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Add Check-In'));
    await settle();

    const note = await screen.findByTestId('check-in-note');
    fireEvent.changeText(note, 'kept the promise');
    await press('check-in-save');
    await settle();

    // back on history with one row for today
    expect(await screen.findByText('Aug 30')).toBeOnTheScreen();
    fireEvent.press(screen.getByLabelText('journal habit, note'));
    await settle();

    const editNote = await screen.findByTestId('check-in-note');
    expect(editNote.props.value).toBe('kept the promise');
    fireEvent.changeText(editNote, 'kept it twice');
    await press('check-in-save');
    await settle();
    expect(await screen.findByText('Aug 30')).toBeOnTheScreen();

    // delete the record through the edit sheet
    fireEvent.press(screen.getByLabelText('journal habit, note'));
    await settle();
    await press('delete-check-in');
    await settle();
    expect(await screen.findByTestId('history-empty')).toBeOnTheScreen();
  });

  it('archives from the edit sheet and restores from read-only detail', async () => {
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('empty-create-board');
    await createBoardThroughUi('cold showers');
    fireEvent.press(screen.getByText('cold showers'));
    await settle();
    await press('edit-board');
    await screen.findByTestId('archive-board');

    fireEvent.press(screen.getByTestId('archive-board'));
    const archiveButtons = alertSpy.mock.calls.at(-1)?.[2];
    archiveButtons?.find((button) => button.text === 'Archive')?.onPress?.();
    await settle();
    await settle();

    // home no longer lists the board
    expect(
      await screen.findByText('Boards turn habits into something you can see.'),
    ).toBeOnTheScreen();
  });

  it('recovers from an invalid board id', async () => {
    renderRouter('src/app', { initialUrl: '/boards/not-a-uuid' });
    expect(await screen.findByTestId('recovery-home')).toBeOnTheScreen();
  });

  it('shows a recovery surface for a missing board id', async () => {
    renderRouter('src/app', {
      initialUrl: '/boards/00000000-0000-4000-8000-00000000dead',
    });
    expect(await screen.findByTestId('board-recovery-home')).toBeOnTheScreen();
  });
});
