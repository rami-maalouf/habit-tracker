import { useLocalSearchParams } from 'expo-router';

import { parseBoardId, parseCheckInId } from '@/core/domain/ids';
import { CheckInFormScreen } from '@/features/check-in-history';
import { RecoveryScreen } from '@/features/ui';

export default function EditCheckInRoute() {
  const { boardId, checkInId } = useLocalSearchParams<{ boardId: string; checkInId: string }>();
  const parsedBoard = parseBoardId(boardId ?? '');
  const parsedCheckIn = parseCheckInId(checkInId ?? '');
  if (!parsedBoard || !parsedCheckIn) {
    return <RecoveryScreen message="This check-in link is not valid." />;
  }
  return <CheckInFormScreen boardId={parsedBoard} checkInId={parsedCheckIn} />;
}
