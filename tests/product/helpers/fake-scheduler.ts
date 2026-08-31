import type {
  ReminderAuthorization,
  ReminderScheduler,
  ReminderScheduleRequest,
} from '@/core/domain/ports';

// configurable in-memory scheduler double: authorization flows, capacity
// limits, and per-call schedule failures are all settable by tests
export class FakeReminderScheduler implements ReminderScheduler {
  auth: ReminderAuthorization = 'granted';
  promptResult: ReminderAuthorization = 'granted';
  prompts = 0;
  capacity = 64;
  failNextSchedules = 0;
  failNextCancels = 0;
  private counter = 0;
  pending = new Map<string, ReminderScheduleRequest>();
  cancelled: string[] = [];

  async authorization(): Promise<ReminderAuthorization> {
    return this.auth;
  }

  async requestAuthorization(): Promise<ReminderAuthorization> {
    this.prompts += 1;
    this.auth = this.promptResult;
    return this.auth;
  }

  async remainingCapacity(): Promise<number> {
    return this.capacity - this.pending.size;
  }

  async pendingIdentifiers(): Promise<string[]> {
    return [...this.pending.keys()];
  }

  async schedule(request: ReminderScheduleRequest): Promise<string> {
    if (this.failNextSchedules > 0) {
      this.failNextSchedules -= 1;
      throw new Error('native scheduling failed');
    }
    this.counter += 1;
    const identifier = `native-${this.counter}`;
    this.pending.set(identifier, request);
    return identifier;
  }

  async cancel(identifiers: string[]): Promise<void> {
    if (this.failNextCancels > 0) {
      this.failNextCancels -= 1;
      throw new Error('native cancel failed');
    }
    for (const identifier of identifiers) {
      this.pending.delete(identifier);
      this.cancelled.push(identifier);
    }
  }
}
