import { useLocalSearchParams } from 'expo-router';

import { parseBoardId, parseReminderId } from '@/core/domain/ids';
import { ReminderFormScreen } from '@/features/reminders';
import { RecoveryScreen } from '@/features/ui';

export default function EditReminderRoute() {
  const { boardId, reminderId } = useLocalSearchParams<{
    boardId: string;
    reminderId: string;
  }>();
  const parsedBoard = parseBoardId(boardId ?? '');
  const parsedReminder = parseReminderId(reminderId ?? '');
  if (!parsedBoard || !parsedReminder) {
    return <RecoveryScreen message="This reminder link is not valid." />;
  }
  return <ReminderFormScreen boardId={parsedBoard} reminderId={parsedReminder} draftIndex={null} />;
}
