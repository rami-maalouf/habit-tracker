import { useLocalSearchParams } from 'expo-router';

import { parseBoardId } from '@/core/domain/ids';
import { BoardOptionsScreen } from '@/features/board-configuration';
import { RecoveryScreen } from '@/features/ui';

// the create flow uses the placeholder segment 'draft' (no board yet); an
// edit flow carries the board id, which must match the live draft session
export default function BoardOptionsRoute() {
  const { boardId } = useLocalSearchParams<{ boardId: string }>();
  if (boardId === 'draft') {
    return <BoardOptionsScreen expectedBoardId={null} />;
  }
  const parsed = parseBoardId(boardId ?? '');
  if (!parsed) {
    return <RecoveryScreen message="This board link is not valid." />;
  }
  return <BoardOptionsScreen expectedBoardId={parsed} />;
}
