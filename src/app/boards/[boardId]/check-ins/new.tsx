import { useLocalSearchParams } from 'expo-router';

import { parseBoardId } from '@/core/domain/ids';
import { CheckInFormScreen } from '@/features/check-in-history';
import { RecoveryScreen } from '@/features/ui';

export default function AddCheckInRoute() {
  const { boardId } = useLocalSearchParams<{ boardId: string }>();
  const parsed = parseBoardId(boardId ?? '');
  if (!parsed) {
    return <RecoveryScreen message="This board link is not valid." />;
  }
  return <CheckInFormScreen boardId={parsed} checkInId={null} />;
}
