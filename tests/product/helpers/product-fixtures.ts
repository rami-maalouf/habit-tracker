import { createBoard } from '@/core/domain/commands';
import type { BoardId } from '@/core/domain/ids';

import type { TestHarness } from './test-db';

export async function createBoardForTest(
  harness: TestHarness,
  overrides: Record<string, unknown> = {},
): Promise<BoardId> {
  const result = await createBoard(harness.deps, {
    commandId: harness.ids.nextCommandId(),
    title: 'test board',
    symbol: 'star.fill',
    accentHex: '#70A7FF',
    usesTintedBackground: true,
    tracksAmount: false,
    tracksTime: false,
    startOfDayMinute: 0,
    metricsEnabled: true,
    ...overrides,
  } as never);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value.boardId;
}
