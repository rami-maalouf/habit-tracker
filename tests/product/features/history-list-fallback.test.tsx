import type { CheckIn } from '@/core/domain/entities';
import type { CheckInId } from '@/core/domain/ids';

import type { HistoryListProps } from '../../../src/features/check-in-history/history-list-types';
import { fireEvent, renderComponent, screen } from '../../../src/testing/render';

// the base file is the android fallback; jest resolves the ios variant for
// the app, so the fallback is exercised directly by filename
const { HistoryList } = jest.requireActual<{
  HistoryList: (props: HistoryListProps) => React.JSX.Element;
}>('../../../src/features/check-in-history/history-list.tsx');

function checkIn(overrides: Partial<CheckIn>): CheckIn {
  return {
    id: '00000000-0000-4000-8000-0000000000f0',
    boardId: '00000000-0000-4000-8000-0000000000f9',
    logicalDate: '2026-08-30',
    occurredAtUtc: null,
    timeZoneId: null,
    offsetMinutes: null,
    amount: null,
    note: null,
    source: 'app',
    idempotencyKey: '00000000-0000-4000-8000-0000000000f1',
    createdAt: 0,
    updatedAt: 0,
    mutationStamp: 's',
    deletedAt: null,
    ...overrides,
  } as CheckIn;
}

const SECTIONS = [
  {
    title: 'Aug 30',
    monthHeader: 'August',
    monthCount: 2,
    count: 2,
    data: [
      checkIn({ id: '00000000-0000-4000-8000-0000000000a1' as CheckInId, note: 'noted' }),
      checkIn({
        id: '00000000-0000-4000-8000-0000000000a2' as CheckInId,
        amount: 3,
        occurredAtUtc: Date.UTC(2026, 7, 30, 16, 30),
        timeZoneId: 'America/New_York',
      }),
    ],
  },
  {
    title: 'Aug 29',
    monthHeader: null,
    monthCount: 2,
    count: 1,
    data: [checkIn({ id: '00000000-0000-4000-8000-0000000000a3' as CheckInId })],
  },
];

function renderList(overrides: Partial<HistoryListProps> = {}) {
  const onOpen = jest.fn();
  const onDelete = jest.fn();
  const onLoadMore = jest.fn();
  renderComponent(
    <HistoryList
      sections={SECTIONS}
      boardTitle="fallback habit"
      amountUnit="km"
      archived={false}
      onOpen={onOpen}
      onDelete={onDelete}
      hasMore={false}
      onLoadMore={onLoadMore}
      {...overrides}
    />,
  );
  return { onOpen, onDelete, onLoadMore };
}

describe('history list fallback', () => {
  it('renders headers, row details, and opens rows on tap', () => {
    const { onOpen } = renderList();
    expect(screen.getByText('August')).toBeOnTheScreen();
    expect(screen.getByText('Aug 29')).toBeOnTheScreen();
    expect(screen.getByText('3 km')).toBeOnTheScreen();
    expect(screen.getByText('✎')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('check-in-row-00000000-0000-4000-8000-0000000000a1'));
    expect(onOpen).toHaveBeenCalledWith('00000000-0000-4000-8000-0000000000a1');
  });

  it('keeps archived rows read-only', () => {
    const { onOpen } = renderList({ archived: true });
    const row = screen.getByTestId('check-in-row-00000000-0000-4000-8000-0000000000a1');
    expect(row.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(row);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('loads more only while more remains', () => {
    const more = renderList({ hasMore: true });
    fireEvent(screen.getByTestId('history-list'), 'endReached');
    expect(more.onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('ignores end reached once exhausted', () => {
    const done = renderList({ hasMore: false });
    fireEvent(screen.getByTestId('history-list'), 'endReached');
    expect(done.onLoadMore).not.toHaveBeenCalled();
  });
});
