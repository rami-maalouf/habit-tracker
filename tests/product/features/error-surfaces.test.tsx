import { Alert } from 'react-native';

import { createBoard } from '@/core/domain/commands';
import { err } from '@/core/domain/result';
import type { BoardId } from '@/core/domain/ids';

import * as queries from '@/core/domain/queries';
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

jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

async function press(testId: string): Promise<void> {
  fireEvent.press(screen.getByTestId(testId));
  await settle();
}

async function seedBoard(
  title: string,
  overrides: Partial<Parameters<typeof createBoard>[1]> = {},
): Promise<BoardId> {
  const opened = await getProductCore();
  if (!opened.ok) {
    throw new Error('test core failed to open');
  }
  const created = await createBoard(opened.value, {
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

describe('query error surfaces', () => {
  beforeEach(() => {
    resetProductCoreForTests();
    jest.restoreAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  it('shows a retryable error block when a detail query fails', async () => {
    const boardId = await seedBoard('flaky metrics');
    jest
      .spyOn(queries, 'getBoardSummary')
      .mockResolvedValueOnce(err('database', 'The data could not be loaded.', { retryable: true }));

    renderRouter('src/app', { initialUrl: `/boards/${boardId}` });
    expect(await screen.findByTestId('detail-query-error')).toBeOnTheScreen();
    // the education card never renders over a failed supporting query
    expect(screen.queryByTestId('metrics-education')).toBeNull();

    await press('detail-query-retry');
    expect(await screen.findByTestId('metrics-education')).toBeOnTheScreen();
    expect(screen.queryByTestId('detail-query-error')).toBeNull();
  });

  it('offers a retry when the archived boards list fails to load', async () => {
    jest
      .spyOn(queries, 'listArchivedBoards')
      .mockResolvedValueOnce(err('database', 'The data could not be loaded.', { retryable: true }));

    renderRouter('src/app', { initialUrl: '/settings/archived' });
    expect(await screen.findByTestId('archived-error')).toBeOnTheScreen();
    await press('archived-retry');
    expect(await screen.findByTestId('archived-empty')).toBeOnTheScreen();
  });

  it('shows a retryable home error when the board projection fails', async () => {
    await seedBoard('recoverable');
    jest
      .spyOn(queries, 'getHomeBoardProjection')
      .mockResolvedValueOnce(err('database', 'The data could not be loaded.', { retryable: true }));

    renderRouter('src/app', { initialUrl: '/' });
    expect(await screen.findByTestId('boards-error')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Try again'));
    await settle();
    expect(await screen.findByText('recoverable')).toBeOnTheScreen();
  });

  it('surfaces a reorder failure when a neighbor vanished', async () => {
    const opened = await getProductCore();
    if (!opened.ok) {
      throw new Error('test core failed to open');
    }
    await seedBoard('stay');
    await seedBoard('vanish');
    renderRouter('src/app', { initialUrl: '/' });
    await screen.findByTestId('board-card-1');
    await press('toggle-edit-boards');

    // the reorder command is forced to fail underneath the ui
    jest
      .spyOn(require('@/core/domain/commands') as typeof import('@/core/domain/commands'), 'reorderBoard')
      .mockResolvedValueOnce(err('not_found', 'This board no longer exists.'));
    await press('board-card-1-move-up');
    expect(await screen.findByTestId('quick-error')).toBeOnTheScreen();
  });

  it('keeps an untimed record untimed on a time-tracking board until touched', async () => {
    // the record predates time tracking: created while the board was
    // untimed, then the board enables tracksTime
    const boardId = await seedBoard('later timed');
    const opened = await getProductCore();
    if (!opened.ok) {
      throw new Error('test core failed to open');
    }
    const commands = jest.requireActual<typeof import('@/core/domain/commands')>(
      '@/core/domain/commands',
    );
    const created = await commands.createCheckIn(opened.value, {
      commandId: newCommandId(),
      boardId,
      source: 'app',
    });
    if (!created.ok) {
      throw new Error('seed check-in failed');
    }
    const queriesActual = jest.requireActual<typeof import('@/core/domain/queries')>(
      '@/core/domain/queries',
    );
    const board = await queriesActual.getBoard(opened.value, boardId);
    if (!board.ok) {
      throw new Error('board load failed');
    }
    const enabled = await commands.updateBoard(opened.value, {
      commandId: newCommandId(),
      boardId,
      expectedMutationStamp: board.value.mutationStamp,
      title: board.value.title,
      symbol: board.value.symbol,
      accentHex: board.value.accentHex,
      usesTintedBackground: board.value.usesTintedBackground,
      tracksAmount: board.value.tracksAmount,
      tracksTime: true,
      startOfDayMinute: board.value.startOfDayMinute,
      metricsEnabled: board.value.metricsEnabled,
    });
    expect(enabled.ok).toBe(true);

    renderRouter('src/app', { initialUrl: `/boards/${boardId}/check-ins` });
    fireEvent.press(await screen.findByLabelText(/later timed/));
    await settle();
    await screen.findByTestId('delete-check-in');
    // a clean save neither invents a time nor rewrites the record
    await press('check-in-save');
    await settle();

    const { getCheckIn } = jest.requireActual<typeof import('@/core/domain/queries')>(
      '@/core/domain/queries',
    );
    const after = await getCheckIn(opened.value, created.value.checkInId);
    if (!after.ok || after.value === null) {
      throw new Error('record vanished');
    }
    expect(after.value.occurredAtUtc).toBeNull();
  });

  it('rejects a blank amount on an amount board with an inline error', async () => {
    const boardId = await seedBoard('measured', {
      tracksAmount: true,
      amountUnit: 'km',
      quickAmount: 5,
    });
    renderRouter('src/app', { initialUrl: `/boards/${boardId}/check-ins` });
    fireEvent.press(await screen.findByText('Add Check-In'));
    await settle();

    fireEvent.changeText(await screen.findByTestId('check-in-amount'), '   ');
    await press('check-in-save');
    expect(await screen.findByTestId('check-in-error')).toHaveTextContent(
      'Enter an amount greater than zero.',
    );
  });
});
