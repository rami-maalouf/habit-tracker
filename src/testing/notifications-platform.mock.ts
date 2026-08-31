// jest replacement for @/platform/notifications: an in-memory scheduler
// and settable notification-tap plumbing
import type {
  ReminderAuthorization,
  ReminderScheduler,
  ReminderScheduleRequest,
} from '@/core/domain/ports';

export const notificationsPlatformMock = {
  auth: 'granted' as ReminderAuthorization,
  promptResult: 'granted' as ReminderAuthorization,
  prompts: 0,
  capacity: 64,
  failNextSchedules: 0,
  counter: 0,
  pending: new Map<string, ReminderScheduleRequest>(),
  cancelled: [] as string[],
  initialBoardId: null as string | null,
  tapHandlers: new Set<(boardId: string) => void>(),
  reset() {
    this.auth = 'granted';
    this.promptResult = 'granted';
    this.prompts = 0;
    this.capacity = 64;
    this.failNextSchedules = 0;
    this.counter = 0;
    this.pending = new Map();
    this.cancelled = [];
    this.initialBoardId = null;
    this.tapHandlers = new Set();
  },
  emitTap(boardId: string) {
    for (const handler of this.tapHandlers) {
      handler(boardId);
    }
  },
};

export const reminderScheduler: ReminderScheduler = {
  async authorization() {
    return notificationsPlatformMock.auth;
  },
  async requestAuthorization() {
    notificationsPlatformMock.prompts += 1;
    notificationsPlatformMock.auth = notificationsPlatformMock.promptResult;
    return notificationsPlatformMock.auth;
  },
  async remainingCapacity() {
    return notificationsPlatformMock.capacity - notificationsPlatformMock.pending.size;
  },
  async pendingIdentifiers() {
    return [...notificationsPlatformMock.pending.keys()];
  },
  async schedule(request: ReminderScheduleRequest) {
    if (notificationsPlatformMock.failNextSchedules > 0) {
      notificationsPlatformMock.failNextSchedules -= 1;
      throw new Error('native scheduling failed');
    }
    notificationsPlatformMock.counter += 1;
    const identifier = `native-${notificationsPlatformMock.counter}`;
    notificationsPlatformMock.pending.set(identifier, request);
    return identifier;
  },
  async cancel(identifiers: string[]) {
    for (const identifier of identifiers) {
      notificationsPlatformMock.pending.delete(identifier);
      notificationsPlatformMock.cancelled.push(identifier);
    }
  },
};

export function addNotificationTapListener(handler: (boardId: string) => void): () => void {
  notificationsPlatformMock.tapHandlers.add(handler);
  return () => notificationsPlatformMock.tapHandlers.delete(handler);
}

export async function getInitialNotificationBoardId(): Promise<string | null> {
  return notificationsPlatformMock.initialBoardId;
}

export function boardIdFromNotificationResponse(): string | null {
  return null;
}
