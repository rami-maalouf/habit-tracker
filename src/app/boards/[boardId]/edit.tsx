import { useLocalSearchParams } from 'expo-router';

import { parseBoardId } from '@/core/domain/ids';
import { BoardFormScreen } from '@/features/board-configuration';
import { RecoveryScreen } from '@/features/ui';

export default function EditBoardRoute() {
  const { boardId } = useLocalSearchParams<{ boardId: string }>();
  const parsed = parseBoardId(boardId ?? '');
  if (!parsed) {
    return <RecoveryScreen message="This board link is not valid." />;
  }
  return <BoardFormScreen boardId={parsed} />;
}
