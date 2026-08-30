import { useLocalSearchParams } from 'expo-router';

import { parseBoardId } from '@/core/domain/ids';
import { AnalyticsScreen } from '@/features/analytics';
import { RecoveryScreen } from '@/features/ui';

export default function AnalyticsRoute() {
  const { boardId } = useLocalSearchParams<{ boardId: string }>();
  const parsed = parseBoardId(boardId ?? '');
  if (!parsed) {
    return <RecoveryScreen message="This board link is not valid." />;
  }
  return <AnalyticsScreen boardId={parsed} />;
}
