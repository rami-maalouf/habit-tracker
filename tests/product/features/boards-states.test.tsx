import { router } from 'expo-router';
import { Alert } from 'react-native';
import { act } from '@testing-library/react-native';

import { updateBoard } from '@/core/domain/commands';
import { listActiveBoards } from '@/core/domain/queries';

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

async function goBack(): Promise<void> {
  act(() => {
    router.back();
  });
  await settle();
}

describe('board configuration states', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    alertSpy.mockClear();
  });

  it('configures symbols, colors, custom hex, tint, and amounts in the form', async () => {
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('empty-create-board');
    await press('create-board');
    await screen.findByTestId('board-title-input');
    fireEvent.changeText(screen.getByTestId('board-title-input'), 'water intake');

    // symbol picker with search narrows the grid and selection closes it
    await press('open-symbol-picker');
    fireEvent.changeText(screen.getByTestId('symbol-search'), 'drop');
    await settle();
    await press('symbol-drop.fill');
    expect(screen.queryByTestId('symbol-picker')).toBeNull();

    // palette selection, then a custom hex over it
    await press('color-blue');
    await press('custom-color');
    fireEvent.changeText(screen.getByTestId('custom-color-input'), 'zzz');

    // invalid custom color surfaces the command validation error in place
    await press('board-form-save');
    expect(await screen.findByTestId('board-form-error')).toHaveTextContent(
      'Colors use the #RRGGBB form.',
    );
    fireEvent.changeText(screen.getByTestId('custom-color-input'), '#123456');

    // tint off, amounts on with unit and quick amount
    fireEvent(screen.getByTestId('tinted-toggle'), 'valueChange', false);
    fireEvent(screen.getByTestId('amounts-toggle'), 'valueChange', true);
    await settle();
    fireEvent.changeText(await screen.findByTestId('unit-input'), 'cups');

    // invalid quick amount surfaces its error, then a valid one saves
    fireEvent.changeText(screen.getByTestId('quick-amount-input'), '0');
    await press('board-form-save');
    expect(await screen.findByTestId('board-form-error')).toHaveTextContent(
      'Enter an amount greater than zero.',
    );
    fireEvent.changeText(screen.getByTestId('quick-amount-input'), '2.5');

    await press('board-form-save');
    await settle();
    expect(screen).toHavePathname('/');
    expect(screen.getByText('water intake')).toBeOnTheScreen();
  });

  it('edits options through the shared draft and saves them with the board', async () => {
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('empty-create-board');
    await press('create-board');
    await screen.findByTestId('board-title-input');
    fireEvent.changeText(screen.getByTestId('board-title-input'), 'sleep early');

    await press('open-options');
    await screen.findByTestId('track-time-toggle');
    fireEvent(screen.getByTestId('track-time-toggle'), 'valueChange', true);
    fireEvent(screen.getByTestId('metrics-toggle'), 'valueChange', false);
    await press('shift-later');
    await press('shift-later');
    expect(screen.getByTestId('start-of-day-value')).toHaveTextContent(/1:00 AM/);
    await press('shift-earlier');
    expect(screen.getByTestId('start-of-day-value')).toHaveTextContent(/12:30 AM/);

    await goBack();
    await press('board-form-save');
    await settle();

    // metrics disabled boards show the enable-metrics surface on detail
    fireEvent.press(screen.getByText('sleep early'));
    await settle();
    expect(await screen.findByTestId('metrics-disabled')).toBeOnTheScreen();
    await press('enable-metrics');
    await settle();
    expect(screen.queryByTestId('metrics-disabled')).toBeNull();
  });

  it('confirms discarding a dirty create sheet', async () => {
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('empty-create-board');
    await press('create-board');
    await screen.findByTestId('board-title-input');
    fireEvent.changeText(screen.getByTestId('board-title-input'), 'dirty');

    alertSpy.mockClear();
    fireEvent.press(screen.getByTestId('board-form-cancel'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Discard changes?',
      expect.any(String),
      expect.any(Array),
    );
  });

  it('surfaces a conflict when the board changed elsewhere', async () => {
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('empty-create-board');
    await press('create-board');
    await screen.findByTestId('board-title-input');
    fireEvent.changeText(screen.getByTestId('board-title-input'), 'conflicted');
    await press('board-form-save');
    await settle();

    fireEvent.press(screen.getByText('conflicted'));
    await settle();
    await press('edit-board');
    await screen.findByTestId('board-title-input');

    // a second writer updates the board after the edit sheet seeded its draft
    const core = await getProductCore();
    if (!core.ok) {
      throw new Error('test core failed to open');
    }
    const boards = await listActiveBoards(core.value);
    if (!boards.ok || boards.value.length === 0) {
      throw new Error('expected one active board');
    }
    const record = boards.value[0];
    const concurrent = await updateBoard(core.value, {
      commandId: newCommandId(),
      boardId: record.id,
      expectedMutationStamp: record.mutationStamp,
      title: 'renamed elsewhere',
      symbol: record.symbol,
      accentHex: record.accentHex,
      usesTintedBackground: record.usesTintedBackground,
      tracksAmount: record.tracksAmount,
      tracksTime: record.tracksTime,
      startOfDayMinute: record.startOfDayMinute,
      metricsEnabled: record.metricsEnabled,
    });
    expect(concurrent.ok).toBe(true);

    fireEvent.changeText(screen.getByTestId('board-title-input'), 'my rename');
    await press('board-form-save');
    expect(await screen.findByTestId('board-form-conflict')).toBeOnTheScreen();
  });
});

describe('amount and time boards through the ui', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    alertSpy.mockClear();
  });

  it('adds an amount and time check-in with pickers and validates amounts', async () => {
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('empty-create-board');
    await press('create-board');
    await screen.findByTestId('board-title-input');
    fireEvent.changeText(screen.getByTestId('board-title-input'), 'run');
    fireEvent(screen.getByTestId('amounts-toggle'), 'valueChange', true);
    await settle();
    fireEvent.changeText(await screen.findByTestId('unit-input'), 'km');
    fireEvent.changeText(screen.getByTestId('quick-amount-input'), '5');

    await press('open-options');
    fireEvent(await screen.findByTestId('track-time-toggle'), 'valueChange', true);
    await goBack();
    await press('board-form-save');
    await settle();

    fireEvent.press(screen.getByText('run'));
    await settle();
    await press('open-check-ins');
    fireEvent.press(await screen.findByText('Add Check-In'));
    await settle();

    // move the date back a day and set an explicit time via the pickers
    const pickerEvent = { nativeEvent: { timestamp: 0, utcOffset: 0 } };
    const date = await screen.findByTestId('check-in-date');
    fireEvent(date, 'valueChange', pickerEvent, new Date(2026, 7, 29, 12, 0));
    const time = screen.getByTestId('check-in-time');
    fireEvent(time, 'valueChange', pickerEvent, new Date(Date.UTC(2026, 7, 29, 18, 30)));

    // an invalid amount surfaces the domain error before saving works
    fireEvent.changeText(screen.getByTestId('check-in-amount'), '-3');
    await press('check-in-save');
    expect(await screen.findByTestId('check-in-error')).toHaveTextContent(
      'Enter an amount greater than zero.',
    );

    fireEvent.changeText(screen.getByTestId('check-in-amount'), '7.5');
    await press('check-in-save');
    await settle();
    expect(await screen.findByText('Aug 29')).toBeOnTheScreen();
    expect(screen.getByText('7.5 km')).toBeOnTheScreen();
  });
});
