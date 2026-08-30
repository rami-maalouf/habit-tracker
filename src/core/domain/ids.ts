export type Brand<Value, Name extends string> = Value & {
  readonly __brand: Name;
};

export type BoardId = Brand<string, 'BoardId'>;
export type CheckInId = Brand<string, 'CheckInId'>;
export type ReminderId = Brand<string, 'ReminderId'>;
export type CommandId = Brand<string, 'CommandId'>;
export type DeviceId = Brand<string, 'DeviceId'>;
export type LogicalDate = Brand<string, 'LogicalDate'>;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV4(value: string): boolean {
  return UUID_V4.test(value);
}

// route params and adapter inputs arrive as plain strings; these parse them
// into branded ids only when they are structurally valid uuids
export function parseBoardId(value: string): BoardId | null {
  return isUuidV4(value) ? (value.toLowerCase() as BoardId) : null;
}

export function parseCheckInId(value: string): CheckInId | null {
  return isUuidV4(value) ? (value.toLowerCase() as CheckInId) : null;
}

export function parseReminderId(value: string): ReminderId | null {
  return isUuidV4(value) ? (value.toLowerCase() as ReminderId) : null;
}

export function parseCommandId(value: string): CommandId | null {
  return isUuidV4(value) ? (value.toLowerCase() as CommandId) : null;
}
