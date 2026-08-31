import * as Notifications from 'expo-notifications';

import type {
  ReminderAuthorization,
  ReminderScheduler,
  ReminderScheduleRequest,
} from '@/core/domain/ports';

// ios caps the pending local-notification pool at 64 requests
const IOS_PENDING_LIMIT = 64;

function toAuthorization(status: Notifications.NotificationPermissionsStatus): ReminderAuthorization {
  if (status.granted) {
    return 'granted';
  }
  return status.canAskAgain ? 'undetermined' : 'denied';
}

// expo weekly triggers number weekdays 1 (sunday) through 7 (saturday);
// the domain speaks iso 1 (monday) through 7 (sunday)
function toExpoWeekday(isoWeekday: number): number {
  return (isoWeekday % 7) + 1;
}

export const reminderScheduler: ReminderScheduler = {
  async authorization(): Promise<ReminderAuthorization> {
    return toAuthorization(await Notifications.getPermissionsAsync());
  },

  async requestAuthorization(): Promise<ReminderAuthorization> {
    return toAuthorization(
      await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: true, allowBadge: true },
      }),
    );
  },

  async remainingCapacity(): Promise<number> {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    return IOS_PENDING_LIMIT - pending.length;
  },

  async schedule(request: ReminderScheduleRequest): Promise<string> {
    return Notifications.scheduleNotificationAsync({
      content: {
        title: request.title,
        body: request.body,
        sound: 'default',
        // the tap handler deep-links straight to the add check-in sheet
        data: { boardId: request.boardId, reminderId: request.reminderId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: toExpoWeekday(request.weekday),
        hour: Math.floor(request.minuteOfDay / 60),
        minute: request.minuteOfDay % 60,
      },
    });
  },

  async cancel(identifiers: string[]): Promise<void> {
    await Promise.all(
      identifiers.map((identifier) =>
        Notifications.cancelScheduledNotificationAsync(identifier),
      ),
    );
  },
};

// a tapped reminder carries its board id; the router turns that into the
// board's add check-in sheet
export function boardIdFromNotificationResponse(
  response: Notifications.NotificationResponse,
): string | null {
  const data = response.notification.request.content.data as
    | Record<string, unknown>
    | null
    | undefined;
  return data && typeof data.boardId === 'string' ? data.boardId : null;
}

// taps while the app runs (or is backgrounded) arrive through the listener
export function addNotificationTapListener(handler: (boardId: string) => void): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const boardId = boardIdFromNotificationResponse(response);
    if (boardId) {
      handler(boardId);
    }
  });
  return () => subscription.remove();
}

// a tap that cold-started the app is delivered once on launch
export async function getInitialNotificationBoardId(): Promise<string | null> {
  const response = await Notifications.getLastNotificationResponseAsync();
  return response ? boardIdFromNotificationResponse(response) : null;
}
