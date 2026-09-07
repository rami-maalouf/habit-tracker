import { act } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { createBoard } from '@/core/domain/commands';
import { listActiveBoards } from '@/core/domain/queries';
import { BoardIconPicker } from '@/features/board-configuration/board-icon-picker';
import { getDraftState } from '@/features/board-configuration/draft-store';

import { getProductCore, newCommandId, resetProductCoreForTests } from '../../../src/testing/product-core.mock';
import { fireEvent, renderComponent, renderRouter, screen, settle } from '../../../src/testing/render';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));

async function press(testId: string) {
  fireEvent.press(screen.getByTestId(testId));
  await settle();
}

async function savedBoards() {
  const core = await getProductCore();
  if (!core.ok) throw new Error(core.error.message);
  const result = await listActiveBoards(core.value);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('habit icon picker', () => {
  beforeEach(() => resetProductCoreForTests());

  it('searches everyday words and saves a new icon with a created habit', async () => {
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('create-board');
    await press('create-board');
    fireEvent.changeText(await screen.findByTestId('board-title-input'), 'Daily swimming');
    await press('open-symbol-picker');

    expect(screen.getByRole('header', { name: 'Choose an icon' })).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('symbol-search'), 'pool');
    expect(screen.getByLabelText('Swimming icon')).toBeOnTheScreen();
    expect(screen.queryByTestId('symbol-calendar')).toBeNull();
    await press('symbol-figure.pool.swim');

    expect(screen.queryByTestId('symbol-picker')).toBeNull();
    expect(screen.getByLabelText('Choose icon, Swimming')).toBeOnTheScreen();
    expect(getDraftState().draft.symbol).toBe('figure.pool.swim');
    await press('board-form-save');

    expect(screen).toHavePathname('/');
    expect((await savedBoards())[0].symbol).toBe('figure.pool.swim');
  });

  it('keeps an edited icon in the draft until save and discards it with a cancelled edit', async () => {
    const core = await getProductCore();
    if (!core.ok) throw new Error(core.error.message);
    const result = await createBoard(core.value, {
      commandId: newCommandId(), title: 'Brush teeth', symbol: 'star.fill',
      accentHex: '#70A7FF', usesTintedBackground: true,
      tracksAmount: false, tracksTime: true, startOfDayMinute: 0, metricsEnabled: true,
    });
    if (!result.ok) throw new Error(result.error.message);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    renderRouter('src/app', { initialUrl: '/' });
    fireEvent.press(await screen.findByText('Brush teeth'));
    await settle();
    await press('edit-board');
    await screen.findByTestId('board-title-input');
    await press('open-symbol-picker');
    expect(screen.getByTestId('symbol-star.fill')).toBeSelected();
    fireEvent.changeText(screen.getByTestId('symbol-search'), 'floss');
    await press('symbol-mouth.fill');
    expect((await savedBoards())[0].symbol).toBe('star.fill');

    await press('board-form-cancel');
    expect(alert).toHaveBeenCalledWith('Discard changes?', expect.any(String), expect.any(Array));
    act(() => alert.mock.calls.at(-1)?.[2]?.find((button) => button.text === 'Discard')?.onPress?.());
    await settle();
    expect((await savedBoards())[0].symbol).toBe('star.fill');

    await press('edit-board');
    await screen.findByTestId('board-title-input');
    await press('open-symbol-picker');
    fireEvent.changeText(screen.getByTestId('symbol-search'), 'floss');
    await press('symbol-mouth.fill');
    await press('board-form-save');
    expect((await savedBoards())[0].symbol).toBe('mouth.fill');
    alert.mockRestore();
  });

  it('filters by category and recovers from a search with no results', () => {
    const onSelect = jest.fn();
    renderComponent(<BoardIconPicker isPresented symbol="calendar" accent="#70A7FF" onSelect={onSelect} onDismiss={jest.fn()} />);
    fireEvent.press(screen.getByTestId('icon-category-health'));
    expect(screen.getByTestId('symbol-mouth.fill')).toBeOnTheScreen();
    expect(screen.queryByTestId('symbol-bicycle')).toBeNull();
    fireEvent.changeText(screen.getByTestId('symbol-search'), 'bike');
    expect(screen.getByTestId('symbol-picker-empty')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('icon-category-all'));
    fireEvent.press(screen.getByTestId('symbol-bicycle'));
    expect(onSelect).toHaveBeenCalledWith('bicycle');
  });

  it('dismisses without changing the icon and starts the next opening with all icons', () => {
    const onSelect = jest.fn();
    const onDismiss = jest.fn();
    const picker = (isPresented: boolean) => <BoardIconPicker isPresented={isPresented} symbol="calendar" accent="#70A7FF" onSelect={onSelect} onDismiss={onDismiss} />;
    const { rerender } = renderComponent(picker(true));
    fireEvent.changeText(screen.getByTestId('symbol-search'), 'meditation');
    fireEvent.press(screen.getByTestId('close-symbol-picker'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
    rerender(picker(false));
    rerender(picker(true));
    expect(screen.getByTestId('symbol-search')).toHaveProp('value', '');
    expect(screen.getByTestId('symbol-calendar')).toBeSelected();
    fireEvent(screen.getByTestId('symbol-picker'), 'accessibilityEscape');
    expect(onDismiss).toHaveBeenCalledTimes(2);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
