export interface Clock {
  nowUtcMs(): number;
  timeZoneId(): string;
}

export interface IdGenerator {
  uuid(): string;
}
