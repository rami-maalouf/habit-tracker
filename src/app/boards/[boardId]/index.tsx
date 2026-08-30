import { useLocalSearchParams } from 'expo-router';

import { parseBoardId } from '@/core/domain/ids';
import { BoardDetailScreen } from '@/features/boards';
import { RecoveryScreen } from '@/features/ui';

export default function BoardDetailRoute() {
  const { boardId } = useLocalSearchParams<{ boardId: string }>();
  const parsed = parseBoardId(boardId ?? '');
  if (!parsed) {
    return <RecoveryScreen message="This board link is not valid." />;
  }
  return <BoardDetailScreen boardId={parsed} />;
}
