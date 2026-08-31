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

// the platform notification adapter: repeating weekly local notifications
// at a wall-clock time, plus authorization and remaining native capacity
export interface ReminderScheduler {
  authorization(): Promise<ReminderAuthorization>;
  requestAuthorization(): Promise<ReminderAuthorization>;
  remainingCapacity(): Promise<number>;
  // identifiers of every pending native request, so the reconciler can
  // detect untracked orphans and duplicates after a crash
  pendingIdentifiers(): Promise<string[]>;
  schedule(request: ReminderScheduleRequest): Promise<string>;
  cancel(identifiers: string[]): Promise<void>;
}
