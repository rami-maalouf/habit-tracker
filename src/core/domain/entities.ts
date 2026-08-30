import type { BoardId, CheckInId, CommandId, DeviceId, LogicalDate, ReminderId } from './ids';

export type Board = {
  id: BoardId;
  title: string;
  symbol: string;
  accentHex: string;
  usesTintedBackground: boolean;
  tracksAmount: boolean;
  amountUnit: string | null;
  quickAmount: number;
  tracksTime: boolean;
  startOfDayMinute: number;
  metricsEnabled: boolean;
  orderKey: string;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
  mutationStamp: string;
  deletedAt: number | null;
};

export type CheckInSource = 'app' | 'widget' | 'shortcut' | 'siri' | 'sync';

export type CheckIn = {
  id: CheckInId;
  boardId: BoardId;
  logicalDate: LogicalDate;
  occurredAtUtc: number | null;
  timeZoneId: string | null;
  offsetMinutes: number | null;
  amount: number | null;
  note: string | null;
  source: CheckInSource;
  idempotencyKey: CommandId;
  createdAt: number;
  updatedAt: number;
  mutationStamp: string;
  deletedAt: number | null;
};

export type ReminderScheduleState = 'idle' | 'pending' | 'scheduled' | 'denied' | 'error';

export type Reminder = {
  id: ReminderId;
  boardId: BoardId;
  weekdaysMask: number;
  minuteOfDay: number;
  message: string | null;
  enabled: boolean;
  scheduleState: ReminderScheduleState;
  lastScheduleError: string | null;
  createdAt: number;
  updatedAt: number;
  mutationStamp: string;
  deletedAt: number | null;
};

export type BoardActivityPeriod = {
  id: number;
  boardId: BoardId;
  startDate: LogicalDate;
  endDate: LogicalDate | null;
  mutationStamp: string;
  deletedAt: number | null;
};

export type SelectedIcon = 'default' | 'midnight' | 'paper';

export type AppSettings = {
  schemaRevision: number;
  selectedIcon: SelectedIcon;
  iCloudSyncEnabled: boolean;
  metricsEducationDismissed: BoardId[];
  deviceId: DeviceId;
  hlcWallTime: number;
  hlcCounter: number;
  lastSyncAtUtc: number | null;
};

export type WidgetBoardRow = {
  boardId: BoardId;
  position: number;
  title: string;
  symbol: string;
  accentHex: string;
  // seven logical days ending today, oldest first; values are check-in counts
  strip: number[];
  stripEndDate: LogicalDate;
};

// versioned product data: the approved board color palette
export const boardPalette = [
  { name: 'graphite', hex: '#8E8E93' },
  { name: 'white', hex: '#F2F2F7' },
  { name: 'green', hex: '#78D98B' },
  { name: 'purple', hex: '#8F82FF' },
  { name: 'pink', hex: '#E58BA6' },
  { name: 'blue', hex: '#70A7FF' },
] as const;

// versioned product data: the exact initial sf symbol allowlist
export const boardSymbolAllowlist = [
  'calendar',
  'star.fill',
  'carrot.fill',
  'bed.double.fill',
  'iphone.slash',
  'play.rectangle.fill',
  'pills.fill',
  'checkmark.circle.fill',
  'figure.walk',
  'figure.run',
  'bicycle',
  'dumbbell.fill',
  'heart.fill',
  'brain.head.profile',
  'leaf.fill',
  'drop.fill',
  'flame.fill',
  'book.fill',
  'pencil',
  'paintbrush.fill',
  'music.note',
  'cup.and.saucer.fill',
  'fork.knife',
  'takeoutbag.and.cup.and.straw.fill',
  'moon.stars.fill',
  'sun.max.fill',
  'alarm.fill',
  'timer',
  'desktopcomputer',
  'phone.fill',
  'person.2.fill',
  'pawprint.fill',
] as const;

export const boardLimits = {
  titleMaxCodePoints: 80,
  unitMaxCodePoints: 20,
  noteMaxCodePoints: 10000,
  reminderMessageMaxCodePoints: 180,
  amountMax: 1_000_000_000,
  startOfDayMinuteMax: 720,
  startOfDayMinuteStep: 30,
} as const;
