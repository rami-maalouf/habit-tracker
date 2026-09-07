import { act } from '@testing-library/react-native';
import { AppState, Button, Text } from 'react-native';
import type { AppStateStatus } from 'react-native';

import { createBoard, createCheckIn, setICloudSyncEnabled } from '@/core/domain/commands';
import type { BoardId } from '@/core/domain/ids';
import { listActiveBoards } from '@/core/domain/queries';
import { ProductProvider, useProduct, useProductQuery } from '@/features/product-store';

import { fireEvent, renderComponent, screen, settle } from '../../../src/testing/render';
import { FakeSyncTransport } from '../helpers/fake-transport';
import { createTestHarness } from '../helpers/test-db';

function CheckInButton({ boardId }: { boardId: BoardId }) {
  const { core, nextCommandId, invalidate, sync } = useProduct();
  const boards = useProductQuery(listActiveBoards, []);
  return <>
    <Button title="Record check-in" onPress={() => {
      void createCheckIn(core, { commandId: nextCommandId(), boardId, source: 'app' }).then((result) => {
        if (result.ok) invalidate();
      });
    }} />
    <Text>{sync.status}</Text>
    {boards.status === 'ready' ? boards.value.map((board) => <Text key={board.id}>{board.title}</Text>) : null}
  </>;
}

it('uploads from home and fetches remote edits on foreground without opening sync settings', async () => {
  jest.useFakeTimers();
  const listeners = new Set<(state: AppStateStatus) => void>();
  const subscription = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    listeners.add(listener);
    return { remove: () => listeners.delete(listener) };
  });
  const harness = await createTestHarness();
  await setICloudSyncEnabled(harness.deps, { commandId: harness.ids.nextCommandId(), enabled: true });
  const created = await createBoard(harness.deps, {
    commandId: harness.ids.nextCommandId(), title: 'walk', symbol: 'star.fill', accentHex: '#78D98B',
    usesTintedBackground: true, tracksAmount: false, tracksTime: false, startOfDayMinute: 0, metricsEnabled: true,
  });
  if (!created.ok) throw new Error('board failed');
  const transport = new FakeSyncTransport();
  const rendered = renderComponent(<ProductProvider coreOverride={harness.deps} syncTransportOverride={transport}>
    <CheckInButton boardId={created.value.boardId} />
  </ProductProvider>);
  try {
    await settle();
    expect(screen.getByText('up_to_date')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Record check-in' }));
    await settle();
    await settle();
    expect([...transport.store.values()].filter((record) => record.entityType === 'check_in')).toHaveLength(1);
    const board = [...transport.store.values()].find((record) => record.entityType === 'board');
    if (!board) throw new Error('remote board absent');
    const stamp = String(Number(board.mutationStamp.slice(0, 14)) + 1000).padStart(14, '0') + board.mutationStamp.slice(14);
    transport.seedRemote({ ...board, mutationStamp: stamp, fields: { ...board.fields, title: 'walk outdoors' } });
    await act(async () => { for (const listener of listeners) listener('active'); });
    await settle();
    expect(screen.getByText('walk outdoors')).toBeOnTheScreen();
  } finally {
    rendered.unmount();
    subscription.mockRestore();
    jest.useRealTimers();
  }
});
