import { useLocalSearchParams } from 'expo-router';

import { parseBoardId } from '@/core/domain/ids';
import { ReminderFormScreen } from '@/features/reminders';
import { RecoveryScreen } from '@/features/ui';

// the draft segment targets the unsaved board's create session; an index
// query edits one of its pending reminders
export default function AddReminderRoute() {
  const { boardId, index } = useLocalSearchParams<{ boardId: string; index?: string }>();
  if (boardId === 'draft') {
    const draftIndex = index === undefined ? null : Number(index);
    if (draftIndex !== null && (!Number.isInteger(draftIndex) || draftIndex < 0)) {
      return <RecoveryScreen message="This reminder link is not valid." />;
    }
    return <ReminderFormScreen boardId={null} reminderId={null} draftIndex={draftIndex} />;
  }
  const parsed = parseBoardId(boardId ?? '');
  if (!parsed) {
    return <RecoveryScreen message="This board link is not valid." />;
  }
  return <ReminderFormScreen boardId={parsed} reminderId={null} draftIndex={null} />;
}
