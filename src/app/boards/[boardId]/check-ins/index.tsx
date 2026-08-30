import { useLocalSearchParams } from 'expo-router';

import { parseBoardId } from '@/core/domain/ids';
import { CheckInHistoryScreen } from '@/features/check-in-history';
import { RecoveryScreen } from '@/features/ui';

export default function CheckInHistoryRoute() {
  const { boardId } = useLocalSearchParams<{ boardId: string }>();
  const parsed = parseBoardId(boardId ?? '');
  if (!parsed) {
    return <RecoveryScreen message="This board link is not valid." />;
  }
  return <CheckInHistoryScreen boardId={parsed} />;
}
