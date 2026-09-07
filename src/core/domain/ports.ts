export interface Clock {
  nowUtcMs(): number;
  timeZoneId(): string;
}

export interface IdGenerator {
  uuid(): string;
}

export type ReminderAuthorization = 'granted' | 'denied' | 'undetermined';

export type ReminderScheduleRequest = {
  reminderId: string;
  boardId: string;
  // iso weekday, 1 (monday) through 7 (sunday); the adapter converts to
  // the platform's own weekday numbering
  weekday: number;
  minuteOfDay: number;
  title: string;
  body: string;
};

export type PendingReminderRequest = {
  identifier: string;
  // null preserves orphan visibility when native content is malformed or
  // the trigger does not describe a repeating weekly reminder
  request: ReminderScheduleRequest | null;
};

export type ReminderSchedulerFailureCode =
  | 'authorization_unavailable'
  | 'pending_unavailable'
  | 'capacity_unavailable'
  | 'schedule_failed'
  | 'cancel_failed';

export interface ReminderSchedulerFailure extends Error {
  readonly name: 'ReminderSchedulerError';
  readonly code: ReminderSchedulerFailureCode;
}

// the platform notification adapter: repeating weekly local notifications
// at a wall-clock time, plus authorization and remaining native capacity
export interface ReminderScheduler {
  authorization(): Promise<ReminderAuthorization>;
  requestAuthorization(): Promise<ReminderAuthorization>;
  remainingCapacity(): Promise<number>;
  // identifiers of every pending native request, so the reconciler can
  // detect untracked orphans and duplicates after a crash
  pendingIdentifiers(): Promise<string[]>;
  pendingRequests(): Promise<PendingReminderRequest[]>;
  schedule(request: ReminderScheduleRequest): Promise<string>;
  cancel(identifiers: string[]): Promise<void>;
}
