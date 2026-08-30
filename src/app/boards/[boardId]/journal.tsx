import { useLocalSearchParams } from 'expo-router';

import { parseBoardId } from '@/core/domain/ids';
import { JournalScreen } from '@/features/journal';
import { RecoveryScreen } from '@/features/ui';

export default function JournalRoute() {
  const { boardId } = useLocalSearchParams<{ boardId: string }>();
  const parsed = parseBoardId(boardId ?? '');
  if (!parsed) {
    return <RecoveryScreen message="This board link is not valid." />;
  }
  return <JournalScreen boardId={parsed} />;
}
